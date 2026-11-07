/**
 * @file The exception reporter, react's pipeline for Hermes. It filters a
 * noted error, builds a PostHog `$exception` from it with `@posthog/core`,
 * scrubs and throttles it, names the person only when analytics says they are
 * identified and capturing, and posts it to the API's collect proxy. With no
 * PostHog key it does nothing. It never throws.
 *
 * What differs from react: there is no page URL, so no `$current_url`; no
 * chunk loading, so no `chunk_load` origin; no beacon or `keepalive`, so
 * `AppState` `background` flushes the queue with a plain `fetch`; and the
 * release is the native app version and build. A fatal crash ends the
 * process before anything asynchronous runs, so `reportFatal` keeps it in
 * MMKV and the next launch sends it (`sendPendingReports`).
 */
import {
  chromeStackLineParser,
  createStackParser,
  ErrorCoercer,
  ErrorPropertiesBuilder,
  geckoStackLineParser,
  ObjectCoercer,
  PrimitiveCoercer,
  StringCoercer,
  type Exception,
  type Mechanism,
  type StackFrame,
} from '@posthog/core/error-tracking'
import { uuidv7 } from '@posthog/core/vendor/uuidv7'
import { isAxiosError } from 'axios'
import * as Application from 'expo-application'
import { AppState } from 'react-native'
import { apiUrl } from '@/http/client'
import { storage } from '@/lib/storage'
import { ANALYTICS_APP, analyticsConfig } from '@/observability/telemetry/config'
import {
  analyticsSettledNow,
  getAnalyticsSessionIdFor,
  whenAnalyticsSettled,
  type AnalyticsSettled,
} from '@/observability/telemetry/telemetry'
import { currentRoutePattern } from '@/observability/telemetry/use-screen-views'
import { scrubText } from './scrub'

/** Where an error was noticed; sent as the event's `origin`. */
export type ErrorOrigin = 'global' | 'rejection' | 'react'

/** How long an exception waits for analytics to settle before it is sent anonymous. */
export const SETTLE_CAP_MS = 10_000

/** Events per fingerprint in one launch. */
export const FINGERPRINT_LIMIT = 5

/** Events in one launch; past it nothing more is built. React's `PAGE_LIMIT`. */
export const LAUNCH_LIMIT = 30

/** The most events in one request. */
export const BATCH_SIZE = 10

/** How long the first queued event waits for others to share its request. */
export const BATCH_WINDOW_MS = 2_000

/** How long a batch that failed on the network or with a 5xx waits before its one retry. */
export const RETRY_DELAY_MS = 5_000

/** Exceptions kept from a `cause` chain, the thrown one first; also how deep `isIgnoredError` looks. */
const CAUSE_DEPTH = 5

/** The MMKV key of the fatal crashes kept for the next launch. */
export const PENDING_REPORTS_KEY = 'error-report:pending'

/** The most fatal crashes kept for the next launch; a new one drops the oldest. */
export const MAX_PENDING_REPORTS = 5

/** The most errors `isIgnoredError` inspects in one noted value. */
const NESTED_ERROR_LIMIT = 50

/** The most serialized bytes in one request, react's cap. */
export const BATCH_MAX_BYTES = 60 * 1024

/** An error handed over later than this after it was noted is sent anonymous, without its route. */
export const STALE_ERROR_MS = 10_000

/** What React Native's `fetch` throws for a request that never got a response. */
const NETWORK_FAILURE_MESSAGE = 'Network request failed'

/** The release bundle's file name on Android and on iOS. */
const RELEASE_BUNDLES = new Set(['index.android.bundle', 'main.jsbundle'])

/** A native `$exception` as `/batch/` takes it. */
export interface ExceptionEvent {
  event: '$exception'
  uuid: string
  timestamp: string
  distinct_id: string
  properties: Record<string, unknown>
}

/** A built event whose identity is not attached yet. */
type PendingEvent = Omit<ExceptionEvent, 'distinct_id'>

let builder: ErrorPropertiesBuilder | undefined
const fingerprintCounts = new Map<string, number>()
let accepted = 0
let settleGate: Promise<void> | undefined
/** Set once analytics has settled; until then, an event built after the settle cap is anonymous without asking again. */
let hasAnalyticsSettled = false
let queue: ExceptionEvent[] = []
/** Built events still waiting for their identity; a move to the background sends them anonymous. */
const awaitingIdentity = new Set<PendingEvent>()
let flushTimer: ReturnType<typeof setTimeout> | undefined
const retrying = new Map<ExceptionEvent[], ReturnType<typeof setTimeout>>()
/** Retries of kept crashes; a move to the background leaves them, since storage still holds them. */
const pendingRetries = new Set<ReturnType<typeof setTimeout>>()
let appStateSubscription: { remove: () => void } | undefined

/** The `message` of an error-like value, the value itself when it is a string, else undefined. */
function messageOf(input: unknown): string | undefined {
  if (typeof input === 'string') return input
  if (typeof input !== 'object' || input === null) return undefined
  const message = (input as { message?: unknown }).message
  return typeof message === 'string' ? message : undefined
}

/**
 * The errors the builder would read from a value: the value, its `cause`
 * chain, an `AggregateError`'s `errors`, and a plain object's own
 * Error-valued properties, to `CAUSE_DEPTH` levels and at most
 * `NESTED_ERROR_LIMIT` values. A cycle is visited once.
 */
function nestedErrors(input: unknown): unknown[] {
  const found: unknown[] = []
  const visited = new Set<unknown>()
  const pending: [unknown, number][] = [[input, 0]]
  while (pending.length > 0 && found.length < NESTED_ERROR_LIMIT) {
    const [value, depth] = pending.shift() as [unknown, number]
    if (typeof value !== 'object' || value === null || visited.has(value)) continue
    visited.add(value)
    found.push(value)
    if (depth >= CAUSE_DEPTH) continue
    if (value instanceof Error) {
      pending.push([(value as { cause?: unknown }).cause, depth + 1])
      const { errors } = value as { errors?: unknown }
      if (Array.isArray(errors)) for (const member of errors) pending.push([member, depth + 1])
      continue
    }
    for (const child of Object.values(value)) {
      if (child instanceof Error) pending.push([child, depth + 1])
    }
  }
  return found
}

/**
 * Whether a noted error is dropped before anything is built: an axios error
 * anywhere the builder would read one (the value, its causes, an
 * `AggregateError`'s members, a plain object's Error property), since its
 * `config.data` can hold the refresh token and the server owns its 5xx; an
 * abort or cancel; or a `fetch` that never reached the network.
 * @param input - The noted error, as received.
 * @returns True to drop it.
 */
export function isIgnoredError(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false
  if (nestedErrors(input).some((value) => isAxiosError(value))) return true
  const name = (input as { name?: unknown }).name
  if (name === 'AbortError' || name === 'CanceledError') return true
  return input instanceof TypeError && messageOf(input) === NETWORK_FAILURE_MESSAGE
}

/**
 * Whether a Hermes frame is this app's code. A release build runs one bundle,
 * `index.android.bundle` or `main.jsbundle`, at any path. A development build
 * loads it from Metro, as `/index.bundle` (the entry, `index.ts`) or a file
 * under `/src/`. Anything under `node_modules`, a `native` frame, Hermes's
 * `InternalBytecode.js` and `<anonymous>` never is. A release bundle holds the
 * libraries too, so its frames count as the app's until source maps say
 * otherwise.
 * @param filename - The frame's file, as the stack parser read it.
 * @returns True for the app's own frames.
 */
export function isAppFrame(filename: string | undefined): boolean {
  if (!filename || filename.includes('/node_modules/')) return false
  if (/^https?:\/\//i.test(filename)) {
    try {
      const { pathname } = new URL(filename)
      return pathname.startsWith('/index.bundle') || pathname.startsWith('/src/')
    } catch {
      return false
    }
  }
  return RELEASE_BUNDLES.has(filename.slice(filename.lastIndexOf('/') + 1))
}

/**
 * The fields of a frame that are sent: `in_app` recomputed from the raw
 * filename, the filename and function scrubbed, and the position. Any other
 * field, such as a source line or variables, is never sent.
 */
function scrubFrame(frame: StackFrame): StackFrame {
  return {
    platform: frame.platform,
    in_app: isAppFrame(frame.filename),
    ...(frame.filename === undefined ? {} : { filename: scrubText(frame.filename) }),
    ...(frame.function === undefined ? {} : { function: scrubText(frame.function) }),
    ...(frame.lineno === undefined ? {} : { lineno: frame.lineno }),
    ...(frame.colno === undefined ? {} : { colno: frame.colno }),
  }
}

/** The mechanism fields that are sent, all of them the builder's own values. */
function mechanismOf(mechanism: Mechanism): Mechanism {
  const { type, handled, synthetic, exception_id: exceptionId, parent_id: parentId } = mechanism
  return {
    ...(type === undefined ? {} : { type }),
    ...(handled === undefined ? {} : { handled }),
    ...(synthetic === undefined ? {} : { synthetic }),
    ...(exceptionId === undefined ? {} : { exception_id: exceptionId }),
    ...(parentId === undefined ? {} : { parent_id: parentId }),
  }
}

/**
 * The builder's exception list cut to `CAUSE_DEPTH`, with `in_app`
 * recomputed for every frame and every type, value, filename and function
 * scrubbed. Only the fields named here are sent, so a field a later
 * `@posthog/core` adds never leaves unscrubbed.
 * @param list - `$exception_list` as the builder returned it.
 * @returns The list to send.
 */
export function prepareExceptionList(list: Exception[]): Exception[] {
  return list.slice(0, CAUSE_DEPTH).map((exception) => ({
    ...(exception.type === undefined ? {} : { type: scrubText(exception.type) }),
    ...(exception.value === undefined ? {} : { value: scrubText(exception.value) }),
    ...(exception.mechanism === undefined ? {} : { mechanism: mechanismOf(exception.mechanism) }),
    ...(exception.stacktrace
      ? {
          stacktrace: {
            type: exception.stacktrace.type,
            ...(exception.stacktrace.frames === undefined
              ? {}
              : { frames: exception.stacktrace.frames.map(scrubFrame) }),
          },
        }
      : {}),
  }))
}

/**
 * What the throttle counts as one error: the thrown exception's type and its
 * innermost in-app frame, or its type and scrubbed value when it has none.
 * @param list - A prepared exception list.
 * @returns The fingerprint.
 */
export function fingerprintOf(list: Exception[]): string {
  const [first] = list
  const frame = first?.stacktrace?.frames?.findLast((candidate) => candidate.in_app)
  const where = frame
    ? `${frame.filename ?? ''}:${frame.function ?? ''}:${String(frame.lineno ?? '')}`
    : (first?.value ?? '')
  return `${first?.type ?? 'Error'}|${where}`
}

/**
 * Builds PostHog's exception list for an error, creating the builder on first
 * use. Hermes writes V8-style frames (`at fn (address at file:line:col)`);
 * the gecko parser reads the `fn@file:line:col` form.
 * @param error - The noted error, as received.
 * @param handled - Recorded as the exception mechanism's `handled`.
 * @returns The exception list, the thrown exception first.
 */
function build(error: unknown, handled: boolean): Exception[] {
  builder ??= new ErrorPropertiesBuilder(
    [new ErrorCoercer(), new ObjectCoercer(), new StringCoercer(), new PrimitiveCoercer()],
    createStackParser('hermes', chromeStackLineParser, geckoStackLineParser)
  )
  return builder.buildFromUnknown(error, { mechanism: { type: 'generic', handled } })
    .$exception_list
}

/** The installed app's version and build, as `1.4.0+42`. */
function release(): string {
  const version = Application.nativeApplicationVersion ?? 'unknown'
  const buildNumber = Application.nativeBuildVersion ?? 'unknown'
  return `${version}+${buildNumber}`
}

/**
 * The identity for an event built now. Calls share one wait for analytics to
 * settle, at most `SETTLE_CAP_MS` from the first call; once that wait is over,
 * later calls read the identity without waiting, and get null while analytics
 * is still unsettled.
 */
function resolveIdentity(): Promise<AnalyticsSettled | null> {
  settleGate ??= new Promise((resolve) => {
    const cap = setTimeout(resolve, SETTLE_CAP_MS)
    void whenAnalyticsSettled().then(() => {
      hasAnalyticsSettled = true
      clearTimeout(cap)
      resolve()
    })
  })
  return settleGate.then(() => (hasAnalyticsSettled ? whenAnalyticsSettled() : null))
}

/**
 * The event with its identity: the person's distinct id and session when
 * analytics says they are identified and capturing; otherwise a fresh
 * distinct id of its own and no person profile.
 * @param event - The built event.
 * @param settled - From `whenAnalyticsSettled`, or null for an anonymous event.
 * @returns The event to send.
 */
function withIdentity(event: PendingEvent, settled: AnalyticsSettled | null): ExceptionEvent {
  if (!settled?.identified || settled.distinctId === null) {
    return {
      ...event,
      distinct_id: uuidv7(),
      properties: { ...event.properties, $process_person_profile: false },
    }
  }
  const sessionId = getAnalyticsSessionIdFor(settled.distinctId)
  return {
    ...event,
    distinct_id: settled.distinctId,
    properties: { ...event.properties, ...(sessionId ? { $session_id: sessionId } : {}) },
  }
}

/** A request body: the project key and the batch, as JSON. */
function batchBody(batch: ExceptionEvent[]): string {
  return JSON.stringify({ api_key: analyticsConfig().key, batch })
}

/** The UTF-8 size of a string in bytes, counted without `TextEncoder`. */
function byteLength(text: string): number {
  let bytes = 0
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

/**
 * Removes the next request's events from the front of a list and returns them:
 * at most `BATCH_SIZE`, and at most `BATCH_MAX_BYTES` once serialized (an
 * event too big alone still goes alone).
 */
function takeBatch(events: ExceptionEvent[]): ExceptionEvent[] {
  let bytes = byteLength(batchBody([]))
  let count = 0
  for (const event of events.slice(0, BATCH_SIZE)) {
    bytes += byteLength(JSON.stringify(event)) + 1
    if (count > 0 && bytes > BATCH_MAX_BYTES) break
    count += 1
  }
  return events.splice(0, count)
}

/**
 * Posts one batch to the collect proxy with no credentials, retrying once
 * after a network failure or a 5xx.
 * @param batch - The events to send.
 * @param canRetry - False for the retry itself.
 * @param onAnswered - For kept crashes: called once the API answered below
 *   500, when the batch needs no other try.
 */
async function send(
  batch: ExceptionEvent[],
  canRetry: boolean,
  onAnswered?: () => void
): Promise<void> {
  try {
    const response = await fetch(apiUrl('/collect/batch/'), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: batchBody(batch),
    })
    if (response.status < 500) {
      onAnswered?.()
      return
    }
  } catch {
    // A network failure is retried once below, like a 5xx.
  }
  if (!canRetry) return
  if (onAnswered) {
    const timer = setTimeout(() => {
      pendingRetries.delete(timer)
      void send(batch, false, onAnswered)
    }, RETRY_DELAY_MS)
    pendingRetries.add(timer)
    return
  }
  retrying.set(
    batch,
    setTimeout(() => {
      retrying.delete(batch)
      void send(batch, false)
    }, RETRY_DELAY_MS)
  )
}

/** Sends every event in `events`, in requests cut by `takeBatch`. */
function sendAll(events: ExceptionEvent[], canRetry: boolean): void {
  while (events.length > 0) void send(takeBatch(events), canRetry)
}

/** Sends everything queued and stops the flush timer. */
function flush(): void {
  if (flushTimer !== undefined) clearTimeout(flushTimer)
  flushTimer = undefined
  sendAll(queue, true)
}

/** Queues an event; a full batch is sent at once, otherwise the flush timer is started if it is not running. */
function enqueue(event: ExceptionEvent): void {
  queue.push(event)
  if (queue.length >= BATCH_SIZE) flush()
  else flushTimer ??= setTimeout(flush, BATCH_WINDOW_MS)
}

/**
 * On a move to the background, the system can suspend or end the app, so
 * everything not yet sent goes now: the queue, every batch waiting to retry,
 * and every event still waiting for its identity, anonymous. These requests
 * are not retried.
 */
function sendOnBackground(): void {
  try {
    const unsent = queue.splice(0)
    for (const event of awaitingIdentity) unsent.push(withIdentity(event, null))
    awaitingIdentity.clear()
    for (const [batch, timer] of retrying) {
      clearTimeout(timer)
      unsent.push(...batch)
    }
    retrying.clear()
    if (flushTimer !== undefined) clearTimeout(flushTimer)
    flushTimer = undefined
    sendAll(unsent, false)
  } catch {
    // Error tracking never fails the app.
  }
}

/** Listens for the move to the background, once. */
function listenForBackground(): void {
  appStateSubscription ??= AppState.addEventListener('change', (state) => {
    if (state === 'background') sendOnBackground()
  })
}

/**
 * Filters, builds, scrubs and throttles one noted error, synchronously.
 * @param error - The noted error.
 * @param origin - Where it was noticed.
 * @param handled - True when the app shows the person an error screen.
 * @param notedAt - When it was noted.
 * @param isStale - True to leave out the route, which is no longer the error's own.
 * @returns The event without its identity, or null when it is dropped.
 */
function buildEvent(
  error: unknown,
  origin: ErrorOrigin,
  handled: boolean,
  notedAt: number,
  isStale: boolean
): PendingEvent | null {
  const { key, environment } = analyticsConfig()
  if (key === null || accepted >= LAUNCH_LIMIT || isIgnoredError(error)) return null
  const list = prepareExceptionList(build(error, handled))
  const hasAppFrame = list.some((exception) =>
    exception.stacktrace?.frames?.some((frame) => frame.in_app)
  )
  if (!hasAppFrame) return null
  const fingerprint = fingerprintOf(list)
  const count = fingerprintCounts.get(fingerprint) ?? 0
  if (count >= FINGERPRINT_LIMIT) return null
  fingerprintCounts.set(fingerprint, count + 1)
  accepted += 1
  const routeId = isStale ? undefined : currentRoutePattern()
  return {
    event: '$exception',
    uuid: uuidv7(),
    timestamp: new Date(notedAt).toISOString(),
    properties: {
      $exception_list: list,
      $exception_level: 'error',
      app: ANALYTICS_APP,
      origin,
      release: release(),
      environment,
      ...(routeId === undefined ? {} : { route_id: routeId }),
    },
  }
}

/** The fatal crashes kept by this launch or an earlier one. */
function readPending(): ExceptionEvent[] {
  try {
    const stored = storage.getString(PENDING_REPORTS_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? (parsed as ExceptionEvent[]) : []
  } catch {
    return []
  }
}

/** Stores the kept crashes, or removes the key when none is left. */
function writePending(events: ExceptionEvent[]): void {
  if (events.length === 0) storage.remove(PENDING_REPORTS_KEY)
  else storage.set(PENDING_REPORTS_KEY, JSON.stringify(events))
}

/**
 * Keeps a fatal crash for the next launch. React Native's handler ends the
 * process right after this returns, before a promise or a timer could run,
 * so everything here is synchronous: the event is built, scrubbed and
 * throttled, takes the identity analytics holds now (anonymous unless the
 * person is identified and capturing), and joins the MMKV list, which keeps
 * the newest `MAX_PENDING_REPORTS`. Nothing is posted. Does nothing without
 * a PostHog key. Never throws.
 * @param error - The thrown error.
 * @param origin - Where it was noticed.
 */
export function reportFatal(error: unknown, origin: ErrorOrigin): void {
  try {
    const event = buildEvent(error, origin, false, Date.now(), false)
    if (!event) return
    const kept = [...readPending(), withIdentity(event, analyticsSettledNow())]
    writePending(kept.slice(-MAX_PENDING_REPORTS))
  } catch {
    // Error tracking never fails the app, and never reports itself.
  }
}

/**
 * Sends the fatal crashes an earlier launch kept, through the batch requests.
 * Each request's events leave the list once the API answers below 500; a
 * network failure or a 5xx, after its one retry, keeps them for the next
 * launch. Does nothing without a PostHog key. Never throws.
 */
export function sendPendingReports(): void {
  try {
    if (analyticsConfig().key === null) return
    const events = readPending()
    while (events.length > 0) {
      const batch = takeBatch(events)
      const sent = new Set(batch.map((event) => event.uuid))
      void send(batch, true, () => {
        writePending(readPending().filter((event) => !sent.has(event.uuid)))
      })
    }
  } catch {
    // Error tracking never fails the app.
  }
}

/**
 * Filters, builds, scrubs and throttles one noted error, then queues it to
 * send once its identity is known. Does nothing without a PostHog key. Never
 * throws.
 * @param error - The noted error.
 * @param origin - Where it was noticed.
 * @param handled - True when the app shows the person an error screen.
 * @param notedAt - When it was noted, `Date.now()` by default. Older than
 *   `STALE_ERROR_MS`, it is sent anonymous and without its route.
 */
export function report(
  error: unknown,
  origin: ErrorOrigin,
  handled: boolean,
  notedAt = Date.now()
): void {
  try {
    const isStale = Date.now() - notedAt > STALE_ERROR_MS
    const event = buildEvent(error, origin, handled, notedAt, isStale)
    if (!event) return
    listenForBackground()
    awaitingIdentity.add(event)
    void resolveIdentity().then(
      (settled) => {
        // Already sent when the app went to the background.
        if (!awaitingIdentity.delete(event)) return
        enqueue(withIdentity(event, isStale ? null : settled))
      },
      () => {
        if (awaitingIdentity.delete(event)) enqueue(withIdentity(event, null))
      }
    )
  } catch {
    // Error tracking never fails the app, and never reports itself.
  }
}

/** Test-only: forget the throttle, the queue, the settle wait, the timers and the `AppState` listener. */
export function resetReporterForTests(): void {
  fingerprintCounts.clear()
  accepted = 0
  settleGate = undefined
  hasAnalyticsSettled = false
  queue = []
  awaitingIdentity.clear()
  if (flushTimer !== undefined) clearTimeout(flushTimer)
  flushTimer = undefined
  for (const timer of retrying.values()) clearTimeout(timer)
  retrying.clear()
  for (const timer of pendingRetries) clearTimeout(timer)
  pendingRetries.clear()
  appStateSubscription?.remove()
  appStateSubscription = undefined
}

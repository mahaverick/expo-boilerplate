/**
 * @file The analytics facade, the only module that imports
 * `posthog-react-native`. Calls made before `initAnalytics` are queued and
 * replayed in order once the SDK starts, so queued identity is applied before
 * any event; with no key, or an SDK that fails to start, every call is a
 * no-op. A throwing or rejecting SDK call is swallowed: analytics never fails
 * a user action. Every event, the SDK's own included, passes `guardEvent` in
 * the SDK's `before_send` hook before it is queued.
 */
import type { BeforeSendFn, CaptureEvent, PostHogEventProperties } from '@posthog/core'
import { PostHog, PostHogPersistedProperty, type PostHogOptions } from 'posthog-react-native'
import { apiUrl } from '@/http/client'
import { storage } from '@/lib/storage'
import {
  ANALYTICS_APP,
  ANALYTICS_URL_QUERY_ALLOWLIST,
  analyticsConfig,
  PERSONAL_DATA_PROPERTIES,
} from './config'
import type { AppEvent, TrackArgs } from './event-registry'
import { MAX_SANITIZE_DEPTH, sanitizeEventUrls, sanitizeUrl } from './url-sanitizer'

/**
 * How the signed-in user reached the workspace they are on: as a member, or
 * as staff through platform access.
 */
type AnalyticsTenantAccess = 'member' | 'platform'

/** A workspace group and how the user reached it. */
interface AnalyticsTenant {
  id: string
  access: AnalyticsTenantAccess
}

/** Who an exception may name, once analytics has settled. */
export interface AnalyticsSettled {
  /** The SDK's distinct id, or null when analytics is inert. */
  distinctId: string | null
  /** Whether capture is on. */
  capturing: boolean
  /**
   * Whether capture is on and the distinct id is the person this facade
   * identified. The SDK's anonymous id never counts, so a signed-out
   * exception never names it.
   */
  identified: boolean
}

/** A call on the SDK, deferred until it has started. */
type Command = (client: PostHog) => void

/** A command waiting for the SDK, and whether the queue may shed it. */
interface QueuedCommand {
  command: Command
  /** Only an event capture may be dropped when the queue is full. */
  isDroppable: boolean
}

/**
 * React's cap on the calls held before the SDK starts. It bounds the queued
 * captures: past it, the oldest queued capture is dropped to make room, or
 * the new capture when none is queued. Identity, reset, group, flag and
 * opt-out calls are never dropped, so the queue exceeds the cap only by
 * those.
 */
const MAX_QUEUED_COMMANDS = 100

/** The super property that says how the user reached the workspace. */
const TENANT_ACCESS_PROPERTY = 'tenant_access'

/** The SDK's group type for a workspace. */
const TENANT_GROUP_TYPE = 'tenant'

/** The super property posthog-react-native keeps groups in. */
const GROUPS_PROPERTY = '$groups'

/**
 * A string the guard treats as a URL: any `scheme://` (the app's own scheme
 * included, which the launch event's `url` carries), `mailto:`, `tel:`, or an
 * app path.
 */
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|tel:|\/)/i

/** Property names dropped at every depth. */
const PERSONAL_KEYS: ReadonlySet<string> = new Set(PERSONAL_DATA_PROPERTIES)

/** The environment the build names. Set before the SDK is built, since the guard reads it. */
let environment = analyticsConfig().environment
let status: 'idle' | 'ready' | 'inert' = 'idle'
let client: PostHog | null = null
let queue: QueuedCommand[] = []
/** The user this facade identified, written when the SDK call is made. */
let signedInUserId: string | null = null
/** The workspace group the SDK carries now. */
let appliedTenant: AnalyticsTenant | null = null
/** The last workspace grouped since the last reset, for `tenant_switched`. */
let lastTenantId: string | null = null
/** The name of a super property that carries a flag's value. */
export type FeaturePropertyName = `$feature/${string}`

/** The `$feature/*` properties registered, put back after a reset that keeps the person. */
let featureProperties: Record<string, unknown> = {}
const settledWaiters = new Set<() => void>()

/** Takes a rejection off a promise an SDK call returned. */
function quietly(result: unknown): void {
  if (result instanceof Promise) result.catch(() => undefined)
}

/** Runs one command, swallowing any throw. */
function execute(command: Command, instance: PostHog): void {
  try {
    command(instance)
  } catch {
    // Analytics never fails a user action.
  }
}

/** Runs a command now, queues it until the SDK starts, or drops it when analytics is inert. */
function run(command: Command, isDroppable = false): void {
  if (status === 'ready' && client) {
    execute(command, client)
    return
  }
  if (status === 'inert') return
  if (queue.length >= MAX_QUEUED_COMMANDS) {
    const oldest = queue.findIndex((queued) => queued.isDroppable)
    if (oldest !== -1) queue.splice(oldest, 1)
    else if (isDroppable) return
  }
  queue.push({ command, isDroppable })
}

/** Wakes every `whenAnalyticsSettled` waiter. */
function notifySettled(): void {
  const waiters = [...settledWaiters]
  settledWaiters.clear()
  for (const waiter of waiters) waiter()
}

/** Gives up on analytics for this launch: every later call is a no-op. */
function becomeInert(): void {
  status = 'inert'
  client = null
  queue = []
  notifySettled()
}

/**
 * A value with every personal key removed and every URL-like string
 * sanitised, to `MAX_SANITIZE_DEPTH` levels. Deeper values pass through to
 * `sanitizeEventUrls`, which replaces them.
 */
function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    return URL_LIKE.test(value) ? sanitizeUrl(value, ANALYTICS_URL_QUERY_ALLOWLIST) : value
  }
  if (typeof value !== 'object' || value === null || depth >= MAX_SANITIZE_DEPTH) return value
  if (Array.isArray(value)) return value.map((item: unknown) => scrubValue(item, depth + 1))
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (!PERSONAL_KEYS.has(key)) result[key] = scrubValue(child, depth + 1)
  }
  return result
}

/** `scrubValue` over an optional record, keeping an absent one absent. */
function scrubRecord(record: object | undefined): Record<string, unknown> | undefined {
  return record === undefined ? undefined : (scrubValue(record, 0) as Record<string, unknown>)
}

/**
 * The SDK's `before_send`. Every event leaves with the `app` and
 * `environment` super properties, which an event captured while the SDK
 * starts would lack; with no personal key at any depth; and with every URL
 * sanitised, the app's own scheme included. It reads only module state set
 * before the SDK is built. A guard that throws drops the event, so nothing
 * leaves unguarded.
 * @param event - The event the SDK is about to queue.
 * @returns The guarded copy, or null to drop it.
 */
function guardEvent(event: CaptureEvent): CaptureEvent | null {
  try {
    const guarded = {
      ...event,
      properties: { ...scrubRecord(event.properties), app: ANALYTICS_APP, environment },
      ...(event.$set ? { $set: scrubRecord(event.$set) } : {}),
      ...(event.$set_once ? { $set_once: scrubRecord(event.$set_once) } : {}),
    }
    return sanitizeEventUrls(guarded, ANALYTICS_URL_QUERY_ALLOWLIST) as CaptureEvent
  } catch {
    return null
  }
}

/** Registers the `app`, `environment` and `$feature/*` super properties. */
function registerSuperProperties(ph: PostHog): void {
  quietly(ph.register({ app: ANALYTICS_APP, environment, ...featureProperties }))
}

/** Puts the SDK's workspace group in step with `appliedTenant`. */
function applyTenant(ph: PostHog): void {
  if (appliedTenant) {
    // Registered before group(), whose `$groupidentify` must already carry it.
    quietly(ph.register({ [TENANT_ACCESS_PROPERTY]: appliedTenant.access }))
    ph.group(TENANT_GROUP_TYPE, appliedTenant.id)
    return
  }
  quietly(ph.unregister(GROUPS_PROPERTY))
  quietly(ph.unregister(TENANT_ACCESS_PROPERTY))
}

/**
 * Empties the SDK's stored event queue. The SDK checks the opt-out only when
 * an event joins the queue, and its flush sends whatever is stored, so the
 * events captured before an opt-out would otherwise still leave after it.
 */
function dropQueuedEvents(ph: PostHog): void {
  ph.setPersistedProperty(PostHogPersistedProperty.Queue, null)
}

/**
 * Resets the SDK's person and puts back what `reset()` clears: the opt-out,
 * first, so nothing is captured in between, then the super properties and
 * the workspace group. `reset()` gets no keep-list: a list replaces the
 * SDK's own, which keeps the installed build and version.
 */
function resetKeepingOptOut(ph: PostHog): void {
  const wasOptedOut = ph.optedOut
  ph.reset()
  if (wasOptedOut) quietly(ph.optOut())
  registerSuperProperties(ph)
  applyTenant(ph)
}

/** The SDK's options: the collect proxy, MMKV storage, and no flags, replay or error autocapture. */
function posthogOptions(): PostHogOptions {
  const beforeSend: BeforeSendFn = guardEvent
  return {
    host: apiUrl('/collect'),
    persistence: 'file',
    customStorage: {
      getItem: (key) => storage.getString(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value)
      },
    },
    captureAppLifecycleEvents: true,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    enableSessionReplay: false,
    errorTracking: {
      autocapture: {
        uncaughtExceptions: false,
        unhandledRejections: false,
        console: false,
        nativeCrashes: false,
        androidNdkCrashes: false,
      },
    },
    before_send: beforeSend,
  }
}

/**
 * Starts the SDK, once; later calls do nothing. Safe before the first render.
 * With no key it builds nothing and analytics stays inert. Screen autocapture
 * needs `PostHogProvider`, which the app never mounts, so screens are
 * captured only through `captureScreen`.
 */
export function initAnalytics(): void {
  if (status !== 'idle') return
  const config = analyticsConfig()
  environment = config.environment
  if (config.key === null) {
    becomeInert()
    return
  }
  try {
    const instance = new PostHog(config.key, posthogOptions())
    client = instance
    status = 'ready'
    // A stored opt-out stands from the first moment: a queue stored before it never leaves.
    if (instance.optedOut) execute(dropQueuedEvents, instance)
    execute(registerSuperProperties, instance)
    const pending = queue
    queue = []
    for (const { command } of pending) execute(command, instance)
  } catch {
    becomeInert()
    return
  }
  notifySettled()
}

/**
 * Sends a registered event.
 * @param event - A name from `AppEventProps`.
 * @param args - Its properties, or nothing for an event that has none.
 */
export function track<E extends AppEvent>(event: E, ...args: TrackArgs<E>): void {
  const [properties] = args
  run((ph) => {
    ph.capture(event, properties ?? {})
  }, true)
}

/**
 * Captures a screen view.
 * @param routePattern - The route's pattern (`/(app)/tenants/[slug]`), never a filled-in path.
 */
export function captureScreen(routePattern: string): void {
  run((ph) => {
    quietly(ph.screen(routePattern))
  }, true)
}

/**
 * Identifies the signed-in user by id alone: no person properties leave the
 * device. A different person the SDK still holds is reset first, keeping the
 * opt-out, so the two are never merged.
 * @param id - The API's user id.
 */
export function identifyUser(id: string): void {
  run((ph) => {
    const isOtherPerson =
      ph.getPersistedProperty(PostHogPersistedProperty.PersonMode) === 'identified' &&
      ph.getDistinctId() !== id
    if (isOtherPerson) resetKeepingOptOut(ph)
    ph.identify(id)
    signedInUserId = id
  })
}

/**
 * Forgets a person the SDK stored from an earlier launch, when nobody is
 * signed in. It resets only while the SDK still holds an identified person,
 * so an anonymous install keeps its id. The opt-out survives.
 */
export function forgetStaleIdentity(): void {
  run((ph) => {
    if (ph.getPersistedProperty(PostHogPersistedProperty.PersonMode) !== 'identified') return
    signedInUserId = null
    appliedTenant = null
    lastTenantId = null
    featureProperties = {}
    resetKeepingOptOut(ph)
  })
}

/**
 * Forgets the person, the workspace group and the `$feature/*` properties:
 * sign-out, forced or chosen. The opt-out survives.
 */
export function resetAnalytics(): void {
  run((ph) => {
    signedInUserId = null
    appliedTenant = null
    lastTenantId = null
    featureProperties = {}
    resetKeepingOptOut(ph)
  })
}

/**
 * Applies the signed-in user's own preference. The SDK persists it in MMKV.
 * Turning capture off also drops the events still queued, so nothing
 * captured before the choice leaves after it.
 * @param optedOut - The profile's `analyticsOptOut`.
 */
export function setAnalyticsOptOut(optedOut: boolean): void {
  run((ph) => {
    if (optedOut) {
      if (!ph.optedOut) quietly(ph.optOut())
      dropQueuedEvents(ph)
    } else if (ph.optedOut) {
      quietly(ph.optIn())
    }
  })
}

/**
 * Puts the following events in a workspace's group, with `tenant_access`
 * saying how the user reached it, or in none. Moving to a different
 * workspace than the last one grouped since the last reset also sends
 * `tenant_switched`. No group properties leave the device.
 * @param tenant - The workspace and the access, or null for a screen outside any workspace.
 */
export function setTenantGroup(tenant: AnalyticsTenant | null): void {
  run((ph) => {
    if (tenant === null) {
      if (appliedTenant === null) return
      appliedTenant = null
      applyTenant(ph)
      return
    }
    if (appliedTenant?.id === tenant.id && appliedTenant.access === tenant.access) return
    const isSwitch = lastTenantId !== null && lastTenantId !== tenant.id
    appliedTenant = { id: tenant.id, access: tenant.access }
    lastTenantId = tenant.id
    applyTenant(ph)
    if (isSwitch) ph.capture('tenant_switched' satisfies AppEvent, {})
  })
}

/**
 * Registers flag values as super properties, so every following event
 * carries them. A reset that forgets the person forgets them too.
 * @param props - `$feature/<flag>` names and their values.
 */
export function registerFeatureProperties(props: Record<string, unknown>): void {
  run((ph) => {
    featureProperties = { ...featureProperties, ...props }
    quietly(ph.register(props as PostHogEventProperties))
  })
}

/**
 * Removes super properties `registerFeatureProperties` registered.
 * @param names - The property names.
 */
export function unregisterFeatureProperties(names: string[]): void {
  run((ph) => {
    const next = { ...featureProperties }
    for (const name of names) {
      delete next[name]
      quietly(ph.unregister(name))
    }
    featureProperties = next
  })
}

/**
 * The analytics session for `X-POSTHOG-SESSION-ID`, so server events link to
 * it: only while capture is on and the SDK's person is `userId`, the user
 * this facade identified.
 * @param userId - The signed-in user's id, or null when nobody is signed in.
 * @returns The session id, or null.
 */
export function getAnalyticsSessionIdFor(userId: string | null): string | null {
  if (status !== 'ready' || !client || userId === null || signedInUserId !== userId) return null
  try {
    if (client.optedOut || client.getDistinctId() !== userId) return null
    const sessionId = client.getSessionId()
    return sessionId ? sessionId : null
  } catch {
    return null
  }
}

/** The identity and capture state now. */
function currentSettled(): AnalyticsSettled {
  const none = { distinctId: null, capturing: false, identified: false }
  if (status !== 'ready' || !client) return none
  try {
    const distinctId = client.getDistinctId()
    const capturing = !client.optedOut
    const identified = capturing && signedInUserId !== null && signedInUserId === distinctId
    return { distinctId, capturing, identified }
  } catch {
    return none
  }
}

/**
 * Resolves once analytics has started or become inert, with the SDK's
 * distinct id, whether capture is on, and whether that id is the person this
 * facade identified. With no key it resolves at once,
 * even before `initAnalytics`. It never rejects.
 * @returns The distinct id, or null when inert, and the capture state.
 */
export function whenAnalyticsSettled(): Promise<AnalyticsSettled> {
  if (status !== 'idle' || analyticsConfig().key === null) return Promise.resolve(currentSettled())
  return new Promise((resolve) => {
    settledWaiters.add(() => {
      resolve(currentSettled())
    })
  })
}

/** Test-only: forget the SDK, the queue, the identity, the group and every waiter. */
export function resetAnalyticsForTests(): void {
  environment = analyticsConfig().environment
  status = 'idle'
  client = null
  queue = []
  signedInUserId = null
  appliedTenant = null
  lastTenantId = null
  featureProperties = {}
  settledWaiters.clear()
}

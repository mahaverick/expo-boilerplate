/**
 * @file The exception reporter: what it drops, how it scrubs, the Hermes
 * frames it parses, the event it builds, when it names the person, the
 * throttle and the transport. React's report test, for the native pipeline:
 * no page URL, no beacon, and `AppState` in place of `pagehide`.
 */
import { jest } from '@jest/globals'
import { AxiosError, AxiosHeaders, CanceledError } from 'axios'
import { AppState, type AppStateStatus } from 'react-native'
import { apiUrl } from '@/http/client'
import {
  BATCH_MAX_BYTES,
  BATCH_SIZE,
  BATCH_WINDOW_MS,
  FINGERPRINT_LIMIT,
  fingerprintOf,
  isAppFrame,
  isIgnoredError,
  LAUNCH_LIMIT,
  MAX_PENDING_REPORTS,
  PENDING_REPORTS_KEY,
  prepareExceptionList,
  report,
  reportFatal,
  resetReporterForTests,
  RETRY_DELAY_MS,
  sendPendingReports,
  SETTLE_CAP_MS,
  STALE_ERROR_MS,
  type ExceptionEvent,
} from '@/observability/errors/report'
import { ANALYTICS_APP } from '@/observability/telemetry/config'
import { getAnalyticsSessionIdFor, whenAnalyticsSettled } from '@/observability/telemetry/telemetry'
import { currentRoutePattern } from '@/observability/telemetry/use-screen-views'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.4.0',
  nativeBuildVersion: '42',
}))
jest.mock('@/observability/telemetry/telemetry', () => ({
  whenAnalyticsSettled: jest.fn(),
  getAnalyticsSessionIdFor: jest.fn(),
}))
/** What the fake MMKV instance holds. */
const mockStored = new Map<string, string>()
jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (key: string) => mockStored.get(key),
    set: (key: string, value: string) => {
      mockStored.set(key, value)
    },
    remove: (key: string) => mockStored.delete(key),
  },
}))
jest.mock('@/observability/telemetry/use-screen-views', () => ({
  currentRoutePattern: jest.fn(),
}))

/** The project key the tests run with. */
const KEY = 'phc_test_key_not_real'

/** Who `whenAnalyticsSettled` names. */
type Settled = Awaited<ReturnType<typeof whenAnalyticsSettled>>

/** A signed-in person with capture on. */
const IDENTIFIED: Settled = { distinctId: 'user-a', capturing: true, identified: true }

const settled = jest.mocked(whenAnalyticsSettled)
const sessionFor = jest.mocked(getAnalyticsSessionIdFor)
const routePattern = jest.mocked(currentRoutePattern)
const fetchMock = jest.fn<(url: string, init: RequestInit) => Promise<{ status: number }>>()
const savedFetch = globalThis.fetch
const savedKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
const savedEnvironment = process.env.EXPO_PUBLIC_APP_ENV

/** The `AppState` listener the reporter registered, if any. */
let appStateListener: ((state: AppStateStatus) => void) | undefined

/** An error whose stack names the release bundle, as a Hermes release build's does. */
function appError(message: string, at = 'renderWidget', line = 1): Error {
  const error = new TypeError(message)
  error.stack = `TypeError: ${message}\n    at ${at} (address at index.android.bundle:${String(line)}:200)\n    at outer (address at index.android.bundle:9:10)`
  return error
}

/** An error with a 50-frame stack and a cause with another, each frame unique to `index`. */
function deepError(index: number): Error {
  /** 50 stack frames named by `prefix`, `index` and the frame number. */
  const frames = (prefix: string) =>
    Array.from(
      { length: 50 },
      (_unused, frame) =>
        `    at ${prefix}${String(index)}x${String(frame)} (address at index.android.bundle:${String(frame + 1)}:200)`
    ).join('\n')
  const cause = new TypeError(`cause ${String(index)}`)
  cause.stack = `TypeError: cause ${String(index)}\n${frames('inner')}`
  const error = new TypeError(`deep ${String(index)}`, { cause })
  error.stack = `TypeError: deep ${String(index)}\n${frames('outer')}`
  return error
}

/** A fetch call's body, which the reporter always sends as a string. */
function bodyOf(init: RequestInit | undefined): string {
  return typeof init?.body === 'string' ? init.body : ''
}

/** Every event sent so far, from the request bodies. */
function sentEvents(): ExceptionEvent[] {
  return fetchMock.mock.calls.flatMap(([, init]) => {
    const body = JSON.parse(bodyOf(init)) as { api_key: string; batch: ExceptionEvent[] }
    return body.batch
  })
}

/** The UTF-8 size of a string in bytes. */
function bytesOf(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

/** Lets identity resolution and the batch window run. */
async function drain(): Promise<void> {
  await jest.advanceTimersByTimeAsync(BATCH_WINDOW_MS)
}

beforeEach(() => {
  jest.useFakeTimers()
  resetReporterForTests()
  process.env.EXPO_PUBLIC_POSTHOG_KEY = KEY
  process.env.EXPO_PUBLIC_APP_ENV = 'test'
  settled.mockReset()
  settled.mockResolvedValue(IDENTIFIED)
  mockStored.clear()
  sessionFor.mockReset()
  sessionFor.mockReturnValue('session-1')
  routePattern.mockReset()
  routePattern.mockReturnValue('/tenants/[slug]')
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ status: 200 })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  appStateListener = undefined
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener
    return { remove: jest.fn() }
  })
})

afterEach(() => {
  resetReporterForTests()
  jest.restoreAllMocks()
  jest.useRealTimers()
  globalThis.fetch = savedFetch
  if (savedKey === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_KEY
  else process.env.EXPO_PUBLIC_POSTHOG_KEY = savedKey
  if (savedEnvironment === undefined) delete process.env.EXPO_PUBLIC_APP_ENV
  else process.env.EXPO_PUBLIC_APP_ENV = savedEnvironment
})

describe('what is never reported', () => {
  /** An Axios response with this status. */
  const response = (status: number) => ({
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders(), data: '{"refreshToken":"secret-refresh"}' },
    data: {},
  })

  it('an axios error is never reported', async () => {
    const error = new AxiosError('500', 'ERR_BAD_RESPONSE', undefined, {}, response(500))
    error.stack = appError('500').stack
    report(error, 'rejection', false)
    await drain()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['an API error', new AxiosError('500', 'ERR_BAD_RESPONSE', undefined, {}, response(500))],
    ['a network failure through axios', new AxiosError('Network Error', 'ERR_NETWORK')],
    ['an axios cancel', new CanceledError()],
    ['a CanceledError by name', Object.assign(new Error('canceled'), { name: 'CanceledError' })],
    ['an AbortError', Object.assign(new Error('Aborted'), { name: 'AbortError' })],
    ['a fetch network failure', new TypeError('Network request failed')],
  ])('drops %s', (_label, input) => {
    expect(isIgnoredError(input)).toBe(true)
  })

  it.each([
    ['a render crash', appError('x is undefined')],
    ['a thrown string', 'boom'],
    ['a number', 42],
    ['an object without a message', { code: 1 }],
    ['a TypeError with another message', new TypeError('x is not a function')],
  ])('keeps %s', (_label, input) => {
    expect(isIgnoredError(input)).toBe(false)
  })

  it.each<[string, () => unknown]>([
    ['as the cause', () => new Error('wrap', { cause: new AxiosError('500', 'ERR_BAD_RESPONSE') })],
    [
      'deeper in the cause chain',
      () =>
        new Error('outer', {
          cause: new Error('middle', { cause: new AxiosError('Network Error', 'ERR_NETWORK') }),
        }),
    ],
    ['in an object’s error property', () => ({ error: new AxiosError('500', 'ERR_BAD_RESPONSE') })],
    [
      'in an AggregateError',
      () =>
        new AggregateError([new Error('fine'), new AxiosError('500', 'ERR_BAD_RESPONSE')], 'many'),
    ],
  ])('drops a report with an axios error %s', async (_label, make) => {
    const input = make()
    if (input instanceof Error) input.stack = appError('wrap').stack ?? ''
    expect(isIgnoredError(input)).toBe(true)
    report(input, 'rejection', false)
    await drain()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops walking a cyclic cause chain', () => {
    const first = new Error('a')
    const second = new Error('b', { cause: first })
    Object.defineProperty(first, 'cause', { value: second })
    expect(isIgnoredError(first)).toBe(false)
  })

  it('drops an exception with no frame from the app bundle', async () => {
    const error = new Error('from a library')
    error.stack = 'Error: from a library\n    at apply (native)'
    report(error, 'global', false)
    report('a thrown string has no frames', 'rejection', false)
    await drain()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('scrubbing', () => {
  it('scrubs the type, value, frame filenames and functions before anything leaves', async () => {
    const error = new TypeError('No account for ada@example.com')
    error.name = 'Error for ada@example.com'
    error.stack = [
      'Error: No account for ada@example.com',
      '    at eyJhIjoxfQ.eyJiIjoyfQ.c2lnbmF0dXJl (http://10.0.2.2:8081/index.bundle?platform=android&token=leak:1:2)',
    ].join('\n')
    report(error, 'global', false)
    await drain()
    const body = bodyOf(fetchMock.mock.calls[0]?.[1])
    expect(body).not.toContain('ada@example.com')
    expect(body).not.toContain('token=leak')
    expect(body).not.toContain('eyJiIjoyfQ')
    expect(body).toContain('[email]')
    expect(body).toContain('?[query]')
    expect(body).toContain('[jwt]')
  })
})

describe('the fields sent', () => {
  it('sends only the fields it knows, so a field the builder adds later never leaves unscrubbed', () => {
    const [exception] = prepareExceptionList([
      {
        type: 'TypeError',
        value: 'v',
        module: 'ada@example.com',
        mechanism: { type: 'generic', handled: false, source: 'ada@example.com' },
        stacktrace: {
          type: 'raw',
          frames: [
            {
              platform: 'hermes',
              filename: 'index.android.bundle',
              function: 'render',
              lineno: 1,
              colno: 2,
              in_app: true,
              context_line: 'const email = "ada@example.com"',
              vars: { password: 'hunter2' },
              abs_path: '/Users/ada/app.js',
            },
          ],
        },
      },
    ])
    expect(exception).toEqual({
      type: 'TypeError',
      value: 'v',
      mechanism: { type: 'generic', handled: false },
      stacktrace: {
        type: 'raw',
        frames: [
          {
            platform: 'hermes',
            filename: 'index.android.bundle',
            function: 'render',
            lineno: 1,
            colno: 2,
            in_app: true,
          },
        ],
      },
    })
  })
})

describe('Hermes frames', () => {
  it('parses Hermes frames with the V8 (chrome) and gecko parsers', async () => {
    const error = new TypeError('boom')
    error.stack = [
      'TypeError: boom',
      '    at renderWidget (address at index.android.bundle:1:98765)',
      '    at apply (native)',
      'loadThing@main.jsbundle:1:234',
    ].join('\n')
    report(error, 'react', true)
    await drain()
    const [event] = sentEvents()
    const [exception] = event!.properties.$exception_list as {
      stacktrace: {
        frames: {
          platform: string
          filename: string
          function: string
          in_app: boolean
          lineno: number
        }[]
      }
    }[]
    expect(exception?.stacktrace.frames).toEqual([
      expect.objectContaining({
        platform: 'hermes',
        filename: 'main.jsbundle',
        function: 'loadThing',
        in_app: true,
        lineno: 1,
      }),
      expect.objectContaining({
        platform: 'hermes',
        filename: 'native',
        function: 'apply',
        in_app: false,
      }),
      expect.objectContaining({
        platform: 'hermes',
        filename: 'index.android.bundle',
        function: 'renderWidget',
        in_app: true,
        lineno: 1,
      }),
    ])
  })

  it.each([
    ['index.android.bundle', true],
    ['main.jsbundle', true],
    ['/data/user/0/com.example/files/index.android.bundle', true],
    ['/var/containers/Bundle/Application/ABC/App.app/main.jsbundle', true],
    ['http://10.0.2.2:8081/index.bundle?platform=android&dev=true&minify=false', true],
    ['http://localhost:8081/index.bundle//&platform=ios&dev=true', true],
    ['http://localhost:8081/src/app/index.tsx', true],
    ['http://localhost:8081/node_modules/react/cjs/react.development.js', false],
    ['http://localhost:8081/node_modules/expo-router/entry.bundle?platform=ios', false],
    ['native', false],
    ['InternalBytecode.js', false],
    ['<anonymous>', false],
    [undefined, false],
  ])('%s is in-app: %s', (filename, expected) => {
    expect(isAppFrame(filename)).toBe(expected)
  })
})

describe('the event', () => {
  it('carries app, origin, release, environment and route_id', async () => {
    report(appError('x.trim is not a function'), 'react', false)
    await drain()
    const [event] = sentEvents()
    expect(event).toMatchObject({
      event: '$exception',
      properties: {
        $exception_level: 'error',
        app: ANALYTICS_APP,
        origin: 'react',
        release: '1.4.0+42',
        environment: 'test',
        route_id: '/tenants/[slug]',
      },
    })
    expect(event?.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/)
    expect(event?.properties).not.toHaveProperty('$current_url')
    const [exception] = event!.properties.$exception_list as {
      type: string
      value: string
      mechanism: { handled: boolean }
    }[]
    expect(exception).toMatchObject({
      type: 'TypeError',
      value: 'x.trim is not a function',
      mechanism: { handled: false },
    })
  })

  it('sends an error handed over more than ten seconds after it was noted anonymous, without its route', async () => {
    const notedAt = Date.now() - STALE_ERROR_MS - 1
    report(appError('replayed'), 'global', false, notedAt)
    await drain()
    const [event] = sentEvents()
    expect(event?.timestamp).toBe(new Date(notedAt).toISOString())
    expect(event?.properties.$process_person_profile).toBe(false)
    expect(event?.properties).not.toHaveProperty('route_id')
  })

  it('never throws, whatever it is handed', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('hostile')
        },
      }
    )
    expect(() => {
      report(hostile, 'global', false)
    }).not.toThrow()
  })
})

describe('identity', () => {
  it('names the person only when analytics says capture is on and the person is identified', async () => {
    report(appError('signed in'), 'react', false)
    await drain()
    const [event] = sentEvents()
    expect(event?.distinct_id).toBe('user-a')
    expect(event?.properties.$session_id).toBe('session-1')
    expect(sessionFor).toHaveBeenCalledWith('user-a')
    expect(event?.properties).not.toHaveProperty('$process_person_profile')
  })

  it.each<[string, Settled]>([
    [
      'the SDK holds only its anonymous id',
      { distinctId: 'anon-1', capturing: true, identified: false },
    ],
    ['capture is off', { distinctId: 'user-a', capturing: false, identified: false }],
    ['analytics is inert', { distinctId: null, capturing: false, identified: false }],
  ])('sends anonymous when %s: a fresh id each time and no person', async (_label, value) => {
    settled.mockResolvedValue(value)
    report(appError('first'), 'global', false)
    report(appError('second', 'other'), 'global', false)
    await drain()
    const events = sentEvents()
    expect(events).toHaveLength(2)
    expect(events[0]?.distinct_id).not.toBe(events[1]?.distinct_id)
    for (const event of events) {
      expect(event.distinct_id).not.toBe('user-a')
      expect(event.distinct_id).not.toBe('anon-1')
      expect(event.properties.$process_person_profile).toBe(false)
      expect(event.properties).not.toHaveProperty('$session_id')
    }
  })

  it('sends anonymous after the settle cap when analytics never settles', async () => {
    settled.mockReturnValue(new Promise(() => {}))
    report(appError('early'), 'global', false)
    await jest.advanceTimersByTimeAsync(SETTLE_CAP_MS - 1)
    expect(fetchMock).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1 + BATCH_WINDOW_MS)
    expect(sentEvents()[0]?.properties.$process_person_profile).toBe(false)
    report(appError('later', 'other'), 'global', false)
    await drain()
    expect(sentEvents()).toHaveLength(2)
  })
})

describe('the throttle caps a crash loop', () => {
  it('sends at most five reports per fingerprint', async () => {
    for (let index = 0; index < FINGERPRINT_LIMIT + 3; index += 1) {
      report(appError('same place'), 'global', false)
    }
    await drain()
    expect(sentEvents()).toHaveLength(FINGERPRINT_LIMIT)
  })

  it('sends at most thirty reports per launch', async () => {
    for (let index = 0; index < LAUNCH_LIMIT + 5; index += 1) {
      report(appError('different place', `fn${String(index)}`), 'global', false)
    }
    await drain()
    await drain()
    expect(sentEvents()).toHaveLength(LAUNCH_LIMIT)
  })

  it('sends batches of ten within a two-second window', async () => {
    report(appError('alone'), 'global', false)
    await jest.advanceTimersByTimeAsync(BATCH_WINDOW_MS - 1)
    expect(fetchMock).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockClear()
    for (let index = 0; index < BATCH_SIZE + 1; index += 1) {
      report(appError('batched', `fn${String(index)}`), 'global', false)
    }
    await jest.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentEvents()).toHaveLength(BATCH_SIZE)
    await drain()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps every request within 60 KiB', async () => {
    for (let index = 0; index < BATCH_SIZE; index += 1) report(deepError(index), 'global', false)
    await jest.advanceTimersByTimeAsync(0)
    await drain()
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
    for (const [, init] of fetchMock.mock.calls) {
      expect(bytesOf(bodyOf(init))).toBeLessThanOrEqual(BATCH_MAX_BYTES)
    }
    expect(sentEvents()).toHaveLength(BATCH_SIZE)
  })
})

describe('the transport', () => {
  it('posts { api_key, batch } as JSON to the collect proxy, with no credentials', async () => {
    report(appError('posted'), 'global', false)
    await drain()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(apiUrl('/collect/batch/'))
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(JSON.stringify(init?.headers)).not.toMatch(/authorization|cookie/i)
    const body = JSON.parse(bodyOf(init)) as { api_key: string; batch: unknown[] }
    expect(body.api_key).toBe(KEY)
    expect(body.batch).toHaveLength(1)
  })

  it('retries a failed POST once after five seconds, then drops it', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'))
    fetchMock.mockResolvedValueOnce({ status: 503 })
    report(appError('retried'), 'global', false)
    await drain()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(RETRY_DELAY_MS * 3)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 4xx', async () => {
    fetchMock.mockResolvedValueOnce({ status: 400 })
    report(appError('refused'), 'global', false)
    await drain()
    await jest.advanceTimersByTimeAsync(RETRY_DELAY_MS * 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('flushes the queue, and what waits to retry, when the app goes to the background', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'))
    report(appError('waits to retry'), 'global', false)
    await drain()
    report(appError('still queued', 'other'), 'global', false)
    await jest.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    appStateListener?.('inactive')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    appStateListener?.('background')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body = JSON.parse(bodyOf(fetchMock.mock.calls[1]?.[1])) as { batch: ExceptionEvent[] }
    expect(body.batch).toHaveLength(2)
    await jest.advanceTimersByTimeAsync(RETRY_DELAY_MS + BATCH_WINDOW_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends an event still waiting for its identity anonymous when the app goes to the background', async () => {
    settled.mockReturnValue(new Promise(() => {}))
    report(appError('crash during start'), 'global', false)
    await jest.advanceTimersByTimeAsync(100)
    appStateListener?.('background')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentEvents()[0]?.properties.$process_person_profile).toBe(false)
  })

  it('sends nothing with no key, and starts no timer', async () => {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY
    report(appError('inert'), 'global', false)
    expect(jest.getTimerCount()).toBe(0)
    await drain()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(appStateListener).toBeUndefined()
  })
})

describe('fingerprintOf', () => {
  it('uses the innermost in-app frame, or the value when there is none', () => {
    const frames = [
      {
        platform: 'hermes' as const,
        filename: 'a.bundle',
        function: 'outer',
        lineno: 9,
        in_app: true,
      },
      {
        platform: 'hermes' as const,
        filename: 'b.bundle',
        function: 'inner',
        lineno: 1,
        in_app: true,
      },
      { platform: 'hermes' as const, filename: 'native', function: 'x', lineno: 3, in_app: false },
    ]
    expect(
      fingerprintOf([{ type: 'TypeError', value: 'v', stacktrace: { type: 'raw', frames } }])
    ).toBe('TypeError|b.bundle:inner:1')
    expect(fingerprintOf([{ type: 'Error', value: 'no frames' }])).toBe('Error|no frames')
  })
})

describe('a fatal crash', () => {
  /** The events kept for the next launch. */
  function pending(): ExceptionEvent[] {
    return JSON.parse(mockStored.get(PENDING_REPORTS_KEY) ?? '[]') as ExceptionEvent[]
  }

  it('is built, scrubbed and kept at once, anonymous, and not posted', () => {
    const error = appError('No account for ada@example.com')
    reportFatal(error, 'global')
    const [event] = pending()
    expect(event).toMatchObject({
      event: '$exception',
      properties: {
        origin: 'global',
        release: '1.4.0+42',
        route_id: '/tenants/[slug]',
        $process_person_profile: false,
      },
    })
    expect(event?.distinct_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/)
    expect(event?.properties).not.toHaveProperty('$session_id')
    expect(JSON.stringify(event)).not.toContain('ada@example.com')
    const [exception] = event!.properties.$exception_list as { mechanism: { handled: boolean } }[]
    expect(exception?.mechanism.handled).toBe(false)
    expect(settled).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('never stores an identified person’s id or session, since it is sent days later', () => {
    reportFatal(appError('signed in'), 'global')
    reportFatal(appError('signed in again', 'other'), 'global')
    const stored = mockStored.get(PENDING_REPORTS_KEY) ?? ''
    expect(stored).not.toContain('user-a')
    expect(stored).not.toContain('session-1')
    const [first, second] = pending()
    expect(first?.distinct_id).not.toBe(second?.distinct_id)
  })

  it('keeps at most five, dropping the oldest', () => {
    for (let index = 0; index < MAX_PENDING_REPORTS + 2; index += 1) {
      reportFatal(appError(`crash ${String(index)}`, `fn${String(index)}`), 'global')
    }
    const values = pending().map(
      (event) => (event.properties.$exception_list as { value: string }[])[0]?.value
    )
    expect(values).toEqual(['crash 2', 'crash 3', 'crash 4', 'crash 5', 'crash 6'])
  })

  it('keeps nothing for an ignored error, or with no key', () => {
    reportFatal(new AxiosError('500', 'ERR_BAD_RESPONSE'), 'global')
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY
    reportFatal(appError('inert'), 'global')
    expect(mockStored.has(PENDING_REPORTS_KEY)).toBe(false)
  })
})

describe('the next launch', () => {
  /** Keeps two crashes, as a launch that ended would have. */
  function keepTwo(): void {
    reportFatal(appError('first crash'), 'global')
    reportFatal(appError('second crash', 'other'), 'global')
  }

  it('sends the kept crashes to the collect proxy and clears them on a 2xx', async () => {
    keepTwo()
    sendPendingReports()
    await jest.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(apiUrl('/collect/batch/'))
    expect(sentEvents()).toHaveLength(2)
    expect(mockStored.has(PENDING_REPORTS_KEY)).toBe(false)
  })

  it('clears them on a 4xx', async () => {
    keepTwo()
    fetchMock.mockResolvedValueOnce({ status: 400 })
    sendPendingReports()
    await jest.advanceTimersByTimeAsync(0)
    expect(mockStored.has(PENDING_REPORTS_KEY)).toBe(false)
  })

  it.each<[string, () => void]>([
    [
      'a network failure',
      () => {
        fetchMock.mockRejectedValue(new TypeError('Network request failed'))
      },
    ],
    [
      'a 5xx',
      () => {
        fetchMock.mockResolvedValue({ status: 503 })
      },
    ],
  ])('keeps them after %s, retry included', async (_label, fail) => {
    keepTwo()
    fail()
    sendPendingReports()
    await jest.advanceTimersByTimeAsync(RETRY_DELAY_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(mockStored.get(PENDING_REPORTS_KEY) ?? '[]')).toHaveLength(2)
  })

  it('keeps a crash kept after the send started', async () => {
    keepTwo()
    sendPendingReports()
    reportFatal(appError('third crash', 'third'), 'global')
    await jest.advanceTimersByTimeAsync(0)
    const left = JSON.parse(mockStored.get(PENDING_REPORTS_KEY) ?? '[]') as ExceptionEvent[]
    expect(left).toHaveLength(1)
  })

  it('sends nothing when nothing is kept, or with no key', async () => {
    sendPendingReports()
    keepTwo()
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY
    sendPendingReports()
    await jest.advanceTimersByTimeAsync(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

import { jest } from '@jest/globals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'
import { NotificationStream } from '@/components/notifications/notification-stream'
import { NoRefreshTokenError } from '@/http/auth-verdict'
import { apiUrl } from '@/http/client'
import * as session from '@/http/session'
import { notificationKeys } from '@/queries/notification.queries'
import { useAuthStore } from '@/states/auth.store'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

/** The life of one fake stream request. */
type StreamState = 'pending' | 'open' | 'refused' | 'failed' | 'ended' | 'aborted'

/** One request the fake fetch received, and the controls a case answers it with. */
interface FakeStream {
  url: string
  /** The request headers, less `Accept`, which the transport always sends. */
  headers: Record<string, string>
  state: StreamState
  accept: () => void
  refuse: (status: number, body?: unknown, headers?: Record<string, string>) => void
  /** Rejects the request, or errors the body of an open stream. */
  fail: () => void
  send: (frame: string) => void
  end: () => void
}

/** Every stream request, in order. */
const mockStreams: FakeStream[] = []
/** The most streams pending or open at one time, over the case. */
let mockMaxOpen = 0

/**
 * Counts the streams pending or open.
 * @returns How many.
 */
function openCount(): number {
  return mockStreams.filter((s) => s.state === 'pending' || s.state === 'open').length
}

/**
 * The fake `expo/fetch`: each call holds until the case answers it, and an
 * abort rejects the request or errors its body.
 * @param url - The request URL.
 * @param init - The request headers and signal.
 * @returns A response the case controls.
 */
function mockFetch(
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
): Promise<unknown> {
  const encoder = new TextEncoder()
  let body: ReadableStreamDefaultController<Uint8Array> | undefined
  const {
    promise: response,
    resolve: resolveResponse,
    reject: rejectResponse,
  } = Promise.withResolvers<unknown>()
  const { Accept: accept, ...headers } = init.headers
  expect(accept).toBe('text/event-stream')
  const stream: FakeStream = {
    url,
    headers,
    state: 'pending',
    accept: () => {
      stream.state = 'open'
      resolveResponse({
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(''),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            body = controller
          },
        }),
      })
    },
    refuse: (status, data = {}, headers = {}) => {
      stream.state = 'refused'
      const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
      resolveResponse({
        status,
        ok: false,
        headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
        text: () => Promise.resolve(JSON.stringify(data)),
        body: null,
      })
    },
    fail: () => {
      const error = new TypeError('Network request failed')
      if (stream.state === 'open') body?.error(error)
      else rejectResponse(error)
      stream.state = 'failed'
    },
    send: (frame) => {
      body?.enqueue(encoder.encode(frame))
    },
    end: () => {
      stream.state = 'ended'
      body?.close()
    },
  }
  init.signal.addEventListener('abort', () => {
    if (stream.state === 'pending') rejectResponse(new Error('aborted'))
    if (stream.state === 'open') body?.error(new Error('aborted'))
    if (stream.state === 'pending' || stream.state === 'open') stream.state = 'aborted'
  })
  mockStreams.push(stream)
  mockMaxOpen = Math.max(mockMaxOpen, openCount())
  return response
}

jest.mock('expo/fetch', () => ({
  fetch: (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) =>
    mockFetch(url, init),
}))

/** The stream's URL. */
const STREAM_URL = apiUrl('/notifications/stream')

/** A signed-in user. */
const USER = { id: 'u1', email: 'a@b.test' } as User

/** The AppState listener the component registered. */
let appStateListener: ((state: AppStateStatus) => void) | undefined

/** The query client of the case. */
let queryClient: QueryClient
/** Spies on the client's invalidations. */
let invalidate: jest.SpiedFunction<QueryClient['invalidateQueries']>
/** The mocked session refresh. */
let ensureSession: jest.SpiedFunction<typeof session.ensureSession>

/**
 * Lets pending promises and stream reads settle.
 */
async function flush(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0)
  })
}

/**
 * Moves the fake clock and settles what it starts.
 * @param ms - How far.
 */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

/**
 * Runs a step against the streams, then settles.
 * @param step - What the case does.
 */
async function step(step: () => void): Promise<void> {
  await act(async () => {
    step()
    await jest.advanceTimersByTimeAsync(0)
  })
}

/**
 * The latest stream request.
 * @returns It; fails the case when there is none.
 */
function latest(): FakeStream {
  const stream = mockStreams.at(-1)
  if (!stream) throw new Error('no stream was opened')
  return stream
}

/**
 * Reports an app state change to the component.
 * @param state - The new state.
 */
async function emit(state: AppStateStatus): Promise<void> {
  await step(() => {
    Object.defineProperty(AppState, 'currentState', { value: state, configurable: true })
    appStateListener?.(state)
  })
}

/**
 * Whether the client invalidated `queryKey` since the spy was last cleared.
 * @param queryKey - The key.
 * @returns True when some call named it.
 */
function invalidated(queryKey: readonly unknown[]): boolean {
  return invalidate.mock.calls.some(
    ([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(queryKey)
  )
}

/**
 * Renders the stream and settles its first connect.
 */
async function mount(): Promise<void> {
  await render(
    <QueryClientProvider client={queryClient}>
      <NotificationStream />
    </QueryClientProvider>
  )
  await flush()
}

/** A notification frame. */
const notificationFrame = (id: string) =>
  `id: ${id}\nevent: notification\ndata: {"id":"${id}","type":"x","title":"t","body":"b","readAt":null,"createdAt":"2026-11-07T00:00:00Z"}\n\n`

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] })
  jest.spyOn(Math, 'random').mockReturnValue(0)
  mockStreams.length = 0
  mockMaxOpen = 0
  appStateListener = undefined
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true })
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateListener = handler
    return { remove: jest.fn() }
  })
  useAuthStore.setState({ accessToken: 't1', user: USER, isAuthenticated: true })
  useMaintenanceModeStore.setState({ mode: 'off' })
  usePasskeySetupStore.setState({ required: false })
  queryClient = new QueryClient()
  invalidate = jest.spyOn(queryClient, 'invalidateQueries')
  let refreshes = 0
  ensureSession = jest.spyOn(session, 'ensureSession').mockImplementation(() => {
    refreshes += 1
    const token = `t${String(refreshes + 1)}`
    useAuthStore.setState({ accessToken: token })
    return Promise.resolve(token)
  })
})

afterEach(() => {
  expect(mockMaxOpen).toBeLessThanOrEqual(1)
  jest.useRealTimers()
  jest.restoreAllMocks()
  useAuthStore.setState({ accessToken: null, user: null, isAuthenticated: false })
})

describe('NotificationStream', () => {
  it('opens with the bearer token, then refetches the list and every cached billing read', async () => {
    queryClient.setQueryData(['tenants', 'acme', 'entitlements'], {})
    queryClient.setQueryData(['tenants', 'beta', 'members'], {})
    queryClient.setQueryData(['tenants', '_pages', 'billing'], {})
    await mount()
    expect(mockStreams).toHaveLength(1)
    expect(latest().url).toBe(STREAM_URL)
    expect(latest().headers).toEqual({ Authorization: 'Bearer t1' })
    expect(invalidated(notificationKeys.list)).toBe(false)
    await step(() => {
      latest().accept()
    })
    expect(invalidated(notificationKeys.list)).toBe(true)
    expect(invalidated(['tenants', 'acme', 'entitlements'])).toBe(true)
    expect(invalidated(['tenants', 'acme', 'billing'])).toBe(true)
    expect(invalidated(['tenants', 'beta', 'entitlements'])).toBe(false)
    expect(invalidated(['tenants', '_pages', 'entitlements'])).toBe(false)
    expect(ensureSession).not.toHaveBeenCalled()
  })

  it('refreshes first when the store holds no token', async () => {
    useAuthStore.setState({ accessToken: null })
    await mount()
    expect(ensureSession).toHaveBeenCalledTimes(1)
    expect(latest().headers.Authorization).toBe('Bearer t2')
  })

  it('refetches the list on a notification frame and keeps its id', async () => {
    await mount()
    await step(() => {
      latest().accept()
    })
    invalidate.mockClear()
    await step(() => {
      latest().send(notificationFrame('n1'))
    })
    expect(invalidated(notificationKeys.list)).toBe(true)
    await step(() => {
      latest().end()
    })
    expect(latest().headers['Last-Event-ID']).toBe('n1')
  })

  it('refetches one workspace’s billing on entitlements_changed', async () => {
    await mount()
    await step(() => {
      latest().accept()
    })
    invalidate.mockClear()
    await step(() => {
      latest().send('event: entitlements_changed\ndata: {"tenantId":"t","slug":"beta"}\n\n')
    })
    expect(invalidated(['tenants', 'beta', 'entitlements'])).toBe(true)
    expect(invalidated(['tenants', 'beta', 'billing'])).toBe(true)
    expect(invalidated(notificationKeys.list)).toBe(false)
  })

  it('reopens after the server closes, with the last event id', async () => {
    await mount()
    await step(() => {
      latest().accept()
    })
    await step(() => {
      latest().send(notificationFrame('n7'))
    })
    await step(() => {
      latest().end()
    })
    expect(ensureSession).toHaveBeenCalledTimes(1)
    expect(mockStreams).toHaveLength(2)
    expect(latest().headers).toEqual({ Authorization: 'Bearer t2', 'Last-Event-ID': 'n7' })
  })

  it('refreshes and reopens at once after a 401', async () => {
    await mount()
    await step(() => {
      latest().refuse(401, { code: 'ACCESS_TOKEN_EXPIRED' })
    })
    expect(ensureSession).toHaveBeenCalledTimes(1)
    expect(mockStreams).toHaveLength(2)
    expect(latest().headers.Authorization).toBe('Bearer t2')
  })

  it('falls back to the backoff when two connects in a row end at once with no frame', async () => {
    await mount()
    await step(() => {
      latest().accept()
    })
    await step(() => {
      latest().end()
    })
    expect(mockStreams).toHaveLength(2)
    await step(() => {
      latest().accept()
    })
    await step(() => {
      latest().end()
    })
    expect(mockStreams).toHaveLength(2)
    await advance(999)
    expect(mockStreams).toHaveLength(2)
    await advance(1)
    expect(mockStreams).toHaveLength(3)
    expect(ensureSession).toHaveBeenCalledTimes(2)
  })

  it('reopens at once after a stream that lasted', async () => {
    await mount()
    await step(() => {
      latest().accept()
    })
    await step(() => {
      latest().send(notificationFrame('n1'))
    })
    await advance(15 * 60_000)
    await step(() => {
      latest().end()
    })
    expect(mockStreams).toHaveLength(2)
  })

  it('stops on an auth verdict from the refresh', async () => {
    await mount()
    ensureSession.mockRejectedValue(new NoRefreshTokenError())
    await step(() => {
      latest().refuse(401)
    })
    await advance(10 * 60_000)
    expect(mockStreams).toHaveLength(1)
    expect(ensureSession).toHaveBeenCalledTimes(1)
  })

  it('retries a refresh that failed on the network after the backoff', async () => {
    await mount()
    ensureSession.mockRejectedValueOnce(new Error('offline'))
    await step(() => {
      latest().accept()
    })
    await step(() => {
      latest().end()
    })
    expect(mockStreams).toHaveLength(1)
    await advance(1000)
    expect(ensureSession).toHaveBeenCalledTimes(2)
    expect(mockStreams).toHaveLength(2)
  })

  it('a 429 stops until the next foreground', async () => {
    await mount()
    await step(() => {
      latest().refuse(429, { code: 'too_many_streams', message: 'tabs' })
    })
    await advance(10 * 60_000)
    expect(mockStreams).toHaveLength(1)
    await emit('inactive')
    await emit('active')
    expect(mockStreams).toHaveLength(1)
    await emit('background')
    await emit('active')
    expect(mockStreams).toHaveLength(2)
  })

  it('treats a 429 with another code as a 503', async () => {
    await mount()
    await step(() => {
      latest().refuse(429, { code: 'RATE_LIMITED' })
    })
    await advance(1000)
    expect(mockStreams).toHaveLength(2)
  })

  it('sets the passkey flag on 403 PASSKEY_SETUP_REQUIRED and stops', async () => {
    await mount()
    await step(() => {
      latest().refuse(403, { code: 'PASSKEY_SETUP_REQUIRED' })
    })
    expect(usePasskeySetupStore.getState().required).toBe(true)
    await advance(10 * 60_000)
    expect(mockStreams).toHaveLength(1)
  })

  it('waits the longer of the backoff and Retry-After after a 503, plus jitter', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    await mount()
    await step(() => {
      latest().refuse(503, { code: 'stream_capacity' }, { 'Retry-After': '30' })
    })
    await advance(32_999)
    expect(mockStreams).toHaveLength(1)
    await advance(1)
    expect(mockStreams).toHaveLength(2)
    expect(ensureSession).not.toHaveBeenCalled()
  })

  it('caps Retry-After at 5 minutes', async () => {
    await mount()
    await step(() => {
      latest().refuse(503, {}, { 'Retry-After': '3600' })
    })
    await advance(299_999)
    expect(mockStreams).toHaveLength(1)
    await advance(1)
    expect(mockStreams).toHaveLength(2)
  })

  it('doubles the backoff after each refusal and resets it on a notification', async () => {
    await mount()
    await step(() => {
      latest().refuse(503)
    })
    await advance(1000)
    expect(mockStreams).toHaveLength(2)
    await step(() => {
      latest().refuse(500)
    })
    await advance(1999)
    expect(mockStreams).toHaveLength(2)
    await advance(1)
    expect(mockStreams).toHaveLength(3)
    await step(() => {
      latest().accept()
    })
    await step(() => {
      latest().send(notificationFrame('n1'))
    })
    await advance(5000)
    await step(() => {
      latest().fail()
    })
    expect(mockStreams).toHaveLength(3)
    await advance(1000)
    expect(mockStreams).toHaveLength(4)
  })

  it('reopens after a network failure once the backoff passes', async () => {
    await mount()
    await step(() => {
      latest().fail()
    })
    await advance(999)
    expect(mockStreams).toHaveLength(1)
    await advance(1)
    expect(mockStreams).toHaveLength(2)
    await step(() => {
      latest().fail()
    })
    await advance(1999)
    expect(mockStreams).toHaveLength(2)
    await advance(1)
    expect(mockStreams).toHaveLength(3)
  })

  it('closes in the background and reopens in the foreground', async () => {
    await mount()
    await step(() => {
      latest().accept()
    })
    await step(() => {
      latest().send(notificationFrame('n3'))
    })
    await emit('background')
    expect(latest().state).toBe('aborted')
    expect(openCount()).toBe(0)
    await advance(60_000)
    expect(mockStreams).toHaveLength(1)
    await emit('active')
    expect(mockStreams).toHaveLength(2)
    expect(latest().headers).toEqual({ Authorization: 'Bearer t1', 'Last-Event-ID': 'n3' })
  })

  it('keeps the stream open while inactive', async () => {
    await mount()
    await step(() => {
      latest().accept()
    })
    await emit('inactive')
    expect(latest().state).toBe('open')
    await emit('active')
    expect(mockStreams).toHaveLength(1)
  })

  it('clears a pending reconnect in the background', async () => {
    await mount()
    await step(() => {
      latest().refuse(503)
    })
    await emit('background')
    await advance(60_000)
    expect(mockStreams).toHaveLength(1)
  })

  it('opens nothing when the app starts in the background', async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true })
    await mount()
    expect(mockStreams).toHaveLength(0)
    await emit('active')
    expect(mockStreams).toHaveLength(1)
  })

  it('aborts on sign-out and forgets the last event id', async () => {
    await mount()
    await step(() => {
      latest().accept()
    })
    await step(() => {
      latest().send(notificationFrame('n9'))
    })
    await step(() => {
      useAuthStore.getState().logout()
    })
    expect(latest().state).toBe('aborted')
    await advance(60_000)
    expect(mockStreams).toHaveLength(1)
    await step(() => {
      useAuthStore.getState().login('t5', USER)
    })
    expect(mockStreams).toHaveLength(2)
    expect(latest().headers).toEqual({ Authorization: 'Bearer t5' })
  })

  it('closes in maintenance full and reopens when it ends', async () => {
    await mount()
    await step(() => {
      latest().accept()
    })
    await step(() => {
      useMaintenanceModeStore.setState({ mode: 'full' })
    })
    expect(latest().state).toBe('aborted')
    await advance(60_000)
    expect(mockStreams).toHaveLength(1)
    await step(() => {
      useMaintenanceModeStore.setState({ mode: 'off' })
    })
    expect(mockStreams).toHaveLength(2)
  })

  it('keeps the open stream when the foreground refresh swaps the token', async () => {
    await mount()
    await step(() => {
      latest().accept()
    })
    await step(() => {
      useAuthStore.setState({ accessToken: 'fresh' })
    })
    expect(mockStreams).toHaveLength(1)
    expect(latest().state).toBe('open')
    await step(() => {
      latest().end()
    })
    expect(latest().headers.Authorization).toBe('Bearer t2')
  })
})

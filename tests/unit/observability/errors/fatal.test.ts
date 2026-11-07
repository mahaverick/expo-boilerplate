/**
 * @file A fatal crash end to end, through the real listener and reporter: the
 * event is kept in MMKV before React Native's handler ends the process, and
 * the next launch sends it. A non-fatal error takes the batch path.
 */
import { jest } from '@jest/globals'
import { apiUrl } from '@/http/client'
import { installErrorListeners, resetErrorListenForTests } from '@/observability/errors/listen'
import {
  BATCH_WINDOW_MS,
  PENDING_REPORTS_KEY,
  resetReporterForTests,
  SETTLE_CAP_MS,
  type ExceptionEvent,
} from '@/observability/errors/report'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.4.0',
  nativeBuildVersion: '42',
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

/** React Native's global error handler signature. */
type GlobalHandler = (error: unknown, isFatal?: boolean) => void

/** The global the listener wraps. */
interface ErrorUtilsGlobal {
  ErrorUtils?: {
    getGlobalHandler: () => GlobalHandler
    setGlobalHandler: (handler: GlobalHandler) => void
  }
}

const globals = globalThis as unknown as ErrorUtilsGlobal
const saved = { errorUtils: globals.ErrorUtils, key: process.env.EXPO_PUBLIC_POSTHOG_KEY }
const savedFetch = globalThis.fetch
const fetchMock = jest.fn<(url: string, init: RequestInit) => Promise<{ status: number }>>()
const previous = jest.fn<GlobalHandler>()
/** The handler installed now. */
let current: GlobalHandler = previous

/** An error whose stack names the release bundle. */
function appError(message: string): Error {
  const error = new TypeError(message)
  error.stack = `TypeError: ${message}\n    at renderWidget (address at index.android.bundle:1:200)`
  return error
}

/** Every event posted so far. */
function sentEvents(): ExceptionEvent[] {
  return fetchMock.mock.calls.flatMap(
    ([, init]) =>
      (JSON.parse(typeof init.body === 'string' ? init.body : '{}') as { batch: ExceptionEvent[] })
        .batch
  )
}

/** Starts a launch: a fresh listener and reporter over the same storage. */
function launch(): void {
  resetErrorListenForTests()
  resetReporterForTests()
  current = previous
  installErrorListeners()
}

beforeEach(() => {
  jest.useFakeTimers()
  mockStored.clear()
  process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test_key_not_real'
  previous.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ status: 200 })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  globals.ErrorUtils = {
    getGlobalHandler: () => current,
    setGlobalHandler: (handler) => {
      current = handler
    },
  }
})

afterEach(() => {
  resetErrorListenForTests()
  resetReporterForTests()
  jest.useRealTimers()
  globalThis.fetch = savedFetch
  globals.ErrorUtils = saved.errorUtils
  if (saved.key === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_KEY
  else process.env.EXPO_PUBLIC_POSTHOG_KEY = saved.key
})

describe('a fatal crash', () => {
  it('is kept before the previous handler runs, and the next launch sends and clears it', async () => {
    let keptWhenPreviousRan: string | undefined
    previous.mockImplementation(() => {
      keptWhenPreviousRan = mockStored.get(PENDING_REPORTS_KEY)
      throw new Error('the process ends here')
    })
    launch()
    expect(() => {
      current(appError('fatal crash'), true)
    }).toThrow('the process ends here')
    expect(JSON.parse(keptWhenPreviousRan ?? '[]')).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()

    launch()
    await jest.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(apiUrl('/collect/batch/'))
    const [event] = sentEvents()
    expect(event?.properties).toMatchObject({ origin: 'global' })
    expect(mockStored.has(PENDING_REPORTS_KEY)).toBe(false)
  })

  it('a non-fatal error takes the batch path and keeps nothing', async () => {
    launch()
    current(appError('soft'), false)
    expect(previous).toHaveBeenCalledTimes(1)
    expect(mockStored.has(PENDING_REPORTS_KEY)).toBe(false)
    // Analytics never started here, so the event waits out the settle cap, then goes anonymous.
    await jest.advanceTimersByTimeAsync(SETTLE_CAP_MS + BATCH_WINDOW_MS)
    expect(sentEvents()).toHaveLength(1)
  })
})

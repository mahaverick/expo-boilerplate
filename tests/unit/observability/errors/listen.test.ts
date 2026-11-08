/**
 * @file The error listeners: `noteError`'s guards and dedupe, the wrapped
 * global handler, and Hermes's promise rejection tracker.
 */
import { jest } from '@jest/globals'
import {
  installErrorListeners,
  noteError,
  resetErrorListenForTests,
  RETHROW_WINDOW_MS,
} from '@/observability/errors/listen'
import { report, reportFatal, sendPendingReports } from '@/observability/errors/report'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('@/observability/errors/report', () => ({
  report: jest.fn(),
  reportFatal: jest.fn(),
  sendPendingReports: jest.fn(),
}))

/** React Native's global error handler signature. */
type GlobalHandler = (error: unknown, isFatal?: boolean) => void

/** The options Hermes's rejection tracker takes. */
interface TrackerOptions {
  allRejections: boolean
  onUnhandled: (id: number, rejection: unknown) => void
  onHandled: (id: number) => void
}

/** The globals the listeners read. */
interface ListenGlobals {
  ErrorUtils?: {
    getGlobalHandler: () => GlobalHandler
    setGlobalHandler: (handler: GlobalHandler) => void
  }
  HermesInternal?: {
    hasPromise?: () => boolean
    enablePromiseRejectionTracker?: (options: TrackerOptions) => void
  } | null
  __DEV__: boolean
}

const globals = globalThis as unknown as ListenGlobals
const saved = {
  errorUtils: globals.ErrorUtils,
  hermes: globals.HermesInternal,
  dev: globals.__DEV__,
  key: process.env.EXPO_PUBLIC_POSTHOG_KEY,
}
const reported = jest.mocked(report)
const fatal = jest.mocked(reportFatal)
const sendPending = jest.mocked(sendPendingReports)

/** The handler React Native had before the install. */
const previous = jest.fn<GlobalHandler>()
/** The handler installed now. */
let current: GlobalHandler = previous
const enableTracker = jest.fn<(options: TrackerOptions) => void>()

beforeEach(() => {
  resetErrorListenForTests()
  process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test_key_not_real'
  reported.mockReset()
  fatal.mockReset()
  sendPending.mockReset()
  previous.mockReset()
  enableTracker.mockReset()
  current = previous
  globals.ErrorUtils = {
    getGlobalHandler: () => current,
    setGlobalHandler: (handler) => {
      current = handler
    },
  }
  globals.HermesInternal = { hasPromise: () => true, enablePromiseRejectionTracker: enableTracker }
  globals.__DEV__ = false
})

afterEach(() => {
  resetErrorListenForTests()
  globals.ErrorUtils = saved.errorUtils
  globals.HermesInternal = saved.hermes
  globals.__DEV__ = saved.dev
  if (saved.key === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_KEY
  else process.env.EXPO_PUBLIC_POSTHOG_KEY = saved.key
})

describe('noteError', () => {
  it('hands the error to the reporter', () => {
    const error = new Error('boom')
    noteError(error, 'react', false)
    expect(reported).toHaveBeenCalledWith(error, 'react', false)
  })

  it('notes an error object once, and a re-throw of the same crash once', () => {
    const error = new Error('boom')
    noteError(error, 'react', false)
    noteError(error, 'global', false)
    const again = new Error('boom')
    again.stack = error.stack ?? ''
    noteError(again, 'global', false)
    expect(reported).toHaveBeenCalledTimes(1)
  })

  it('notes the same crash again after the re-throw window', () => {
    jest.useFakeTimers()
    try {
      const error = new Error('boom')
      noteError(error, 'react', false)
      jest.advanceTimersByTime(RETHROW_WINDOW_MS)
      const again = new Error('boom')
      again.stack = error.stack ?? ''
      noteError(again, 'react', false)
      expect(reported).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('is a no-op with no key, and starts no timer', () => {
    jest.useFakeTimers()
    try {
      delete process.env.EXPO_PUBLIC_POSTHOG_KEY
      noteError(new Error('inert'), 'global', false)
      expect(reported).not.toHaveBeenCalled()
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('never throws, even when the reporter does', () => {
    reported.mockImplementation(() => {
      throw new Error('reporter')
    })
    expect(() => {
      noteError(new Error('boom'), 'react', false)
    }).not.toThrow()
  })
})

describe('installErrorListeners', () => {
  it('the global handler still calls the previous handler', () => {
    installErrorListeners()
    const soft = new Error('soft')
    current(soft, false)
    expect(reported).toHaveBeenCalledWith(soft, 'global', false)
    expect(fatal).not.toHaveBeenCalled()
    expect(previous).toHaveBeenCalledWith(soft, false)
    const unflagged = new Error('unflagged')
    current(unflagged)
    expect(reported).toHaveBeenLastCalledWith(unflagged, 'global', false)
    expect(previous.mock.calls.at(-1)).toEqual([unflagged])
  })

  it('keeps a fatal error for the next launch before the previous handler runs, even one that throws', () => {
    previous.mockImplementation(() => {
      expect(fatal).toHaveBeenCalledTimes(1)
      throw new Error('the process ends here')
    })
    installErrorListeners()
    const error = new Error('fatal')
    expect(() => {
      current(error, true)
    }).toThrow('the process ends here')
    expect(fatal).toHaveBeenCalledWith(error, 'global')
    expect(reported).not.toHaveBeenCalled()
    expect(previous).toHaveBeenCalledWith(error, true)
  })

  it('notes a fatal error object once', () => {
    installErrorListeners()
    const error = new Error('fatal')
    noteError(error, 'react', true)
    current(error, true)
    expect(fatal).not.toHaveBeenCalled()
    expect(previous).toHaveBeenCalledTimes(1)
  })

  it('sends the reports kept by the last launch', () => {
    installErrorListeners()
    expect(sendPending).toHaveBeenCalledTimes(1)
  })

  it('installs nothing and reads nothing with no key', () => {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY
    installErrorListeners()
    expect(current).toBe(previous)
    expect(enableTracker).not.toHaveBeenCalled()
    expect(sendPending).not.toHaveBeenCalled()
  })

  it('installs once', () => {
    installErrorListeners()
    installErrorListeners()
    current(new Error('soft'), false)
    expect(previous).toHaveBeenCalledTimes(1)
    expect(enableTracker).toHaveBeenCalledTimes(1)
    expect(sendPending).toHaveBeenCalledTimes(1)
  })

  it('reports an unhandled rejection through Hermes’s tracker', () => {
    installErrorListeners()
    expect(enableTracker).toHaveBeenCalledWith(expect.objectContaining({ allRejections: true }))
    const reason = new Error('rejected')
    enableTracker.mock.calls[0]?.[0].onUnhandled(1, reason)
    expect(reported).toHaveBeenCalledWith(reason, 'rejection', false)
  })

  it.each<[string, () => void]>([
    [
      'in a development build, where React Native’s own tracker shows the warning',
      () => {
        globals.__DEV__ = true
      },
    ],
    [
      'when Promise is not Hermes’s own',
      () => {
        globals.HermesInternal = {
          hasPromise: () => false,
          enablePromiseRejectionTracker: enableTracker,
        }
      },
    ],
    [
      'without Hermes',
      () => {
        globals.HermesInternal = null
      },
    ],
  ])('leaves rejections alone %s', (_label, arrange) => {
    arrange()
    installErrorListeners()
    expect(enableTracker).not.toHaveBeenCalled()
  })

  it('installs nothing without ErrorUtils, and does not throw', () => {
    delete globals.ErrorUtils
    expect(() => {
      installErrorListeners()
    }).not.toThrow()
  })
})

/**
 * @file Where errors are noticed: `noteError`, which the root error boundary
 * calls, and the listeners `installErrorListeners` adds for the errors no
 * boundary sees. With no PostHog key, nothing is noted or installed.
 *
 * - **Uncaught errors** reach React Native's global handler. The install wraps
 *   it, notes the error, then calls the handler it replaced with the same
 *   arguments, so the red box and the crash still happen. No error screen
 *   shows, so every one is reported as unhandled.
 * - **A fatal error** ends the process inside that handler, before a promise
 *   or a timer runs, so it is kept in MMKV synchronously (`reportFatal`) and
 *   the next launch's install sends it (`sendPendingReports`).
 * - **Unhandled rejections** reach Hermes's rejection tracker, which the
 *   install enables only in a release build whose `Promise` is Hermes's own.
 *   A development build already enables it with React Native's options, which
 *   raise the "Possible unhandled promise rejection" warning, and a second
 *   call would replace them. Chaining to those options would need an untyped
 *   import of React Native's internals, so a development build reports no
 *   rejection. Without Hermes's `Promise`, the tracker never sees a
 *   rejection, so nothing is enabled.
 */
import { analyticsConfig } from '@/observability/telemetry/config'
import { report, reportFatal, sendPendingReports, type ErrorOrigin } from './report'

/**
 * How long a second error with the same name, message and stack counts as a
 * re-throw of the crash it repeats. React's value.
 */
export const RETHROW_WINDOW_MS = 1000

/** React Native's global error handler. */
type GlobalHandler = (error: unknown, isFatal?: boolean) => void

/** The options Hermes's rejection tracker takes. */
interface RejectionTrackerOptions {
  allRejections: boolean
  onUnhandled: (id: number, rejection: unknown) => void
  onHandled: (id: number) => void
}

/** The globals the install reads, each of which a runtime can lack. */
interface ErrorGlobals {
  ErrorUtils?: {
    getGlobalHandler?: () => GlobalHandler
    setGlobalHandler?: (handler: GlobalHandler) => void
  }
  HermesInternal?: {
    hasPromise?: () => boolean
    enablePromiseRejectionTracker?: (options: RejectionTrackerOptions) => void
  } | null
}

const seen = new WeakSet<object>()
/** When each recently noted name, message and stack was first noted. */
const recent = new Map<string, number>()
let isInstalled = false
/** The handler the install replaced, put back by the test reset. */
let replaced: { handler: GlobalHandler; set: (handler: GlobalHandler) => void } | undefined

/**
 * Whether an error repeats one noted less than `RETHROW_WINDOW_MS` ago: the
 * same name, message and stack. Records it when it does not. An error without
 * a stack never repeats one.
 */
function isRethrow(error: object): boolean {
  const { name, message, stack } = error as { name?: unknown; message?: unknown; stack?: unknown }
  if (typeof stack !== 'string' || stack === '') return false
  const now = Date.now()
  for (const [key, at] of recent) if (now - at >= RETHROW_WINDOW_MS) recent.delete(key)
  const key = `${String(name)}\n${String(message)}\n${stack}`
  if (recent.has(key)) return true
  recent.set(key, now)
  return false
}

/**
 * Whether an error is new: an error object is noted once, whichever source
 * sees it first, and so is a re-throw of the same crash. False with no
 * PostHog key.
 */
function isNew(error: unknown): boolean {
  if (analyticsConfig().key === null) return false
  if (typeof error !== 'object' || error === null) return true
  if (seen.has(error)) return false
  seen.add(error)
  return !isRethrow(error)
}

/**
 * Hands one error to the reporter, once (see `isNew`). With no PostHog key it
 * does nothing. Never throws.
 * @param error - What was thrown or rejected, as received.
 * @param origin - Where it was noticed.
 * @param handled - True when the app shows the person an error screen for it.
 */
export function noteError(error: unknown, origin: ErrorOrigin, handled: boolean): void {
  try {
    if (isNew(error)) report(error, origin, handled)
  } catch {
    // Error tracking never fails the app.
  }
}

/** Keeps a fatal error for the next launch, once (see `isNew`). Never throws. */
function noteFatal(error: unknown): void {
  try {
    if (isNew(error)) reportFatal(error, 'global')
  } catch {
    // Error tracking never fails the app.
  }
}

/** Wraps React Native's global handler, keeping the one it replaces. */
function wrapGlobalHandler(errorUtils: ErrorGlobals['ErrorUtils']): void {
  const get = errorUtils?.getGlobalHandler
  const set = errorUtils?.setGlobalHandler
  if (!get || !set) return
  const previous = get.call(errorUtils)
  /** Installs a handler through `ErrorUtils`, bound to it. */
  const setHandler = (handler: GlobalHandler) => {
    set.call(errorUtils, handler)
  }
  replaced = { handler: previous, set: setHandler }
  setHandler((...args: Parameters<GlobalHandler>) => {
    if (args[1] === true) noteFatal(args[0])
    else noteError(args[0], 'global', false)
    previous(...args)
  })
}

/** Enables Hermes's rejection tracker in a release build whose `Promise` is Hermes's. */
function trackRejections(hermes: ErrorGlobals['HermesInternal']): void {
  if (__DEV__ || !hermes?.hasPromise?.() || !hermes.enablePromiseRejectionTracker) return
  hermes.enablePromiseRejectionTracker({
    allRejections: true,
    onUnhandled: (_id, rejection) => {
      noteError(rejection, 'rejection', false)
    },
    onHandled: () => undefined,
  })
}

/**
 * Wraps React Native's global error handler, enables Hermes's promise
 * rejection tracker, and sends the fatal crashes the last launch kept. With
 * no PostHog key it installs and reads nothing. Idempotent; the root layout
 * calls it at module load.
 */
export function installErrorListeners(): void {
  if (isInstalled || analyticsConfig().key === null) return
  isInstalled = true
  const globals = globalThis as unknown as ErrorGlobals
  try {
    wrapGlobalHandler(globals.ErrorUtils)
    trackRejections(globals.HermesInternal)
  } catch {
    // A runtime without these hooks reports nothing.
  }
  sendPendingReports()
}

/** Test-only: put back the replaced handler and forget the install and the recent re-throw keys. */
export function resetErrorListenForTests(): void {
  replaced?.set(replaced.handler)
  replaced = undefined
  isInstalled = false
  recent.clear()
}

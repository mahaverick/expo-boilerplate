/**
 * @file Runs after the test framework loads, before each test file.
 *
 * - TanStack Query's timers (a query's garbage-collection timeout, 5 minutes
 *   by default) are unref'd, so a QueryClient a shared test leaves behind
 *   never holds its Jest worker open after the file ends.
 * - Each case starts with no toast queued, whatever the case before it raised.
 */
import { afterEach } from '@jest/globals'
import { timeoutManager, type ManagedTimerId } from '@tanstack/react-query'
import { toast } from '@/lib/toast'

/** A Node timer handle, which `unref()` frees from keeping the process alive. */
type NodeTimer = ReturnType<typeof globalThis.setTimeout> & { unref?: () => void }

/**
 * Lets the process exit with `timer` still pending.
 * @param timer - The handle `setTimeout` or `setInterval` returned.
 * @returns The same handle.
 */
function unref(timer: NodeTimer): ManagedTimerId {
  timer.unref?.()
  return timer
}

timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) => unref(setTimeout(callback, delay)),
  clearTimeout: (id) => {
    clearTimeout(id as unknown as NodeTimer)
  },
  setInterval: (callback, delay) => unref(setInterval(callback, delay)),
  clearInterval: (id) => {
    clearInterval(id as unknown as NodeTimer)
  },
})

afterEach(() => {
  toast.dismiss()
})

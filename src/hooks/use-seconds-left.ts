import { useCallback, useSyncExternalStore } from 'react'

/** How often the count moves. */
const TICK_MS = 1_000

/**
 * The whole seconds left until `until`, re-rendering the reader every second
 * while it is set. Zero once it has passed, and zero for `null`.
 * @param until - The moment to count down to, in epoch milliseconds, or `null`.
 * @returns The seconds left, rounded up.
 */
export function useSecondsLeft(until: number | null): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (until === null) return () => undefined
      const timer = setInterval(onChange, TICK_MS)
      return () => {
        clearInterval(timer)
      }
    },
    [until]
  )
  /** Reads the clock; whole seconds stay equal between ticks, as `useSyncExternalStore` requires. */
  const getSnapshot = () =>
    until === null ? 0 : Math.max(0, Math.ceil((until - Date.now()) / TICK_MS))
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

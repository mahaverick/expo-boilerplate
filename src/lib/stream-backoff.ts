/**
 * @file The notification stream's reconnect timing: a doubling backoff, the
 * cap on a server's `Retry-After`, and jitter so clients a server refused
 * together do not all return in the same second.
 */

/** The first reconnect wait, and the wait after each notification frame. */
export const INITIAL_BACKOFF_MS = 1000

/** The longest the doubling backoff grows to. */
export const MAX_BACKOFF_MS = 30_000

/**
 * The longest a server's `Retry-After` may hold a reconnect off, so a wrong
 * header cannot park the stream for good.
 */
export const MAX_RETRY_AFTER_MS = 300_000

/** The most jitter adds, as a fraction of the wait. */
const JITTER = 0.2

/**
 * The backoff after one more failed connect.
 * @param previousMs - The backoff the failed connect waited.
 * @returns Double it, at most `MAX_BACKOFF_MS`.
 */
export function nextBackoff(previousMs: number): number {
  return Math.min(previousMs * 2, MAX_BACKOFF_MS)
}

/**
 * Stretches a wait by up to 20%.
 * @param ms - The wait.
 * @param random - A source in [0, 1); `Math.random` by default.
 * @returns The wait plus `ms * 0.2 * random()`.
 */
export function withJitter(ms: number, random: () => number = Math.random): number {
  return ms * (1 + JITTER * random())
}

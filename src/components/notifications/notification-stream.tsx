/**
 * @file The one owner of the live notification stream: when it opens, how it
 * reconnects, and what each frame does to the query cache. Screens only read
 * the cache.
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { isAuthVerdict } from '@/http/auth-verdict'
import { apiUrl } from '@/http/client'
import { ensureSession } from '@/http/session'
import { openEventStream, type SseFrame, type StreamEnd } from '@/http/sse'
import {
  INITIAL_BACKOFF_MS,
  MAX_RETRY_AFTER_MS,
  nextBackoff,
  withJitter,
} from '@/lib/stream-backoff'
import { invalidateBilling } from '@/queries/billing.queries'
import { notificationKeys } from '@/queries/notification.queries'
import { useAuthStore } from '@/states/auth.store'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { PASSKEY_SETUP_REQUIRED } from '@/types/passkey.types'

/** The path of the stream under the API prefix. */
const STREAM_PATH = '/notifications/stream'

/** The event name of a notification frame, which carries an `id:` line. */
const NOTIFICATION_EVENT = 'notification'

/**
 * The event name of a plan or entitlements change. The frame has no `id:` line
 * and is never replayed.
 */
const ENTITLEMENTS_EVENT = 'entitlements_changed'

/** The 429 code for too many open streams for this account. Its message names browser tabs, so it is never shown. */
const TOO_MANY_STREAMS = 'too_many_streams'

/**
 * A connect that ends this soon with no frame counts as quick. Two quick ends
 * in a row fall back to the backoff, so a server that ends every stream at
 * once cannot cause a tight loop.
 */
const QUICK_END_MS = 1000

/** How many quick ends in a row switch the reopen to the backoff. */
const QUICK_ENDS_FOR_BACKOFF = 2

/** The cached workspace query suffixes that mark a workspace whose billing a connect refetches. */
const BILLING_KEY_PARTS = new Set(['entitlements', 'billing', 'upgrade-requests'])

/**
 * Reads the web address off an `entitlements_changed` frame.
 * @param data - The frame's `data:` text.
 * @returns The slug, or null when the data is not JSON or has no string slug.
 */
function parseEntitlementsSlug(data: string): string | null {
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed !== 'object' || parsed === null || !('slug' in parsed)) return null
    return typeof parsed.slug === 'string' && parsed.slug !== '' ? parsed.slug : null
  } catch {
    return null
  }
}

/**
 * Refetches the billing reads of every workspace in the cache. Entitlement
 * frames are never replayed, so a change made while the stream was down is
 * caught only here.
 * @param queryClient - The app's query client.
 */
function refetchCachedBilling(queryClient: QueryClient): void {
  const slugs = new Set<string>()
  for (const { queryKey } of queryClient.getQueryCache().getAll()) {
    const [root, slug, part] = queryKey
    if (root !== 'tenants' || typeof slug !== 'string' || slug.startsWith('_')) continue
    if (typeof part === 'string' && BILLING_KEY_PARTS.has(part)) slugs.add(slug)
  }
  for (const slug of slugs) void invalidateBilling(queryClient, slug)
}

/**
 * Whether the app is in the foreground, as the stream reads it: `active` is
 * foreground, `background` is not, and `inactive` (the iOS app switcher, a
 * system sheet) keeps the last answer. A move to `background` also calls
 * `onBackground`.
 * @param onBackground - Runs on each move to `background`.
 * @returns True while the stream may be open.
 */
function useForeground(onBackground: () => void): boolean {
  const [foreground, setForeground] = useState(() => AppState.currentState === 'active')
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setForeground(true)
      if (next === 'background') {
        onBackground()
        setForeground(false)
      }
    })
    return () => {
      subscription.remove()
    }
  }, [onBackground])
  return foreground
}

/**
 * Keeps one notification stream open while a person is signed in, the app is
 * in the foreground and maintenance is not `full`, and applies its frames to
 * the query cache.
 *
 * - Each connect reads the access token from the store, and refreshes first
 *   when there is none. A token the foreground refresh swaps in leaves the open
 *   stream alone until it ends.
 * - Express ends each stream when its access token expires, so an end or a 401
 *   refreshes and reopens at once with `Last-Event-ID`. Two quick ends in a row
 *   with no frame fall back to the backoff.
 * - A 429 `too_many_streams` stops until the next return from the background,
 *   and a 403 `PASSKEY_SETUP_REQUIRED` raises the passkey flag and stops.
 * - Any other refusal waits the backoff or `Retry-After`, whichever is longer,
 *   capped at 5 minutes, plus jitter. A network failure waits the backoff with
 *   jitter. The backoff doubles each time and resets on a notification frame.
 * - Background, sign-out and maintenance `full` abort the stream and clear the
 *   timer. Sign-out also forgets the last event id and the 429 stop.
 */
function useNotificationStream(): void {
  const queryClient = useQueryClient()
  const signedIn = useAuthStore((state) => state.isAuthenticated)
  const isFull = useMaintenanceModeStore((state) => state.mode) === 'full'
  const passkeyRequired = usePasskeySetupStore((state) => state.required)
  const lastEventId = useRef<string | undefined>(undefined)
  const backoff = useRef(INITIAL_BACKOFF_MS)
  const quickEnds = useRef(0)
  const blocked = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controller = useRef<AbortController | null>(null)
  const onBackground = useCallback(() => {
    blocked.current = false
  }, [])
  const foreground = useForeground(onBackground)

  useEffect(() => {
    if (!signedIn) {
      lastEventId.current = undefined
      backoff.current = INITIAL_BACKOFF_MS
      quickEnds.current = 0
      blocked.current = false
      return
    }
    if (!foreground || isFull || passkeyRequired || blocked.current) return
    let cancelled = false

    /**
     * Runs `action` after `ms`, replacing any timer already set.
     * @param ms - The wait.
     * @param action - What runs then.
     */
    const schedule = (ms: number, action: () => void) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        action()
      }, ms)
    }

    /**
     * Waits the backoff (or a longer `Retry-After`) with jitter, doubles the backoff, then runs `action`.
     * @param action - What runs after the wait.
     * @param retryAfterMs - The server's `Retry-After`, when it sent one.
     */
    const afterBackoff = (action: () => void, retryAfterMs?: number) => {
      const wait = Math.min(Math.max(backoff.current, retryAfterMs ?? 0), MAX_RETRY_AFTER_MS)
      backoff.current = nextBackoff(backoff.current)
      schedule(withJitter(wait), action)
    }

    /** Refreshes the session, then connects. An auth verdict stops; the session core signs out. */
    const renewThenConnect = () => {
      ensureSession().then(
        (fresh) => {
          if (!cancelled) void connect(fresh)
        },
        (error: unknown) => {
          if (cancelled || isAuthVerdict(error)) return
          afterBackoff(renewThenConnect)
        }
      )
    }

    /**
     * Applies one frame to the cache.
     * @param frame - The frame.
     */
    const onFrame = (frame: SseFrame) => {
      if (frame.id !== undefined) lastEventId.current = frame.id
      if (frame.event === NOTIFICATION_EVENT) {
        backoff.current = INITIAL_BACKOFF_MS
        void queryClient.invalidateQueries({ queryKey: notificationKeys.list })
      } else if (frame.event === ENTITLEMENTS_EVENT) {
        const slug = parseEntitlementsSlug(frame.data)
        if (slug) void invalidateBilling(queryClient, slug)
      }
    }

    /**
     * Acts on how a stream ended.
     * @param end - The transport's answer.
     * @param quick - Whether it ended within `QUICK_END_MS` with no frame.
     */
    const onEnd = (end: StreamEnd, quick: boolean) => {
      if (end.kind === 'refused' && end.status === 429 && end.code === TOO_MANY_STREAMS) {
        blocked.current = true
        return
      }
      if (end.kind === 'refused' && end.status === 403 && end.code === PASSKEY_SETUP_REQUIRED) {
        usePasskeySetupStore.getState().setRequired(true)
        return
      }
      if (end.kind === 'refused' && end.status !== 401) {
        afterBackoff(() => void connect(), end.retryAfterMs)
        return
      }
      quickEnds.current = quick ? quickEnds.current + 1 : 0
      if (quickEnds.current >= QUICK_ENDS_FOR_BACKOFF) afterBackoff(renewThenConnect)
      else renewThenConnect()
    }

    /**
     * Opens one stream and reacts to its end.
     * @param fallback - The token a refresh just returned, used when the store holds none.
     */
    const connect = async (fallback?: string) => {
      const token = useAuthStore.getState().accessToken ?? fallback
      if (!token) {
        renewThenConnect()
        return
      }
      const abort = new AbortController()
      controller.current = abort
      const startedAt = Date.now()
      let framed = false
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
      if (lastEventId.current !== undefined) headers['Last-Event-ID'] = lastEventId.current
      let end: StreamEnd
      try {
        end = await openEventStream({
          url: apiUrl(STREAM_PATH),
          headers,
          signal: abort.signal,
          onOpen: () => {
            void queryClient.invalidateQueries({ queryKey: notificationKeys.list })
            refetchCachedBilling(queryClient)
          },
          onFrame: (frame) => {
            framed = true
            onFrame(frame)
          },
        })
      } catch {
        if (cancelled || abort.signal.aborted) return
        afterBackoff(() => void connect())
        return
      }
      if (cancelled) return
      onEnd(end, !framed && Date.now() - startedAt < QUICK_END_MS)
    }

    void connect()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      controller.current?.abort()
      controller.current = null
    }
  }, [signedIn, foreground, isFull, passkeyRequired, queryClient])
}

/**
 * Keeps the live notification stream for the signed-in app. Render it once,
 * in the `(app)` layout's signed-in branch: two mounts open two streams.
 * @returns Nothing; it renders no view.
 */
export function NotificationStream(): null {
  useNotificationStream()
  return null
}

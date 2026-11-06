/**
 * @file The session port. The refresh token lives in SecureStore and a
 * restore posts it in the body. There is one process, so nothing is
 * broadcast and the core takes no lock.
 *
 * A refresh can still overlap a sign-out or a sign-in on this device. The
 * core reads the token, posts it, writes the rotated one, then signs in. A
 * refresh that read the store before a session change (`markSessionChange`)
 * keeps nothing: its write throws a plain `Error`, not a verdict, so the core
 * neither signs in nor clears the store.
 */
import type { QueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { apiClient } from '@/http/client'
import { createRefreshCore, type RefreshCore, type RefreshTokenStore } from '@/http/refresh-core'
import { revokeToken } from '@/http/revoke'
import { refreshTokenStore, sessionChangeCount } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'

/** The messages other than `logout` that react's tabs send each other. */
type AuthMessageType = 'signed_in' | 'step_up_confirmed'

/** The refresh core, built on the first `ensureSession()` call. */
let core: RefreshCore | null = null

/** The session-change count when the refresh in flight read the store. */
let readAt = 0

/** The core's in-flight refresh, and the same refresh checked for a session change. */
let checked: { source: Promise<string>; result: Promise<string> } | null = null

/** What a refresh that overlapped a sign-out or a sign-in rejects with. Not a verdict. */
const SESSION_CHANGED = 'The session changed during the refresh.'

/**
 * Whether a session change was marked since the count `since`.
 * @param since - The count when the refresh read the store.
 */
function changedSince(since: number): boolean {
  return sessionChangeCount() !== since
}

/**
 * The store the core sees. It notes when the refresh read the token, and
 * after a session change it refuses the write, revoking the rotated token no
 * one holds, and skips the clear, so a verdict on the old token cannot
 * remove a new sign-in's token.
 */
const guardedStore: RefreshTokenStore = {
  read() {
    readAt = sessionChangeCount()
    return refreshTokenStore.read()
  },
  async write(token) {
    if (changedSince(readAt)) {
      void revokeToken(token)
      throw new Error(SESSION_CHANGED)
    }
    await refreshTokenStore.write(token)
  },
  async clear() {
    if (changedSince(readAt)) return
    await refreshTokenStore.clear()
  },
}

/**
 * Undoes a refresh that a session change overtook after its write: the
 * core's `login()` stands only while no sign-out or sign-in followed.
 * @param accessToken - The token the refresh returned.
 * @param since - The count when the refresh read the store.
 * @returns The token, when nothing changed.
 * @throws A plain `Error` when the session changed.
 */
function keepUnlessChanged(accessToken: string, since: number): string {
  if (!changedSince(since)) return accessToken
  // Another sign-in's login() replaced this one's token; leave it.
  if (useAuthStore.getState().accessToken === accessToken) useAuthStore.getState().logout()
  throw new Error(SESSION_CHANGED)
}

/**
 * Restores the session: posts the stored refresh token and keeps the rotated
 * one. The core is built here, not at module load, because `client.ts` and
 * this file import each other. Every caller of one refresh shares one result.
 * @returns A fresh access token.
 */
export function ensureSession(): Promise<string> {
  core ??= createRefreshCore({
    client: apiClient,
    transport: 'body',
    tokenStore: guardedStore,
  })
  const source = core.ensureSession()
  if (checked?.source !== source) {
    // The core calls read() before ensureSession() returns, so readAt belongs to this refresh.
    const since = readAt
    checked = { source, result: source.then((token) => keepUnlessChanged(token, since)) }
  }
  return checked.result
}

/** Drops the cached core, so the next `ensureSession()` builds a new one. */
export function resetSessionForTests(): void {
  core?.reset()
  core = null
  checked = null
}

/** Does nothing: there is no other tab to tell. */
export function broadcastLogout(): void {}

/** Does nothing with the message: there is no other tab to tell. */
export const broadcastAuthMessage: (type: AuthMessageType) => void = () => {}

/** Sends the app to the sign-in screen once a session has ended. */
export function redirectToLogin(): void {
  router.replace('/login')
}

/**
 * Ends a different user's session before `login()` replaces it: the previous
 * user's cached queries and the store's session are cleared. Nothing happens
 * when nobody or the same user is signed in.
 * @param queryClient - The app's query client, emptied on a switch.
 * @param nextUserId - The id of the user about to sign in.
 */
export function switchIdentity(queryClient: QueryClient, nextUserId: string): void {
  const current = useAuthStore.getState().user
  if (!current || current.id === nextUserId) return
  queryClient.clear()
  useAuthStore.getState().logout()
}

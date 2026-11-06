/**
 * @file The session port. The refresh token lives in SecureStore and a
 * restore posts it in the body. There is one process, so nothing is
 * broadcast and the core takes no lock.
 */
import type { QueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { apiClient } from '@/http/client'
import { createRefreshCore, type RefreshCore } from '@/http/refresh-core'
import { refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'

/** The messages other than `logout` that react's tabs send each other. */
type AuthMessageType = 'signed_in' | 'step_up_confirmed'

/** The refresh core, built on the first `ensureSession()` call. */
let core: RefreshCore | null = null

/**
 * Restores the session: posts the stored refresh token and keeps the rotated
 * one. The core is built here, not at module load, because `client.ts` and
 * this file import each other.
 * @returns A fresh access token.
 */
export function ensureSession(): Promise<string> {
  core ??= createRefreshCore({
    client: apiClient,
    transport: 'body',
    tokenStore: refreshTokenStore,
  })
  return core.ensureSession()
}

/** Drops the cached core, so the next `ensureSession()` builds a new one. */
export function resetSessionForTests(): void {
  core?.reset()
  core = null
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

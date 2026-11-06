/**
 * @file The session port. In this plan the app keeps no refresh token, so
 * every session restore ends in a verdict and the app counts as signed out.
 * There is one process, so nothing is broadcast.
 */
import type { QueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { NoRefreshTokenError } from '@/http/auth-verdict'
import { useAuthStore } from '@/states/auth.store'

/** The messages other than `logout` that react's tabs send each other. */
type AuthMessageType = 'signed_in' | 'step_up_confirmed'

/**
 * Restores the session. No refresh token is stored yet, so it rejects with
 * `NoRefreshTokenError`, an auth verdict, before any request is sent.
 * @returns Never resolves.
 * @throws `NoRefreshTokenError`, always.
 */
export function ensureSession(): Promise<string> {
  return Promise.reject(new NoRefreshTokenError())
}

/** Does nothing: there is no other tab to tell. */
export function broadcastLogout(): void {}

/** Does nothing with the message: there is no other tab to tell. */
export const broadcastAuthMessage: (type: AuthMessageType) => void = () => {}

/** Sends the app to its first screen once a session has ended. */
export function redirectToLogin(): void {
  router.replace('/')
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

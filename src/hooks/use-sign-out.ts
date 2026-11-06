/**
 * @file Expo's sign-out. The shared `useLogout` posts first and sends no
 * token. This hook signs the device out first, then tells the API, so a
 * request that never answers cannot leave the person signed in.
 */
import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { retryPendingRevoke, revokeToken } from '@/http/revoke'
import { markSessionChange, pendingRevokeStore, refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { useOwnSignOutStore } from '@/states/own-sign-out.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'

/** What `useSignOut` returns. */
interface SignOut {
  signOut: (options?: { navigate?: boolean }) => Promise<void>
  isPending: boolean
}

/**
 * Signs the device out, then revokes the token with the API.
 * The order keeps the token safe: it joins `pending_revoke` before it leaves
 * `refresh_token`, so a crash between the two never loses it. If that save
 * fails, the device still signs out and the token is posted directly.
 * `signOut` never rejects. A call while one is pending returns that call's
 * promise.
 * @returns `signOut`, and whether a sign-out is in flight.
 */
export function useSignOut(): SignOut {
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)
  const inFlight = useRef<Promise<void> | null>(null)

  const signOut = useCallback(
    (options?: { navigate?: boolean }): Promise<void> => {
      if (inFlight.current) return inFlight.current
      /** Runs the seven steps in order. */
      const run = async (): Promise<void> => {
        // A refresh in flight must not write its token back or sign the person in again.
        markSessionChange()
        let token: string | null = null
        let saved = true
        try {
          token = await refreshTokenStore.read()
          if (token) await pendingRevokeStore.add(token)
        } catch {
          saved = false
        }
        // The device must end signed out, whatever the keychain does.
        await refreshTokenStore.clear().catch(() => {})
        // Again after the clear: a refresh that read the token during the steps above.
        markSessionChange()
        queryClient.clear()
        // Before the store signs out, so the (app) guard adds no redirect for the next person.
        useOwnSignOutStore.setState({ isOwn: true })
        useAuthStore.getState().logout()
        usePasskeySetupStore.getState().setRequired(false)
        if (options?.navigate !== false) router.replace('/login')
        // The direct revoke must not depend on the retry: a keychain that refused the save may refuse the read.
        await retryPendingRevoke().catch(() => {})
        if (token && !saved) await revokeToken(token)
      }
      setIsPending(true)
      const promise = run()
        .catch(() => {})
        .finally(() => {
          inFlight.current = null
          setIsPending(false)
        })
      inFlight.current = promise
      return promise
    },
    [queryClient]
  )

  return { signOut, isPending }
}

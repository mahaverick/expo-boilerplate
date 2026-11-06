import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { isAuthVerdict, NoRefreshTokenError } from '@/http/auth-verdict'
import {
  broadcastAuthMessage,
  broadcastLogout,
  ensureSession,
  redirectToLogin,
  switchIdentity,
} from '@/http/session'
import { useAuthStore } from '@/states/auth.store'
import { afterEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

/**
 * A user with only the fields these cases read.
 * @param id - The user's id.
 */
function userWith(id: string): User {
  return { id } as User
}

afterEach(() => {
  useAuthStore.getState().logout()
})

describe('session', () => {
  it('rejects ensureSession with an auth verdict, so the app counts as signed out', async () => {
    const failure = await ensureSession().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(NoRefreshTokenError)
    expect(isAuthVerdict(failure)).toBe(true)
  })

  it('broadcasts nothing, since there is one process', () => {
    expect(() => {
      broadcastLogout()
      broadcastAuthMessage('signed_in')
    }).not.toThrow()
  })

  it('sends redirectToLogin to the root route', () => {
    const replace = jest.spyOn(router, 'replace')
    redirectToLogin()
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('clears the store and the cache when a different user signs in', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['profile'], 'cached')
    useAuthStore.getState().login('token', userWith('user-1'))
    switchIdentity(queryClient, 'user-2')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(queryClient.getQueryData(['profile'])).toBeUndefined()
  })

  it('keeps the session when the same user signs in again', () => {
    const queryClient = new QueryClient()
    useAuthStore.getState().login('token', userWith('user-1'))
    switchIdentity(queryClient, 'user-1')
    expect(useAuthStore.getState().accessToken).toBe('token')
  })
})

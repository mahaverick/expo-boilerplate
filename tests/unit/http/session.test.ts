import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { router, type Href } from 'expo-router'
import { isAuthVerdict, NoRefreshTokenError } from '@/http/auth-verdict'
import { apiClient } from '@/http/client'
import {
  broadcastAuthMessage,
  broadcastLogout,
  ensureSession,
  redirectToLogin,
  resetSessionForTests,
  switchIdentity,
} from '@/http/session'
import { refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

/**
 * A user with only the fields these cases read.
 * @param id - The user's id.
 */
function userWith(id: string): User {
  return { id } as User
}

beforeEach(() => {
  resetSecureStore()
  resetSessionForTests()
})

afterEach(() => {
  useAuthStore.getState().logout()
})

describe('session', () => {
  it('ensureSession posts the stored token and stores the rotated one', async () => {
    await refreshTokenStore.write('old')
    const bodies: unknown[] = []
    apiClient.defaults.adapter = (config) => {
      const url = config.url ?? ''
      if (url === '/auth/refresh') bodies.push(JSON.parse(config.data as string))
      const data =
        url === '/auth/refresh'
          ? { accessToken: 'access-1', refreshToken: 'new' }
          : { id: 'user-1' }
      return Promise.resolve({
        data: { success: true, data },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config,
      })
    }
    await expect(ensureSession()).resolves.toBe('access-1')
    expect(bodies).toEqual([{ refreshToken: 'old' }])
    await expect(refreshTokenStore.read()).resolves.toBe('new')
  })

  it('a verdict clears the token store', async () => {
    await refreshTokenStore.write('old')
    apiClient.defaults.adapter = (config) =>
      Promise.reject(
        new AxiosError('no', 'ERR_BAD_REQUEST', config, null, {
          data: { success: false, code: 'INVALID_REFRESH_TOKEN', message: 'no' },
          status: 401,
          statusText: '',
          headers: {},
          config,
        })
      )
    const failure = await ensureSession().catch((error: unknown) => error)
    expect(isAuthVerdict(failure)).toBe(true)
    await expect(refreshTokenStore.read()).resolves.toBeNull()
  })

  it('rejects with NoRefreshTokenError when nothing is stored', async () => {
    await expect(ensureSession()).rejects.toBeInstanceOf(NoRefreshTokenError)
  })

  it('broadcasts nothing, since there is one process', () => {
    expect(() => {
      broadcastLogout()
      broadcastAuthMessage('signed_in')
    }).not.toThrow()
  })

  it('redirectToLogin replaces the route with /login', () => {
    const replace = jest.spyOn(router, 'replace')
    redirectToLogin()
    expect(replace).toHaveBeenCalledWith('/login' as Href)
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

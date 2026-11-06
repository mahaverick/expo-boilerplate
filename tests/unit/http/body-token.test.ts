import { jest } from '@jest/globals'
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { SignInNotKeptError } from '@/http/body-token'
import { apiClient } from '@/http/client'
import { ensureSession, resetSessionForTests } from '@/http/session'
import { pendingRevokeStore, refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { getItemAsync, resetSecureStore, setItemAsync } from '@/tests/mocks/expo-secure-store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

/** What the fake adapter does with a request. */
type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown }

/**
 * Installs an adapter that records each config and answers through `handler`.
 * @param handler - Picks the answer for a request.
 * @returns The configs the adapter saw.
 */
function serve(handler: Handler): InternalAxiosRequestConfig[] {
  const sent: InternalAxiosRequestConfig[] = []
  /** Answers or rejects as the handler says. */
  const adapter: AxiosAdapter = (config) => {
    sent.push(config)
    const { status, data } = handler(config)
    const response = {
      data,
      status,
      statusText: '',
      headers: { 'content-type': 'application/json' },
      config,
    }
    if (status >= 200 && status < 300) return Promise.resolve(response)
    return Promise.reject(new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response))
  }
  apiClient.defaults.adapter = adapter
  return sent
}

/**
 * The JSON body of a recorded request, or undefined when it had none.
 * @param config - The request config.
 */
function bodyOf(config: InternalAxiosRequestConfig | undefined): unknown {
  const data = config?.data as string | undefined
  return data === undefined ? undefined : JSON.parse(data)
}

/** A sign-in answer in express's envelope. */
const signedIn = {
  status: 200,
  data: {
    success: true,
    data: { accessToken: 'a', refreshToken: 'new', refreshTokenExpiresAt: '2027-01-01' },
  },
}

const INJECT = [
  '/auth/logout',
  '/auth/sessions/revoke-others',
  '/auth/link/verify',
  '/auth/passkeys/sign-in/verify',
  '/invitations/confirm',
  '/auth/step-up/link/verify',
  '/auth/passkeys/step-up/verify',
]

beforeEach(() => {
  resetSecureStore()
  resetSessionForTests()
})

afterEach(() => {
  useAuthStore.getState().logout()
  usePasskeySetupStore.getState().setRequired(false)
})

describe('request body token', () => {
  it.each(INJECT)('adds the token to POST %s', async (path) => {
    await refreshTokenStore.write('tok')
    const sent = serve(() => ({ status: 200, data: { success: true, data: {} } }))
    await apiClient.post(path, { x: 1 }, { skipAuthRetry: true })
    expect(bodyOf(sent[0])).toEqual({ x: 1, refreshToken: 'tok' })
  })

  it('adds nothing for /auth/refresh, /profile, a GET or another origin', async () => {
    await refreshTokenStore.write('tok')
    const sent = serve(() => ({ status: 200, data: { success: true, data: {} } }))
    await apiClient.post('/auth/refresh', { a: 1 }, { skipAuthRetry: true })
    await apiClient.post('/profile', { a: 1 })
    await apiClient.get('/auth/logout')
    await apiClient.post('https://other.example.test/api/v1/auth/logout', { a: 1 })
    expect(bodyOf(sent[0])).toEqual({ a: 1 })
    expect(bodyOf(sent[1])).toEqual({ a: 1 })
    expect(sent[2]?.data).toBeUndefined()
    expect(bodyOf(sent[3])).toEqual({ a: 1 })
  })

  it('matches the path with its query string stripped', async () => {
    await refreshTokenStore.write('tok')
    const sent = serve(() => ({ status: 200, data: { success: true, data: {} } }))
    await apiClient.post('/auth/logout?x=1', undefined, { skipAuthRetry: true })
    expect(bodyOf(sent[0])).toEqual({ refreshToken: 'tok' })
  })

  it('fills an empty body and keeps an explicit refreshToken', async () => {
    await refreshTokenStore.write('tok')
    const sent = serve(() => ({ status: 200, data: { success: true, data: {} } }))
    await apiClient.post('/auth/logout', undefined, { skipAuthRetry: true })
    await apiClient.post('/auth/logout', { refreshToken: 'mine' }, { skipAuthRetry: true })
    expect(bodyOf(sent[0])).toEqual({ refreshToken: 'tok' })
    expect(bodyOf(sent[1])).toEqual({ refreshToken: 'mine' })
  })

  it('sends a body that names its own refreshToken without reading the store', async () => {
    getItemAsync.mockRejectedValue(Object.assign(new Error('locked'), { code: 'ERR_KEY_CHAIN' }))
    const sent = serve(() => ({ status: 200, data: { success: true, data: {} } }))
    await apiClient.post('/auth/logout', { refreshToken: 'mine' }, { skipAuthRetry: true })
    expect(bodyOf(sent[0])).toEqual({ refreshToken: 'mine' })
    expect(getItemAsync).not.toHaveBeenCalled()
  })

  it('rejects, and sends nothing, when the store cannot be read for a body that needs the token', async () => {
    getItemAsync.mockRejectedValue(Object.assign(new Error('locked'), { code: 'ERR_KEY_CHAIN' }))
    const sent = serve(() => ({ status: 200, data: { success: true, data: {} } }))
    await expect(
      apiClient.post('/auth/logout', { x: 1 }, { skipAuthRetry: true })
    ).rejects.toBeInstanceOf(Error)
    expect(sent).toHaveLength(0)
  })

  it('sends no token key when none is stored', async () => {
    const sent = serve(() => ({ status: 200, data: { success: true, data: {} } }))
    await apiClient.post('/auth/logout', { x: 1 }, { skipAuthRetry: true })
    expect(bodyOf(sent[0])).toEqual({ x: 1 })
  })

  it('sends the rotated token when the shared chain replays after a refresh', async () => {
    await refreshTokenStore.write('first')
    useAuthStore.getState().login('expired', { id: 'u1' } as User)
    let logouts = 0
    const sent = serve((config) => {
      if (config.url === '/auth/refresh')
        return {
          status: 200,
          data: { success: true, data: { accessToken: 'a2', refreshToken: 'rotated' } },
        }
      if (config.url === '/profile')
        return { status: 200, data: { success: true, data: { id: 'u1' } } }
      logouts += 1
      return logouts === 1
        ? { status: 401, data: { success: false, code: 'ACCESS_TOKEN_EXPIRED', message: 'x' } }
        : { status: 200, data: { success: true, data: {} } }
    })
    await apiClient.post('/auth/sessions/revoke-others', {})
    const attempts = sent.filter((c) => c.url === '/auth/sessions/revoke-others')
    expect(attempts).toHaveLength(2)
    expect(bodyOf(attempts[0])).toEqual({ refreshToken: 'first' })
    expect(bodyOf(attempts[1])).toEqual({ refreshToken: 'rotated' })
  })

  it('keeps a refreshToken the caller set across a replay', async () => {
    await refreshTokenStore.write('first')
    useAuthStore.getState().login('expired', { id: 'u1' } as User)
    let calls = 0
    const sent = serve((config) => {
      if (config.url === '/auth/refresh')
        return {
          status: 200,
          data: { success: true, data: { accessToken: 'a2', refreshToken: 'rotated' } },
        }
      if (config.url === '/profile')
        return { status: 200, data: { success: true, data: { id: 'u1' } } }
      calls += 1
      return calls === 1
        ? { status: 401, data: { success: false, code: 'ACCESS_TOKEN_EXPIRED', message: 'x' } }
        : { status: 200, data: { success: true, data: {} } }
    })
    await apiClient.post('/auth/sessions/revoke-others', { refreshToken: 'mine' })
    const attempts = sent.filter((c) => c.url === '/auth/sessions/revoke-others')
    expect(bodyOf(attempts[1])).toEqual({ refreshToken: 'mine' })
  })
})

describe('refresh token capture', () => {
  /** Default behaviour for keys other than the session. */
  let realSet: (key: string, value: string) => Promise<void>
  beforeEach(() => {
    const impl = setItemAsync.getMockImplementation()
    realSet = (key, value) => impl?.(key, value) ?? Promise.resolve()
  })

  it.each(['/auth/link/verify', '/auth/passkeys/sign-in/verify', '/invitations/confirm'])(
    'stores the token %s returns and removes it from the response',
    async (path) => {
      serve(() => structuredClone(signedIn))
      const response = await apiClient.post(path, {})
      const data = (response.data as { data: Record<string, unknown> }).data
      expect(data.refreshToken).toBeUndefined()
      expect(data.refreshTokenExpiresAt).toBeUndefined()
      expect(data.accessToken).toBe('a')
      await expect(refreshTokenStore.read()).resolves.toBe('new')
    }
  )

  it('stores the token before the request promise resolves', async () => {
    serve(() => structuredClone(signedIn))
    let seen: string | null = null
    await apiClient.post('/auth/link/verify', {}).then(async () => {
      seen = await refreshTokenStore.read()
    })
    expect(seen).toBe('new')
  })

  it('passes an answer with no refreshToken through untouched', async () => {
    serve(() => ({ status: 200, data: { success: true, data: { accessToken: 'a' } } }))
    const response = await apiClient.post('/auth/link/verify', {})
    expect(response.data).toEqual({ success: true, data: { accessToken: 'a' } })
    await expect(refreshTokenStore.read()).resolves.toBeNull()
  })

  it('does not capture from a route outside the list', async () => {
    serve(() => structuredClone(signedIn))
    await apiClient.post('/auth/sessions/revoke-others', {})
    await expect(refreshTokenStore.read()).resolves.toBeNull()
  })

  it('rejects with SignInNotKeptError and revokes the token when the write fails', async () => {
    setItemAsync.mockImplementation((key, value) =>
      key === 'refresh_token' ? Promise.reject(new Error('keychain')) : realSet(key, value)
    )
    const sent = serve((config) =>
      config.url === '/auth/link/verify'
        ? structuredClone(signedIn)
        : { status: 500, data: { success: false } }
    )
    await expect(apiClient.post('/auth/link/verify', {})).rejects.toBeInstanceOf(SignInNotKeptError)
    // The revoke is not awaited by the interceptor: let its microtasks settle.
    for (let i = 0; i < 50 && !sent.some((c) => c.url === '/auth/logout'); i += 1)
      await Promise.resolve()
    const logout = sent.find((c) => c.url === '/auth/logout')
    expect(bodyOf(logout)).toEqual({ refreshToken: 'new' })
    await expect(pendingRevokeStore.list()).resolves.toEqual(['new'])
  })
})

describe('refresh', () => {
  it('leaves the refresh request body to the core and writes the token once', async () => {
    await refreshTokenStore.write('old')
    setItemAsync.mockClear()
    const sent = serve((config) =>
      config.url === '/auth/refresh'
        ? {
            status: 200,
            data: { success: true, data: { accessToken: 'a2', refreshToken: 'rotated' } },
          }
        : { status: 200, data: { success: true, data: { id: 'u1' } } }
    )
    await ensureSession().catch(() => {})
    const refresh = sent.find((c) => c.url === '/auth/refresh')
    expect(bodyOf(refresh)).toEqual({ refreshToken: 'old' })
    expect(setItemAsync.mock.calls.filter(([key]) => key === 'refresh_token')).toHaveLength(1)
    await expect(refreshTokenStore.read()).resolves.toBe('rotated')
  })
})

describe('passkey setup flag', () => {
  it('a 403 PASSKEY_SETUP_REQUIRED sets the flag and the error still rejects', async () => {
    serve(() => ({
      status: 403,
      data: { success: false, code: 'PASSKEY_SETUP_REQUIRED', message: 'x' },
    }))
    await expect(apiClient.get('/profile')).rejects.toMatchObject({
      response: { status: 403 },
    })
    expect(usePasskeySetupStore.getState().required).toBe(true)
  })

  it('leaves the flag alone on other errors', async () => {
    serve(() => ({ status: 403, data: { success: false, code: 'FORBIDDEN' } }))
    await expect(apiClient.get('/profile')).rejects.toBeDefined()
    expect(usePasskeySetupStore.getState().required).toBe(false)
  })
})

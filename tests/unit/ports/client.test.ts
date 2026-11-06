import { jest } from '@jest/globals'
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/http/client'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/states/auth.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { afterEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

jest.mock('expo-device', () => ({ modelName: 'Pixel 9' }))
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

/**
 * An adapter that answers every request with an empty success envelope and
 * keeps the config it was sent.
 * @returns The adapter and the configs it saw.
 */
function recordingAdapter(): { adapter: AxiosAdapter; sent: InternalAxiosRequestConfig[] } {
  const sent: InternalAxiosRequestConfig[] = []
  /** Answers with the envelope and keeps the config. */
  const adapter: AxiosAdapter = (config) => {
    sent.push(config)
    return Promise.resolve({
      data: { success: true, data: {} },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      config,
    })
  }
  return { adapter, sent }
}

afterEach(() => {
  useAuthStore.getState().logout()
})

describe('apiClient', () => {
  it('names the native client, the device and the trace on an API request', async () => {
    const { adapter, sent } = recordingAdapter()
    await apiClient.get('/profile', { adapter })
    const config = sent[0]
    expect(config?.headers.get('X-Client')).toBe('native')
    expect(config?.headers.get('X-Device-Name')).toBe('Pixel 9')
    expect(config?.headers.get('traceparent')).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(config?.withCredentials).toBe(false)
  })

  it('sends to the configured API under its prefix', async () => {
    const { adapter, sent } = recordingAdapter()
    await apiClient.get('/profile', { adapter })
    const config = sent[0]
    expect(config && apiClient.getUri(config)).toBe('https://api.example.test/api/v1/profile')
  })

  it('names no device on a request to another host', async () => {
    const { adapter, sent } = recordingAdapter()
    await apiClient.get('https://elsewhere.example.test/thing', { adapter })
    const config = sent[0]
    expect(config?.headers.has('X-Device-Name')).toBe(false)
    expect(config?.headers.has('X-Client')).toBe(false)
    expect(config?.headers.has('traceparent')).toBe(false)
  })

  it('sends the bearer token to the API and to no other origin', async () => {
    useAuthStore.getState().setToken('token-1')
    const { adapter, sent } = recordingAdapter()
    await apiClient.get('https://other.example.test/x', { adapter })
    await apiClient.get('/profile', { adapter })
    expect(sent[0]?.headers.has('Authorization')).toBe(false)
    expect(sent[1]?.headers.get('Authorization')).toBe('Bearer token-1')
  })

  it('a forced sign-out clears the passkey flag and the query cache', async () => {
    useAuthStore.getState().login('access', { id: 'u1' } as User)
    usePasskeySetupStore.getState().setRequired(true)
    queryClient.setQueryData(['profile'], 'cached')
    /** Refuses the session with a 401 that is not an expiry. */
    const refuse: AxiosAdapter = (config) =>
      Promise.reject(
        new AxiosError('no', 'ERR_BAD_REQUEST', config, null, {
          data: { success: false, code: 'SESSION_REVOKED', message: 'no' },
          status: 401,
          statusText: '',
          headers: {},
          config,
        })
      )
    apiClient.defaults.adapter = refuse
    await expect(apiClient.get('/tenants')).rejects.toBeDefined()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(usePasskeySetupStore.getState().required).toBe(false)
    expect(queryClient.getQueryData(['profile'])).toBeUndefined()
  })
})

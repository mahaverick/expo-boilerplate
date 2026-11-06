import { jest } from '@jest/globals'
import { AxiosError, type AxiosAdapter } from 'axios'
import { apiClient } from '@/http/client'
import { retryPendingRevoke, revokeToken } from '@/http/revoke'
import { pendingRevokeStore } from '@/http/token-store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

/**
 * Makes the next logout answer with a status, or with no response at all.
 * @param status - The HTTP status, or `undefined` for a network failure.
 * @returns The configs the adapter saw.
 */
function answerWith(status: number | undefined): { sent: unknown[] } {
  const sent: unknown[] = []
  /** Answers or rejects as `status` says. */
  const adapter: AxiosAdapter = (config) => {
    sent.push(config)
    if (status === undefined)
      return Promise.reject(new AxiosError('offline', 'ERR_NETWORK', config))
    const response = { data: {}, status, statusText: '', headers: {}, config }
    if (status >= 200 && status < 300) return Promise.resolve(response)
    return Promise.reject(new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response))
  }
  apiClient.defaults.adapter = adapter
  return { sent }
}

beforeEach(() => {
  resetSecureStore()
})

describe('revokeToken', () => {
  it('posts the token with no bearer and no auth retry', async () => {
    const { sent } = answerWith(200)
    await revokeToken('tok')
    const config = sent[0] as { url: string; data: string; skipAuthRetry: boolean }
    expect(config.url).toBe('/auth/logout')
    expect(JSON.parse(config.data)).toEqual({ refreshToken: 'tok' })
    expect(config.skipAuthRetry).toBe(true)
  })

  it.each([200, 400, 401])('deletes pending_revoke on %i', async (status) => {
    await pendingRevokeStore.write('tok')
    answerWith(status)
    await revokeToken('tok')
    await expect(pendingRevokeStore.read()).resolves.toBeNull()
  })

  it.each([undefined, 500, 503, 429])('keeps the token in pending_revoke on %s', async (status) => {
    answerWith(status)
    await revokeToken('tok')
    await expect(pendingRevokeStore.read()).resolves.toBe('tok')
  })
})

describe('retryPendingRevoke', () => {
  it('does nothing when no token is pending', async () => {
    const { sent } = answerWith(200)
    await retryPendingRevoke()
    expect(sent).toHaveLength(0)
  })

  it('posts the pending token and clears it on success', async () => {
    await pendingRevokeStore.write('tok')
    const { sent } = answerWith(200)
    await retryPendingRevoke()
    expect(sent).toHaveLength(1)
    await expect(pendingRevokeStore.read()).resolves.toBeNull()
  })
})

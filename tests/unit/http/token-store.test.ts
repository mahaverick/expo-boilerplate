import { NoRefreshTokenError } from '@/http/auth-verdict'
import { pendingRevokeStore, refreshTokenStore, WRITE_ATTEMPTS } from '@/http/token-store'
import {
  deleteItemAsync,
  getItemAsync,
  resetSecureStore,
  setItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} from '@/tests/mocks/expo-secure-store'
import { beforeEach, describe, expect, it } from '@/tests/support/runner'

const OPTIONS = { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY }

beforeEach(() => {
  resetSecureStore()
})

describe('refreshTokenStore', () => {
  it('writes and reads with WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
    await refreshTokenStore.write('t1')
    await refreshTokenStore.read()
    await refreshTokenStore.clear()
    expect(setItemAsync).toHaveBeenCalledWith('refresh_token', 't1', OPTIONS)
    expect(getItemAsync).toHaveBeenCalledWith('refresh_token', OPTIONS)
    expect(deleteItemAsync).toHaveBeenCalledWith('refresh_token', OPTIONS)
  })

  it('reads a value that fails to decrypt as no token, and deletes it', async () => {
    getItemAsync.mockRejectedValueOnce(new Error('decrypt'))
    await expect(refreshTokenStore.read()).resolves.toBeNull()
    expect(deleteItemAsync).toHaveBeenCalledWith('refresh_token', OPTIONS)
  })

  it('retries a failed write, then throws NoRefreshTokenError', async () => {
    setItemAsync.mockRejectedValue(new Error('locked'))
    const failure = await refreshTokenStore.write('t1').catch((e: unknown) => e)
    expect(setItemAsync).toHaveBeenCalledTimes(WRITE_ATTEMPTS)
    expect(failure).toBeInstanceOf(NoRefreshTokenError)
  })

  it('a write that succeeds on the second attempt resolves', async () => {
    setItemAsync.mockRejectedValueOnce(new Error('locked'))
    await expect(refreshTokenStore.write('t1')).resolves.toBeUndefined()
    expect(setItemAsync).toHaveBeenCalledTimes(2)
  })

  it('never rejects on clear', async () => {
    deleteItemAsync.mockRejectedValueOnce(new Error('gone'))
    await expect(refreshTokenStore.clear()).resolves.toBeUndefined()
  })
})

describe('pendingRevokeStore', () => {
  it('keeps its token under pending_revoke', async () => {
    await pendingRevokeStore.write('old')
    expect(setItemAsync).toHaveBeenCalledWith('pending_revoke', 'old', OPTIONS)
    await expect(pendingRevokeStore.read()).resolves.toBe('old')
  })
})

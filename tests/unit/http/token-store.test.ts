import { isAuthVerdict, NoRefreshTokenError } from '@/http/auth-verdict'
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

/**
 * An error shaped like expo-modules-core's `CodedError`.
 * @param code - The native code, such as `ERR_DECRYPT`, or none.
 */
function codedError(code: string | undefined): Error {
  return Object.assign(new Error('native failure'), code === undefined ? {} : { code })
}

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
    getItemAsync.mockRejectedValueOnce(codedError('ERR_DECRYPT'))
    await expect(refreshTokenStore.read()).resolves.toBeNull()
    expect(deleteItemAsync).toHaveBeenCalledWith('refresh_token', OPTIONS)
  })

  it.each([['ERR_KEY_CHAIN'], ['ERR_UNEXPECTED'], [undefined]])(
    'rethrows a read that fails with %s as a plain error, and keeps the item',
    async (code) => {
      await refreshTokenStore.write('live')
      getItemAsync.mockRejectedValueOnce(codedError(code))
      const failure = await refreshTokenStore.read().catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(Error)
      expect(isAuthVerdict(failure)).toBe(false)
      expect(deleteItemAsync).not.toHaveBeenCalled()
      await expect(refreshTokenStore.read()).resolves.toBe('live')
    }
  )

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
  it('keeps its tokens as a JSON array under pending_revoke', async () => {
    await pendingRevokeStore.add('a')
    await pendingRevokeStore.add('b')
    expect(setItemAsync).toHaveBeenLastCalledWith('pending_revoke', '["a","b"]', OPTIONS)
    await expect(pendingRevokeStore.list()).resolves.toEqual(['a', 'b'])
  })

  it('adds a token once', async () => {
    await pendingRevokeStore.add('a')
    await pendingRevokeStore.add('a')
    await expect(pendingRevokeStore.list()).resolves.toEqual(['a'])
  })

  it('drops the oldest token when a sixth arrives', async () => {
    for (const t of ['1', '2', '3', '4', '5', '6']) await pendingRevokeStore.add(t)
    await expect(pendingRevokeStore.list()).resolves.toEqual(['2', '3', '4', '5', '6'])
  })

  it('removes one token and keeps the others', async () => {
    await pendingRevokeStore.add('a')
    await pendingRevokeStore.add('b')
    await pendingRevokeStore.remove('a')
    await expect(pendingRevokeStore.list()).resolves.toEqual(['b'])
    await pendingRevokeStore.remove('b')
    expect(deleteItemAsync).toHaveBeenCalledWith('pending_revoke', OPTIONS)
    await expect(pendingRevokeStore.list()).resolves.toEqual([])
  })

  it.each(['not json', '{"a":1}', '[1,2]'])('reads %s as empty', async (raw) => {
    await setItemAsync('pending_revoke', raw)
    await expect(pendingRevokeStore.list()).resolves.toEqual([])
  })

  it('rejects list and add on a locked keychain, and deletes nothing', async () => {
    await pendingRevokeStore.add('a')
    getItemAsync.mockRejectedValue(codedError('ERR_KEY_CHAIN'))
    await expect(pendingRevokeStore.list()).rejects.toBeInstanceOf(Error)
    await expect(pendingRevokeStore.add('b')).rejects.toBeInstanceOf(Error)
    await expect(pendingRevokeStore.remove('a')).resolves.toBeUndefined()
    expect(deleteItemAsync).not.toHaveBeenCalled()
    getItemAsync
      .mockReset()
      .mockImplementation((key) =>
        key === 'pending_revoke' ? Promise.resolve('["a"]') : Promise.resolve(null)
      )
    await expect(pendingRevokeStore.list()).resolves.toEqual(['a'])
  })

  it('reads a list that fails to decrypt as empty without deleting it, and the next add replaces it', async () => {
    getItemAsync.mockRejectedValueOnce(codedError('ERR_DECRYPT'))
    await expect(pendingRevokeStore.list()).resolves.toEqual([])
    getItemAsync.mockRejectedValueOnce(codedError('ERR_DECRYPT'))
    await pendingRevokeStore.add('b')
    expect(deleteItemAsync).not.toHaveBeenCalled()
    await expect(pendingRevokeStore.list()).resolves.toEqual(['b'])
  })

  it('keeps both tokens when two adds run at once', async () => {
    await Promise.all([pendingRevokeStore.add('a'), pendingRevokeStore.add('b')])
    await expect(pendingRevokeStore.list()).resolves.toEqual(['a', 'b'])
  })
})

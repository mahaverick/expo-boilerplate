/**
 * @file The refresh token's home on the device: iOS Keychain or Android
 * Keystore, through `expo-secure-store`. The token leaves the store only for
 * the request that presents it.
 */
import * as SecureStore from 'expo-secure-store'
import { NoRefreshTokenError } from '@/http/auth-verdict'
import type { RefreshTokenStore } from '@/http/refresh-core'

/** How many times `write` tries before it gives up. */
export const WRITE_ATTEMPTS = 3

/** Keeps the item on this device, readable only while it is unlocked. */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

/**
 * A store over one SecureStore key.
 * @param key - The SecureStore key.
 */
function storeFor(key: string): RefreshTokenStore {
  return {
    async read() {
      try {
        return await SecureStore.getItemAsync(key, OPTIONS)
      } catch {
        // A value that fails to decrypt (a restored backup, a changed key) can never be read; drop it.
        await SecureStore.deleteItemAsync(key, OPTIONS).catch(() => {})
        return null
      }
    },
    async write(token) {
      for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
        try {
          await SecureStore.setItemAsync(key, token, OPTIONS)
          return
        } catch {
          // Try again at once.
        }
      }
      throw new NoRefreshTokenError()
    },
    async clear() {
      await SecureStore.deleteItemAsync(key, OPTIONS).catch(() => {})
    },
  }
}

/** Holds the session's refresh token under `refresh_token`. */
export const refreshTokenStore: RefreshTokenStore = storeFor('refresh_token')

/** Holds a token whose logout has not reached the API, under `pending_revoke`. */
export const pendingRevokeStore: RefreshTokenStore = storeFor('pending_revoke')

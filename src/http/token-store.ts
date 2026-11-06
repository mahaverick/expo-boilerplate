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

/** The most tokens `pending_revoke` holds; a sixth drops the oldest. */
const PENDING_REVOKE_LIMIT = 5

/** The tokens whose logout has not reached the API. */
export interface PendingRevokeStore {
  /** Every pending token, oldest first. A value that cannot be read gives an empty list. */
  list(): Promise<string[]>
  /** Adds a token, once. A sixth token drops the oldest. Rejects when the write fails. */
  add(token: string): Promise<void>
  /** Removes one token and keeps the others. Never rejects. */
  remove(token: string): Promise<void>
}

/** The raw store under `pending_revoke`; its value is a JSON array of tokens. */
const pendingSlot = storeFor('pending_revoke')

/** Runs after every earlier change, so two changes never overwrite each other. */
let pendingQueue: Promise<unknown> = Promise.resolve()

/**
 * Runs `change` after the changes queued before it.
 * @param change - A read-modify-write on the pending list.
 */
function serialized<T>(change: () => Promise<T>): Promise<T> {
  const run = pendingQueue.then(change)
  pendingQueue = run.catch(() => {})
  return run
}

/**
 * Parses the stored value.
 * @param raw - The stored JSON, or `null`.
 * @returns The tokens, or an empty list for anything but an array of strings.
 */
function parseTokens(raw: string | null): string[] {
  if (raw === null) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : []
  } catch {
    return []
  }
}

/**
 * Saves the list, or clears the key when it is empty.
 * @param tokens - The tokens to keep.
 */
async function saveTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) await pendingSlot.clear()
  else await pendingSlot.write(JSON.stringify(tokens))
}

/** Holds the tokens whose logout has not reached the API, under `pending_revoke`. */
export const pendingRevokeStore: PendingRevokeStore = {
  async list() {
    return parseTokens(await pendingSlot.read())
  },
  add(token) {
    return serialized(async () => {
      const tokens = parseTokens(await pendingSlot.read())
      if (tokens.includes(token)) return
      await saveTokens([...tokens, token].slice(-PENDING_REVOKE_LIMIT))
    })
  },
  remove(token) {
    return serialized(async () => {
      const tokens = parseTokens(await pendingSlot.read())
      if (!tokens.includes(token)) return
      await saveTokens(tokens.filter((item) => item !== token)).catch(() => {})
    })
  },
}

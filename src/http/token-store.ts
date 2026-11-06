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
 * The code expo-secure-store gives a value it cannot decrypt. Android's
 * `DecryptException` takes it from its class name (`CodedException.inferCode`).
 * The iOS Keychain decrypts its own items and has no such failure.
 */
const DECRYPT_FAILURE = 'ERR_DECRYPT'

/** What `readItem` returns for a value that fails to decrypt. */
const UNDECRYPTABLE = Symbol('undecryptable')

/**
 * Whether `error` is expo-secure-store's decrypt failure.
 * @param error - What the read rejected with.
 */
function isDecryptFailure(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === DECRYPT_FAILURE
  )
}

/**
 * Reads one key and deletes nothing.
 * @param key - The SecureStore key.
 * @returns The value, `null` when it is unset, or `UNDECRYPTABLE`.
 * @throws A plain `Error`, never an auth verdict, on any other failure, such
 * as a locked Keychain (`ERR_KEY_CHAIN`). The item may still be good.
 */
async function readItem(key: string): Promise<string | null | typeof UNDECRYPTABLE> {
  try {
    return await SecureStore.getItemAsync(key, OPTIONS)
  } catch (error) {
    if (isDecryptFailure(error)) return UNDECRYPTABLE
    throw new Error(`SecureStore could not read ${key}.`, { cause: error })
  }
}

/**
 * A store over one SecureStore key. `read` drops a value that fails to
 * decrypt and reads it as `null`; any other read failure rejects and keeps
 * the item.
 * @param key - The SecureStore key.
 */
function storeFor(key: string): RefreshTokenStore {
  return {
    async read() {
      const value = await readItem(key)
      if (value !== UNDECRYPTABLE) return value
      // A value that fails to decrypt (a restored backup, a changed key) can never be read; drop it.
      await SecureStore.deleteItemAsync(key, OPTIONS).catch(() => {})
      return null
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
  /**
   * Every pending token, oldest first. A value that fails to decrypt gives an
   * empty list. Rejects when the store cannot be read, such as a locked Keychain.
   */
  list(): Promise<string[]>
  /** Adds a token, once. A sixth token drops the oldest. Rejects when the read or the write fails. */
  add(token: string): Promise<void>
  /** Removes one token and keeps the others. Never rejects. */
  remove(token: string): Promise<void>
}

/** The raw store under `pending_revoke`; its value is a JSON array of tokens. */
const pendingSlot = storeFor('pending_revoke')

/**
 * Reads the pending list and deletes nothing: a value that fails to decrypt
 * reads as empty, and the next save replaces it.
 * @returns The tokens.
 * @throws A plain `Error` when the store cannot be read, such as a locked Keychain.
 */
async function readTokens(): Promise<string[]> {
  const raw = await readItem('pending_revoke')
  return raw === UNDECRYPTABLE ? [] : parseTokens(raw)
}

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
  list() {
    return readTokens()
  },
  add(token) {
    return serialized(async () => {
      const tokens = await readTokens()
      if (tokens.includes(token)) return
      await saveTokens([...tokens, token].slice(-PENDING_REVOKE_LIMIT))
    })
  },
  remove(token) {
    return serialized(async () => {
      const tokens = await readTokens().catch(() => null)
      if (tokens === null || !tokens.includes(token)) return
      await saveTokens(tokens.filter((item) => item !== token)).catch(() => {})
    })
  },
}

/** How many times the device's session has changed hands. */
let sessionChanges = 0

/**
 * Marks a change of whose session the device holds: a sign-out, or a
 * sign-in that stores a new token. A refresh that read the store before the
 * mark cannot keep its token (`src/http/session.ts`).
 */
export function markSessionChange(): void {
  sessionChanges += 1
}

/**
 * How many session changes have been marked so far.
 * @returns The count, which only grows.
 */
export function sessionChangeCount(): number {
  return sessionChanges
}

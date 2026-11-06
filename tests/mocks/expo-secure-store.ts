/**
 * @file An in-memory stand-in for `expo-secure-store`. Registered in
 * `jest.config.ts`; each method is a `jest.fn`, so a test can assert on the
 * calls or make one reject.
 */
import { jest } from '@jest/globals'

/** What the fake keychain holds. */
const items = new Map<string, string>()

/** The accessibility value the app asks for on every call. */
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY'

/** Reads a key, or `null` when it is unset. */
export const getItemAsync = jest.fn<(key: string, options?: unknown) => Promise<string | null>>()

/** Stores a value under a key. */
export const setItemAsync =
  jest.fn<(key: string, value: string, options?: unknown) => Promise<void>>()

/** Removes a key. */
export const deleteItemAsync = jest.fn<(key: string, options?: unknown) => Promise<void>>()

/** Empties the keychain, clears the call records and restores the default behaviour. */
export function resetSecureStore(): void {
  items.clear()
  getItemAsync.mockReset().mockImplementation((key) => Promise.resolve(items.get(key) ?? null))
  setItemAsync.mockReset().mockImplementation((key, value) => {
    items.set(key, value)
    return Promise.resolve()
  })
  deleteItemAsync.mockReset().mockImplementation((key) => {
    items.delete(key)
    return Promise.resolve()
  })
}

resetSecureStore()

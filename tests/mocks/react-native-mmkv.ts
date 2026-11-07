/**
 * @file An in-memory stand-in for `react-native-mmkv`, whose Nitro module
 * Jest cannot load. Registered in `jest.config.ts`, so any suite that reaches
 * `src/lib/storage.ts` (the analytics facade does, through the telemetry
 * port) loads. A suite that needs set values still mocks the module or
 * `@/lib/storage` itself.
 */

/** The subset of an MMKV instance the app calls. */
interface MockMMKV {
  getString: (key: string) => string | undefined
  set: (key: string, value: string) => void
  remove: (key: string) => boolean
}

/**
 * A fresh, empty instance.
 * @returns An instance backed by a `Map`.
 */
export function createMMKV(): MockMMKV {
  const values = new Map<string, string>()
  return {
    getString: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value)
    },
    remove: (key) => values.delete(key),
  }
}

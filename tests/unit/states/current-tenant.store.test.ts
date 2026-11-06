import { jest } from '@jest/globals'
import { beforeEach, describe, expect, it } from '@/tests/support/runner'

/** What the mocked MMKV instance holds, keyed as the store writes it. */
const mockStorage = new Map<string, string>()

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => {
      mockStorage.set(key, value)
    },
    remove: (key: string) => mockStorage.delete(key),
  }),
}))

/**
 * The store module, loaded fresh over what storage holds now.
 * @returns Its exports.
 */
function loadStore(): typeof import('@/states/current-tenant.store') {
  let loaded: typeof import('@/states/current-tenant.store') | undefined
  jest.isolateModules(() => {
    loaded = jest.requireActual<typeof import('@/states/current-tenant.store')>(
      '@/states/current-tenant.store'
    )
  })
  return loaded!
}

beforeEach(() => {
  mockStorage.clear()
})

describe('useCurrentTenantStore', () => {
  it('remembers per user, and a second user does not read the first user’s workspace', () => {
    const { useCurrentTenantStore } = loadStore()
    useCurrentTenantStore.getState().remember('u1', 'acme')
    expect(mockStorage.get('last-tenant:u1')).toBe('acme')
    expect(useCurrentTenantStore.getState().recall('u1')).toBe('acme')
    expect(useCurrentTenantStore.getState().recall('u2')).toBeNull()
  })

  it('loads a user’s value from MMKV on first read, and only that user’s', () => {
    mockStorage.set('last-tenant:u1', 'acme')
    mockStorage.set('last-tenant:u2', 'other')
    const { useCurrentTenantStore } = loadStore()
    expect(useCurrentTenantStore.getState().remembered).toEqual({})
    expect(useCurrentTenantStore.getState().recall('u1')).toBe('acme')
  })

  it('forgets a user’s value from memory and from MMKV', () => {
    const { useCurrentTenantStore } = loadStore()
    useCurrentTenantStore.getState().remember('u1', 'acme')
    useCurrentTenantStore.getState().forget('u1')
    expect(mockStorage.has('last-tenant:u1')).toBe(false)
    expect(useCurrentTenantStore.getState().recall('u1')).toBeNull()
  })
})

import { jest } from '@jest/globals'
import { describe, expect, it } from '@/tests/support/runner'

/** What the mocked MMKV instance holds, keyed as the store writes it. */
const mockStorage = new Map<string, string>()

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => {
      mockStorage.set(key, value)
    },
  }),
}))

/**
 * The store module, loaded fresh over what storage holds now.
 * @returns Its exports.
 */
function loadStore(): typeof import('@/states/theme.store') {
  let loaded: typeof import('@/states/theme.store') | undefined
  jest.isolateModules(() => {
    loaded = jest.requireActual<typeof import('@/states/theme.store')>('@/states/theme.store')
  })
  return loaded!
}

describe('useThemeStore', () => {
  it('starts at system when nothing is stored', () => {
    mockStorage.clear()
    expect(loadStore().useThemeStore.getState().preference).toBe('system')
  })

  it('starts at system when the stored value is not a preference', () => {
    mockStorage.set('theme', 'sepia')
    expect(loadStore().useThemeStore.getState().preference).toBe('system')
  })

  it('reads a stored preference and saves a new one under `theme`', () => {
    mockStorage.set('theme', 'dark')
    const { useThemeStore } = loadStore()
    expect(useThemeStore.getState().preference).toBe('dark')
    useThemeStore.getState().setPreference('light')
    expect(useThemeStore.getState().preference).toBe('light')
    expect(mockStorage.get('theme')).toBe('light')
  })
})

describe('resolvedScheme', () => {
  it.each([
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
    ['system', null, 'light'],
    ['system', undefined, 'light'],
  ] as const)('%s with the system at %s is %s', (preference, system, expected) => {
    expect(loadStore().resolvedScheme(preference, system)).toBe(expected)
  })
})

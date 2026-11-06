import { create } from 'zustand'
import { storage } from '@/lib/storage'

/** The user's colour theme choice; `system` follows the OS. */
export type ThemePreference = 'light' | 'dark' | 'system'

/** A colour scheme the app paints in. */
type ColorScheme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

/**
 * The preference saved in MMKV, or `system` when none is saved or the saved
 * value is not a preference.
 */
function readStoredPreference(): ThemePreference {
  const stored = storage.getString(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

/**
 * The scheme a preference paints in.
 * @param preference - The user's choice.
 * @param systemScheme - The OS's scheme; anything but `dark` reads as light.
 * @returns `light` or `dark`.
 */
export function resolvedScheme(
  preference: ThemePreference,
  systemScheme: string | null | undefined
): ColorScheme {
  if (preference !== 'system') return preference
  return systemScheme === 'dark' ? 'dark' : 'light'
}

/** The chosen theme and the action that changes it. */
interface ThemeState {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}

/**
 * The theme choice, saved to MMKV under `theme` on every change. The root
 * layout applies it to NativeWind before the splash screen hides.
 */
export const useThemeStore = create<ThemeState>()((set) => ({
  preference: readStoredPreference(),
  setPreference: (preference) => {
    storage.set(STORAGE_KEY, preference)
    set({ preference })
  },
}))

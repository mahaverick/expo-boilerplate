import { jest } from '@jest/globals'
import { act, render, waitFor } from '@testing-library/react-native'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme } from 'nativewind'
import RootLayout from '@/app/_layout'
import { useThemeStore } from '@/states/theme.store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => (key === 'theme' ? 'dark' : undefined),
    set: () => undefined,
  }),
}))
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}))
jest.mock('expo-router', () => ({ Stack: () => null }))

/** NativeWind's own `set`, which in tests reports the scheme at once. */
const apply = colorScheme.set.bind(colorScheme)

/** The scheme NativeWind reported when the splash screen was hidden. */
let schemeAtHide: string | undefined

beforeEach(() => {
  jest.useFakeTimers()
  // Each case starts on a light system with the stored dark preference.
  apply('light')
  useThemeStore.setState({ preference: 'dark' })
  schemeAtHide = undefined
  jest.mocked(SplashScreen.hideAsync).mockImplementation(() => {
    schemeAtHide = colorScheme.get()
    return Promise.resolve()
  })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

/**
 * Holds every `colorScheme.set` call back, as a device does until its native
 * appearance event arrives; `apply` delivers the report.
 * @returns The spy on `colorScheme.set`.
 */
function holdSchemeReports() {
  return jest.spyOn(colorScheme, 'set').mockImplementation(() => undefined)
}

describe('RootLayout', () => {
  it('keeps the splash screen up until the stored dark theme is applied', async () => {
    const preventAutoHide = jest.mocked(SplashScreen.preventAutoHideAsync)
    const hide = jest.mocked(SplashScreen.hideAsync)
    // Module scope: the call ran when the layout was imported, before any render.
    expect(preventAutoHide).toHaveBeenCalledTimes(1)
    expect(hide).not.toHaveBeenCalled()

    const set = holdSchemeReports()
    const schedule = jest.spyOn(globalThis, 'setTimeout')
    const clear = jest.spyOn(globalThis, 'clearTimeout')
    await render(<RootLayout />)

    expect(set).toHaveBeenCalledWith('dark')
    expect(hide).not.toHaveBeenCalled()
    const fallback = schedule.mock.results[schedule.mock.calls.findIndex(([, ms]) => ms === 2000)]
    expect(fallback).toBeDefined()

    await act(() => {
      apply('dark')
    })
    await waitFor(() => {
      expect(hide).toHaveBeenCalledTimes(1)
    })
    expect(schemeAtHide).toBe('dark')
    expect(preventAutoHide.mock.invocationCallOrder[0]).toBeLessThan(
      set.mock.invocationCallOrder[0]!
    )

    // The fallback timer was cleared on the normal path, so it never hides a second time.
    expect(clear).toHaveBeenCalledWith(fallback!.value as ReturnType<typeof setTimeout>)
    await act(() => {
      jest.advanceTimersByTime(5000)
    })
    expect(hide).toHaveBeenCalledTimes(1)

    set.mockImplementation(apply)
    await act(() => {
      useThemeStore.getState().setPreference('light')
    })
    await waitFor(() => {
      expect(set).toHaveBeenLastCalledWith('light')
    })
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('hides the splash screen after 2 seconds when no scheme report arrives', async () => {
    const hide = jest.mocked(SplashScreen.hideAsync)
    const set = holdSchemeReports()
    await render(<RootLayout />)
    expect(set).toHaveBeenCalledWith('dark')

    await act(() => {
      jest.advanceTimersByTime(1999)
    })
    expect(hide).not.toHaveBeenCalled()
    await act(() => {
      jest.advanceTimersByTime(1)
    })
    expect(hide).toHaveBeenCalledTimes(1)
    expect(schemeAtHide).toBe('light')

    // A late report does not hide it again.
    await act(() => {
      apply('dark')
    })
    expect(hide).toHaveBeenCalledTimes(1)
  })
})

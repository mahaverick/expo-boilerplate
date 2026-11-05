import { jest } from '@jest/globals'
import { act, render, waitFor } from '@testing-library/react-native'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme } from 'nativewind'
import RootLayout from '@/app/_layout'
import { useThemeStore } from '@/states/theme.store'
import { describe, expect, it } from '@/tests/support/runner'

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

describe('RootLayout', () => {
  it('keeps the splash screen up until the stored dark theme is applied', async () => {
    const preventAutoHide = jest.mocked(SplashScreen.preventAutoHideAsync)
    const hide = jest.mocked(SplashScreen.hideAsync)
    // Module scope: the call ran when the layout was imported, before any render.
    expect(preventAutoHide).toHaveBeenCalledTimes(1)
    expect(hide).not.toHaveBeenCalled()

    // On a device the scheme reaches NativeWind through a native event, after `set` returns; held here until `apply`.
    const apply = colorScheme.set.bind(colorScheme)
    const set = jest.spyOn(colorScheme, 'set').mockImplementation(() => undefined)
    let schemeAtHide: string | undefined
    hide.mockImplementation(() => {
      schemeAtHide = colorScheme.get()
      return Promise.resolve()
    })
    await render(<RootLayout />)

    expect(set).toHaveBeenCalledWith('dark')
    expect(hide).not.toHaveBeenCalled()

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

    set.mockImplementation(apply)
    await act(() => {
      useThemeStore.getState().setPreference('light')
    })
    await waitFor(() => {
      expect(set).toHaveBeenLastCalledWith('light')
    })
    expect(hide).toHaveBeenCalledTimes(1)
    set.mockRestore()
  })
})

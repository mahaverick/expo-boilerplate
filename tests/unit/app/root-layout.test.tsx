import { jest } from '@jest/globals'
import { act, render, waitFor } from '@testing-library/react-native'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme } from 'nativewind'
import RootLayout from '@/app/_layout'
import {
  installForegroundRefresh,
  restoreSession,
  useSessionStatus,
} from '@/http/session-lifecycle'
import type { SessionStatus } from '@/http/session-lifecycle'
import { queryClient } from '@/lib/query-client'
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
jest.mock('@/http/session-lifecycle', () => ({
  restoreSession: jest.fn(() => Promise.resolve()),
  installForegroundRefresh: jest.fn(() => jest.fn()),
  useSessionStatus: jest.fn(() => 'signed-out'),
}))
jest.mock('expo-router', () => {
  const { useQueryClient } =
    jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    /** Records the query client the screens would read. */
    Stack: function Stack() {
      mockSeenClients.push(useQueryClient())
      return null
    },
  }
})

/** The query clients the mocked `Stack` saw, one per render. */
const mockSeenClients: unknown[] = []

/** NativeWind's own `set`, which in tests reports the scheme at once. */
const apply = colorScheme.set.bind(colorScheme)

/** The scheme NativeWind reported when the splash screen was hidden. */
let schemeAtHide: string | undefined

/**
 * Sets the session status the mocked hook reports.
 * @param status - The status to report.
 */
function setStatus(status: SessionStatus): void {
  jest.mocked(useSessionStatus).mockReturnValue(status)
}

beforeEach(() => {
  jest.useFakeTimers()
  // Each case starts on a light system with the stored dark preference.
  apply('light')
  useThemeStore.setState({ preference: 'dark' })
  schemeAtHide = undefined
  setStatus('signed-out')
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

  it('holds the splash screen while the session restores, then hides it', async () => {
    const hide = jest.mocked(SplashScreen.hideAsync)
    setStatus('restoring')
    const view = await render(<RootLayout />)
    // The theme is applied, but the restore is pending.
    expect(colorScheme.get()).toBe('dark')
    expect(hide).not.toHaveBeenCalled()
    expect(restoreSession).toHaveBeenCalledTimes(1)

    setStatus('signed-in')
    await view.rerender(<RootLayout />)
    await waitFor(() => {
      expect(hide).toHaveBeenCalledTimes(1)
    })
  })

  it('hides the splash screen after the fallback even while the restore is pending', async () => {
    const hide = jest.mocked(SplashScreen.hideAsync)
    setStatus('restoring')
    await render(<RootLayout />)
    await act(() => {
      jest.advanceTimersByTime(1999)
    })
    expect(hide).not.toHaveBeenCalled()
    await act(() => {
      jest.advanceTimersByTime(1)
    })
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('provides the app query client to every screen', async () => {
    mockSeenClients.length = 0
    await render(<RootLayout />)
    expect(mockSeenClients.length).toBeGreaterThan(0)
    expect(mockSeenClients.every((client) => client === queryClient)).toBe(true)
  })

  it('installs the foreground refresh and removes it on unmount', async () => {
    const remove = jest.fn()
    jest.mocked(installForegroundRefresh).mockReturnValueOnce(remove)
    const view = await render(<RootLayout />)
    expect(installForegroundRefresh).toHaveBeenCalledTimes(1)
    await view.unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})

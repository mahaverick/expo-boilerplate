import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { BackHandler, Linking } from 'react-native'
import PasskeyRequired from '@/app/passkey-required'
import { refreshTokenStore } from '@/http/token-store'
import { clientSettingsKeys } from '@/queries/client-settings.queries'
import { useAuthStore } from '@/states/auth.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  Stack: { Screen: () => null },
}))

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }))

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }))

/** Sets the `extra.webUrl` the screen reads. */
function setWebUrl(webUrl: string | undefined): void {
  Constants.expoConfig = { extra: webUrl ? { webUrl } : {} } as never
}

beforeEach(async () => {
  resetSecureStore()
  await refreshTokenStore.write('tok')
  usePasskeySetupStore.setState({ required: true })
  useAuthStore.setState({ accessToken: 'a', isAuthenticated: true })
  serve(() => ({ status: 200, data: {} }))
})

afterEach(() => {
  restoreApi()
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

describe('PasskeyRequired', () => {
  it('explains the block under one header', async () => {
    setWebUrl('https://app.example.com')
    await renderScreen(<PasskeyRequired />)
    expect(screen.getByRole('header', { name: 'Add a passkey to continue' })).toBeTruthy()
    expect(
      screen.getByText(
        'Your account needs a passkey. This app can’t add one yet. Add one on the website under Settings, then Security, then come back.'
      )
    ).toBeTruthy()
  })

  it('says how to ask for deletion by email, with a support address', async () => {
    setWebUrl(undefined)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(clientSettingsKeys.all, { supportEmail: 'help@example.com' })
    await renderScreen(<PasskeyRequired />, client)
    expect(
      screen.getByText('To ask us to delete your account instead, write to help@example.com.')
    ).toBeTruthy()
  })

  it('without a support address, points to the one on the website and offers it', async () => {
    setWebUrl('https://app.example.com')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(clientSettingsKeys.all, null)
    await renderScreen(<PasskeyRequired />, client)
    expect(
      screen.getByText(
        'To ask us to delete your account instead, write to the support address on our website.'
      )
    ).toBeTruthy()
    expect(screen.queryByText(/our support team/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Open the website' })).toBeTruthy()
  })

  it('renders inside a scroll view, so Sign out stays reachable at large text sizes', async () => {
    setWebUrl('https://app.example.com')
    await renderScreen(<PasskeyRequired />)
    expect(screen.getByTestId('screen').type).toBe('RCTScrollView')
  })

  it('Open the website opens the security settings page in the in-app browser', async () => {
    setWebUrl('https://app.example.com')
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    await renderScreen(<PasskeyRequired />)
    await fireEvent.press(screen.getByRole('button', { name: 'Open the website' }))
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://app.example.com/settings/account/security'
    )
    // The system's link handler would hand a verified app link back to this app.
    expect(openURL).not.toHaveBeenCalled()
  })

  it('survives a refusal to open the website', async () => {
    setWebUrl('https://app.example.com')
    const open = jest
      .mocked(WebBrowser.openBrowserAsync)
      .mockRejectedValueOnce(new Error('no browser'))
    await renderScreen(<PasskeyRequired />)
    await fireEvent.press(screen.getByRole('button', { name: 'Open the website' }))
    await waitFor(() => {
      expect(open).toHaveBeenCalled()
    })
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('hides Open the website with no web address', async () => {
    setWebUrl(undefined)
    await renderScreen(<PasskeyRequired />)
    expect(screen.queryByRole('button', { name: 'Open the website' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('Sign out signs out, which clears the flag', async () => {
    setWebUrl(undefined)
    await renderScreen(<PasskeyRequired />)
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => {
      expect(usePasskeySetupStore.getState().required).toBe(false)
    })
    expect(router.replace).toHaveBeenCalledWith('/login')
    expect(await refreshTokenStore.read()).toBeNull()
  })

  it('goes Home when the flag clears while signed in', async () => {
    setWebUrl(undefined)
    await renderScreen(<PasskeyRequired />)
    expect(router.replace).not.toHaveBeenCalled()
    await act(() => {
      usePasskeySetupStore.getState().setRequired(false)
    })
    expect(router.replace).toHaveBeenCalledWith('/')
  })

  it('ignores the Android back button', async () => {
    setWebUrl(undefined)
    const add = jest.spyOn(BackHandler, 'addEventListener')
    await renderScreen(<PasskeyRequired />)
    const call = add.mock.calls.find(([event]) => event === 'hardwareBackPress')
    const handler = call?.[1] as (() => boolean) | undefined
    expect(handler?.()).toBe(true)
  })
})

import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { BackHandler, Linking } from 'react-native'
import PasskeyRequired from '@/app/passkey-required'
import { refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  Stack: { Screen: () => null },
}))

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

  it('renders inside a scroll view, so Sign out stays reachable at large text sizes', async () => {
    setWebUrl('https://app.example.com')
    await renderScreen(<PasskeyRequired />)
    expect(screen.getByTestId('screen').type).toBe('RCTScrollView')
  })

  it('Open the website opens the security settings page', async () => {
    setWebUrl('https://app.example.com')
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    await renderScreen(<PasskeyRequired />)
    await fireEvent.press(screen.getByRole('button', { name: 'Open the website' }))
    expect(open).toHaveBeenCalledWith('https://app.example.com/settings/account/security')
  })

  it('survives a refusal to open the website', async () => {
    setWebUrl('https://app.example.com')
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'))
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

  it('ignores the Android back button', async () => {
    setWebUrl(undefined)
    const add = jest.spyOn(BackHandler, 'addEventListener')
    await renderScreen(<PasskeyRequired />)
    const call = add.mock.calls.find(([event]) => event === 'hardwareBackPress')
    const handler = call?.[1] as (() => boolean) | undefined
    expect(handler?.()).toBe(true)
  })
})

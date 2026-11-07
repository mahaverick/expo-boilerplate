import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router, type Href } from 'expo-router'
import Settings from '@/app/(app)/(tabs)/settings'
import { refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }))

beforeEach(() => {
  resetSecureStore()
  serve(() => ({ status: 200, data: { success: true, data: {} } }))
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  jest.clearAllMocks()
})

describe('Settings', () => {
  it('shows its copy under one header', async () => {
    await renderScreen(<Settings />)
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(screen.getByRole('header', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByText('Account')).toBeTruthy()
    expect(screen.getByText('Your profile, sign-in and notifications.')).toBeTruthy()
    expect(screen.getByText('Workspace')).toBeTruthy()
    expect(screen.getByText('The current workspace’s details, members and activity.')).toBeTruthy()
  })

  it.each([
    ['Profile', 'Your name.', '/settings/account/profile'],
    ['Security', 'Your sign-in methods and signed-in devices.', '/settings/account/security'],
    [
      'Notifications',
      'How each kind of notification reaches you.',
      '/settings/account/notifications',
    ],
  ])('the %s row shows %s and pushes %s', async (title, description, href) => {
    await renderScreen(<Settings />)
    expect(screen.getByText(description)).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: title }))
    expect(router.push).toHaveBeenCalledWith(href as Href)
  })

  it('Sign out signs the device out and goes to /login', async () => {
    await refreshTokenStore.write('tok')
    await renderScreen(<Settings />)
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/login')
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

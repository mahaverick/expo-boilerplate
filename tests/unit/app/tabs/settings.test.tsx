import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router, type Href } from 'expo-router'
import Settings from '@/app/(app)/(tabs)/settings'
import { refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { serveWorkspace } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }))

/** The in-memory stand-in for MMKV. */
const mockStorage = new Map<string, string>()
jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => {
      mockStorage.set(key, value)
    },
    remove: (key: string) => mockStorage.delete(key),
  },
}))

beforeEach(() => {
  mockStorage.clear()
  useCurrentTenantStore.setState({ remembered: {} })
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

  it('says to choose a workspace first when none is current', async () => {
    await renderScreen(<Settings />)
    expect(screen.getByText('Choose a workspace first.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'General' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull()
  })

  it.each([
    ['General', 'The workspace’s details, time zone, and language and region.', 'general'],
    ['Members', 'Members, roles and pending invitations.', 'members'],
    ['Activity', 'Every change made in this workspace, newest first.', 'activity'],
  ])('the %s row pushes the current workspace’s screen', async (title, description, leaf) => {
    useAuthStore.getState().login('a', {
      id: 'u1',
      email: 'ada@example.com',
      firstName: null,
      lastName: null,
      createdAt: '2026-01-01',
      platformRole: null,
      analyticsOptOut: false,
    })
    serveWorkspace()
    await renderScreen(<Settings />)
    expect(await screen.findByText(description)).toBeTruthy()
    expect(screen.queryByText('Choose a workspace first.')).toBeNull()
    await fireEvent.press(screen.getByRole('link', { name: title }))
    expect(router.push).toHaveBeenCalledWith(`/settings/workspace/acme/${leaf}` as Href)
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

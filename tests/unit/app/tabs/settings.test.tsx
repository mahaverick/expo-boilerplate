import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import Constants from 'expo-constants'
import { router, type Href } from 'expo-router'
import Settings from '@/app/(app)/(tabs)/settings'
import { refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { membership, serveWorkspace } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }))

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }))

const savedKey = process.env.EXPO_PUBLIC_POSTHOG_KEY

/**
 * Sets the build's analytics key and policy URL, which decide the Privacy row.
 * @param key - The PostHog key, or undefined for none.
 * @param policyUrl - The privacy policy URL, or undefined for none.
 */
function setBuild(key: string | undefined, policyUrl: string | undefined): void {
  if (key === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_KEY
  else process.env.EXPO_PUBLIC_POSTHOG_KEY = key
  Constants.expoConfig = { extra: policyUrl ? { privacyPolicyUrl: policyUrl } : {} } as never
}

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
  setBuild('phc_test_key_not_real', undefined)
  mockStorage.clear()
  useCurrentTenantStore.setState({ remembered: {} })
  resetSecureStore()
  serve(() => ({ status: 200, data: { success: true, data: {} } }))
})

afterEach(() => {
  if (savedKey === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_KEY
  else process.env.EXPO_PUBLIC_POSTHOG_KEY = savedKey
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
    expect(
      screen.getByText('The current workspace’s details, members, activity and plan.')
    ).toBeTruthy()
  })

  it.each([
    ['Profile', 'Your name.', '/settings/account/profile'],
    ['Security', 'Your sign-in methods and signed-in devices.', '/settings/account/security'],
    [
      'Notifications',
      'How each kind of notification reaches you.',
      '/settings/account/notifications',
    ],
    ['Privacy', 'Usage analytics and our privacy policy.', '/settings/account/privacy'],
    ['Delete account', 'Ask us to delete your account.', '/settings/account/delete'],
  ])('the %s row shows %s and pushes %s', async (title, description, href) => {
    await renderScreen(<Settings />)
    expect(screen.getByText(description)).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: title }))
    expect(router.push).toHaveBeenCalledWith(href as Href)
  })

  it('lists Privacy before Delete account, last in the Account group', async () => {
    await renderScreen(<Settings />)
    const titles = screen.getAllByRole('link').map((link) => String(link.props.accessibilityLabel))
    expect(titles.slice(0, 5)).toEqual([
      'Profile',
      'Security',
      'Notifications',
      'Privacy',
      'Delete account',
    ])
  })

  it.each([
    ['a key and no policy URL', 'phc_test_key_not_real', undefined, true],
    ['a policy URL and no key', undefined, 'https://example.com/privacy', true],
    ['neither', undefined, undefined, false],
  ])('with %s the Privacy row shows: %s', async (_name, key, policyUrl, shows) => {
    setBuild(key, policyUrl)
    await renderScreen(<Settings />)
    expect(screen.queryByRole('link', { name: 'Privacy' }) !== null).toBe(shows)
    expect(screen.getByRole('link', { name: 'Delete account' })).toBeTruthy()
  })

  it('says to choose a workspace first when none is current', async () => {
    await renderScreen(<Settings />)
    expect(screen.getByText('Choose a workspace first.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'General' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull()
  })

  describe('while the workspaces are not known', () => {
    beforeEach(() => {
      useAuthStore.getState().login('a', {
        id: 'u1',
        email: 'ada@example.com',
        firstName: null,
        lastName: null,
        createdAt: '2026-01-01',
        platformRole: null,
        analyticsOptOut: false,
      })
    })

    it('shows a spinner, not the choose line, while the list loads', async () => {
      restoreApi()
      serve(() => new Promise(() => {}))
      await renderScreen(<Settings />)
      expect(screen.getByLabelText('Loading your workspaces')).toBeTruthy()
      expect(screen.queryByText('Choose a workspace first.')).toBeNull()
    })

    it('shows the load error with Try again when the list fails, then the rows', async () => {
      restoreApi()
      let fail = true
      const listed = {
        status: 200,
        data: {
          success: true,
          data: {
            items: [membership('acme', 'Acme')],
            page: { hasNext: false, nextCursor: null },
          },
        },
      }
      serve((config) => {
        if (config.url !== '/tenants') return { status: 404, data: { success: false } }
        return fail ? { status: 500, data: { success: false, message: 'Broke' } } : listed
      })
      await renderScreen(<Settings />)
      expect(
        await screen.findByText(
          'We couldn’t load your workspaces, so none are listed. Select Try again to load them.'
        )
      ).toBeTruthy()
      expect(screen.queryByText('Choose a workspace first.')).toBeNull()
      fail = false
      await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByRole('link', { name: 'General' })).toBeTruthy()
    })

    it('says to choose a workspace first when the list has none', async () => {
      restoreApi()
      serveWorkspace({
        'GET /tenants': {
          status: 200,
          data: { success: true, data: { items: [], page: { hasNext: false, nextCursor: null } } },
        },
      })
      await renderScreen(<Settings />)
      expect(await screen.findByText('Choose a workspace first.')).toBeTruthy()
      expect(screen.queryByLabelText('Loading your workspaces')).toBeNull()
    })
  })

  it.each([
    ['General', 'The workspace’s details, time zone, and language and region.', 'general'],
    ['Members', 'Members, roles and pending invitations.', 'members'],
    ['Activity', 'Every change made in this workspace, newest first.', 'activity'],
    ['Plan', 'The workspace’s plan and its limits.', 'billing'],
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

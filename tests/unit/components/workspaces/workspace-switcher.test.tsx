import { jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { WorkspaceSwitcher } from '@/components/workspaces/workspace-switcher'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

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

/** A tenants page in express's envelope. */
const page = (items: unknown[]) => ({
  status: 200,
  data: { success: true, data: { items, page: { hasNext: false, nextCursor: null } } },
})

/** A membership row. */
const row = (id: string, name: string, lifecycleState = 'active', isPlatform = false) => ({
  tenant: { id, name, slug: id, lifecycleState },
  role: 'owner',
  joinedAt: '2026-01-01',
  isPlatform,
})

beforeEach(() => {
  mockStorage.clear()
  useCurrentTenantStore.setState({ remembered: {} })
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

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  jest.clearAllMocks()
})

describe('WorkspaceSwitcher', () => {
  it('labels the trigger by what is known', async () => {
    serve(() => page([row('acme', 'Acme')]))
    await renderScreen(<WorkspaceSwitcher />)
    expect(screen.getByRole('button', { name: 'Loading workspaces…' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Choose a workspace' })).toBeTruthy()
  })

  it('names the open workspace on the trigger', async () => {
    serve(() => page([row('acme', 'Acme')]))
    await renderScreen(<WorkspaceSwitcher currentSlug="acme" />)
    expect(await screen.findByRole('button', { name: 'Acme' })).toBeTruthy()
  })

  it('labels a failed list on the trigger', async () => {
    serve(() => 'network-error')
    await renderScreen(<WorkspaceSwitcher />)
    expect(await screen.findByRole('button', { name: 'Workspaces didn’t load' })).toBeTruthy()
  })

  it('remembers and opens the chosen workspace', async () => {
    serve(() => page([row('acme', 'Acme'), row('beta', 'Beta')]))
    await renderScreen(<WorkspaceSwitcher />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a workspace' }))
    expect(screen.getByText('Your workspaces')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Beta, /beta' }))
    expect(useCurrentTenantStore.getState().recall('u1')).toBe('beta')
    expect(router.push).toHaveBeenCalledWith('/tenants/beta')
    expect(screen.queryByText('Your workspaces')).toBeNull()
  })

  it('lists a suspended workspace disabled and hides the platform workspace', async () => {
    serve(() =>
      page([
        row('acme', 'Acme'),
        row('frozen', 'Frozen', 'suspended'),
        row('platform', 'Platform', 'active', true),
      ])
    )
    await renderScreen(<WorkspaceSwitcher />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a workspace' }))
    expect(screen.getByText('Frozen')).toBeTruthy()
    expect(screen.getByText('Suspended')).toBeTruthy()
    expect(screen.queryByText('Platform')).toBeNull()
    await fireEvent.press(screen.getByText('Frozen'))
    expect(router.push).not.toHaveBeenCalled()
    expect(useCurrentTenantStore.getState().recall('u1')).toBeNull()
  })

  it('says "No workspaces yet" for an empty list', async () => {
    serve(() => page([]))
    await renderScreen(<WorkspaceSwitcher />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a workspace' }))
    expect(screen.getByText('No workspaces yet')).toBeTruthy()
  })

  it('a failed list shows the error, not the empty state', async () => {
    serve(() => 'network-error')
    await renderScreen(<WorkspaceSwitcher />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Workspaces didn’t load' }))
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('No workspaces yet')).toBeNull()
  })

  it('Create a workspace goes to /tenants, and Close closes the sheet', async () => {
    serve(() => page([row('acme', 'Acme')]))
    await renderScreen(<WorkspaceSwitcher />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a workspace' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Create a workspace' }))
    expect(router.push).toHaveBeenCalledWith('/tenants')
    expect(screen.queryByText('Your workspaces')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a workspace' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Your workspaces')).toBeNull()
  })
})

import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import Overview from '@/app/(app)/tenants/[slug]/index'
import { WorkspaceOverview } from '@/components/workspaces/workspace-overview'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { renderScreen, restoreApi } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import {
  acme,
  envelope,
  membership,
  onboarding,
  serveWorkspace,
} from '@/tests/support/workspace-api'

const mockParams = { slug: 'acme' }
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))

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
  mockParams.slug = 'acme'
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

describe('WorkspaceOverview', () => {
  it('shows the name as the one header, then the role and the web address', async () => {
    serveWorkspace()
    await renderScreen(<WorkspaceOverview slug="acme" />)
    expect(await screen.findByRole('header', { name: 'Acme' })).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(screen.getByText('Owner')).toBeTruthy()
    expect(screen.getAllByText('/acme').length).toBeGreaterThan(0)
  })

  it('shows Details, with a dash for an empty field', async () => {
    serveWorkspace({
      'GET /tenants/acme': envelope(acme({ description: 'Anvils', website: null })),
    })
    await renderScreen(<WorkspaceOverview slug="acme" />)
    await screen.findByText('Details')
    for (const label of ['Name', 'Web address', 'Description', 'Website', 'Logo', 'Created']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText('Anvils')).toBeTruthy()
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('5 January 2026')).toBeTruthy()
  })

  it('shows the checklist under the header', async () => {
    serveWorkspace({ 'GET /tenants/acme/onboarding': envelope(onboarding()) })
    await renderScreen(<WorkspaceOverview slug="acme" />)
    expect(await screen.findByText('0 of 1 required')).toBeTruthy()
  })

  it('remembers the workspace', async () => {
    serveWorkspace()
    await renderScreen(<WorkspaceOverview slug="acme" />)
    await screen.findByText('Details')
    expect(useCurrentTenantStore.getState().recall('u1')).toBe('acme')
  })

  it('does not remember a workspace reached by platform access', async () => {
    serveWorkspace({ 'GET /tenants/acme': envelope(acme({ access: 'platform' })) })
    await renderScreen(<WorkspaceOverview slug="acme" />)
    await screen.findByText('Details')
    expect(useCurrentTenantStore.getState().recall('u1')).toBeNull()
  })

  it('opens another workspace in place from the switcher', async () => {
    serveWorkspace({
      'GET /tenants': envelope({
        items: [membership('acme', 'Acme'), membership('beta', 'Beta')],
        page: { hasNext: false, nextCursor: null },
      }),
    })
    await renderScreen(<WorkspaceOverview slug="acme" inPlace />)
    await screen.findByText('Details')
    await fireEvent.press(screen.getByRole('button', { name: 'Acme' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Beta, /beta' }))
    expect(useCurrentTenantStore.getState().recall('u1')).toBe('beta')
    expect(router.push).not.toHaveBeenCalled()
  })
})

describe('the tenants/[slug] route', () => {
  it('opens the route slug and remembers it', async () => {
    mockParams.slug = 'acme'
    serveWorkspace()
    await renderScreen(<Overview />)
    expect(await screen.findByRole('header', { name: 'Acme' })).toBeTruthy()
    await waitFor(() => {
      expect(useCurrentTenantStore.getState().recall('u1')).toBe('acme')
    })
  })
})

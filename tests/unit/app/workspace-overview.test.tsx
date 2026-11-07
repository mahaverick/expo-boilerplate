import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import Overview from '@/app/(app)/tenants/[slug]/index'
import { WorkspaceOverview } from '@/components/workspaces/workspace-overview'
import { formatDate } from '@/lib/format'
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
    // The reader's own locale formats the date, so the expected text comes from the same formatter.
    expect(screen.getByText(formatDate('2026-01-05T00:00:00.000Z', 'long') ?? '')).toBeTruthy()
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

describe('the entry rows', () => {
  it('always offers Insights and pushes its route', async () => {
    serveWorkspace()
    await renderScreen(<WorkspaceOverview slug="acme" />)
    await fireEvent.press(await screen.findByRole('link', { name: 'Insights' }))
    expect(router.push).toHaveBeenCalledWith('/tenants/acme/insights')
  })

  it('hides Beta while the flag is off or unread', async () => {
    serveWorkspace({
      'GET /tenants/acme/flags': envelope({ flags: { example_beta_page: false } }),
    })
    await renderScreen(<WorkspaceOverview slug="acme" />)
    await screen.findByRole('link', { name: 'Insights' })
    expect(screen.queryByRole('link', { name: 'Beta' })).toBeNull()
  })

  it('hides Beta when the flags read fails', async () => {
    const sent = serveWorkspace()
    await renderScreen(<WorkspaceOverview slug="acme" />)
    await screen.findByRole('link', { name: 'Insights' })
    await waitFor(() => {
      expect(sent.some((request) => request.url === '/tenants/acme/flags')).toBe(true)
    })
    expect(screen.queryByRole('link', { name: 'Beta' })).toBeNull()
  })

  it('shows Beta while the flag is on and pushes its route', async () => {
    serveWorkspace({
      'GET /tenants/acme/flags': envelope({ flags: { example_beta_page: true } }),
    })
    await renderScreen(<WorkspaceOverview slug="acme" />)
    await fireEvent.press(await screen.findByRole('link', { name: 'Beta' }))
    expect(router.push).toHaveBeenCalledWith('/tenants/acme/beta')
  })
})

describe('the platform-access banner', () => {
  it('shows who the person is and a way back for staff', async () => {
    serveWorkspace({ 'GET /tenants/acme': envelope(acme({ access: 'platform', role: 'admin' })) })
    await renderScreen(<WorkspaceOverview slug="acme" />)
    expect(await screen.findByText(/as platform staff \(Admin\)\./)).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
    await fireEvent.press(screen.getByRole('link', { name: 'Back to your workspaces' }))
    expect(router.push).toHaveBeenCalledWith('/tenants')
  })

  it('is absent for a member', async () => {
    serveWorkspace()
    await renderScreen(<WorkspaceOverview slug="acme" />)
    await screen.findByText('Details')
    expect(screen.queryByText(/platform staff/)).toBeNull()
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

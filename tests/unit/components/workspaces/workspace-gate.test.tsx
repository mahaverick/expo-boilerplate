import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import { Text } from 'react-native'
import { WorkspaceGate } from '@/components/workspaces/workspace-gate'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { renderScreen, restoreApi } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import {
  acme,
  envelope,
  membership,
  NOT_FOUND,
  serveWorkspace,
} from '@/tests/support/workspace-api'

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

/** A list page in express's envelope. */
const list = (...items: unknown[]) =>
  envelope({ items, page: { hasNext: false, nextCursor: null } })

/** The gate around a marker. */
const gate = () => (
  <WorkspaceGate slug="acme">{(tenant) => <Text>{`Open: ${tenant.name}`}</Text>}</WorkspaceGate>
)

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

describe('WorkspaceGate', () => {
  it('titles the screen with the workspace name and renders the children', async () => {
    serveWorkspace()
    await renderScreen(gate())
    expect(await screen.findByText('Open: Acme')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Acme' })).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
  })

  it('says the request failed, with Try again, and claims nothing about the workspace', async () => {
    const sent = serveWorkspace({ 'GET /tenants/acme': { status: 500, data: { success: false } } })
    await renderScreen(gate())
    expect(
      await screen.findByText(
        'We couldn’t load this workspace because the request failed. Select Try again.'
      )
    ).toBeTruthy()
    expect(screen.queryByText('Workspace not available')).toBeNull()
    const before = sent.length
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => {
      expect(sent.length).toBeGreaterThan(before)
    })
  })

  it('says not available when the list does not hold the workspace', async () => {
    serveWorkspace({
      'GET /tenants/acme': NOT_FOUND,
      'GET /tenants': list(membership('beta', 'Beta')),
    })
    await renderScreen(gate())
    expect(await screen.findByRole('header', { name: 'Workspace not available' })).toBeTruthy()
    expect(
      screen.getByText('We couldn’t open /acme. It doesn’t exist, or you aren’t a member.')
    ).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Back to your workspaces' }))
    expect(router.push).toHaveBeenCalledWith('/tenants')
  })

  it('says suspended when the list holds the workspace as suspended', async () => {
    serveWorkspace({
      'GET /tenants/acme': NOT_FOUND,
      'GET /tenants': list(membership('acme', 'Acme', 'suspended')),
    })
    await renderScreen(gate())
    expect(await screen.findByRole('header', { name: 'Workspace suspended' })).toBeTruthy()
    expect(screen.getByText('Acme is suspended, so its pages are closed.')).toBeTruthy()
    expect(screen.getByText('Contact support to restore access.')).toBeTruthy()
  })

  it('names the support address when the client settings have one', async () => {
    serveWorkspace({
      'GET /tenants/acme': NOT_FOUND,
      'GET /tenants': list(membership('acme', 'Acme', 'suspended')),
      'GET /status/client-settings': envelope({
        signInLinkTtlSeconds: 600,
        stepUpLinkTtlSeconds: 600,
        invitationTtlSeconds: 600,
        supportEmail: 'help@example.com',
      }),
    })
    await renderScreen(gate())
    expect(
      await screen.findByText('Contact support at help@example.com to restore access.')
    ).toBeTruthy()
  })

  it('claims neither when the list read failed', async () => {
    serveWorkspace({
      'GET /tenants/acme': NOT_FOUND,
      'GET /tenants': 'network-error',
    })
    await renderScreen(gate())
    expect(
      await screen.findByText(
        'We couldn’t load this workspace because the request failed. Select Try again.'
      )
    ).toBeTruthy()
    expect(screen.queryByText('Workspace not available')).toBeNull()
    expect(screen.queryByText('Workspace suspended')).toBeNull()
  })

  it('remembers a workspace the person works in', async () => {
    serveWorkspace()
    await renderScreen(gate())
    await screen.findByText('Open: Acme')
    expect(useCurrentTenantStore.getState().recall('u1')).toBe('acme')
  })

  it('does not remember a workspace reached by platform access', async () => {
    serveWorkspace({ 'GET /tenants/acme': envelope(acme({ access: 'platform' })) })
    await renderScreen(gate())
    await screen.findByText('Open: Acme')
    expect(useCurrentTenantStore.getState().recall('u1')).toBeNull()
  })

  it('does not remember the platform workspace', async () => {
    serveWorkspace({ 'GET /tenants/acme': envelope(acme({ isPlatform: true })) })
    await renderScreen(gate())
    await screen.findByText('Open: Acme')
    expect(useCurrentTenantStore.getState().recall('u1')).toBeNull()
  })
})

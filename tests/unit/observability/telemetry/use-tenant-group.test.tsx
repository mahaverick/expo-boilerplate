import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { useTenantGroup } from '@/observability/telemetry/use-tenant-group'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { restoreApi, screenTree, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import {
  acme,
  envelope,
  membership,
  NOT_FOUND,
  serveWorkspace,
} from '@/tests/support/workspace-api'
import type { User } from '@/types/api.types'

/** The arguments of each `setTenantGroup` call. */
const mockGroups: unknown[] = []

jest.mock('@/lib/storage', () => ({
  storage: { getString: () => undefined, set: () => undefined, remove: () => undefined },
}))

jest.mock('@/observability/telemetry/telemetry', () => ({
  // The API client reads the session id on every request.
  getAnalyticsSessionIdFor: () => null,
  setTenantGroup: (tenant: unknown) => mockGroups.push(tenant),
}))

let client: QueryClient

/** Renders the hook inside a real query client. */
function renderGroup() {
  return renderHook(
    () => {
      useTenantGroup()
    },
    { wrapper: ({ children }: { children: ReactNode }) => screenTree(<>{children}</>, client) }
  )
}

/** The list answer for these memberships. */
function list(...items: unknown[]) {
  return envelope({ items, page: { hasNext: false, nextCursor: null } })
}

beforeEach(() => {
  mockGroups.length = 0
  useCurrentTenantStore.setState({ remembered: {} })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.getState().login('tok', { id: 'u1' } as User)
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
})

describe('useTenantGroup', () => {
  it('sends no request while restoring or signed out', async () => {
    useAuthStore.getState().logout()
    const sent = serve(() => ({ status: 401, data: { success: false } }))
    await renderGroup()
    // The query would have started on mount; let its request reach the adapter.
    await act(async () => {
      for (let tick = 0; tick < 20; tick += 1) await Promise.resolve()
    })
    expect(client.isFetching()).toBe(0)
    expect(sent).toHaveLength(0)
    expect(mockGroups.every((group) => group === null)).toBe(true)
  })

  it('groups the current workspace by id, with the access the API reports', async () => {
    serveWorkspace()
    await renderGroup()
    await waitFor(() => expect(mockGroups).toContainEqual({ id: 't-acme', access: 'member' }))
    expect(mockGroups.at(-1)).toEqual({ id: 't-acme', access: 'member' })
  })

  it('carries platform access for staff', async () => {
    serveWorkspace({ 'GET /tenants/acme': envelope(acme({ access: 'platform' })) })
    await renderGroup()
    await waitFor(() => expect(mockGroups).toContainEqual({ id: 't-acme', access: 'platform' }))
  })

  it('clears the group when no workspace resolves', async () => {
    serveWorkspace({ 'GET /tenants': list() })
    await renderGroup()
    await waitFor(() => expect(mockGroups).toContain(null))
    expect(mockGroups.every((group) => group === null)).toBe(true)
  })

  it('clears the group when the workspace is not found', async () => {
    serveWorkspace({ 'GET /tenants/acme': NOT_FOUND })
    await renderGroup()
    await waitFor(() => expect(mockGroups.at(-1)).toBeNull())
    expect(mockGroups.every((group) => group === null)).toBe(true)
  })

  it('never groups the platform workspace for a member', async () => {
    serveWorkspace({
      'GET /tenants': list(membership('platform', 'Platform')),
      'GET /tenants/platform': envelope(
        acme({ id: 't-platform', slug: 'platform', isPlatform: true, access: 'member' })
      ),
    })
    await renderGroup()
    await waitFor(() => expect(mockGroups.length).toBeGreaterThan(0))
    expect(JSON.stringify(mockGroups)).not.toContain('t-platform')
  })
})

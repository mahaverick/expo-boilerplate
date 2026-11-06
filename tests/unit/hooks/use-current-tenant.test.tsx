import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { restoreApi, screenTree, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

/** What the mocked MMKV instance holds. */
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

/**
 * A `GET /tenants` row.
 * @param slug - The workspace's web address.
 * @param extra - Fields to override on the row or its tenant.
 * @returns The row.
 */
function row(slug: string, extra: { isPlatform?: boolean; lifecycleState?: string } = {}) {
  return {
    tenant: {
      id: `id-${slug}`,
      name: slug,
      slug,
      lifecycleState: extra.lifecycleState ?? 'active',
      isPlatform: extra.isPlatform ?? false,
    },
    role: 'owner',
    joinedAt: '2026-01-01',
    isPlatform: extra.isPlatform ?? false,
  }
}

/**
 * Answers `GET /tenants` with these rows.
 * @param items - The rows.
 */
function serveTenants(items: unknown[]) {
  serve(() => ({
    status: 200,
    data: { success: true, data: { items, page: { hasNext: false, nextCursor: null } } },
  }))
}

/**
 * Signs a user in.
 * @param id - The user's id.
 */
function signIn(id: string) {
  useAuthStore.getState().login('tok', { id } as User)
}

let client: QueryClient

/**
 * Renders the hook inside a real query client.
 * @param requested - The requested web address.
 * @returns The render result.
 */
function renderCurrent(requested?: string) {
  return renderHook(() => useCurrentTenant(requested), {
    wrapper: ({ children }: { children: ReactNode }) => screenTree(<>{children}</>, client),
  })
}

beforeEach(() => {
  mockStorage.clear()
  useCurrentTenantStore.setState({ remembered: {} })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
})

describe('useCurrentTenant', () => {
  it('resolves the requested workspace when eligible', async () => {
    signIn('u1')
    serveTenants([row('a'), row('b')])
    const { result } = await renderCurrent('b')
    expect(result.current.status).toBe('pending')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.slug).toBe('b')
  })

  it.each([
    ['suspended', row('s', { lifecycleState: 'suspended' })],
    ['platform', row('p', { isPlatform: true })],
    ['missing', row('gone')],
  ])('falls back past an ineligible remembered workspace: %s', async (_name, bad) => {
    signIn('u1')
    mockStorage.set('last-tenant:u1', bad.tenant.slug)
    serveTenants(_name === 'missing' ? [row('a'), row('b')] : [bad, row('a'), row('b')])
    const { result } = await renderCurrent()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.slug).toBe('a')
  })

  it('uses the remembered workspace when eligible', async () => {
    signIn('u1')
    mockStorage.set('last-tenant:u1', 'b')
    serveTenants([row('a'), row('b')])
    const { result } = await renderCurrent()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.slug).toBe('b')
  })

  it('is none only when the list read succeeded and holds no eligible workspace', async () => {
    signIn('u1')
    serveTenants([row('p', { isPlatform: true }), row('s', { lifecycleState: 'suspended' })])
    const { result } = await renderCurrent()
    await waitFor(() => expect(result.current.status).toBe('none'))
    expect(result.current.slug).toBeNull()
  })

  it('is error, not none, when the list read fails, and retry reads again', async () => {
    signIn('u1')
    const sent = serve(() => ({ status: 500, data: { success: false } }))
    const { result } = await renderCurrent()
    await waitFor(() => expect(result.current.status).toBe('error'))
    serveTenants([row('a')])
    await act(() => {
      result.current.retry()
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(sent.length).toBe(1)
  })

  it('remembers the resolved workspace', async () => {
    signIn('u1')
    serveTenants([row('a'), row('b')])
    const { result } = await renderCurrent('b')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await waitFor(() => expect(mockStorage.get('last-tenant:u1')).toBe('b'))
  })

  it('does not hand one user’s workspace to another user', async () => {
    signIn('u1')
    serveTenants([row('a'), row('b')])
    const first = await renderCurrent('b')
    await waitFor(() => expect(mockStorage.get('last-tenant:u1')).toBe('b'))
    await first.unmount()
    useAuthStore.getState().logout()
    client.clear()
    expect(mockStorage.get('last-tenant:u1')).toBe('b')
    signIn('u2')
    const second = await renderCurrent()
    await waitFor(() => expect(second.result.current.status).toBe('ready'))
    expect(second.result.current.slug).toBe('a')
  })

  it('is none without a signed-in user, and reads no storage', async () => {
    serveTenants([row('a')])
    const { result } = await renderCurrent()
    expect(result.current.status).toBe('none')
    expect(mockStorage.size).toBe(0)
  })
})

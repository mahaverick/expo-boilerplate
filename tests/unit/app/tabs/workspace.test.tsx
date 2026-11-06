import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router, type Href } from 'expo-router'
import Workspace from '@/app/(app)/(tabs)/workspace'
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

describe('Workspace tab', () => {
  it('replaces to the resolved workspace', async () => {
    serve(() =>
      page([
        {
          tenant: { id: 'acme', name: 'Acme', slug: 'acme', lifecycleState: 'active' },
          role: 'owner',
          joinedAt: '2026-01-01',
          isPlatform: false,
        },
      ])
    )
    await renderScreen(<Workspace />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/tenants/acme' as Href)
    })
  })

  it('replaces to /welcome when the person has no workspace', async () => {
    serve(() => page([]))
    await renderScreen(<Workspace />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/welcome')
    })
  })

  it('shows the error with Try again on a failed list, and goes nowhere', async () => {
    const sent = serve(() => 'network-error')
    await renderScreen(<Workspace />)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    const before = sent.length
    await fireEvent.press(retry)
    await waitFor(() => {
      expect(sent.length).toBeGreaterThan(before)
    })
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('shows a spinner while the list loads', async () => {
    serve(() => new Promise(() => {}))
    await renderScreen(<Workspace />)
    expect(screen.getByLabelText('Loading your workspaces')).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
  })
})

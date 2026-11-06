import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import Workspace from '@/app/(app)/(tabs)/workspace'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { membership, serveWorkspace } from '@/tests/support/workspace-api'

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
  it('shows the resolved workspace in place, with no navigation', async () => {
    serveWorkspace()
    await renderScreen(<Workspace />)
    expect(await screen.findByRole('header', { name: 'Acme' })).toBeTruthy()
    expect(await screen.findByText('Details')).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('switches workspace in place when the person chooses one', async () => {
    serveWorkspace({
      'GET /tenants': page([membership('acme', 'Acme'), membership('beta', 'Beta')]),
      'GET /tenants/beta': {
        status: 200,
        data: {
          success: true,
          data: {
            id: 't-beta',
            name: 'Beta',
            slug: 'beta',
            description: null,
            logo: null,
            website: null,
            lifecycleState: 'active',
            createdAt: '2026-01-05T00:00:00.000Z',
            isPlatform: false,
            role: 'owner',
            access: 'member',
          },
        },
      },
    })
    await renderScreen(<Workspace />)
    await screen.findByRole('header', { name: 'Acme' })
    await fireEvent.press(screen.getByRole('button', { name: 'Acme' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Beta, /beta' }))
    expect(await screen.findByRole('header', { name: 'Beta' })).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('pushes /welcome over the tabs when the person has no workspace', async () => {
    serve(() => page([]))
    await renderScreen(<Workspace />)
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/welcome')
    })
  })

  it('goes nowhere while no one is signed in, as after a forced sign-out in full maintenance', async () => {
    useAuthStore.getState().logout()
    serve(() => page([]))
    await renderScreen(<Workspace />)
    await waitFor(() => {
      expect(screen.getByLabelText('Loading your workspaces')).toBeTruthy()
    })
    expect(router.push).not.toHaveBeenCalled()
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
    expect(router.push).not.toHaveBeenCalled()
  })

  it('shows a spinner while the list loads', async () => {
    serve(() => new Promise(() => {}))
    await renderScreen(<Workspace />)
    expect(screen.getByLabelText('Loading your workspaces')).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
  })
})

import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import Welcome from '@/app/(app)/welcome'
import { useAuthStore } from '@/states/auth.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }))
const mockSignOut = jest.fn(() => Promise.resolve())
jest.mock('@/hooks/use-sign-out', () => ({
  useSignOut: () => ({ signOut: mockSignOut, isPending: false }),
}))

/** A tenants page in express's envelope. */
const page = (items: unknown[]) => ({
  status: 200,
  data: { success: true, data: { items, page: { hasNext: false, nextCursor: null } } },
})

/** A membership row. */
const row = (overrides: { lifecycleState?: string; isPlatform?: boolean } = {}) => ({
  tenant: {
    id: 't1',
    name: 'Acme',
    slug: 'acme',
    lifecycleState: overrides.lifecycleState ?? 'active',
  },
  role: 'owner',
  joinedAt: '2026-01-01',
  isPlatform: overrides.isPlatform ?? false,
})

beforeEach(() => {
  useToastQueueStore.setState({ toasts: [] } as never)
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

describe('Welcome', () => {
  it('shows the form, the email and the two ways out for a new account', async () => {
    serve(() => page([]))
    await renderScreen(<Welcome />)
    expect(
      await screen.findByText('Name your workspace. You can invite your team next.')
    ).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Create your workspace' })).toBeTruthy()
    expect(screen.getByText('You’re signed in as ada@example.com.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Go to Home' }))
    expect(router.replace).toHaveBeenCalledWith('/')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('a person who already has a workspace goes Home', async () => {
    serve(() => page([row()]))
    await renderScreen(<Welcome />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/')
    })
    expect(screen.queryByRole('button', { name: 'Create workspace' })).toBeNull()
  })

  it('does not count a suspended or platform workspace', async () => {
    serve(() => page([row({ lifecycleState: 'suspended' }), row({ isPlatform: true })]))
    await renderScreen(<Welcome />)
    expect(await screen.findByRole('button', { name: 'Create workspace' })).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('a failed first read counts as no workspaces', async () => {
    serve(() => ({ status: 500, data: { success: false, message: 'Boom.' } }))
    await renderScreen(<Welcome />)
    expect(await screen.findByRole('button', { name: 'Create workspace' })).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('toasts then replaces to the new workspace, and the refetched list does not bounce', async () => {
    let created = false
    serve((config) => {
      if (config.method === 'post') {
        created = true
        return {
          status: 201,
          data: { success: true, data: { id: 't1', name: 'Acme', slug: 'acme' } },
        }
      }
      return page(created ? [row()] : [])
    })
    await renderScreen(<Welcome />)
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Acme')
    await fireEvent.changeText(screen.getByLabelText('Web address'), 'acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/tenants/acme')
    })
    expect(useToastQueueStore.getState().toasts.map((toast) => toast.title)).toContain(
      'Acme created.'
    )
    expect(router.replace).not.toHaveBeenCalledWith('/')
  })
})

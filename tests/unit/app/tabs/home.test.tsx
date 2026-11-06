import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import Home from '@/app/(app)/(tabs)/index'
import { useAuthStore } from '@/states/auth.store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }))

/** A tenants page in express's envelope. */
const page = (items: unknown[]) => ({
  status: 200,
  data: { success: true, data: { items, page: { hasNext: false, nextCursor: null } } },
})

/**
 * Signs in a user.
 * @param firstName - Their first name, if any.
 */
function signIn(firstName: string | null): void {
  useAuthStore.getState().login('a', {
    id: 'u1',
    email: 'ada@example.com',
    firstName,
    lastName: null,
    createdAt: '2026-01-01',
    platformRole: null,
    analyticsOptOut: false,
  })
}

beforeEach(() => {
  signIn('Ada')
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  jest.clearAllMocks()
})

describe('Home', () => {
  it('greets by first name as its one header', async () => {
    serve(() => page([{ tenant: { id: 't1' }, role: 'owner' }]))
    await renderScreen(<Home />)
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(screen.getByRole('header', { name: 'Welcome back, Ada' })).toBeTruthy()
    expect(
      await screen.findByText('This screen is intentionally empty. Derived projects fill it.')
    ).toBeTruthy()
    expect(screen.queryByText('You don’t belong to a workspace yet.')).toBeNull()
  })

  it('greets by email without a first name', async () => {
    useAuthStore.getState().logout()
    signIn(null)
    serve(() => page([{ tenant: { id: 't1' }, role: 'owner' }]))
    await renderScreen(<Home />)
    expect(screen.getByRole('header', { name: 'Welcome back, ada@example.com' })).toBeTruthy()
  })

  it('offers to create a workspace only for an empty list', async () => {
    serve(() => page([]))
    await renderScreen(<Home />)
    expect(await screen.findByText('You don’t belong to a workspace yet.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Create your workspace' }))
    expect(router.push).toHaveBeenCalledWith('/welcome')
    expect(
      screen.queryByText('This screen is intentionally empty. Derived projects fill it.')
    ).toBeNull()
  })

  it('counts only eligible workspaces: an all-suspended list shows the empty state', async () => {
    serve(() =>
      page([
        { tenant: { id: 't1', lifecycleState: 'suspended' }, role: 'owner', isPlatform: false },
        { tenant: { id: 't2' }, role: 'owner', isPlatform: true },
      ])
    )
    await renderScreen(<Home />)
    expect(await screen.findByText('You don’t belong to a workspace yet.')).toBeTruthy()
  })

  it('shows a spinner, not the empty state, while the list loads', async () => {
    serve(() => new Promise(() => {}))
    await renderScreen(<Home />)
    expect(screen.getByLabelText('Loading your workspaces')).toBeTruthy()
    expect(screen.queryByText('You don’t belong to a workspace yet.')).toBeNull()
  })

  it('shows the error with Try again after a failure, never the empty state', async () => {
    serve(() => 'network-error')
    await renderScreen(<Home />)
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('You don’t belong to a workspace yet.')).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('has no Sign out: Settings holds it', async () => {
    serve(() => page([]))
    await renderScreen(<Home />)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
    })
  })
})

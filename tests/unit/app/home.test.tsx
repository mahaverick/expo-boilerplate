import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import Home from '@/app/(app)/index'
import { refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

/** A tenants page in express's envelope. */
const page = (items: unknown[]) => ({
  status: 200,
  data: { success: true, data: { items, page: { hasNext: false, nextCursor: null } } },
})

beforeEach(() => {
  resetSecureStore()
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

describe('Home', () => {
  it('shows Home as its one header, and who is signed in', async () => {
    serve(() => page([]))
    await renderScreen(<Home />)
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(screen.getByRole('header', { name: 'Home' })).toBeTruthy()
    expect(screen.getByText('Signed in as ada@example.com')).toBeTruthy()
  })

  it('says there are no workspaces once the list resolves empty', async () => {
    serve(() => page([]))
    await renderScreen(<Home />)
    expect(await screen.findByText('You have no workspaces yet.')).toBeTruthy()
  })

  it('says nothing about workspaces when there are some', async () => {
    serve(() => page([{ tenant: { id: 't1' }, role: 'owner' }]))
    await renderScreen(<Home />)
    await waitFor(() => {
      expect(screen.queryByText('You have no workspaces yet.')).toBeNull()
    })
    expect(screen.queryByText('You have no workspaces yet.')).toBeNull()
  })

  it('says nothing about workspaces when the list fails to load', async () => {
    serve(() => 'network-error')
    await renderScreen(<Home />)
    expect(screen.queryByText('You have no workspaces yet.')).toBeNull()
  })

  it('Sign out signs the device out and goes to /login', async () => {
    serve(() => page([]))
    await refreshTokenStore.write('tok')
    await renderScreen(<Home />)
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/login')
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import Beta from '@/app/(app)/tenants/[slug]/beta'
import { tenantFlagsKey, useTenantFlags } from '@/queries/flags.queries'
import { useAuthStore } from '@/states/auth.store'
import { renderScreen, restoreApi } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { envelope, NOT_FOUND, serveWorkspace } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'acme' }),
}))

beforeEach(() => {
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

/**
 * Stands for the overview beneath Beta in the stack, which observes the flags.
 * @returns The flag as text.
 */
function FlagsObserver() {
  return <Text>{`beta flag: ${String(useTenantFlags('acme').example_beta_page)}`}</Text>
}

describe('Beta', () => {
  it('confirms the beta features for the workspace', async () => {
    serveWorkspace({
      'GET /tenants/acme/beta': envelope({ slug: 'acme', enabledAt: '2026-11-07T00:00:00.000Z' }),
    })
    await renderScreen(<Beta />)
    expect(await screen.findByText('Beta features are on for /acme.')).toBeTruthy()
    expect(screen.getByText('Features this workspace sees before everyone else.')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Beta' })).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
  })

  it('shows Page not found and refetches the flags when the API answers 404', async () => {
    const sent = serveWorkspace({
      'GET /tenants/acme/beta': NOT_FOUND,
      'GET /tenants/acme/flags': envelope({ flags: { example_beta_page: false } }),
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(tenantFlagsKey('acme'), { example_beta_page: true })
    await renderScreen(
      <>
        <FlagsObserver />
        <Beta />
      </>,
      client
    )
    expect(await screen.findByRole('header', { name: 'Page not found' })).toBeTruthy()
    await waitFor(() => {
      expect(sent.filter((request) => request.url === '/tenants/acme/flags')).toHaveLength(1)
    })
    await waitFor(() => {
      expect(client.getQueryData(tenantFlagsKey('acme'))).toMatchObject({
        example_beta_page: false,
      })
    })
  })

  it('shows Try again, not Page not found, for another failure', async () => {
    serveWorkspace({
      'GET /tenants/acme/beta': { status: 500, data: { success: false, message: 'x' } },
    })
    await renderScreen(<Beta />)
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('Page not found')).toBeNull()
  })
})

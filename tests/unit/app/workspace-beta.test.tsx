import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import Beta from '@/app/(app)/tenants/[slug]/beta'
import { useFlagValues } from '@/observability/flags/flag-hooks'
import { flagsKey } from '@/observability/flags/flag-query'
import { useAuthStore } from '@/states/auth.store'
import { renderScreen, restoreApi } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { acme, envelope, NOT_FOUND, serveWorkspace } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'acme' }),
  useGlobalSearchParams: () => ({ slug: 'acme' }),
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
  return <Text>{`beta flag: ${String(useFlagValues().example_beta_page)}`}</Text>
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
    client.setQueryData(flagsKey({ kind: 'tenant', slug: 'acme' }), { example_beta_page: true })
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
      expect(client.getQueryData(flagsKey({ kind: 'tenant', slug: 'acme' }))).toMatchObject({
        example_beta_page: false,
      })
    })
  })

  it('shows the not-available panel, not Page not found, when the workspace answers 404', async () => {
    const sent = serveWorkspace({
      'GET /tenants/acme': NOT_FOUND,
      'GET /tenants/acme/beta': NOT_FOUND,
    })
    await renderScreen(<Beta />)
    expect(await screen.findByRole('header', { name: 'Workspace not available' })).toBeTruthy()
    expect(
      screen.getByText('We couldn’t open /acme. It doesn’t exist, or you aren’t a member.')
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to your workspaces' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(screen.queryByText('Page not found')).toBeNull()
    expect(sent.some((config) => config.url === '/tenants/acme/beta')).toBe(false)
    expect(sent.some((config) => config.url === '/tenants/acme/flags')).toBe(false)
  })

  it('shows the workspace load error when the workspace read fails', async () => {
    serveWorkspace({
      'GET /tenants/acme': { status: 500, data: { success: false, message: 'x' } },
    })
    await renderScreen(<Beta />)
    expect(
      await screen.findByText(
        'We couldn’t load this workspace because the request failed. Select Try again.'
      )
    ).toBeTruthy()
  })

  it('shows Try again, not Page not found, for another failure', async () => {
    serveWorkspace({
      'GET /tenants/acme/beta': { status: 500, data: { success: false, message: 'x' } },
    })
    await renderScreen(<Beta />)
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('Page not found')).toBeNull()
  })

  it('tells staff with platform access whose workspace this is, also on Page not found', async () => {
    serveWorkspace({
      'GET /tenants/acme': envelope(acme({ access: 'platform' })),
      'GET /tenants/acme/beta': envelope({ slug: 'acme', enabledAt: '2026-11-07T00:00:00.000Z' }),
    })
    await renderScreen(<Beta />)
    expect(await screen.findByText(/as platform staff \(Owner\)\./)).toBeTruthy()
    restoreApi()
    serveWorkspace({
      'GET /tenants/acme': envelope(acme({ access: 'platform' })),
      'GET /tenants/acme/beta': NOT_FOUND,
    })
    await renderScreen(<Beta />)
    expect(await screen.findByRole('header', { name: 'Page not found' })).toBeTruthy()
    expect(await screen.findAllByText(/as platform staff \(Owner\)\./)).toHaveLength(1)
  })
})

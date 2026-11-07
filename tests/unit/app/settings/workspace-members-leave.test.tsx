import { jest } from '@jest/globals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router, Stack } from 'expo-router'
import { Alert } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Members from '@/app/(app)/settings/workspace/[slug]/members'
import TenantOverview from '@/app/(app)/tenants/[slug]'
import Workspaces from '@/app/(app)/tenants/index'
import { StepUpProvider } from '@/components/step-up/step-up-provider'
import { clientSettingsKeys } from '@/queries/client-settings.queries'
import { useAuthStore } from '@/states/auth.store'
import { METRICS } from '@/tests/support/a11y'
import { restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { tokenWith } from '@/tests/support/step-up'
import { acme, envelope, membership, NOT_FOUND, onboarding } from '@/tests/support/workspace-api'

jest.mock('@/lib/storage', () => ({
  storage: { getString: () => undefined, set: () => undefined, remove: () => undefined },
}))

/** What `renderRouter` returns that these tests read. */
interface RouterResult {
  getPathname: () => string
  getRouterState: () => unknown
}

/** A route state as expo-router reports it: a name and, for a navigator, its routes. */
interface RouteNode {
  name: string
  state?: { routes: RouteNode[] }
}

/**
 * The route names of the root stack, bottom first.
 * @param root - The router state.
 * @returns The names.
 */
function appStack(root: { routes: RouteNode[] } | undefined): string[] {
  const rootRoute = root?.routes.find((route) => route.name === '__root')
  return rootRoute?.state?.routes.map((route) => route.name) ?? []
}

/**
 * Expo Router's test renderer, loaded untyped: its type declarations augment
 * the `expect` module and hide the Testing Library matchers from `tsc`.
 */
const { renderRouter } = jest.requireActual<{
  renderRouter: (
    routes: Record<string, unknown>,
    options: { initialUrl: string }
  ) => Promise<RouterResult>
}>('expo-router/testing-library')

const ME = {
  membership: {
    id: 'm-u1',
    userId: 'u1',
    tenantId: 't-acme',
    role: 'owner',
    createdAt: 'x',
    updatedAt: 'x',
  },
  user: { id: 'u1', email: 'u1@example.com', firstName: 'Ada', lastName: 'Lovelace' },
}
const OTHER = {
  membership: {
    id: 'm-u9',
    userId: 'u9',
    tenantId: 't-acme',
    role: 'owner',
    createdAt: 'x',
    updatedAt: 'x',
  },
  user: { id: 'u9', email: 'u9@example.com', firstName: 'Bo', lastName: 'Ng' },
}

/**
 * A list page.
 * @param items - The rows.
 * @returns The page.
 */
function page(items: unknown[]) {
  return {
    items,
    page: { hasNext: false, nextCursor: null, prevCursor: null, hasPrev: false, limit: 20 },
  }
}

beforeEach(() => {
  useAuthStore.getState().login(tokenWith(1_000), {
    id: 'u1',
    email: 'u1@example.com',
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
  jest.restoreAllMocks()
})

describe('leaving from the overview', () => {
  it('sends no GET to the left workspace after a leave from the overview', async () => {
    let left = false
    const sent = serve((config) => {
      const method = (config.method ?? 'get').toUpperCase()
      const url = config.url ?? ''
      if (method === 'DELETE' && url === '/tenants/acme/membership') {
        left = true
        return envelope(null)
      }
      if (url.startsWith('/tenants/acme')) {
        if (left) return NOT_FOUND
        if (url === '/tenants/acme') return envelope(acme())
        if (url === '/tenants/acme/members') return envelope(page([ME, OTHER]))
        if (url === '/tenants/acme/onboarding') return envelope(onboarding())
        if (url === '/tenants/acme/invitations') return envelope(page([]))
        return NOT_FOUND
      }
      if (url === '/tenants') return envelope(page(left ? [] : [membership('acme', 'Acme')]))
      return NOT_FOUND
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(clientSettingsKeys.all, null)
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const result = await renderRouter(
      {
        _layout: () => (
          <SafeAreaProvider initialMetrics={METRICS}>
            <QueryClientProvider client={client}>
              <StepUpProvider>
                <Stack />
              </StepUpProvider>
            </QueryClientProvider>
          </SafeAreaProvider>
        ),
        index: () => null,
        'tenants/index': Workspaces,
        'tenants/[slug]/index': TenantOverview,
        'settings/workspace/[slug]/members': Members,
      },
      { initialUrl: '/' }
    )
    await act(() => {
      router.push('/tenants/acme')
    })
    await screen.findByText('Getting started', {}, { timeout: 4000 })
    await act(() => {
      router.push('/settings/workspace/acme/members')
    })
    await fireEvent.press(await screen.findByRole('button', { name: 'Leave' }))
    const buttons = alert.mock.calls.at(-1)?.[2] ?? []
    await act(async () => {
      await Promise.resolve(buttons.find((button) => button.text === 'Leave')?.onPress?.())
    })
    await act(async () => {
      jest.advanceTimersByTime(500)
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.getPathname()).toBe('/tenants')
    })
    await act(async () => {
      jest.advanceTimersByTime(200)
      await Promise.resolve()
    })
    const leftAt = sent.findIndex((config) => config.url === '/tenants/acme/membership')
    const after = sent
      .slice(leftAt + 1)
      .filter((config) => config.method === 'get' && config.url?.startsWith('/tenants/acme'))
    expect(after.map((config) => config.url)).toEqual([])
    expect(appStack(result.getRouterState() as never)).toEqual(['index', 'tenants/index'])
    expect(client.getQueryCache().findAll({ queryKey: ['tenants', 'acme'] })).toHaveLength(0)
  })
})

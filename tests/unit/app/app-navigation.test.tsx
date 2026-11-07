import { jest } from '@jest/globals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router, Stack, Tabs } from 'expo-router'
import { Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import TabsLayout from '@/app/(app)/(tabs)/_layout'
import * as appLayout from '@/app/(app)/_layout'
import TenantSubpath from '@/app/(app)/tenants/[slug]/[...rest]'
import Welcome from '@/app/(app)/welcome'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { useTabBarStore } from '@/states/tab-bar.store'
import { METRICS } from '@/tests/support/a11y'
import { restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

// The stream opens a real connection; its own suite covers it.
jest.mock('@/components/notifications/notification-stream', () => ({
  NotificationStream: () => null,
}))
jest.mock('@/lib/storage', () => ({
  storage: { getString: () => undefined, set: () => undefined, remove: () => undefined },
}))

/** What `renderRouter` returns that these tests read. */
interface RouterResult {
  getPathname: () => string
  getRouterState: () => unknown
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

/** A route state as expo-router reports it: a name and, for a navigator, its routes. */
interface RouteNode {
  name: string
  state?: { routes: RouteNode[] }
}

/**
 * The route names of the `(app)` stack, bottom first.
 * @param root - The router state.
 * @returns The names, or an empty list when `(app)` is not mounted.
 */
function appStack(root: { routes: RouteNode[] } | undefined): string[] {
  const rootRoute = root?.routes.find((route) => route.name === '__root')
  const app = rootRoute?.state?.routes.find((route) => route.name === '(app)')
  return app?.state?.routes.map((route) => route.name) ?? []
}

/**
 * A stub leaf screen that shows its name.
 * @param name - The text it shows.
 * @returns The screen component.
 */
function stub(name: string) {
  return () => <Text>{name}</Text>
}

/** The app's routes, with the real `(app)` stack settings and stub leaf screens. */
function routes(overrides: Record<string, unknown> = {}) {
  return {
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    '(app)/_layout': { default: () => <Stack />, unstable_settings: appLayout.unstable_settings },
    '(app)/(tabs)/_layout': () => <Tabs />,
    '(app)/(tabs)/index': stub('home'),
    '(app)/(tabs)/workspace': stub('workspace tab'),
    '(app)/welcome': stub('welcome'),
    '(app)/tenants/index': stub('workspaces'),
    '(app)/tenants/[slug]/index': stub('overview'),
    login: stub('login'),
    ...overrides,
  }
}

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
})

describe('the (app) stack', () => {
  it('puts the tabs beneath a cold /tenants/{slug} link, so Back reaches them', async () => {
    const result = await renderRouter(routes(), { initialUrl: '/tenants/acme' })
    expect(screen.getByText('overview')).toBeTruthy()
    expect(appStack(result.getRouterState() as never)).toEqual(['(tabs)', 'tenants/[slug]/index'])
    await act(() => {
      router.back()
    })
    expect(result.getPathname()).toBe('/')
  })

  it('keeps the tabs beneath a sign-in that lands on a safe redirect', async () => {
    const result = await renderRouter(routes({ 'auth/link': stub('link') }), {
      initialUrl: '/auth/link',
    })
    // What the link screen does with a safe redirect once the verify succeeds.
    await act(() => {
      router.replace('/tenants/acme', { withAnchor: true })
    })
    expect(result.getPathname()).toBe('/tenants/acme')
    expect(appStack(result.getRouterState() as never)).toEqual(['(tabs)', 'tenants/[slug]/index'])
  })

  it('sends a deeper /tenants/{slug} path to the overview, never Page not found', async () => {
    const result = await renderRouter(routes({ '(app)/tenants/[slug]/[...rest]': TenantSubpath }), {
      initialUrl: '/tenants/acme/members/42',
    })
    await waitFor(() => {
      expect(result.getPathname()).toBe('/tenants/acme')
    })
    expect(screen.getByText('overview')).toBeTruthy()
    expect(appStack(result.getRouterState() as never)).toEqual(['(tabs)', 'tenants/[slug]/index'])
  })

  it('publishes the tab bar height while a tab shows, and clears it under a stack screen', async () => {
    useTabBarStore.setState({ height: 0, owner: null })
    const result = await renderRouter(
      routes({
        '(app)/(tabs)/_layout': () => (
          <QueryClientProvider client={new QueryClient()}>
            <TabsLayout />
          </QueryClientProvider>
        ),
        '(app)/(tabs)/notifications': stub('notifications'),
        '(app)/(tabs)/settings': stub('settings'),
      }),
      { initialUrl: '/' }
    )
    expect(screen.getByText('home')).toBeTruthy()
    await waitFor(() => {
      expect(useTabBarStore.getState().height).toBeGreaterThan(0)
    })
    await act(() => {
      router.push('/tenants/acme')
    })
    expect(result.getPathname()).toBe('/tenants/acme')
    await waitFor(() => {
      expect(useTabBarStore.getState().height).toBe(0)
    })
    await act(() => {
      router.back()
    })
    await waitFor(() => {
      expect(useTabBarStore.getState().height).toBeGreaterThan(0)
    })
  })

  it('puts the tabs beneath /welcome', async () => {
    const result = await renderRouter(routes(), { initialUrl: '/welcome' })
    expect(appStack(result.getRouterState() as never)).toEqual(['(tabs)', 'welcome'])
  })
})

describe('Welcome, in the router', () => {
  beforeEach(() => {
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

  it('lands a new workspace on the Workspace tab, with the tab bar', async () => {
    let created = false
    serve((config) => {
      if (config.method === 'post') {
        created = true
        return {
          status: 201,
          data: { success: true, data: { id: 't1', name: 'Acme', slug: 'acme' } },
        }
      }
      const items = created
        ? [
            {
              tenant: { id: 't1', name: 'Acme', slug: 'acme', lifecycleState: 'active' },
              role: 'owner',
              joinedAt: '2026-01-01',
              isPlatform: false,
            },
          ]
        : []
      return {
        status: 200,
        data: { success: true, data: { items, page: { hasNext: false, nextCursor: null } } },
      }
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const result = await renderRouter(
      routes({
        _layout: () => (
          <SafeAreaProvider initialMetrics={METRICS}>
            <QueryClientProvider client={client}>
              <Stack screenOptions={{ headerShown: false }} />
            </QueryClientProvider>
          </SafeAreaProvider>
        ),
        '(app)/welcome': Welcome,
      }),
      { initialUrl: '/welcome' }
    )
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Acme')
    await fireEvent.changeText(screen.getByLabelText('Web address'), 'acme')
    await fireEvent.press(screen.getByRole('button', { name: 'Create workspace' }))
    await waitFor(() => {
      expect(result.getPathname()).toBe('/workspace')
    })
    expect(appStack(result.getRouterState() as never)).toEqual(['(tabs)'])
    expect(useCurrentTenantStore.getState().remembered).toEqual({ u1: 'acme' })
  })
})

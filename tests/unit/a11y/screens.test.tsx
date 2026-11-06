import { jest } from '@jest/globals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Href } from 'expo-router'
import { Pressable, Text, TextInput } from 'react-native'
import Home from '@/app/(app)/(tabs)/index'
import Notifications from '@/app/(app)/(tabs)/notifications'
import Settings from '@/app/(app)/(tabs)/settings'
import Workspace from '@/app/(app)/(tabs)/workspace'
import Overview from '@/app/(app)/tenants/[slug]/index'
import Tenants from '@/app/(app)/tenants/index'
import Welcome from '@/app/(app)/welcome'
import NotFound from '@/app/+not-found'
import Link from '@/app/auth/link'
import Login from '@/app/login'
import PasskeyRequired from '@/app/passkey-required'
import { SigningInScreen } from '@/components/auth/signing-in-screen'
import { SettingsRow } from '@/components/settings/settings-row'
import { MaintenanceScreen } from '@/components/shared/maintenance-screen'
import { UpdateScreen } from '@/components/shared/update-screen'
import { WorkspaceOverview } from '@/components/workspaces/workspace-overview'
import { billingKeys } from '@/queries/billing.queries'
import { clientSettingsKeys } from '@/queries/client-settings.queries'
import { tenantKeys, tenantsQueryOptions, type TenantWithRole } from '@/queries/tenant.queries'
import { A11Y_SCREENS, assertAccessible, renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'acme' }),
  Stack: { Screen: () => null },
}))
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

jest.mock('@/http/session-lifecycle', () => ({ useSessionStatus: () => 'signed-out' }))

/** The query client the screens below share. */
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})
// Home reads the list from the cache, so the harness makes no request.
client.setQueryData(tenantsQueryOptions().queryKey, [])

/** The screens this app ships, each inside the query client its hooks need. */
const SCREENS: Array<[string, () => React.JSX.Element]> = [
  ['Login', () => <Login />],
  ['Link (dead link)', () => <Link />],
  ['Home', () => <Home />],
  ['Workspace tab', () => <Workspace />],
  ['Notifications', () => <Notifications />],
  ['Settings', () => <Settings />],
  ['Welcome', () => <Welcome />],
  ['Workspaces', () => <Tenants />],
  ['Passkey required', () => <PasskeyRequired />],
  ['Not found', () => <NotFound />],
  ['Signing you in', () => <SigningInScreen />],
  ['Maintenance', () => <MaintenanceScreen message={null} since={null} />],
  ['Update the app', () => <UpdateScreen url="market://details?id=x" />],
]
for (const [name, screenElement] of SCREENS) {
  A11Y_SCREENS.push({
    name,
    element: <QueryClientProvider client={client}>{screenElement()}</QueryClientProvider>,
  })
}

/**
 * A query client that already holds a workspace's reads, so the screen makes
 * no request.
 * @param detail - The `GET /tenants/acme` answer: a workspace, or `null` for a 404.
 * @param list - The caller's memberships.
 * @returns The seeded client.
 */
function seeded(detail: unknown, list: TenantWithRole[]): QueryClient {
  const seed = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  seed.setQueryData(tenantKeys.detail('acme'), detail)
  seed.setQueryData(tenantsQueryOptions().queryKey, list)
  seed.setQueryData(billingKeys.billing('acme'), null)
  seed.setQueryData(clientSettingsKeys.all, null)
  seed.setQueryData(tenantKeys.onboarding('acme'), {
    state: 'in_progress',
    steps: [
      {
        key: 'profile',
        title: 'Add a profile',
        description: 'Say who you are.',
        scope: 'tenant',
        kind: 'manual',
        required: true,
        completedAt: null,
        source: null,
      },
    ],
    requiredDone: 0,
    requiredTotal: 1,
    completedAt: null,
    dismissedAt: null,
  })
  return seed
}

/** The workspace the overview shows. */
const ACME = {
  id: 't-acme',
  name: 'Acme',
  slug: 'acme',
  description: null,
  logo: null,
  website: null,
  lifecycleState: 'active',
  deletedAt: null,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
  isPlatform: false,
  role: 'owner',
  access: 'member',
}

/** The workspace screens, each over its own seeded client. */
const WORKSPACE_SCREENS: Array<[string, QueryClient, () => React.JSX.Element]> = [
  [
    'Workspace overview',
    seeded(ACME, [{ tenant: ACME, role: 'owner', joinedAt: '2026-01-05', isPlatform: false }]),
    () => <Overview />,
  ],
  ['Workspace not available', seeded(null, []), () => <WorkspaceOverview slug="acme" />],
  [
    'Workspace suspended',
    seeded(null, [
      {
        tenant: { ...ACME, lifecycleState: 'suspended' },
        role: 'owner',
        joinedAt: '2026-01-05',
        isPlatform: false,
      },
    ]),
    () => <WorkspaceOverview slug="acme" />,
  ],
]
for (const [name, workspaceClient, workspaceScreen] of WORKSPACE_SCREENS) {
  A11Y_SCREENS.push({
    name,
    element: (
      <QueryClientProvider client={workspaceClient}>{workspaceScreen()}</QueryClientProvider>
    ),
  })
}

describe('the accessibility harness', () => {
  it('accepts a screen with one header and a labelled pressable', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Go" onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).not.toThrow()
  })

  it('rejects a pressable with no label', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityRole="button" onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a disabled pressable with no label', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityRole="button" disabled onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a pressable with no role', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityLabel="Go" onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a screen with two headers', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">One</Text>
        <Text accessibilityRole="header">Two</Text>
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a screen with no header', async () => {
    await renderWithProviders(<Text>Plain</Text>)
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a text input with no label', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <TextInput onChangeText={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })
})

A11Y_SCREENS.push({
  name: 'Settings row under a header',
  element: (
    <>
      <Text accessibilityRole="header">Settings</Text>
      <SettingsRow
        title="Profile"
        description="Your name."
        href={'/settings/account/profile' as Href}
      />
    </>
  ),
})

describe('A11Y_SCREENS', () => {
  for (const { name, element } of A11Y_SCREENS) {
    it(`${name} is accessible`, async () => {
      await renderWithProviders(element)
      assertAccessible()
    })
  }

  it('is a list', () => {
    expect(Array.isArray(A11Y_SCREENS)).toBe(true)
  })
})

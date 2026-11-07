import { jest } from '@jest/globals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Pressable, Text, TextInput } from 'react-native'
import Home from '@/app/(app)/(tabs)/index'
import Notifications from '@/app/(app)/(tabs)/notifications'
import Settings from '@/app/(app)/(tabs)/settings'
import Workspace from '@/app/(app)/(tabs)/workspace'
import DeleteAccount from '@/app/(app)/settings/account/delete'
import NotificationPreferences from '@/app/(app)/settings/account/notifications'
import Profile from '@/app/(app)/settings/account/profile'
import Security from '@/app/(app)/settings/account/security'
import WorkspaceActivity from '@/app/(app)/settings/workspace/[slug]/activity'
import WorkspacePlan from '@/app/(app)/settings/workspace/[slug]/billing'
import WorkspaceGeneral from '@/app/(app)/settings/workspace/[slug]/general'
import WorkspaceMembers from '@/app/(app)/settings/workspace/[slug]/members'
import Beta from '@/app/(app)/tenants/[slug]/beta'
import Overview from '@/app/(app)/tenants/[slug]/index'
import Insights from '@/app/(app)/tenants/[slug]/insights'
import Tenants from '@/app/(app)/tenants/index'
import Welcome from '@/app/(app)/welcome'
import NotFound from '@/app/+not-found'
import Confirm from '@/app/auth/confirm'
import Link from '@/app/auth/link'
import AcceptInvitation from '@/app/invitations/accept'
import ConfirmInvitation from '@/app/invitations/confirm'
import Login from '@/app/login'
import PasskeyRequired from '@/app/passkey-required'
import { SigningInScreen } from '@/components/auth/signing-in-screen'
import { InvitationInbox } from '@/components/invitations/invitation-inbox'
import { SettingsRow } from '@/components/settings/settings-row'
import { MaintenanceScreen } from '@/components/shared/maintenance-screen'
import { RootErrorBoundary } from '@/components/shared/root-error-boundary'
import { UpdateScreen } from '@/components/shared/update-screen'
import { StepUpDialog } from '@/components/step-up/step-up-dialog'
import { StepUpProvider } from '@/components/step-up/step-up-provider'
import { WorkspaceOverview } from '@/components/workspaces/workspace-overview'
import type { MembershipRole } from '@/constants/roles'
import { flagsKey } from '@/observability/flags/flag-query'
import { accountDeletionKeys } from '@/queries/account-deletion.queries'
import { tenantAuditListOptions } from '@/queries/audit.queries'
import { authKeys } from '@/queries/auth.queries'
import { billingKeys } from '@/queries/billing.queries'
import { clientSettingsKeys } from '@/queries/client-settings.queries'
import { insightsKey } from '@/queries/insights.queries'
import {
  notificationKeys,
  notificationsListOptions,
  type Notification,
  type NotificationPreference,
} from '@/queries/notification.queries'
import { sessionKeys } from '@/queries/sessions.queries'
import {
  invitationsListOptions,
  membersListOptions,
  ownersQueryOptions,
  tenantKeys,
  tenantsQueryOptions,
  type TenantMember,
  type TenantWithRole,
} from '@/queries/tenant.queries'
import { A11Y_SCREENS, assertAccessible, renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'
import type { TenantInvitation } from '@/types/api.types'
import type { ListPage } from '@/types/list.types'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'acme' }),
  useGlobalSearchParams: () => ({ slug: 'acme' }),
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react')
    useEffect(effect, [effect])
  },
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
  ['Confirm (incomplete link)', () => <Confirm />],
  ['Invitation (incomplete link)', () => <AcceptInvitation />],
  ['Invitation confirm (incomplete link)', () => <ConfirmInvitation />],
  [
    'Invitation (check your inbox)',
    () => (
      <InvitationInbox
        email="ada@example.com"
        workspace="Acme"
        resendAt={Date.now() + 60_000}
        resending={false}
        onResend={() => undefined}
        onHome={() => undefined}
      />
    ),
  ],
  ['Home', () => <Home />],
  ['Workspace tab', () => <Workspace />],
  ['Settings', () => <Settings />],
  ['Profile', () => <Profile />],
  ['Welcome', () => <Welcome />],
  ['Workspaces', () => <Tenants />],
  ['Passkey required', () => <PasskeyRequired />],
  ['Not found', () => <NotFound />],
  ['Signing you in', () => <SigningInScreen />],
  ['Maintenance', () => <MaintenanceScreen message={null} since={null} />],
  ['Update the app', () => <UpdateScreen url="market://details?id=x" />],
  [
    'The app hit a problem',
    () => <RootErrorBoundary error={new Error('boom')} retry={() => Promise.resolve()} />,
  ],
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
  seed.setQueryData(flagsKey({ kind: 'tenant', slug: 'acme' }), {
    example_beta_page: false,
    example_cta_experiment: 'control',
  })
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

/**
 * A client holding the Insights and Beta reads for the staff and extra-screen cases.
 * @param seed - Fills the client.
 * @returns The seeded client.
 */
function extraClient(seed: (client: QueryClient) => void): QueryClient {
  const extra = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  seed(extra)
  return extra
}

/** The Insights and Beta screens, and the overview a staff member sees. */
const EXTRA_SCREENS: Array<[string, QueryClient, () => React.JSX.Element]> = [
  [
    'Workspace Insights (open)',
    extraClient((extra) => {
      extra.setQueryData(billingKeys.entitlements('acme'), {
        plan: { key: 'paid', name: 'Paid' },
        features: { advanced_example: true },
        limits: {},
      })
      extra.setQueryData(insightsKey('acme'), {
        membersJoinedLast30Days: 4,
        invitationsSentLast30Days: 9,
      })
    }),
    () => <Insights />,
  ],
  [
    'Workspace Insights (locked)',
    extraClient((extra) => {
      extra.setQueryData(billingKeys.entitlements('acme'), {
        plan: { key: 'free', name: 'Free' },
        features: {},
        limits: {},
      })
    }),
    () => <Insights />,
  ],
  [
    'Workspace Beta',
    extraClient((extra) => {
      extra.setQueryData([...tenantKeys.detail('acme'), 'beta'], {
        slug: 'acme',
        enabledAt: '2026-11-07T00:00:00.000Z',
      })
    }),
    () => <Beta />,
  ],
  [
    'Workspace overview (staff banner)',
    seeded({ ...ACME, access: 'platform' }, []),
    () => <Overview />,
  ],
]
for (const [name, extra, extraScreen] of EXTRA_SCREENS) {
  A11Y_SCREENS.push({
    name,
    element: <QueryClientProvider client={extra}>{extraScreen()}</QueryClientProvider>,
  })
}

/** The settings the General screen shows. */
const GENERAL_SETTINGS = {
  tenantId: 't-acme',
  timezone: 'Europe/London',
  locale: 'en-GB',
  metadata: { plan: 'x' },
  updatedAt: '2026-01-05T00:00:00.000Z',
}

/** The General screen as a manager, a viewer and staff with platform access sees it. */
const GENERAL_SCREENS: Array<[string, Record<string, unknown>]> = [
  ['Workspace General (manager)', ACME],
  ['Workspace General (viewer)', { ...ACME, role: 'viewer' }],
  ['Workspace General (staff)', { ...ACME, access: 'platform' }],
]
for (const [name, tenant] of GENERAL_SCREENS) {
  const generalClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  generalClient.setQueryData(tenantKeys.detail('acme'), tenant)
  generalClient.setQueryData(tenantKeys.settings('acme'), GENERAL_SETTINGS)
  A11Y_SCREENS.push({
    name,
    element: (
      <QueryClientProvider client={generalClient}>
        <WorkspaceGeneral />
      </QueryClientProvider>
    ),
  })
}

/**
 * One member row of the API.
 * @param id - The user's id.
 * @param role - The membership role.
 * @param firstName - The first name, or null.
 * @returns The row.
 */
function memberRow(id: string, role: MembershipRole, firstName: string | null): TenantMember {
  return {
    membership: {
      id: `m-${id}`,
      userId: id,
      tenantId: 't-acme',
      role,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    user: { id, email: `${id}@example.com`, firstName, lastName: null },
  }
}

/** One page of members: two with names, one without. */
const MEMBERS_PAGE: ListPage<TenantMember> = {
  items: [
    memberRow('u1', 'owner', 'Ada'),
    memberRow('u2', 'viewer', 'Bob'),
    memberRow('u3', 'admin', null),
  ],
  page: { hasNext: true, nextCursor: 'c2', prevCursor: null, hasPrev: false, limit: 20 },
}

/** One page of pending invitations: one the viewer may act on, one for an admin role. */
const INVITATIONS_PAGE: ListPage<TenantInvitation> = {
  items: ['viewer', 'admin'].map((role, index) => ({
    id: `i${String(index)}`,
    email: `${role}-invite@example.com`,
    role: role as MembershipRole,
    invitedBy: { id: 'u1', firstName: 'Ada', lastName: null },
    expiresAt: '2030-01-10T10:00:00.000Z',
    createdAt: '2030-01-01T10:00:00.000Z',
    lastSentAt: null,
    resendAvailableAt: null,
  })),
  page: { hasNext: true, nextCursor: 'c2', prevCursor: null, hasPrev: false, limit: 20 },
}

/** The Members screen as a manager, a viewer and staff with platform access sees it. */
const MEMBERS_SCREENS: Array<[string, Record<string, unknown>]> = [
  ['Workspace Members (manager)', ACME],
  ['Workspace Members (viewer)', { ...ACME, role: 'viewer' }],
  ['Workspace Members (staff)', { ...ACME, access: 'platform' }],
]
for (const [name, tenant] of MEMBERS_SCREENS) {
  const membersClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  membersClient.setQueryData(tenantKeys.detail('acme'), tenant)
  membersClient.setQueryData(membersListOptions('acme', {}).queryKey, MEMBERS_PAGE)
  membersClient.setQueryData(ownersQueryOptions('acme').queryKey, MEMBERS_PAGE)
  membersClient.setQueryData(clientSettingsKeys.all, null)
  membersClient.setQueryData(invitationsListOptions('acme', {}).queryKey, INVITATIONS_PAGE)
  membersClient.setQueryData(billingKeys.entitlements('acme'), {
    plan: { key: 'free', name: 'Free' },
    features: {},
    limits: { members: { limit: 3, used: 3, approaching: false } },
  })
  A11Y_SCREENS.push({
    name,
    element: (
      <QueryClientProvider client={membersClient}>
        <StepUpProvider>
          <WorkspaceMembers />
        </StepUpProvider>
      </QueryClientProvider>
    ),
  })
}

/** The Activity screen as an owner and a viewer sees it. */
const ACTIVITY_SCREENS: Array<[string, Record<string, unknown>]> = [
  ['Workspace Activity (owner)', ACME],
  ['Workspace Activity (viewer)', { ...ACME, role: 'viewer' }],
]
for (const [name, tenant] of ACTIVITY_SCREENS) {
  const activityClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  activityClient.setQueryData(tenantKeys.detail('acme'), tenant)
  activityClient.setQueryData(tenantAuditListOptions('acme', {}).queryKey, {
    items: [
      {
        id: 'e1',
        occurredAt: '2026-11-01T10:00:00.000Z',
        action: 'tenant.updated',
        access: 'platform',
        actor: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
        target: { type: 'tenant', id: 't-acme' },
        metadata: {},
      },
    ],
    page: { hasNext: false, nextCursor: null, prevCursor: null, hasPrev: false, limit: 20 },
  })
  A11Y_SCREENS.push({
    name,
    element: (
      <QueryClientProvider client={activityClient}>
        <WorkspaceActivity />
      </QueryClientProvider>
    ),
  })
}

/** The Plan screen for an owner, staff with platform access and the platform workspace. */
const PLAN_SCREENS: Array<[string, Record<string, unknown>, boolean]> = [
  ['Workspace Plan (owner)', ACME, true],
  ['Workspace Plan (staff)', { ...ACME, access: 'platform' }, true],
  ['Workspace Plan (platform workspace)', { ...ACME, isPlatform: true }, false],
]
for (const [name, tenant, withPlan] of PLAN_SCREENS) {
  const planClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  planClient.setQueryData(tenantKeys.detail('acme'), tenant)
  planClient.setQueryData(clientSettingsKeys.all, null)
  if (withPlan) {
    planClient.setQueryData(billingKeys.entitlements('acme'), {
      plan: { key: 'free', name: 'Free' },
      state: 'free',
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      pastDue: null,
      features: { advanced_example: false },
      limits: { members: { limit: 3, used: 3, approaching: false } },
    })
    planClient.setQueryData(billingKeys.plans, {
      plans: [],
      catalog: [
        { key: 'members', kind: 'limit', label: 'Members', description: 'People.' },
        { key: 'advanced_example', kind: 'feature', label: 'Advanced example', description: 'x' },
      ],
      trial: { enabled: true, days: 14 },
      paymentsEnabled: true,
      gstRegistered: false,
    })
  }
  A11Y_SCREENS.push({
    name,
    element: (
      <QueryClientProvider client={planClient}>
        <WorkspacePlan />
      </QueryClientProvider>
    ),
  })
}

/**
 * A client holding the notification preferences query in a given state.
 * @param state - What the query holds: rows, or an error with no data.
 * @returns The seeded client.
 */
function preferencesClient(state: NotificationPreference[] | 'error'): QueryClient {
  const seed = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  if (state === 'error') {
    seed
      .getQueryCache()
      .build(seed, { queryKey: notificationKeys.preferences })
      .setState({ status: 'error', error: new Error('offline'), fetchStatus: 'idle' })
  } else {
    seed.setQueryData(notificationKeys.preferences, state)
  }
  return seed
}

/** The notification preferences screen with data, empty and failed. */
const PREFERENCE_SCREENS: Array<[string, QueryClient]> = [
  [
    'Notification preferences',
    preferencesClient([
      { notificationType: 'billing_payment_failed', emailEnabled: true, inAppEnabled: true },
      { notificationType: 'workspace_full', emailEnabled: false, inAppEnabled: false },
    ]),
  ],
  ['Notification preferences (empty)', preferencesClient([])],
  ['Notification preferences (load failed)', preferencesClient('error')],
]
for (const [name, preferencesQueryClient] of PREFERENCE_SCREENS) {
  A11Y_SCREENS.push({
    name,
    element: (
      <QueryClientProvider client={preferencesQueryClient}>
        <NotificationPreferences />
      </QueryClientProvider>
    ),
  })
}

/**
 * A client holding the Notifications tab's reads in a given state.
 * @param state - Rows, or an error on the first page with no data.
 * @returns The seeded client.
 */
function inboxClient(state: Notification[] | 'error'): QueryClient {
  const seed = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  seed.setQueryData(tenantsQueryOptions().queryKey, [])
  seed.setQueryData(notificationsListOptions({ unread: true, limit: 1 }).queryKey, {
    items: [],
    page: { hasNext: false, nextCursor: null, prevCursor: null, hasPrev: false, limit: 1 },
    total: { count: state === 'error' ? 0 : state.length, capped: false },
  })
  const list = notificationsListOptions({}).queryKey
  if (state === 'error') {
    seed
      .getQueryCache()
      .build(seed, { queryKey: list })
      .setState({ status: 'error', error: new Error('offline'), fetchStatus: 'idle' })
  } else {
    seed.setQueryData(list, {
      items: state,
      page: { hasNext: true, nextCursor: 'c2', prevCursor: null, hasPrev: false, limit: 20 },
    })
  }
  return seed
}

/** One unread invitation and one neutral billing notice. */
const INBOX_ROWS: Notification[] = [
  {
    id: 'n1',
    userId: 'u1',
    type: 'tenant_invitation',
    title: 'Invitation to Acme',
    body: 'Ada invited you.',
    metadata: { tenantSlug: 'acme' },
    readAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'n2',
    userId: 'u1',
    type: 'billing_payment_failed',
    title: 'Your payment of ₹999 failed',
    body: 'Upgrade from Billing.',
    metadata: { slug: 'acme' },
    readAt: '2026-11-02T10:00:00.000Z',
    createdAt: '2026-11-01T09:00:00.000Z',
  },
]

/** The Notifications tab with rows, empty and failed. */
const INBOX_SCREENS: Array<[string, QueryClient]> = [
  ['Notifications', inboxClient(INBOX_ROWS)],
  ['Notifications (empty)', inboxClient([])],
  ['Notifications (load failed)', inboxClient('error')],
]
for (const [name, inbox] of INBOX_SCREENS) {
  A11Y_SCREENS.push({
    name,
    element: (
      <QueryClientProvider client={inbox}>
        <Notifications />
      </QueryClientProvider>
    ),
  })
}

/** A client holding the client settings, so the dialog's update check makes no request. */
const stepUpClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})
stepUpClient.setQueryData(clientSettingsKeys.all, null)
// The other views are checked where the dialog's tests reach them.
A11Y_SCREENS.push({
  name: 'Confirm it’s you',
  element: (
    <QueryClientProvider client={stepUpClient}>
      <StepUpDialog onConfirmed={() => {}} onDismissed={() => {}} />
    </QueryClientProvider>
  ),
})

/** A client holding Security's reads, so the screen makes no request. */
const securityClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})
securityClient.setQueryData(clientSettingsKeys.all, null)
securityClient.setQueryData(authKeys.providers, {
  providers: [
    { provider: 'email', linkedAt: '2026-01-01T00:00:00.000Z' },
    { provider: 'google', linkedAt: '2026-01-02T00:00:00.000Z' },
  ],
})
securityClient.setQueryData(sessionKeys.all, [
  {
    id: 'a',
    client: 'native',
    deviceName: 'Pixel 9',
    createdAt: '2026-10-01T12:00:00.000Z',
    lastUsedAt: '2026-11-05T12:00:00.000Z',
    current: true,
  },
  {
    id: 'b',
    client: 'web',
    deviceName: null,
    createdAt: '2026-09-01T12:00:00.000Z',
    lastUsedAt: '2026-09-02T12:00:00.000Z',
    current: false,
  },
])
A11Y_SCREENS.push({
  name: 'Security',
  element: (
    <QueryClientProvider client={securityClient}>
      <StepUpProvider>
        <Security />
      </StepUpProvider>
    </QueryClientProvider>
  ),
})

/** A client holding the deletion read, so the screen makes no request. */
const deleteClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})
deleteClient.setQueryData(clientSettingsKeys.all, null)
deleteClient.setQueryData(accountDeletionKeys.request, null)
A11Y_SCREENS.push({
  name: 'Delete account',
  element: (
    <QueryClientProvider client={deleteClient}>
      <StepUpProvider>
        <DeleteAccount />
      </StepUpProvider>
    </QueryClientProvider>
  ),
})

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
      <SettingsRow title="Profile" description="Your name." href={'/settings/account/profile'} />
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

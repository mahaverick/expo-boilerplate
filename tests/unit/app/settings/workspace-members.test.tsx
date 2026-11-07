import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { Alert } from 'react-native'
import Members from '@/app/(app)/settings/workspace/[slug]/members'
import { StepUpProvider } from '@/components/step-up/step-up-provider'
import { clientSettingsKeys } from '@/queries/client-settings.queries'
import { tenantKeys } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { bodyOf, renderScreen, restoreApi, serve, type FakeAnswer } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { REAUTH_ANSWER, tokenWith } from '@/tests/support/step-up'
import { acme, envelope } from '@/tests/support/workspace-api'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), push: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'acme' }),
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

/**
 * One member row of the API.
 * @param id - The user's id.
 * @param role - The membership role.
 * @param names - First and last name.
 * @returns The row.
 */
function member(id: string, role: string, names: [string | null, string | null] = [null, null]) {
  return {
    membership: {
      id: `m-${id}`,
      userId: id,
      tenantId: 't-acme',
      role,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    user: { id, email: `${id}@example.com`, firstName: names[0], lastName: names[1] },
  }
}

/**
 * A list page.
 * @param items - The rows.
 * @param next - The next cursor, when more follow.
 * @returns The page.
 */
function page(items: unknown[], next: string | null = null) {
  return {
    items,
    page: { hasNext: next !== null, nextCursor: next, prevCursor: null, hasPrev: false, limit: 20 },
  }
}

/** The viewer's own row, an owner. */
const ME = member('u1', 'owner', ['Ada', 'Lovelace'])
const BOB = member('u2', 'viewer', ['Bob', 'Stone'])
const CAROL = member('u3', 'admin', ['Carol', 'Ng'])

let alert: jest.SpiedFunction<typeof Alert.alert>

beforeEach(() => {
  mockStorage.clear()
  mockReplace.mockReset()
  useToastQueueStore.getState().remove()
  useAuthStore.getState().login(tokenWith(1_000), {
    id: 'u1',
    email: 'u1@example.com',
    firstName: null,
    lastName: null,
    createdAt: '2026-01-01',
    platformRole: null,
    analyticsOptOut: false,
  })
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  jest.restoreAllMocks()
})

/** What a test changes in the served API. */
interface Serving {
  tenant?: Record<string, unknown>
  members?: unknown[]
  owners?: unknown[]
  list?: (config: { params?: Record<string, unknown> }) => FakeAnswer | undefined
  owners_answer?: FakeAnswer
  write?: (method: string, url: string) => FakeAnswer | undefined
}

/**
 * Serves the workspace, its members and owners; writes answer 200.
 * @param serving - Overrides.
 * @returns The requests seen.
 */
function serveMembers(serving: Serving = {}) {
  const rows = serving.members ?? [ME, BOB, CAROL]
  return serve((config) => {
    const method = (config.method ?? 'get').toUpperCase()
    const url = config.url ?? ''
    if (method === 'GET' && url === '/tenants/acme') return envelope(serving.tenant ?? acme())
    if (method === 'GET' && url === '/tenants/acme/members') {
      const params = config.params as Record<string, unknown> | undefined
      if (params?.role === 'owner') {
        return (
          serving.owners_answer ?? envelope(page(serving.owners ?? [ME, member('u9', 'owner')]))
        )
      }
      const custom = serving.list?.({ params })
      if (custom) return custom
      return envelope(page(rows))
    }
    if (method === 'GET' && url === '/status/client-settings') {
      return { status: 404, data: { success: false, message: 'Not found' } }
    }
    const written = serving.write?.(method, url)
    if (written) return written
    if (method === 'GET' && url === '/tenants/acme/invitations') return envelope(page([]))
    if (method === 'GET') return { status: 404, data: { success: false, message: 'Not found' } }
    return envelope(null)
  })
}

/**
 * The writes among the requests.
 * @param sent - Every request.
 * @returns The non-GET requests.
 */
function writes(sent: ReturnType<typeof serve>) {
  return sent.filter((config) => config.method !== 'get')
}

/**
 * The toasts shown.
 * @returns The titles.
 */
function toasts() {
  return useToastQueueStore.getState().toasts.map((toast) => toast.title)
}

/**
 * Presses the confirm button of the last alert.
 * @param label - The button's text.
 */
async function confirmAlert(label: string) {
  const buttons = alert.mock.calls.at(-1)?.[2] ?? []
  const button = buttons.find((candidate) => candidate.text === label)
  await act(async () => {
    await Promise.resolve(button?.onPress?.())
  })
}

/**
 * Renders the screen inside the step-up provider.
 * @returns The query client the screen reads.
 */
async function renderMembers(): Promise<QueryClient> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(clientSettingsKeys.all, null)
  await renderScreen(
    <StepUpProvider>
      <Members />
    </StepUpProvider>,
    client
  )
  return client
}

describe('Members screen', () => {
  it('lists the members with names, emails, roles and (you)', async () => {
    serveMembers({ members: [ME, BOB, member('u4', 'editor')] })
    await renderMembers()
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Members' })).toBeTruthy()
    expect(screen.getByText('Everyone with access to this workspace.')).toBeTruthy()
    expect(screen.getByText('(you)')).toBeTruthy()
    expect(screen.getByText('u2@example.com')).toBeTruthy()
    expect(screen.getByText('Bob Stone')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(within(screen.getByTestId('member-m-u2')).getByText('Viewer')).toBeTruthy()
    expect(screen.getByText('Editor')).toBeTruthy()
  })

  it('a failed list shows the error, not the empty state', async () => {
    serveMembers({ list: () => ({ status: 500, data: { success: false, message: 'Broke' } }) })
    await renderMembers()
    expect(
      await screen.findByText(
        'We couldn’t load this workspace’s members, so none are listed. Select Try again to load them.',
        {},
        { timeout: 4000 }
      )
    ).toBeTruthy()
    expect(screen.queryByText('No one has access to this workspace yet.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('shows the empty state for a list that answered with no rows', async () => {
    serveMembers({ members: [] })
    await renderMembers()
    expect(await screen.findByText('No one has access to this workspace yet.')).toBeTruthy()
  })

  it('Load more appends a page', async () => {
    const sent = serveMembers({
      list: ({ params }) =>
        params?.cursor === 'c2' ? envelope(page([BOB])) : envelope(page([ME], 'c2')),
    })
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Bob Stone')).toBeTruthy()
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
    expect(sent.some((config) => (config.params as { cursor?: string })?.cursor === 'c2')).toBe(
      true
    )
  })

  it('shows the role error and no list when the role did not load', async () => {
    serve((config) =>
      config.url === '/tenants/acme'
        ? { status: 500, data: { success: false, message: 'Broke' } }
        : { status: 404, data: { success: false, message: 'Not found' } }
    )
    await renderMembers()
    expect(
      await screen.findByText(
        'We couldn’t load your role in this workspace, so its controls are hidden. Select Try again to show them.'
      )
    ).toBeTruthy()
  })

  it('offers an owner only the roles an owner may grant, and sends the choice through step-up', async () => {
    const sent = serveMembers()
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Change role for Bob Stone' }))
    const sheet = await screen.findByRole('header', { name: 'Role for Bob Stone' })
    expect(sheet).toBeTruthy()
    for (const label of ['Owner', 'Admin', 'Manager', 'Editor', 'Viewer']) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy()
    }
    expect(screen.getByRole('radio', { name: 'Viewer' })).toBeChecked()
    await fireEvent.press(screen.getByRole('radio', { name: 'Editor' }))
    await waitFor(() => {
      expect(toasts()).toContain('Bob Stone is now Editor.')
    })
    const patch = writes(sent).filter((config) => config.method === 'patch')
    expect(patch).toHaveLength(1)
    expect(patch[0]?.url).toBe('/tenants/acme/members/u2')
    expect(bodyOf(patch[0])).toEqual({ role: 'editor' })
  })

  it('choosing the current role sends nothing', async () => {
    const sent = serveMembers()
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Change role for Bob Stone' }))
    await fireEvent.press(await screen.findByRole('radio', { name: 'Viewer' }))
    expect(writes(sent)).toHaveLength(0)
  })

  it('an admin changes no role and removes only members below admin', async () => {
    serveMembers({
      tenant: acme({ role: 'admin' }),
      members: [
        member('u1', 'admin', ['Ada', 'Lovelace']),
        BOB,
        member('u5', 'admin', ['Dan', 'Roe']),
      ],
    })
    await renderMembers()
    await screen.findByText('Bob Stone')
    expect(screen.queryByRole('button', { name: /Change role for/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove Bob Stone' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove Dan Roe' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy()
  })

  it('a viewer sees the list and only Leave', async () => {
    serveMembers({
      tenant: acme({ role: 'viewer' }),
      members: [BOB, member('u1', 'viewer', ['Ada', 'L'])],
    })
    await renderMembers()
    await screen.findByText('Bob Stone')
    expect(screen.queryByRole('button', { name: /Change role for/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy()
  })

  it('removing a member confirms first, and a refused write asks to confirm it is you', async () => {
    const sent = serveMembers({
      write: (method) => (method === 'DELETE' ? REAUTH_ANSWER : undefined),
    })
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove Bob Stone' }))
    expect(alert).toHaveBeenCalledTimes(1)
    const [title, message, buttons] = alert.mock.calls[0] ?? []
    expect(title).toBe('Remove Bob Stone?')
    expect(message).toBe(
      'Bob Stone will lose access to this workspace immediately. Pending invitations they sent are revoked.'
    )
    expect(buttons?.map((button) => button.text)).toEqual(['Cancel', 'Remove'])
    expect(buttons?.[1]?.style).toBe('destructive')
    expect(writes(sent)).toHaveLength(0)
    await confirmAlert('Remove')
    expect(await screen.findByText('Confirm it’s you')).toBeTruthy()
    expect(writes(sent)[0]?.url).toBe('/tenants/acme/members/u2')
  })

  it('removing a member toasts "{name} removed."', async () => {
    const sent = serveMembers()
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove Bob Stone' }))
    await confirmAlert('Remove')
    await waitFor(() => {
      expect(toasts()).toContain('Bob Stone removed.')
    })
    expect(writes(sent)).toHaveLength(1)
  })

  it('Cancel on the remove dialog sends nothing', async () => {
    const sent = serveMembers()
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove Bob Stone' }))
    await confirmAlert('Cancel')
    expect(writes(sent)).toHaveLength(0)
  })

  it('a double press of Remove sends one request', async () => {
    const sent = serveMembers()
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove Bob Stone' }))
    const buttons = alert.mock.calls[0]?.[2]
    await act(async () => {
      buttons?.[1]?.onPress?.()
      await Promise.resolve(buttons?.[1]?.onPress?.())
    })
    await waitFor(() => {
      expect(toasts()).toContain('Bob Stone removed.')
    })
    expect(writes(sent)).toHaveLength(1)
  })

  it('a 404 member_not_found toasts the gone message and refetches', async () => {
    const sent = serveMembers({
      write: (method) =>
        method === 'PATCH'
          ? {
              status: 404,
              data: { success: false, message: 'No', code: 'member_not_found' },
            }
          : undefined,
    })
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Change role for Bob Stone' }))
    await fireEvent.press(await screen.findByRole('radio', { name: 'Editor' }))
    await waitFor(() => {
      expect(toasts()).toContain(
        'That member is no longer in this workspace. We refreshed the list.'
      )
    })
    /** The member list reads, not the owners read. */
    const lists = () =>
      sent.filter(
        (config) =>
          config.url === '/tenants/acme/members' &&
          (config.params as { role?: string } | undefined)?.role === undefined
      )
    await waitFor(() => {
      expect(lists().length).toBeGreaterThanOrEqual(2)
    })
  })

  it('the last owner cannot be demoted, removed or leave', async () => {
    serveMembers({ owners: [ME], members: [ME, BOB] })
    await renderMembers()
    const reason = 'A workspace must always have an owner. Add another owner first.'
    expect(await screen.findByText(reason)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change role for Ada Lovelace' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove Bob Stone' })).toBeEnabled()
  })

  it('locks owner changes while the owners did not load', async () => {
    serveMembers({
      owners_answer: { status: 500, data: { success: false, message: 'Broke' } },
    })
    await renderMembers()
    expect(
      await screen.findByText(
        'Owners didn’t load, so owner changes are locked.',
        {},
        { timeout: 4000 }
      )
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change role for Ada Lovelace' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeDisabled()
    expect(
      screen.queryByText('A workspace must always have an owner. Add another owner first.')
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Change role for Bob Stone' })).toBeEnabled()
  })

  it('staff with platform access see no member controls', async () => {
    serveMembers({ tenant: acme({ role: 'owner', access: 'platform' }) })
    await renderMembers()
    await screen.findByText('Bob Stone')
    expect(
      screen.getByText(
        'You’re viewing this workspace as staff. Make changes from the staff console.'
      )
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Change role for/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Leave/ })).toBeNull()
  })

  it('staff viewers get no staff note', async () => {
    serveMembers({ tenant: acme({ role: 'viewer', access: 'platform' }) })
    await renderMembers()
    await screen.findByText('Bob Stone')
    expect(screen.queryByText(/viewing this workspace as staff/)).toBeNull()
  })

  it('leaving forgets the workspace and lands on the list', async () => {
    const order: string[] = []
    const held: { client?: QueryClient } = {}
    useCurrentTenantStore.getState().remember('u1', 'acme')
    const forget = jest
      .spyOn(useCurrentTenantStore.getState(), 'forget')
      .mockImplementation((userId: string) => {
        order.push(`forget:${userId}`)
      })
    mockReplace.mockImplementation((...args: unknown[]) => {
      order.push(
        `replace:${String(args[0])}:${String(held.client?.getQueryData(tenantKeys.detail('acme')) === undefined)}`
      )
    })
    const sent = serveMembers({ owners: [ME, member('u9', 'owner')] })
    held.client = await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Leave' }))
    const [title, message, buttons] = alert.mock.calls[0] ?? []
    expect(title).toBe('Leave this workspace?')
    expect(message).toBe(
      'You will lose access to this workspace immediately. An owner or admin will have to invite you back. Pending invitations you sent are revoked.'
    )
    expect(buttons?.map((button) => button.text)).toEqual(['Cancel', 'Leave'])
    await confirmAlert('Leave')
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/tenants')
    })
    expect(forget).toHaveBeenCalledWith('u1')
    expect(order).toEqual(['forget:u1', 'replace:/tenants:true'])
    expect(toasts()).toContain('You left Acme.')
    const del = writes(sent).find((config) => config.url === '/tenants/acme/membership')
    expect(del?.method).toBe('delete')
  })

  it('leaving keeps a different remembered workspace', async () => {
    useCurrentTenantStore.getState().remember('u1', 'other')
    serveMembers({ owners: [ME, member('u9', 'owner')] })
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Leave' }))
    await confirmAlert('Leave')
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/tenants')
    })
    expect(useCurrentTenantStore.getState().recall('u1')).toBe('other')
  })

  it('a 404 on leave says the person is no longer a member and still lands on the list', async () => {
    serveMembers({
      owners: [ME, member('u9', 'owner')],
      write: (method, url) =>
        method === 'DELETE' && url === '/tenants/acme/membership'
          ? { status: 404, data: { success: false, message: 'Gone', code: 'NOT_FOUND' } }
          : undefined,
    })
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Leave' }))
    await confirmAlert('Leave')
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/tenants')
    })
    expect(toasts()).toContain('You’re no longer a member of Acme.')
  })

  it('a failed leave stays on the screen and toasts the failure', async () => {
    serveMembers({
      owners: [ME, member('u9', 'owner')],
      write: (method, url) =>
        method === 'DELETE' && url === '/tenants/acme/membership'
          ? { status: 500, data: { success: false, message: 'Server broke' } }
          : undefined,
    })
    await renderMembers()
    await fireEvent.press(await screen.findByRole('button', { name: 'Leave' }))
    await confirmAlert('Leave')
    await waitFor(() => {
      expect(toasts()).toContain('Server broke')
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("scopes a row's controls to that row", async () => {
    serveMembers()
    await renderMembers()
    await screen.findByText('Bob Stone')
    const names = screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel as string)
    expect(names).toContain('Remove Carol Ng')
    expect(within(screen.getByTestId('member-m-u2')).getByText('Bob Stone')).toBeTruthy()
  })

  describe('invitations', () => {
    /** Serves one pending invitation to the invitations route. */
    const withInvitation = (method: string, url: string) =>
      method === 'GET' && url === '/tenants/acme/invitations'
        ? envelope(
            page([
              {
                id: 'i1',
                email: 'new@example.com',
                role: 'viewer',
                invitedBy: null,
                expiresAt: '2030-01-10T10:00:00.000Z',
                createdAt: '2030-01-01T10:00:00.000Z',
                lastSentAt: null,
                resendAvailableAt: null,
              },
            ])
          )
        : undefined

    it('shows an owner the invite form and the pending list below the members', async () => {
      serveMembers({ write: withInvitation })
      await renderMembers()
      expect(await screen.findByText('Invite a member')).toBeTruthy()
      expect(await screen.findByText('new@example.com')).toBeTruthy()
      expect(screen.getByText('Pending invitations')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Invite member' })).toBeTruthy()
    })

    it('shows a viewer neither the form nor the list', async () => {
      const sent = serveMembers({
        tenant: acme({ role: 'viewer' }),
        members: [BOB, member('u1', 'viewer', ['Ada', 'L'])],
        write: withInvitation,
      })
      await renderMembers()
      await screen.findByText('Bob Stone')
      expect(screen.queryByText('Invite a member')).toBeNull()
      expect(screen.queryByText('Pending invitations')).toBeNull()
      expect(sent.some((config) => config.url === '/tenants/acme/invitations')).toBe(false)
    })

    it('shows staff the list read-only and no form', async () => {
      serveMembers({ tenant: acme({ access: 'platform' }), write: withInvitation })
      await renderMembers()
      expect(await screen.findByText('new@example.com')).toBeTruthy()
      expect(screen.queryByText('Invite a member')).toBeNull()
      expect(screen.queryByRole('button', { name: /Resend/ })).toBeNull()
    })
  })
})

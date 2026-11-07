import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import Notifications from '@/app/(app)/(tabs)/notifications'
import { notificationsListOptions } from '@/queries/notification.queries'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { renderScreen, restoreApi, serve, type FakeAnswer } from '@/tests/support/api'
import { afterEach, describe, expect, it } from '@/tests/support/runner'
import { envelope, membership } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}))

afterEach(() => {
  useToastQueueStore.getState().remove()
  restoreApi()
  jest.clearAllMocks()
})

/**
 * One notification.
 * @param id - Its id.
 * @param overrides - Fields to change.
 * @returns The row.
 */
function note(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: 'u1',
    type: 'tenant_invitation',
    title: `Title ${id}`,
    body: `Body ${id}`,
    metadata: null,
    readAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  }
}

/**
 * A list page.
 * @param items - The rows.
 * @param next - The next cursor.
 * @param total - The unread total, when the request asked.
 * @returns The page.
 */
function page(items: unknown[], next: string | null = null, total?: number) {
  return {
    items,
    page: { hasNext: next !== null, nextCursor: next, prevCursor: null, hasPrev: false, limit: 20 },
    ...(total === undefined ? {} : { total: { count: total, capped: false } }),
  }
}

/** What a test changes in the served API. */
interface Serving {
  list?: (params: Record<string, unknown> | undefined) => FakeAnswer
  unread?: number | (() => number)
  /** Called for every write that reaches the server. */
  onWrite?: (method: string, url: string) => void
  /** Answers every write with a 500. */
  failWrites?: boolean
  /** Holds every write's answer until this settles. */
  hold?: Promise<void>
}

/**
 * Serves the inbox, the unread count and the workspaces.
 * @param serving - Overrides.
 * @returns The requests seen.
 */
function serveInbox(serving: Serving = {}) {
  return serve(async (config) => {
    const url = config.url ?? ''
    const method = (config.method ?? 'get').toUpperCase()
    if (url === '/tenants') {
      return envelope({
        items: [membership('acme', 'Acme')],
        page: { hasNext: false, nextCursor: null },
      })
    }
    if (method !== 'GET') {
      await serving.hold
      serving.onWrite?.(method, url)
      if (serving.failWrites) {
        return { status: 500, data: { success: false, message: 'Write failed' } }
      }
    }
    if (method === 'PATCH' && url === '/notifications/read-all') return envelope({ count: 2 })
    if (method === 'PATCH') return envelope(note('x', { readAt: '2026-11-02T00:00:00.000Z' }))
    if (method === 'DELETE') return envelope(null)
    if (url === '/notifications') {
      const params = config.params as Record<string, unknown> | undefined
      if (params?.unread === true && params.limit === 1) {
        return envelope(
          page(
            [],
            null,
            typeof serving.unread === 'function' ? serving.unread() : (serving.unread ?? 2)
          )
        )
      }
      return serving.list ? serving.list(params) : envelope(page([note('n1')]))
    }
    return { status: 404, data: { success: false, message: 'Not found' } }
  })
}

/**
 * Renders the screen.
 * @returns The query client.
 */
async function renderTab(): Promise<QueryClient> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  await renderScreen(<Notifications />, client)
  return client
}

/**
 * The list requests among those seen (not the count's).
 * @param sent - Every request.
 * @returns The list requests.
 */
function listRequests(sent: ReturnType<typeof serve>) {
  return sent.filter(
    (config) =>
      config.url === '/notifications' &&
      config.method === 'get' &&
      !((config.params as { limit?: number } | undefined)?.limit === 1)
  )
}

/**
 * The requests of one method and path.
 * @param sent - Every request.
 * @param method - The method.
 * @param url - The path.
 * @returns The matches.
 */
function writes(sent: ReturnType<typeof serve>, method: string, url: string) {
  return sent.filter((config) => config.method === method && config.url === url)
}

/**
 * A promise a test settles by hand.
 * @returns The promise and its resolver.
 */
function deferred() {
  const { promise, resolve } = Promise.withResolvers<void>()
  return { promise, release: resolve }
}

describe('Notifications tab', () => {
  it('lists the rows with the intro, the unread mark and the meta line, and Load more appends', async () => {
    const sent = serveInbox({
      list: (params) =>
        params?.cursor === 'c2'
          ? envelope(page([note('n3')]))
          : envelope(page([note('n1'), note('n2', { readAt: '2026-11-02T00:00:00.000Z' })], 'c2')),
    })
    await renderTab()
    expect(await screen.findByText('Title n1')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Notifications' })).toBeTruthy()
    expect(screen.getByText('Everything this account has been sent, newest first.')).toBeTruthy()
    expect(screen.getByText('Body n1')).toBeTruthy()
    expect(within(screen.getByTestId('notification-n1')).getByText('Unread')).toBeTruthy()
    expect(within(screen.getByTestId('notification-n2')).queryByText('Unread')).toBeNull()
    expect(
      within(screen.getByTestId('notification-n1')).getByText(/^Workspace invitation · /)
    ).toBeTruthy()
    const titles = screen.getAllByText(/^Title n/)
    expect(titles).toHaveLength(2)
    expect(titles[0]).toHaveTextContent('Title n1')
    expect(titles[1]).toHaveTextContent('Title n2')
    await fireEvent.press(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Title n3')).toBeTruthy()
    expect(listRequests(sent).at(-1)?.params).toEqual({ cursor: 'c2' })
  })

  it('links to the notification settings', async () => {
    serveInbox()
    await renderTab()
    await fireEvent.press(await screen.findByRole('link', { name: 'Notification settings' }))
    expect(router.push).toHaveBeenCalledWith('/settings/account/notifications')
  })

  it('billing rows never show the server’s text', async () => {
    serveInbox({
      list: () =>
        envelope(
          page([
            note('b1', {
              type: 'billing_payment_failed',
              title: 'Your payment of ₹999 failed',
              body: 'Update your card. To keep Paid, upgrade from Billing.',
              metadata: { slug: 'acme', tenantId: 't-acme' },
            }),
          ])
        ),
    })
    await renderTab()
    const row = await screen.findByTestId('notification-b1')
    await waitFor(() =>
      expect(
        within(row).getByText('A payment for Acme failed. Open Plan for its current plan.')
      ).toBeTruthy()
    )
    expect(screen.queryByText(/₹999/)).toBeNull()
    expect(screen.queryByText(/upgrade from Billing/)).toBeNull()
    expect(within(row).getByText('Payment failed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete "Payment failed"' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mark "Payment failed" as read' })).toBeTruthy()
  })

  it('names "your workspace" when the list lacks the workspace', async () => {
    serveInbox({
      list: () =>
        envelope(
          page([
            note('b2', {
              type: 'billing_payer_left',
              metadata: { slug: 'gone' },
            }),
          ])
        ),
    })
    await renderTab()
    expect(await screen.findByText('The person who paid for your workspace left it.')).toBeTruthy()
  })

  it('the chips send unread=true and unread=false, and All sends neither', async () => {
    const sent = serveInbox()
    await renderTab()
    await screen.findByText('Title n1')
    expect(screen.getByLabelText('Status')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'All', checked: true })).toBeTruthy()
    await fireEvent.press(screen.getByRole('radio', { name: 'Unread' }))
    await waitFor(() =>
      expect(listRequests(sent).at(-1)?.params).toEqual({ unread: true, total: 1 })
    )
    await fireEvent.press(screen.getByRole('radio', { name: 'Read' }))
    await waitFor(() =>
      expect(listRequests(sent).at(-1)?.params).toEqual({ unread: false, total: 1 })
    )
    await fireEvent.press(screen.getByRole('radio', { name: 'All' }))
    expect(screen.getByRole('radio', { name: 'All', checked: true })).toBeTruthy()
  })

  it('sends the trimmed search after the debounce', async () => {
    const sent = serveInbox()
    await renderTab()
    await screen.findByText('Title n1')
    const field = screen.getByLabelText('Search notifications')
    expect(field.props.placeholder).toBe('Search by title or text')
    const before = listRequests(sent).length
    await fireEvent.changeText(field, '  inv')
    await fireEvent.changeText(field, '  invite  ')
    expect(listRequests(sent)).toHaveLength(before)
    await waitFor(() =>
      expect(listRequests(sent).at(-1)?.params).toEqual({ search: 'invite', total: 1 })
    )
    expect(listRequests(sent)).toHaveLength(before + 1)
  })

  it('marks one row read once, even when pressed twice', async () => {
    const gate = deferred()
    const sent = serveInbox({ hold: gate.promise })
    await renderTab()
    const button = await screen.findByRole('button', { name: 'Mark "Title n1" as read' })
    await fireEvent.press(button)
    await fireEvent.press(button)
    gate.release()
    await waitFor(() => expect(writes(sent, 'patch', '/notifications/n1/read')).toHaveLength(1))
    expect(writes(sent, 'patch', '/notifications/n1/read')).toHaveLength(1)
  })

  it('shows no Mark as read button on a read row', async () => {
    serveInbox({ list: () => envelope(page([note('n2', { readAt: '2026-11-02T00:00:00.000Z' })])) })
    await renderTab()
    await screen.findByText('Title n2')
    expect(screen.queryByRole('button', { name: /^Mark "Title n2"/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete "Title n2"' })).toBeTruthy()
  })

  it('deletes a row once with no confirmation', async () => {
    const gate = deferred()
    const sent = serveInbox({ hold: gate.promise })
    await renderTab()
    const button = await screen.findByRole('button', { name: 'Delete "Title n1"' })
    await fireEvent.press(button)
    await fireEvent.press(button)
    gate.release()
    await waitFor(() => expect(writes(sent, 'delete', '/notifications/n1')).toHaveLength(1))
    expect(writes(sent, 'delete', '/notifications/n1')).toHaveLength(1)
  })

  it('marks all read once', async () => {
    const gate = deferred()
    const sent = serveInbox({ hold: gate.promise })
    await renderTab()
    await screen.findByText('Title n1')
    const all = screen.getByRole('button', { name: 'Mark all read' })
    await waitFor(() => expect(all).toBeEnabled())
    await fireEvent.press(all)
    await fireEvent.press(all)
    gate.release()
    await waitFor(() => expect(writes(sent, 'patch', '/notifications/read-all')).toHaveLength(1))
    expect(writes(sent, 'patch', '/notifications/read-all')).toHaveLength(1)
  })

  it('disables Mark all read when nothing is unread', async () => {
    serveInbox({ unread: 0 })
    await renderTab()
    await screen.findByText('Title n1')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
    )
  })

  it('opens Plan for a billing row and Members for workspace_full', async () => {
    serveInbox({
      list: () =>
        envelope(
          page([
            note('b1', { type: 'billing_trial_ending', metadata: { slug: 'acme' } }),
            note('w1', { type: 'workspace_full', metadata: { slug: 'acme' } }),
          ])
        ),
    })
    await renderTab()
    await fireEvent.press(await screen.findByRole('link', { name: 'Open Plan' }))
    expect(router.push).toHaveBeenCalledWith('/settings/workspace/acme/billing')
    await fireEvent.press(screen.getByRole('link', { name: 'Open Members' }))
    expect(router.push).toHaveBeenCalledWith('/settings/workspace/acme/members')
  })

  it('shows the empty state when nothing is sent', async () => {
    serveInbox({ list: () => envelope(page([])) })
    await renderTab()
    expect(await screen.findByText('You have no notifications.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
  })

  it('shows the filtered empty state, and Reset clears the filters', async () => {
    const sent = serveInbox({
      list: (params) =>
        params?.unread === true ? envelope(page([])) : envelope(page([note('n1')])),
    })
    await renderTab()
    await screen.findByText('Title n1')
    await fireEvent.press(screen.getByRole('radio', { name: 'Unread' }))
    expect(await screen.findByText('Nothing matches these filters.')).toBeTruthy()
    expect(screen.queryByText('You have no notifications.')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Reset' }))
    expect(await screen.findByText('Title n1')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'All', checked: true })).toBeTruthy()
    expect(screen.getByLabelText('Search notifications').props.value).toBe('')
    expect(listRequests(sent).every((config) => config.params !== undefined)).toBe(true)
  })

  it('shows the load error, not the empty state, when the list fails', async () => {
    serveInbox({ list: () => ({ status: 500, data: { success: false, message: 'Boom' } }) })
    await renderTab()
    expect(
      await screen.findByText(
        'We couldn’t load your notifications, so none are listed. Select Try again to load them.',
        {},
        { timeout: 4000 }
      )
    ).toBeTruthy()
    expect(screen.queryByText('You have no notifications.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

describe('Notifications tab writes that fail', () => {
  it('toasts a failed Delete, though the row left at once', async () => {
    const gate = deferred()
    serveInbox({ failWrites: true, hold: gate.promise })
    await renderTab()
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete "Title n1"' }))
    await waitFor(() => expect(screen.queryByText('Title n1')).toBeNull())
    gate.release()
    await waitFor(() =>
      expect(useToastQueueStore.getState().toasts.map((toast) => toast.title)).toEqual([
        'Write failed',
      ])
    )
    expect(await screen.findByText('Title n1')).toBeTruthy()
  })

  it('toasts a failed Mark read in the Unread view', async () => {
    const gate = deferred()
    serveInbox({ failWrites: true, hold: gate.promise })
    await renderTab()
    await screen.findByText('Title n1')
    await fireEvent.press(screen.getByRole('radio', { name: 'Unread' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Mark "Title n1" as read' }))
    await waitFor(() => expect(screen.queryByText('Title n1')).toBeNull())
    gate.release()
    await waitFor(() =>
      expect(useToastQueueStore.getState().toasts.map((toast) => toast.title)).toEqual([
        'Write failed',
      ])
    )
  })

  it('toasts a failed Mark all read', async () => {
    serveInbox({ failWrites: true })
    await renderTab()
    await screen.findByText('Title n1')
    const all = screen.getByRole('button', { name: 'Mark all read' })
    await waitFor(() => expect(all).toBeEnabled())
    await fireEvent.press(all)
    await waitFor(() =>
      expect(useToastQueueStore.getState().toasts.map((toast) => toast.title)).toEqual([
        'Write failed',
      ])
    )
  })
})

describe('Notifications tab with two pages', () => {
  it('marks a page-2 row read in the Unread view without dropping page 2', async () => {
    const unread = ['u1', 'u2', 'u3', 'u4']
    serveInbox({
      unread: () => unread.length,
      onWrite: (method, url) => {
        if (method === 'PATCH') unread.splice(unread.indexOf(url.split('/')[2] ?? ''), 1)
      },
      list: (params) => {
        const start = params?.cursor === 'u2' ? 2 : 0
        const ids = unread.slice(start, start + 2)
        return envelope(
          page(
            ids.map((id) => note(id)),
            start === 0 && unread.length > 2 ? 'u2' : null
          )
        )
      },
    })
    const client = await renderTab()
    await screen.findByText('Title u1')
    await fireEvent.press(screen.getByRole('radio', { name: 'Unread' }))
    await screen.findByRole('button', { name: 'Load more' })
    await fireEvent.press(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Title u4')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Mark "Title u3" as read' }))
    await waitFor(() => expect(screen.queryByText('Title u3')).toBeNull())
    await waitFor(() =>
      expect(
        (
          client.getQueryData(notificationsListOptions({ unread: true, limit: 1 }).queryKey) as {
            total: { count: number }
          }
        ).total.count
      ).toBe(3)
    )
    expect(screen.getByText('Title u1')).toBeTruthy()
    expect(screen.getByText('Title u4')).toBeTruthy()
  })
})

import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import Activity from '@/app/(app)/settings/workspace/[slug]/activity'
import { renderScreen, restoreApi, serve, type FakeAnswer } from '@/tests/support/api'
import { afterEach, describe, expect, it } from '@/tests/support/runner'
import { acme, envelope, membership } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: 'acme' }),
}))

afterEach(() => {
  restoreApi()
})

/**
 * One audit entry.
 * @param id - The entry id.
 * @param overrides - Fields to change.
 * @returns The entry.
 */
function entry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    occurredAt: '2026-11-01T10:00:00.000Z',
    action: 'tenant.updated',
    access: 'member',
    actor: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
    target: { type: 'tenant', id: 't-acme' },
    metadata: {},
    ...overrides,
  }
}

/**
 * A list page.
 * @param items - The rows.
 * @param next - The next cursor.
 * @returns The page.
 */
function page(items: unknown[], next: string | null = null) {
  return {
    items,
    page: { hasNext: next !== null, nextCursor: next, prevCursor: null, hasPrev: false, limit: 20 },
  }
}

/** What a test changes in the served API. */
interface Serving {
  tenant?: Record<string, unknown>
  log?: (params: Record<string, unknown> | undefined) => FakeAnswer
}

/**
 * Serves the workspace and its audit log.
 * @param serving - Overrides.
 * @returns The requests seen.
 */
function serveActivity(serving: Serving = {}) {
  return serve((config) => {
    const url = config.url ?? ''
    if (url === '/tenants/acme') return envelope(serving.tenant ?? acme())
    if (url === '/tenants/acme/audit-log') {
      const params = config.params as Record<string, unknown> | undefined
      return serving.log ? serving.log(params) : envelope(page([entry('e1')]))
    }
    return { status: 404, data: { success: false, message: 'Not found' } }
  })
}

/**
 * Renders the screen.
 * @returns The query client.
 */
async function renderActivity(): Promise<QueryClient> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  await renderScreen(<Activity />, client)
  return client
}

/**
 * The audit-log requests among those seen.
 * @param sent - Every request.
 * @returns The log requests.
 */
function logRequests(sent: ReturnType<typeof serve>) {
  return sent.filter((config) => config.url === '/tenants/acme/audit-log')
}

const NOT_ALLOWED = 'Only this workspace’s owners and admins can see its activity.'

describe('Activity screen', () => {
  it('lists entries with the actor, time and target', async () => {
    serveActivity({
      log: () => envelope(page([entry('e1'), entry('e2', { actor: null, target: null })])),
    })
    await renderActivity()
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Activity' })).toBeTruthy()
    expect(
      screen.getByText('Changes made by React Boilerplate support staff are marked Staff.')
    ).toBeTruthy()
    expect(within(screen.getByTestId('activity-e2')).getByText('System')).toBeTruthy()
    expect(screen.getByText('Workspace')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('shows the not-available panel, not the role error, when the workspace answers 404', async () => {
    const sent = serve((config) => {
      if (config.url === '/tenants') {
        return envelope({
          items: [membership('acme', 'Acme')],
          page: { hasNext: false, nextCursor: null },
        })
      }
      return { status: 404, data: { success: false, message: 'Not found' } }
    })
    await renderActivity()
    expect(await screen.findByRole('header', { name: 'Workspace not available' })).toBeTruthy()
    expect(
      screen.getByText('We couldn’t open /acme. It doesn’t exist, or you aren’t a member.')
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to your workspaces' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(logRequests(sent)).toHaveLength(0)
  })

  it('a viewer sees the note, and no request is made', async () => {
    const sent = serveActivity({ tenant: acme({ role: 'viewer' }) })
    await renderActivity()
    expect(await screen.findByText(NOT_ALLOWED)).toBeTruthy()
    expect(logRequests(sent)).toHaveLength(0)
  })

  it('a 403 shows the note and refetches the workspace', async () => {
    const sent = serveActivity({
      log: () => ({ status: 403, data: { success: false, message: 'Forbidden' } }),
    })
    await renderActivity()
    expect(await screen.findByText(NOT_ALLOWED, {}, { timeout: 4000 })).toBeTruthy()
    await waitFor(() =>
      expect(sent.filter((config) => config.url === '/tenants/acme').length).toBeGreaterThan(1)
    )
  })

  it('debounces search and starts again at page 1', async () => {
    const sent = serveActivity({
      log: (params) =>
        params?.cursor === 'c2'
          ? envelope(page([entry('e2')]))
          : envelope(page([entry('e1')], 'c2')),
    })
    await renderActivity()
    await fireEvent.press(await screen.findByRole('button', { name: 'Load more' }))
    await waitFor(() =>
      expect(
        logRequests(sent).some((config) => (config.params as { cursor?: string }).cursor === 'c2')
      ).toBe(true)
    )
    const before = logRequests(sent).length
    const field = screen.getByLabelText('Search activity')
    expect(field.props.placeholder).toBe('Search by email or action')
    await fireEvent.changeText(field, 'a')
    await fireEvent.changeText(field, 'ada')
    expect(logRequests(sent)).toHaveLength(before)
    await waitFor(() =>
      expect(logRequests(sent).at(-1)?.params).toEqual({ search: 'ada', total: 1 })
    )
    expect(logRequests(sent)).toHaveLength(before + 1)
  })

  it('the access filter sends access=platform', async () => {
    const sent = serveActivity()
    await renderActivity()
    await screen.findByText('Ada Lovelace')
    expect(screen.getByRole('radio', { name: 'All', checked: true })).toBeTruthy()
    await fireEvent.press(screen.getByRole('radio', { name: 'Staff (React Boilerplate support)' }))
    await waitFor(() =>
      expect(logRequests(sent).at(-1)?.params).toEqual({ access: 'platform', total: 1 })
    )
    expect(screen.getByRole('radio', { name: 'Member' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'System' })).toBeTruthy()
  })

  it('shows the Staff badge for platform access only', async () => {
    serveActivity({
      log: () =>
        envelope(
          page([
            entry('e1', {
              actor: { id: 's', name: 'Sam Staff', email: 's@x.com' },
              access: 'platform',
            }),
            entry('e2'),
          ])
        ),
    })
    await renderActivity()
    await screen.findByText('Sam Staff')
    expect(screen.getAllByText('Staff')).toHaveLength(1)
  })

  it('shows the empty state for a log with no entries', async () => {
    serveActivity({ log: () => envelope(page([])) })
    await renderActivity()
    expect(await screen.findByText('Nothing has happened in this workspace yet.')).toBeTruthy()
  })

  it('a failed list shows the error, not the empty state', async () => {
    serveActivity({ log: () => ({ status: 500, data: { success: false, message: 'Broke' } }) })
    await renderActivity()
    expect(
      await screen.findByText(
        'We couldn’t load the activity, so none is listed. Select Try again to load it.',
        {},
        { timeout: 4000 }
      )
    ).toBeTruthy()
    expect(screen.queryByText('Nothing has happened in this workspace yet.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

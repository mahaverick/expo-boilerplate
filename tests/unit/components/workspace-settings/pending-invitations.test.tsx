import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { StepUpProvider } from '@/components/step-up/step-up-provider'
import { PendingInvitations } from '@/components/workspace-settings/pending-invitations'
import type { MembershipRole } from '@/constants/roles'
import { clientSettingsKeys } from '@/queries/client-settings.queries'
import { useAuthStore } from '@/states/auth.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { renderScreen, restoreApi, serve, type FakeAnswer } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { REAUTH_ANSWER, tokenWith } from '@/tests/support/step-up'
import { envelope } from '@/tests/support/workspace-api'

/**
 * One invitation of the API.
 * @param id - The invitation's id.
 * @param overrides - Fields to replace.
 * @returns The row.
 */
function invitation(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    email: `${id}@example.com`,
    role: 'viewer',
    invitedBy: { firstName: 'Ada', lastName: 'Lovelace' },
    expiresAt: '2030-01-10T10:00:00.000Z',
    createdAt: '2030-01-01T10:00:00.000Z',
    lastSentAt: '2030-01-01T10:00:00.000Z',
    resendAvailableAt: null,
    ...overrides,
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

/**
 * An error answer in express's envelope.
 * @param status - The HTTP status.
 * @param code - The error code.
 * @param message - The message.
 * @param headers - Extra headers.
 * @returns The answer.
 */
function refusal(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>
): FakeAnswer {
  return { status, data: { success: false, statusCode: status, code, message }, headers }
}

/** What a test changes in the served API. */
interface Serving {
  rows?: unknown[]
  list?: (params: Record<string, unknown> | undefined) => FakeAnswer | undefined
  resend?: FakeAnswer
  revoke?: FakeAnswer
}

let alert: jest.SpiedFunction<typeof Alert.alert>

beforeEach(() => {
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

/**
 * Serves the invitation routes.
 * @param serving - Overrides.
 * @returns The requests seen.
 */
function serveInvitations(serving: Serving = {}) {
  return serve((config) => {
    const method = (config.method ?? 'get').toUpperCase()
    const url = config.url ?? ''
    const params = config.params as Record<string, unknown> | undefined
    if (method === 'GET' && url === '/tenants/acme/invitations') {
      return serving.list?.(params) ?? envelope(page(serving.rows ?? [invitation('i1')]))
    }
    if (method === 'POST' && url.endsWith('/resend')) return serving.resend ?? envelope(null)
    if (method === 'DELETE') return serving.revoke ?? envelope(null)
    return { status: 404, data: { success: false, message: 'Not found' } }
  })
}

/**
 * Renders the list inside the step-up provider.
 * @param role - The viewer's role.
 * @param readOnly - True for staff through platform access.
 */
async function renderList(role: MembershipRole = 'owner', readOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(clientSettingsKeys.all, null)
  await renderScreen(
    <StepUpProvider>
      <PendingInvitations slug="acme" myRole={role} readOnly={readOnly} />
    </StepUpProvider>,
    client
  )
}

/**
 * The toasts shown.
 * @returns The titles.
 */
function toasts() {
  return useToastQueueStore.getState().toasts.map((toast) => toast.title)
}

/**
 * Presses a button of the last alert.
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
 * The non-GET requests among those seen.
 * @param sent - Every request.
 * @returns The writes.
 */
function writes(sent: ReturnType<typeof serve>) {
  return sent.filter((config) => config.method !== 'get')
}

describe('PendingInvitations', () => {
  it('lists each invitation with its role, inviter and expiry', async () => {
    serveInvitations({
      rows: [invitation('i1'), invitation('i2', { invitedBy: null, role: 'editor' })],
    })
    await renderList()
    expect(await screen.findByText('Sent, and not yet accepted.')).toBeTruthy()
    expect(await screen.findByText('i1@example.com')).toBeTruthy()
    expect(screen.getByText('Invited by Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('Invited by A teammate')).toBeTruthy()
    expect(screen.getByText('Editor')).toBeTruthy()
    expect(screen.getAllByText(/^Expires /)).toHaveLength(2)
  })

  it('shows the empty state for a list that answered with no rows', async () => {
    serveInvitations({ rows: [] })
    await renderList()
    expect(await screen.findByText('No invitations are waiting to be accepted.')).toBeTruthy()
  })

  it('a failed list shows the error, not the empty state', async () => {
    serveInvitations({ list: () => refusal(500, 'INTERNAL', 'Broke') })
    await renderList()
    expect(
      await screen.findByText(
        'We couldn’t load the pending invitations. Select Try again to load them.',
        {},
        { timeout: 4000 }
      )
    ).toBeTruthy()
    expect(screen.queryByText('No invitations are waiting to be accepted.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('Load more appends a page', async () => {
    serveInvitations({
      list: (params) =>
        params?.cursor === 'c2'
          ? envelope(page([invitation('i2')]))
          : envelope(page([invitation('i1')], 'c2')),
    })
    await renderList()
    await fireEvent.press(await screen.findByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('i2@example.com')).toBeTruthy()
    expect(screen.getByText('i1@example.com')).toBeTruthy()
  })

  it('resend runs through step-up and toasts', async () => {
    const sent = serveInvitations({ resend: REAUTH_ANSWER })
    await renderList()
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Resend, invitation to i1@example.com' })
    )
    expect(await screen.findByText('Confirm it’s you')).toBeTruthy()
    expect(writes(sent)[0]?.url).toBe('/tenants/acme/invitations/i1/resend')
  })

  it('resend toasts on success', async () => {
    serveInvitations()
    await renderList()
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Resend, invitation to i1@example.com' })
    )
    await waitFor(() => {
      expect(toasts()).toContain('Invitation resent to i1@example.com.')
    })
  })

  it('a 429 invitation_resend_cooldown holds Resend until Retry-After', async () => {
    serveInvitations({
      resend: refusal(429, 'invitation_resend_cooldown', 'Wait a bit.', { 'retry-after': '120' }),
    })
    await renderList()
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Resend, invitation to i1@example.com' })
    )
    const held = await screen.findByRole('button', {
      name: 'Resend in 2 min, invitation to i1@example.com',
    })
    expect(screen.getByText('Resend in 2 min')).toBeTruthy()
    expect(held).toBeDisabled()
  })

  it('holds Resend until the row’s resendAvailableAt', async () => {
    const soon = new Date(Date.now() + 42_000).toISOString()
    serveInvitations({ rows: [invitation('i1', { resendAvailableAt: soon })] })
    await renderList()
    expect(await screen.findByText(/^Resend in \d+ seconds?$/)).toBeTruthy()
  })

  it('a resend of a gone invitation says it is no longer pending', async () => {
    serveInvitations({ resend: refusal(404, 'invitation_not_found', 'Not found') })
    await renderList()
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Resend, invitation to i1@example.com' })
    )
    await waitFor(() => {
      expect(toasts()).toContain('That invitation is no longer pending.')
    })
  })

  it('a resend at the limit says so', async () => {
    serveInvitations({
      resend: {
        status: 402,
        data: {
          success: false,
          code: 'PLAN_LIMIT_REACHED',
          message: 'Limit',
          details: { key: 'members', used: 5, limit: 5 },
        },
      },
    })
    await renderList()
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Resend, invitation to i1@example.com' })
    )
    await waitFor(() => {
      expect(toasts()).toContain('Not sent. You’re at the members limit.')
    })
  })

  it('revoke confirms first, then runs through step-up', async () => {
    const sent = serveInvitations({ revoke: REAUTH_ANSWER })
    await renderList()
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Revoke invitation to i1@example.com' })
    )
    const [title, message, buttons] = alert.mock.calls[0] ?? []
    expect(title).toBe('Revoke the invitation to i1@example.com?')
    expect(message).toBe(
      'The link in their email stops working immediately. You can invite them again from this page.'
    )
    expect(buttons?.map((button) => button.text)).toEqual(['Cancel', 'Revoke'])
    expect(buttons?.[1]?.style).toBe('destructive')
    expect(writes(sent)).toHaveLength(0)
    await confirmAlert('Revoke')
    expect(await screen.findByText('Confirm it’s you')).toBeTruthy()
    expect(writes(sent)[0]?.url).toBe('/tenants/acme/invitations/i1')
  })

  it('revoke toasts on success', async () => {
    serveInvitations()
    await renderList()
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Revoke invitation to i1@example.com' })
    )
    await confirmAlert('Revoke')
    await waitFor(() => {
      expect(toasts()).toContain('Invitation to i1@example.com revoked.')
    })
  })

  it('an admin cannot resend or revoke an invitation for a role it cannot grant', async () => {
    serveInvitations({ rows: [invitation('i1', { role: 'admin' }), invitation('i2')] })
    await renderList('admin')
    expect(
      await screen.findByRole('button', { name: 'Resend, invitation to i1@example.com' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Revoke invitation to i1@example.com' })
    ).toBeDisabled()
    expect(
      screen.getAllByText('Only an owner can resend or revoke an invitation for this role.')
    ).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: 'Resend, invitation to i2@example.com' })
    ).not.toBeDisabled()
  })

  it('staff see the list read-only', async () => {
    serveInvitations()
    await renderList('owner', true)
    expect(await screen.findByText('i1@example.com')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Resend/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Revoke/ })).toBeNull()
  })
})

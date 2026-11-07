import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { StepUpProvider } from '@/components/step-up/step-up-provider'
import { InviteForm } from '@/components/workspace-settings/invite-form'
import type { MembershipRole } from '@/constants/roles'
import { clientSettingsKeys } from '@/queries/client-settings.queries'
import { useAuthStore } from '@/states/auth.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { bodyOf, renderScreen, restoreApi, serve, type FakeAnswer } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { REAUTH_ANSWER, tokenWith } from '@/tests/support/step-up'
import { envelope } from '@/tests/support/workspace-api'

/**
 * Builds an error answer in express's envelope.
 * @param status - The HTTP status.
 * @param code - The error code.
 * @param message - The server's message.
 * @param details - Extra detail, when the refusal carries some.
 * @returns The answer.
 */
function refusal(status: number, code: string, message: string, details?: unknown): FakeAnswer {
  return { status, data: { success: false, statusCode: status, code, message, details } }
}

/** The members limit refusal: 402 with its counts. */
const AT_LIMIT = refusal(402, 'PLAN_LIMIT_REACHED', 'Limit reached', {
  key: 'members',
  used: 5,
  limit: 5,
})

/** The entitlements of a workspace on the Free plan with `used` of 5 members. */
function entitlements(used: number) {
  return {
    plan: { key: 'free', name: 'Free' },
    features: {},
    limits: { members: { limit: 5, used, approaching: false } },
  }
}

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
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
})

/**
 * Serves the invite route and the entitlements.
 * @param post - The answer to the invite.
 * @param used - Members in use.
 * @returns The requests seen.
 */
function serveInvite(
  post: FakeAnswer = { status: 202, data: { success: true, data: null } },
  used = 2
) {
  return serve((config) => {
    const method = (config.method ?? 'get').toUpperCase()
    const url = config.url ?? ''
    if (method === 'POST' && url === '/tenants/acme/invitations') return post
    if (url === '/tenants/acme/entitlements') return envelope(entitlements(used))
    if (url === '/status/client-settings') {
      return envelope({ invitationTtlSeconds: 259_200 })
    }
    return { status: 404, data: { success: false, message: 'Not found' } }
  })
}

/**
 * Renders the form inside the step-up provider.
 * @param role - The viewer's role.
 */
async function renderForm(role: MembershipRole = 'owner') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(clientSettingsKeys.all, { invitationTtlSeconds: 259_200 })
  await renderScreen(
    <StepUpProvider>
      <InviteForm slug="acme" myRole={role} />
    </StepUpProvider>,
    client
  )
}

/**
 * Types an address and presses Invite member.
 * @param email - The address.
 */
async function invite(email: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email)
  await fireEvent.press(screen.getByRole('button', { name: 'Invite member' }))
}

/** The invite requests among those seen. */
function posts(sent: ReturnType<typeof serve>) {
  return sent.filter((config) => config.method === 'post')
}

describe('InviteForm', () => {
  it('says how long an invitation lasts', async () => {
    serveInvite()
    await renderForm()
    expect(
      await screen.findByText(
        'We email them an invitation that expires in 3 days. After they select Join, we email them a link to confirm.'
      )
    ).toBeTruthy()
  })

  it('sends the address and the default role, then toasts and clears the field', async () => {
    const sent = serveInvite()
    await renderForm()
    await invite('ada@example.com')
    await waitFor(() => {
      expect(useToastQueueStore.getState().toasts.map((toast) => toast.title)).toContain(
        'Invitation sent to ada@example.com.'
      )
    })
    expect(bodyOf(posts(sent)[0])).toEqual({ email: 'ada@example.com', role: 'viewer' })
    expect(screen.getByLabelText('Email').props.value).toBe('')
  })

  it('offers an admin only the roles an admin may grant', async () => {
    serveInvite()
    await renderForm('admin')
    await fireEvent.press(screen.getByRole('button', { name: 'Role: Viewer' }))
    expect(await screen.findByRole('header', { name: 'Role' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Manager' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Editor' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Owner' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Admin' })).toBeNull()
  })

  it('sends the chosen role', async () => {
    const sent = serveInvite()
    await renderForm()
    await fireEvent.press(screen.getByRole('button', { name: 'Role: Viewer' }))
    await fireEvent.press(await screen.findByRole('radio', { name: 'Editor' }))
    await invite('ada@example.com')
    await waitFor(() => {
      expect(posts(sent)).toHaveLength(1)
    })
    expect(bodyOf(posts(sent)[0])).toEqual({ email: 'ada@example.com', role: 'editor' })
  })

  it('refuses a bad address before sending', async () => {
    const sent = serveInvite()
    await renderForm()
    await invite('ada@localhost')
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
    expect(posts(sent)).toHaveLength(0)
  })

  it('an invite at the limit says so', async () => {
    serveInvite(AT_LIMIT)
    await renderForm()
    await invite('ada@example.com')
    expect(await screen.findByText('Not sent. You’re at the members limit.')).toBeTruthy()
  })

  it('a 402 without counts shows the app’s copy, never the server’s', async () => {
    serveInvite(refusal(402, 'PLAN_LIMIT_REACHED', 'Upgrade to add more.'))
    await renderForm()
    await invite('ada@example.com')
    expect(await screen.findByText('Not sent. You’re at the members limit.')).toBeTruthy()
    expect(screen.queryByText(/upgrade/i)).toBeNull()
  })

  it('already_member shows on the email field', async () => {
    serveInvite(refusal(409, 'already_member', 'That person is already a member.'))
    await renderForm()
    await invite('ada@example.com')
    expect(await screen.findByText('That person is already a member.')).toBeTruthy()
    expect(screen.getByLabelText('Email').props.accessibilityHint).toBe(
      'That person is already a member.'
    )
  })

  it('invitation_conflict points to the pending list', async () => {
    serveInvite(refusal(409, 'invitation_conflict', 'Conflict'))
    await renderForm()
    await invite('ada@example.com')
    expect(
      await screen.findByText(
        'Another member invited this address first. Their invitation is under Pending invitations.'
      )
    ).toBeTruthy()
  })

  it('a field error clears when the address changes', async () => {
    serveInvite(refusal(409, 'already_member', 'That person is already a member.'))
    await renderForm()
    await invite('ada@example.com')
    await screen.findByText('That person is already a member.')
    await fireEvent.changeText(screen.getByLabelText('Email'), 'bob@example.com')
    expect(screen.queryByText('That person is already a member.')).toBeNull()
  })

  it('shows any other refusal with the server’s message', async () => {
    serveInvite(refusal(429, 'RATE_LIMITED', 'Too many invitations. Try later.'))
    await renderForm()
    await invite('ada@example.com')
    expect(await screen.findByText('Too many invitations. Try later.')).toBeTruthy()
  })

  it('runs the invite through step-up', async () => {
    const sent = serveInvite(REAUTH_ANSWER)
    await renderForm()
    await invite('ada@example.com')
    expect(await screen.findByText('Confirm it’s you')).toBeTruthy()
    expect(posts(sent)).toHaveLength(1)
  })

  it('a cancelled step-up shows inline and queues no toast', async () => {
    serveInvite(REAUTH_ANSWER)
    await renderForm()
    await invite('ada@example.com')
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Confirm it’s you to continue.')).toBeTruthy()
    expect(useToastQueueStore.getState().toasts).toHaveLength(0)
  })

  it('sends one invite for two quick presses', async () => {
    const sent = serveInvite()
    await renderForm()
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ada@example.com')
    const button = screen.getByRole('button', { name: 'Invite member' })
    await fireEvent.press(button)
    await fireEvent.press(button)
    await waitFor(() => {
      expect(posts(sent)).toHaveLength(1)
    })
  })

  describe('the members limit note', () => {
    it('says the counts at the limit, with no upgrade action', async () => {
      serveInvite(undefined, 5)
      await renderForm()
      expect(await screen.findByText('You’ve used 5 of 5 members on Free.')).toBeTruthy()
      expect(screen.queryByText(/Upgrade/)).toBeNull()
    })

    it('says how many to remove past the limit', async () => {
      serveInvite(undefined, 7)
      await renderForm()
      expect(
        await screen.findByText('7 of 5 members on Free. Remove 2 to invite more.')
      ).toBeTruthy()
    })

    it('shows nothing below the limit', async () => {
      serveInvite(undefined, 2)
      await renderForm()
      await screen.findByText(/We email them/)
      await waitFor(() => {
        expect(screen.queryByText(/members on Free/)).toBeNull()
      })
    })
  })
})

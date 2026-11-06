import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Alert, type AlertButton } from 'react-native'
import { GettingStarted } from '@/components/workspaces/getting-started'
import type { MembershipRole } from '@/constants/roles'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { renderScreen, restoreApi, type FakeAnswer } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import {
  envelope,
  NOT_FOUND,
  onboarding,
  serveWorkspace,
  step,
} from '@/tests/support/workspace-api'
import type { TenantAccess } from '@/types/api.types'

const LOAD_ERROR = 'We couldn’t load getting started because the request failed. Select Try again.'

/**
 * Renders the checklist for a viewer.
 * @param role - The viewer's role.
 * @param access - How they reached the workspace.
 */
async function open(role: MembershipRole = 'owner', access: TenantAccess = 'member') {
  return renderScreen(<GettingStarted slug="acme" role={role} access={access} />)
}

/** Serves the onboarding route with `body`. */
function serveOnboarding(body: unknown, more: Record<string, FakeAnswer> = {}) {
  return serveWorkspace({ 'GET /tenants/acme/onboarding': envelope(body), ...more })
}

beforeEach(() => {
  useToastQueueStore.setState({ toasts: [] } as never)
})

afterEach(() => {
  restoreApi()
  jest.restoreAllMocks()
})

describe('GettingStarted', () => {
  it('shows the in-progress checklist', async () => {
    serveOnboarding(
      onboarding({
        steps: [
          step('profile', { title: 'Add a profile', completedAt: '2026-01-06T00:00:00Z' }),
          step('tour', { title: 'Take the tour', required: false }),
        ],
        requiredDone: 1,
        requiredTotal: 2,
      })
    )
    await open()
    expect(await screen.findByText('Getting started')).toBeTruthy()
    expect(screen.getByText('1 of 2 required')).toBeTruthy()
    expect(screen.getByText('Add a profile')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByText('Not done')).toBeTruthy()
    expect(screen.getByText('Optional')).toBeTruthy()
  })

  it('renders nothing for a 404 and for not_tracked', async () => {
    serveWorkspace({ 'GET /tenants/acme/onboarding': NOT_FOUND })
    const first = await open()
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading getting started')).toBeNull()
    })
    expect(screen.queryByText('Getting started')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await first.unmount()

    serveOnboarding(onboarding({ state: 'not_tracked' }))
    await open()
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading getting started')).toBeNull()
    })
    expect(screen.queryByText('Getting started')).toBeNull()
  })

  it('shows LoadError for a failed load, and retries', async () => {
    const sent = serveWorkspace({
      'GET /tenants/acme/onboarding': { status: 500, data: { success: false } },
    })
    await open()
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy()
    const before = sent.length
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => {
      expect(sent.length).toBeGreaterThan(before)
    })
  })

  it('shows the all-set card within 24 hours of completion, and nothing later', async () => {
    serveOnboarding(
      onboarding({ state: 'complete', completedAt: new Date(Date.now() - 3600_000).toISOString() })
    )
    const first = await open()
    expect(await screen.findByText('You’re all set')).toBeTruthy()
    expect(screen.getByText('Every required getting started step is done.')).toBeTruthy()
    await first.unmount()

    serveOnboarding(
      onboarding({
        state: 'complete',
        completedAt: new Date(Date.now() - 25 * 3600_000).toISOString(),
      })
    )
    await open()
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading getting started')).toBeNull()
    })
    expect(screen.queryByText('You’re all set')).toBeNull()
  })

  it('marks a manual step done and raises the toast', async () => {
    const sent = serveOnboarding(
      onboarding({ steps: [step('profile', { title: 'Add a profile' })] })
    )
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'Mark done' }))
    await waitFor(() => {
      expect(useToastQueueStore.getState().toasts.map((t) => t.title)).toEqual([
        '“Add a profile” marked done.',
      ])
    })
    expect(
      sent.some(
        (r) => r.method === 'post' && r.url === '/tenants/acme/onboarding/steps/profile/complete'
      )
    ).toBe(true)
  })

  it('raises an error toast when Mark done fails', async () => {
    serveOnboarding(onboarding(), {
      'POST /tenants/acme/onboarding/steps/profile/complete': {
        status: 409,
        data: { success: false, message: 'Already done.' },
      },
    })
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'Mark done' }))
    await waitFor(() => {
      expect(useToastQueueStore.getState().toasts).toHaveLength(1)
    })
    expect(useToastQueueStore.getState().toasts[0]?.type).toBe('error')
  })

  it('tells a non-admin a workspace step is for an owner or admin, and offers Mark done for a member step', async () => {
    serveOnboarding(
      onboarding({
        steps: [
          step('profile', { title: 'Workspace step' }),
          step('mine', { title: 'My step', scope: 'member' }),
        ],
      })
    )
    await open('viewer')
    expect(await screen.findByText('An owner or admin can do this')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Mark done' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('lets staff with platform access read, with no buttons', async () => {
    serveOnboarding(onboarding({ steps: [step('profile', { title: 'Add a profile' })] }))
    await open('owner', 'platform')
    expect(await screen.findByText('Add a profile')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('An owner or admin can do this')).toBeNull()
  })

  it('shows no link for the steps that need Settings or Members', async () => {
    serveOnboarding(
      onboarding({
        steps: [
          step('configure_settings', { title: 'Configure', kind: 'auto' }),
          step('invite_teammate', { title: 'Invite', kind: 'auto' }),
        ],
        requiredTotal: 2,
      })
    )
    await open()
    expect(await screen.findByText('Configure')).toBeTruthy()
    expect(screen.queryByText('Open settings')).toBeNull()
    expect(screen.queryByText('Open members')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark done' })).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('confirms Dismiss with an alert, then dismisses', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const sent = serveOnboarding(onboarding())
    await open('owner')
    await fireEvent.press(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(alert).toHaveBeenCalledWith(
      'Dismiss getting started?',
      'The checklist is hidden for everyone in this workspace. An owner can show it again from this page.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Dismiss', style: 'destructive', onPress: expect.any(Function) },
      ]
    )
    expect(sent.some((r) => r.url?.endsWith('/dismiss'))).toBe(false)
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[]
    buttons[1]?.onPress?.()
    await waitFor(() => {
      expect(useToastQueueStore.getState().toasts.map((t) => t.title)).toEqual([
        'Getting started dismissed.',
      ])
    })
    expect(
      sent.some((r) => r.method === 'post' && r.url === '/tenants/acme/onboarding/dismiss')
    ).toBe(true)
  })

  it('shows the owner a way back after a dismissal, and nobody else anything', async () => {
    serveOnboarding(onboarding({ state: 'dismissed', dismissedAt: '2026-01-06T00:00:00Z' }))
    const sent = serveWorkspace({
      'GET /tenants/acme/onboarding': envelope(
        onboarding({ state: 'dismissed', dismissedAt: '2026-01-06T00:00:00Z' })
      ),
    })
    const first = await open('owner')
    expect(await screen.findByText('Getting started is hidden for this workspace.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Show getting started' }))
    await waitFor(() => {
      expect(useToastQueueStore.getState().toasts.map((t) => t.title)).toEqual([
        'Getting started shown.',
      ])
    })
    expect(sent.some((r) => r.url === '/tenants/acme/onboarding/undismiss')).toBe(true)
    await first.unmount()

    await open('admin')
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading getting started')).toBeNull()
    })
    expect(screen.queryByText('Getting started is hidden for this workspace.')).toBeNull()
  })
})

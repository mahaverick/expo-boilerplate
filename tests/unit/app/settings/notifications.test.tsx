import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import Notifications from '@/app/(app)/settings/account/notifications'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { bodyOf, renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { envelope } from '@/tests/support/workspace-api'

/** The matrix the server holds. */
const MATRIX = [
  { notificationType: 'billing_payment_failed', emailEnabled: true, inAppEnabled: true },
  { notificationType: 'workspace_full', emailEnabled: false, inAppEnabled: false },
]

/**
 * A promise and the function that settles it.
 * @returns The promise and its release.
 */
function deferred() {
  const holder: { release?: () => void } = {}
  const promise = new Promise<void>(
    /** Hands the resolver out. */
    (resolve) => {
      holder.release = resolve
    }
  )
  return { promise, release: () => holder.release?.() }
}

beforeEach(() => {
  useToastQueueStore.getState().remove()
})

afterEach(() => {
  restoreApi()
})

describe('Notifications screen', () => {
  it('shows the copy and each type’s email state', async () => {
    serve(() => envelope({ preferences: MATRIX }))
    await renderScreen(<Notifications />)
    expect(await screen.findByText('Payment failed')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Notifications' })).toBeTruthy()
    expect(
      screen.getByText(
        'How each kind of notification reaches you. Email can’t be turned off for a kind that sends it; the in-app copy can.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Email: On')).toBeTruthy()
    expect(screen.getByText('Email: Never sent')).toBeTruthy()
    expect(screen.getByLabelText('Payment failed: In-app').props.value).toBe(true)
    expect(screen.getByLabelText('Workspace full: In-app').props.value).toBe(false)
  })

  it('calls a plan request "Plan request" and shows no upgrade text', async () => {
    serve(() =>
      envelope({
        preferences: [
          { notificationType: 'billing_upgrade_requested', emailEnabled: true, inAppEnabled: true },
        ],
      })
    )
    await renderScreen(<Notifications />)
    expect(await screen.findByText('Plan request')).toBeTruthy()
    expect(screen.getByLabelText('Plan request: In-app')).toBeTruthy()
    expect(screen.queryByText(/upgrade/i)).toBeNull()
    expect(screen.queryByLabelText(/upgrade/i)).toBeNull()
  })

  it('sends emailEnabled true for an email type and keeps the in-app-only value', async () => {
    const sent = serve((config) =>
      config.method === 'put'
        ? envelope({ preferences: MATRIX })
        : envelope({ preferences: MATRIX })
    )
    await renderScreen(<Notifications />)
    await fireEvent(await screen.findByLabelText('Payment failed: In-app'), 'valueChange', false)
    await waitFor(() => expect(sent.filter((c) => c.method === 'put')).toHaveLength(1))
    await fireEvent(screen.getByLabelText('Workspace full: In-app'), 'valueChange', true)
    await waitFor(() => expect(sent.filter((c) => c.method === 'put')).toHaveLength(2))
    const puts = sent.filter((c) => c.method === 'put')
    expect(bodyOf(puts[0])).toEqual({
      preferences: [
        { notificationType: 'billing_payment_failed', emailEnabled: true, inAppEnabled: false },
      ],
    })
    expect(bodyOf(puts[1])).toEqual({
      preferences: [
        { notificationType: 'workspace_full', emailEnabled: false, inAppEnabled: true },
      ],
    })
  })

  it('disables a pending row’s switch and shows the requested value', async () => {
    const { promise: gate, release } = deferred()
    serve(async (config) => {
      if (config.method === 'put') await gate
      return envelope({ preferences: MATRIX })
    })
    await renderScreen(<Notifications />)
    await fireEvent(await screen.findByLabelText('Payment failed: In-app'), 'valueChange', false)
    await waitFor(() => {
      const pending = screen.getByLabelText('Payment failed: In-app')
      expect(pending.props.value).toBe(false)
      expect(pending.props.disabled).toBe(true)
    })
    expect(screen.getByLabelText('Workspace full: In-app').props.disabled).toBeFalsy()
    release()
    await waitFor(() =>
      expect(screen.getByLabelText('Payment failed: In-app').props.disabled).toBeFalsy()
    )
  })

  it('a failed write toasts and the switch returns to the server value', async () => {
    serve((config) =>
      config.method === 'put'
        ? { status: 500, data: { success: false, message: 'Server broke', code: 'INTERNAL' } }
        : envelope({ preferences: MATRIX })
    )
    await renderScreen(<Notifications />)
    await fireEvent(await screen.findByLabelText('Payment failed: In-app'), 'valueChange', false)
    await waitFor(() => expect(useToastQueueStore.getState().toasts.length).toBeGreaterThan(0))
    await waitFor(() => {
      const row = screen.getByLabelText('Payment failed: In-app')
      expect(row.props.value).toBe(true)
      expect(row.props.disabled).toBeFalsy()
    })
  })

  it('a failed load shows the error, not the empty state', async () => {
    serve(() => ({ status: 500, data: { success: false, message: 'Down', code: 'INTERNAL' } }))
    await renderScreen(<Notifications />)
    expect(
      await screen.findByText(
        'We couldn’t load your notification preferences, so none are shown. Select Try again to load them.'
      )
    ).toBeTruthy()
    expect(screen.queryByText('This account has no notification types yet.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('shows the empty state when the server lists no types', async () => {
    serve(() => envelope({ preferences: [] }))
    await renderScreen(<Notifications />)
    expect(await screen.findByText('This account has no notification types yet.')).toBeTruthy()
  })
})

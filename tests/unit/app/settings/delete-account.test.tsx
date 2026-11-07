import { jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import DeleteAccount from '@/app/(app)/settings/account/delete'
import { broadcastAuthMessage, resetSessionForTests } from '@/http/session'
import { formatDate, formatDateTime } from '@/lib/format'
import { useAuthStore } from '@/states/auth.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { bodyOf, restoreApi, serve, type FakeAnswer } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { REAUTH_ANSWER, renderCaller, tokenWith } from '@/tests/support/step-up'
import { envelope } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}))

/** The `auth_time` of the token held when each test starts. */
const OLD_AUTH_TIME = 1_000

/** The open request express answers with. */
const REQUEST = {
  requestedAt: '2026-11-07T10:00:00.000Z',
  dueAt: '2026-12-07T10:00:00.000Z',
}

/** The client settings the app holds. */
const SETTINGS = { supportEmail: 'help@x.com' }

/** The Alert spy. */
let alert: jest.SpiedFunction<typeof Alert.alert>

beforeEach(() => {
  resetSessionForTests()
  useToastQueueStore.getState().remove()
  useAuthStore.getState().login(tokenWith(OLD_AUTH_TIME), {
    id: 'u1',
    email: 'ada@example.com',
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
  jest.clearAllMocks()
})

/**
 * The toast titles raised so far.
 * @returns The titles, in order.
 */
function toasts(): string[] {
  return useToastQueueStore.getState().toasts.map((t) => t.title)
}

/**
 * Serves the read and the request.
 * @param open - What the GET answers.
 * @param post - What the POST answers; one answer, or a function of the call number.
 * @returns The requests seen.
 */
function serveAll(
  open: unknown,
  post: FakeAnswer | ((call: number) => FakeAnswer) = {
    status: 201,
    data: { success: true, message: 'Receipt sent.', data: REQUEST },
  }
) {
  let calls = 0
  return serve((config) => {
    if (config.url === '/status/client-settings') return envelope({ supportEmail: 'help@x.com' })
    if (config.method === 'get')
      return open === 'fail' ? { status: 500, data: {} } : envelope({ request: open })
    if (config.url === '/auth/step-up/link/request') {
      return envelope({
        resendAvailableAt: '2026-11-07T10:01:00.000Z',
        expiresAt: '2026-11-07T10:15:00.000Z',
      })
    }
    calls += 1
    return typeof post === 'function' ? post(calls) : post
  })
}

/**
 * The POSTs seen.
 * @param sent - Every request.
 * @returns The posts.
 */
function posts(sent: ReturnType<typeof serve>) {
  return sent.filter((c) => c.method === 'post' && c.url === '/account/deletion-request')
}

/** Presses the Alert's Send request button. */
async function sendRequest(times = 1) {
  const buttons = alert.mock.calls[0]?.[2]
  const send = buttons?.find((b) => b.text === 'Send request')
  await act(async () => {
    for (let i = 0; i < times; i += 1) send?.onPress?.()
    await Promise.resolve()
  })
}

describe('Delete account screen', () => {
  it('with no request, shows the explanation, the form and What we delete', async () => {
    serveAll(null)
    await renderCaller(<DeleteAccount />, SETTINGS)
    expect(await screen.findByRole('button', { name: 'Request deletion' })).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Delete account' })).toBeTruthy()
    expect(
      screen.getByText(
        'Ask us to delete your account. Our team deletes it within 30 days and emails you when it’s done. If you’re the only owner of a workspace or pay for a running subscription, we can’t delete it until that’s settled.'
      )
    ).toBeTruthy()
    expect(screen.getByLabelText('Why are you leaving?').props.maxLength).toBe(500)
    expect(screen.getByText('Optional. Up to 500 characters.')).toBeTruthy()
    expect(screen.getByText('We send the confirmation to ada@example.com.')).toBeTruthy()
    expect(screen.getByText('What we delete')).toBeTruthy()
    expect(screen.getByText(/we remove its Google sign-in link\.$/)).toBeTruthy()
    expect(screen.getByText(/^We keep our audit log/)).toBeTruthy()
  })

  it('Request deletion opens the Alert, and Send request posts the trimmed reason', async () => {
    const sent = serveAll(null)
    await renderCaller(<DeleteAccount />, SETTINGS)
    await fireEvent.changeText(await screen.findByLabelText('Why are you leaving?'), '  Too busy ')
    await fireEvent.press(screen.getByRole('button', { name: 'Request deletion' }))
    expect(alert).toHaveBeenCalledTimes(1)
    const [title, text, buttons] = alert.mock.calls[0] ?? []
    expect(title).toBe('Ask us to delete your account?')
    expect(text).toBe(
      'Our team deletes it by the date in your receipt email, at most 30 days from now. You stay signed in until then. If you’re the only owner of a workspace or pay for a running subscription, we can’t delete it until that’s settled. To withdraw the request, write to help@x.com.'
    )
    expect(buttons?.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Send request', 'destructive'],
    ])
    expect(posts(sent)).toHaveLength(0)
    await sendRequest()
    await waitFor(() => expect(posts(sent)).toHaveLength(1))
    expect(bodyOf(posts(sent)[0])).toEqual({ reason: 'Too busy' })
  })

  it('a blank reason sends {}', async () => {
    const sent = serveAll(null)
    await renderCaller(<DeleteAccount />, SETTINGS)
    await fireEvent.changeText(await screen.findByLabelText('Why are you leaving?'), '   ')
    await fireEvent.press(screen.getByRole('button', { name: 'Request deletion' }))
    await sendRequest()
    await waitFor(() => expect(posts(sent)).toHaveLength(1))
    expect(bodyOf(posts(sent)[0])).toEqual({})
  })

  it('posts once, and shows the open request after a 200', async () => {
    const sent = serveAll(null, {
      status: 200,
      data: {
        success: true,
        message: 'We emailed you a receipt when you asked.',
        data: REQUEST,
      },
    })
    await renderCaller(<DeleteAccount />, SETTINGS)
    await fireEvent.press(await screen.findByRole('button', { name: 'Request deletion' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Request deletion' }))
    expect(alert).toHaveBeenCalledTimes(1)
    await sendRequest(2)
    await waitFor(() => expect(toasts()).toEqual(['We emailed you a receipt when you asked.']))
    expect(posts(sent)).toHaveLength(1)
    const due = formatDateTime(REQUEST.dueAt) ?? ''
    expect(
      screen.getByText(
        `You asked us to delete your account on ${formatDate(REQUEST.requestedAt, 'long') ?? ''}. We’ll delete it by ${due}. To withdraw the request, write to help@x.com before then.`
      )
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Request deletion' })).toBeNull()
    expect(screen.getByText('What we delete')).toBeTruthy()
  })

  it('an open request shows its dates instead of the form', async () => {
    serveAll(REQUEST)
    await renderCaller(<DeleteAccount />, SETTINGS)
    expect(await screen.findByText(/^You asked us to delete your account on /)).toBeTruthy()
    expect(screen.queryByLabelText('Why are you leaving?')).toBeNull()
  })

  it.each([
    [
      'Cancel',
      (call: Parameters<typeof Alert.alert>) => {
        call[2]?.find((b) => b.text === 'Cancel')?.onPress?.()
      },
    ],
    [
      'a dismiss',
      (call: Parameters<typeof Alert.alert>) => {
        call[3]?.onDismiss?.()
      },
    ],
  ])('%s in the Alert lets Request deletion open it again', async (_name, close) => {
    const sent = serveAll(null)
    await renderCaller(<DeleteAccount />, SETTINGS)
    await fireEvent.press(await screen.findByRole('button', { name: 'Request deletion' }))
    expect(alert).toHaveBeenCalledTimes(1)
    await act(() => {
      close(alert.mock.calls[0] as Parameters<typeof Alert.alert>)
    })
    await fireEvent.press(screen.getByRole('button', { name: 'Request deletion' }))
    expect(alert).toHaveBeenCalledTimes(2)
    expect(posts(sent)).toHaveLength(0)
  })

  it('announces the open request politely', async () => {
    serveAll(REQUEST)
    await renderCaller(<DeleteAccount />, SETTINGS)
    const line = await screen.findByText(/^You asked us to delete your account on /)
    expect(line.props.accessibilityLiveRegion).toBe('polite')
  })

  it('a step-up Cancel shows the refusal inline and keeps the reason', async () => {
    serveAll(null, REAUTH_ANSWER)
    await renderCaller(<DeleteAccount />, SETTINGS)
    await fireEvent.changeText(await screen.findByLabelText('Why are you leaving?'), 'Too busy')
    await fireEvent.press(screen.getByRole('button', { name: 'Request deletion' }))
    await sendRequest()
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Confirm it’s you to continue.')).toBeTruthy()
    expect(toasts()).toEqual([])
    expect(screen.getByLabelText('Why are you leaving?').props.value).toBe('Too busy')
  })

  it('a confirmed step-up retries and shows the open request', async () => {
    const sent = serveAll(null, (call) =>
      call === 1
        ? REAUTH_ANSWER
        : { status: 201, data: { success: true, message: '', data: REQUEST } }
    )
    await renderCaller(<DeleteAccount />, SETTINGS)
    await fireEvent.press(await screen.findByRole('button', { name: 'Request deletion' }))
    await sendRequest()
    await fireEvent.press(await screen.findByRole('button', { name: 'Email me a link' }))
    await screen.findByText('Check your email. Open the link on this phone to continue.')
    await act(() => {
      useAuthStore.getState().setToken(tokenWith(OLD_AUTH_TIME + 60, 'b'))
      broadcastAuthMessage('step_up_confirmed')
    })
    await waitFor(() =>
      expect(toasts()).toEqual(['We’ve got your request. Check your email for a receipt.'])
    )
    expect(posts(sent)).toHaveLength(2)
    expect(await screen.findByText(/^You asked us to delete your account on /)).toBeTruthy()
  })

  it('another failure shows inline', async () => {
    serveAll(null, {
      status: 500,
      data: { success: false, message: 'Server broke', code: 'INTERNAL' },
    })
    await renderCaller(<DeleteAccount />, SETTINGS)
    await fireEvent.press(await screen.findByRole('button', { name: 'Request deletion' }))
    await sendRequest()
    expect(await screen.findByText('Server broke')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Request deletion' })).toBeTruthy()
  })

  it('a failed read shows the load error, never the form', async () => {
    serveAll('fail')
    await renderCaller(<DeleteAccount />, SETTINGS)
    expect(
      await screen.findByText(
        'We couldn’t load your deletion request. Select Try again to load it.'
      )
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Request deletion' })).toBeNull()
    expect(screen.queryByLabelText('Why are you leaving?')).toBeNull()
  })
})

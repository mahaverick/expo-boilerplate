import { jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import Security from '@/app/(app)/settings/account/security'
import { broadcastAuthMessage, resetSessionForTests } from '@/http/session'
import { formatDate } from '@/lib/format'
import { relativeTime } from '@/lib/relative-time'
import { useAuthStore } from '@/states/auth.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { restoreApi, serve, type FakeAnswer } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { REAUTH_ANSWER, renderCaller, tokenWith } from '@/tests/support/step-up'
import { envelope } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }))

/** The `auth_time` of the token held when each test starts. */
const OLD_AUTH_TIME = 1_000

/** A recent instant, so "Last active" reads the same in every run. */
const LAST_USED = new Date(Date.now() - 3 * 3_600_000).toISOString()

/** The devices the API sends, newest use first. */
const SESSIONS = [
  {
    id: 'a',
    client: 'native',
    deviceName: 'Pixel 9',
    createdAt: '2026-10-01T12:00:00.000Z',
    lastUsedAt: LAST_USED,
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
  {
    id: 'c',
    client: 'native',
    deviceName: '',
    createdAt: '2026-08-01T12:00:00.000Z',
    lastUsedAt: '2026-08-02T12:00:00.000Z',
    current: false,
  },
]

/** The methods the API sends: email, and Google. */
const PROVIDERS = {
  providers: [
    { provider: 'email', linkedAt: '2026-01-01T00:00:00.000Z' },
    { provider: 'google', linkedAt: '2026-01-02T00:00:00.000Z' },
    { provider: 'github', linkedAt: '2026-01-03T00:00:00.000Z' },
  ],
}

/** A step-up link request's 202. */
const LINK_SENT: FakeAnswer = {
  status: 202,
  data: {
    success: true,
    data: {
      resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
  },
}

/** A failed answer. */
const FAILED: FakeAnswer = {
  status: 500,
  data: { success: false, message: 'Server broke', code: 'INTERNAL' },
}

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
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
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
 * Serves both lists and the revoke.
 * @param revoke - What the revoke answers; one answer, or a function of the call number.
 * @returns The requests seen.
 */
function serveAll(revoke: FakeAnswer | ((call: number) => FakeAnswer) = envelope({ revoked: 2 })) {
  let calls = 0
  return serve((config) => {
    if (config.url === '/auth/providers') return envelope(PROVIDERS)
    if (config.url === '/auth/sessions') return envelope(SESSIONS)
    if (config.url === '/auth/step-up/link/request') return LINK_SENT
    calls += 1
    return typeof revoke === 'function' ? revoke(calls) : revoke
  })
}

describe('Security screen', () => {
  it('shows the sign-in methods', async () => {
    serveAll()
    await renderCaller(<Security />)
    expect(await screen.findByText('Email link (ada@example.com)')).toBeTruthy()
    expect(screen.getByText('Google')).toBeTruthy()
    expect(screen.getByText('github')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Security' })).toBeTruthy()
    expect(screen.getByText('Sign-in methods')).toBeTruthy()
  })

  it('lists devices in the API’s order and tags the current one', async () => {
    serveAll()
    await renderCaller(<Security />)
    await screen.findByText('Pixel 9')
    const names = screen.getAllByTestId('device-name').map((n) => n.props.children as string)
    expect(names).toEqual(['Pixel 9', 'Web browser', 'Unknown device'])
    expect(screen.getAllByText('This device')).toHaveLength(1)
    expect(screen.getByText(`Last active ${relativeTime(LAST_USED)}`)).toBeTruthy()
    expect(
      screen.getByText(`Signed in ${formatDate('2026-10-01T12:00:00.000Z', 'medium') ?? ''}`)
    ).toBeTruthy()
  })

  it('never puts the device name in a label', async () => {
    serveAll()
    await renderCaller(<Security />)
    await screen.findByText('Pixel 9')
    expect(screen.queryByLabelText('Pixel 9')).toBeNull()
    expect(screen.queryByLabelText(/Pixel 9/)).toBeNull()
  })

  it('a failed load shows the error, not the empty state, for the methods', async () => {
    serve((config) => (config.url === '/auth/providers' ? FAILED : envelope(SESSIONS)))
    await renderCaller(<Security />)
    expect(
      await screen.findByText(
        'We couldn’t load your sign-in methods. Select Try again to load them.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Pixel 9')).toBeTruthy()
  })

  it('a failed load shows the error, not the empty state, for the devices', async () => {
    serve((config) => (config.url === '/auth/sessions' ? FAILED : envelope(PROVIDERS)))
    await renderCaller(<Security />)
    expect(
      await screen.findByText(
        'We couldn’t load your signed-in devices. Select Try again to load them.'
      )
    ).toBeTruthy()
    expect(screen.queryByText('Unknown device')).toBeNull()
    expect(screen.getByText('Google')).toBeTruthy()
  })

  it.each([
    [0, 'You have no other sessions.'],
    [1, 'Signed out 1 other session.'],
    [2, 'Signed out 2 other sessions.'],
  ])('revoking %i other sessions toasts the count', async (revoked, message) => {
    const sent = serveAll(envelope({ revoked }))
    await renderCaller(<Security />)
    await screen.findByText('Pixel 9')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out other devices' }))
    await waitFor(() => expect(toasts()).toEqual([message]))
    const revokes = sent.filter((c) => c.url === '/auth/sessions/revoke-others')
    expect(revokes).toHaveLength(1)
    expect(revokes[0]?.method).toBe('post')
  })

  it('two presses in one frame post once and toast once', async () => {
    const sent = serveAll()
    await renderCaller(<Security />)
    await screen.findByText('Pixel 9')
    const button = screen.getByRole('button', { name: 'Sign out other devices' })
    await act(async () => {
      void fireEvent.press(button)
      void fireEvent.press(button)
      await Promise.resolve()
    })
    await waitFor(() => expect(toasts()).toEqual(['Signed out 2 other sessions.']))
    expect(sent.filter((c) => c.url === '/auth/sessions/revoke-others')).toHaveLength(1)
  })

  it('refetches the devices after a revoke', async () => {
    const sent = serveAll()
    await renderCaller(<Security />)
    await screen.findByText('Pixel 9')
    expect(sent.filter((c) => c.url === '/auth/sessions')).toHaveLength(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out other devices' }))
    await waitFor(() => expect(sent.filter((c) => c.url === '/auth/sessions')).toHaveLength(2))
  })

  it('a refused revoke opens the dialog, and a confirmation retries once', async () => {
    const sent = serveAll((call) => (call === 1 ? REAUTH_ANSWER : envelope({ revoked: 2 })))
    await renderCaller(<Security />)
    await screen.findByText('Pixel 9')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out other devices' }))
    await screen.findByText('Confirm it’s you')
    expect(screen.getAllByText('Waiting for you to confirm…').length).toBeGreaterThan(0)
    await fireEvent.press(await screen.findByRole('button', { name: 'Email me a link' }))
    await screen.findByText('Check your email. Open the link on this phone to continue.')
    await act(() => {
      useAuthStore.getState().setToken(tokenWith(OLD_AUTH_TIME + 60, 'b'))
      broadcastAuthMessage('step_up_confirmed')
    })
    await waitFor(() => expect(toasts()).toEqual(['Signed out 2 other sessions.']))
    expect(sent.filter((c) => c.url === '/auth/sessions/revoke-others')).toHaveLength(2)
    await waitFor(() => expect(screen.queryByText('Confirm it’s you')).toBeNull())
  })

  it('cancelling the dialog toasts the step-up refusal', async () => {
    serveAll(REAUTH_ANSWER)
    await renderCaller(<Security />)
    await screen.findByText('Pixel 9')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out other devices' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(toasts()).toEqual(['Confirm it’s you to continue.']))
  })

  it('another failure toasts the API’s message', async () => {
    serveAll(FAILED)
    await renderCaller(<Security />)
    await screen.findByText('Pixel 9')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out other devices' }))
    await waitFor(() => expect(toasts()).toEqual(['Server broke']))
  })
})

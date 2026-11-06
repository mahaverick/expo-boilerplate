import { jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { broadcastAuthMessage, resetSessionForTests } from '@/http/session'
import { refreshTokenStore } from '@/http/token-store'
import { stepUpRefusal } from '@/lib/step-up'
import { useAuthStore } from '@/states/auth.store'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { assertAccessible } from '@/tests/support/a11y'
import { restoreApi, serve, type FakeAnswer, type FakeHandler } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import {
  ACTION_PATH,
  DONE_ANSWER,
  REAUTH_ANSWER,
  renderCaller,
  tokenWith,
  type Outcome,
} from '@/tests/support/step-up'
import type { User } from '@/types/api.types'

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }))

/** The `auth_time` of the token held when each test starts. */
const OLD_AUTH_TIME = 1_000

/** The signed-in person. */
const ADA: User = {
  id: 'u1',
  email: 'ada@example.com',
  firstName: null,
  lastName: null,
  createdAt: '2026-01-01',
  platformRole: null,
  analyticsOptOut: false,
}

/** The path that mails a link. */
const LINK_PATH = '/auth/step-up/link/request'

/** When the mailed link expires, 15 minutes from the test's start. */
const EXPIRES_AT = new Date(Date.now() + 15 * 60_000).toISOString()

/**
 * A link request's 202.
 * @param resendInMs - When the resend opens, from now.
 * @param expiresAt - The link's expiry, or null for an API that names none.
 */
function linkSent(resendInMs = 60_000, expiresAt: string | null = EXPIRES_AT): FakeAnswer {
  const resendAvailableAt = new Date(Date.now() + resendInMs).toISOString()
  return {
    status: 202,
    data: {
      success: true,
      data: expiresAt === null ? { resendAvailableAt } : { resendAvailableAt, expiresAt },
    },
  }
}

/** Express's 429 inside the link cooldown. */
const COOLDOWN: FakeAnswer = {
  status: 429,
  data: {
    success: false,
    statusCode: 429,
    code: 'STEP_UP_LINK_COOLDOWN',
    message: 'We just sent a link. Wait a moment, then try again.',
  },
  headers: { 'retry-after': '42' },
}

/**
 * The refresh answer and the profile read that follows it.
 * @param authTime - The `auth_time` of the token the refresh brings.
 */
function refreshed(authTime: number): FakeHandler {
  return (config) => {
    if (config.url === '/profile') return { status: 200, data: { success: true, data: ADA } }
    return {
      status: 200,
      data: {
        success: true,
        data: { accessToken: tokenWith(authTime, 'r'), refreshToken: 'rotated' },
      },
    }
  }
}

/**
 * Serves the action, the link request and the refresh: the action is refused
 * until a token newer than the start's is held.
 * @param link - The link request's answer.
 * @param refresh - The refresh's handler.
 * @returns The requests seen.
 */
function serveAll(link: FakeAnswer, refresh: FakeHandler = refreshed(OLD_AUTH_TIME)) {
  return serve((config) => {
    if (config.url === ACTION_PATH) {
      const sent = String(config.headers.get('Authorization'))
      return sent === `Bearer ${tokenWith(OLD_AUTH_TIME)}` ? REAUTH_ANSWER : DONE_ANSWER
    }
    if (config.url === LINK_PATH) return link
    return refresh(config)
  })
}

beforeEach(async () => {
  resetSessionForTests()
  await refreshTokenStore.write('stored')
  useAuthStore.getState().login(tokenWith(OLD_AUTH_TIME), ADA)
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  useMaintenanceModeStore.setState({ mode: 'off' })
  useToastQueueStore.getState().remove()
  jest.clearAllMocks()
})

/**
 * Renders the caller, presses Act, and waits for the start view.
 * @returns The caller's outcomes.
 */
async function openDialog(): Promise<Outcome[]> {
  const outcomes = await renderCaller()
  await fireEvent.press(screen.getByRole('button', { name: 'Act' }))
  await screen.findByText('Confirm it’s you')
  return outcomes
}

/** Presses Email me a link and waits for the email view. */
async function sendLink() {
  await fireEvent.press(screen.getByRole('button', { name: 'Email me a link' }))
  await screen.findByText('Check your email. Open the link on this phone to continue.')
}

/** What the confirm screen does after it posts the link: the signal. */
async function signal() {
  await act(() => {
    broadcastAuthMessage('step_up_confirmed')
  })
}

/** The modal's prop that Android's back button calls. */
interface BackProps {
  onRequestClose: () => void
}

/** Presses Android's back button over the modal. */
async function pressBack() {
  await act(() => {
    const [modal] = screen.container.queryAll(
      (node) => typeof (node.props as Partial<BackProps>).onRequestClose === 'function'
    )
    if (!modal) throw new Error('No modal is rendered')
    ;(modal.props as BackProps).onRequestClose()
  })
}

describe('StepUpDialog', () => {
  it('the start view asks for a link and passes the accessibility harness', async () => {
    serveAll(linkSent())
    await openDialog()
    expect(
      screen.getByText(
        'This action needs a confirmation from the last 10 minutes. We’ll email you a link to open on this phone.'
      )
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    assertAccessible()
  })

  it('the email view names the address and expiry, counts down the resend, and passes the harness', async () => {
    serveAll(linkSent(65_000))
    await openDialog()
    await sendLink()
    const time = new Date(EXPIRES_AT).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    expect(
      screen.getByText(`We sent the link to ada@example.com. It expires at ${time}.`)
    ).toBeTruthy()
    const resend = screen.getByRole('button', { name: /^Resend in 1:0[45]$/ })
    expect(resend.props.accessibilityState).toMatchObject({ disabled: true })
    assertAccessible()
  })

  it('an API that names no expiry gets no expiry sentence, and an open resend reads Resend link', async () => {
    serveAll(linkSent(-1_000, null))
    await openDialog()
    await sendLink()
    expect(screen.getByText('We sent the link to ada@example.com.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resend link' })).toBeTruthy()
  })

  it('an expired link asks for a new one', async () => {
    serveAll(linkSent(-1_000, new Date(Date.now() - 1_000).toISOString()))
    await openDialog()
    await sendLink()
    expect(screen.getByText('That link expired. Send a new link to continue.')).toBeTruthy()
  })

  it('a step_up_confirmed signal with a newer auth_time retries', async () => {
    const sent = serveAll(linkSent())
    const outcomes = await openDialog()
    await sendLink()
    await act(() => {
      useAuthStore.getState().setToken(tokenWith(OLD_AUTH_TIME + 60, 'b'))
    })
    await signal()
    await waitFor(() => expect(outcomes).toEqual([{ value: 'done' }]))
    expect(sent.some((config) => config.url === '/auth/refresh')).toBe(false)
    await waitFor(() => expect(screen.queryByText('Confirm it’s you')).toBeNull())
  })

  it('one that is not newer refreshes once, then retries or returns to the email view', async () => {
    const sent = serveAll(linkSent(), refreshed(OLD_AUTH_TIME))
    const outcomes = await openDialog()
    await sendLink()
    await signal()
    await screen.findByText('Check your email. Open the link on this phone to continue.')
    await waitFor(() =>
      expect(sent.filter((config) => config.url === '/auth/refresh')).toHaveLength(1)
    )
    expect(outcomes).toEqual([])

    restoreApi()
    serveAll(linkSent(), refreshed(OLD_AUTH_TIME + 60))
    resetSessionForTests()
    await signal()
    await waitFor(() => expect(outcomes).toEqual([{ value: 'done' }]))
  })

  it('the resuming view passes the accessibility harness', async () => {
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const refresh = refreshed(OLD_AUTH_TIME + 60)
    serveAll(linkSent(), async (config) => {
      await held
      return refresh(config)
    })
    const outcomes = await openDialog()
    await sendLink()
    await signal()
    await screen.findByText('Confirmed. Continuing…')
    assertAccessible()
    await pressBack()
    expect(screen.getByText('Confirmed. Continuing…')).toBeTruthy()
    release?.()
    await waitFor(() => expect(outcomes).toEqual([{ value: 'done' }]))
  })

  it('a refresh that fails offline shows Try again, which retries', async () => {
    serveAll(linkSent(), () => 'network-error')
    const outcomes = await openDialog()
    await sendLink()
    await signal()
    await screen.findByText(
      'You confirmed, but we couldn’t reach the server. Check your connection, then select Try again.'
    )
    assertAccessible()
    restoreApi()
    serveAll(linkSent(), refreshed(OLD_AUTH_TIME + 60))
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(outcomes).toEqual([{ value: 'done' }]))
  })

  it('a refresh verdict closes the dialog and rejects with the original refusal', async () => {
    serveAll(linkSent(), () => ({
      status: 401,
      data: { success: false, statusCode: 401, code: 'INVALID_REFRESH_TOKEN', message: 'no' },
    }))
    const outcomes = await openDialog()
    await sendLink()
    await signal()
    await waitFor(() => expect(outcomes).toHaveLength(1))
    const [outcome] = outcomes
    const error = outcome && 'error' in outcome ? outcome.error : null
    expect(error).toMatchObject({ response: { status: 401, data: { code: 'REAUTH_REQUIRED' } } })
    expect(stepUpRefusal(error)).toBe('Confirm it’s you to continue.')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    await waitFor(() => expect(screen.queryByText('Confirm it’s you')).toBeNull())
  })

  it('a 429 STEP_UP_LINK_COOLDOWN moves to the email view and holds the resend', async () => {
    serveAll(COOLDOWN)
    await openDialog()
    await sendLink()
    const resend = screen.getByRole('button', { name: /^Resend in 0:4[12]$/ })
    expect(resend.props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('a resend refused by the cooldown toasts and pushes the resend out', async () => {
    let answer = linkSent(-1_000)
    serve((config) => (config.url === ACTION_PATH ? REAUTH_ANSWER : answer))
    await openDialog()
    await sendLink()
    answer = COOLDOWN
    await fireEvent.press(screen.getByRole('button', { name: 'Resend link' }))
    await screen.findByRole('button', { name: /^Resend in 0:4[12]$/ })
    expect(useToastQueueStore.getState().toasts.map((toast) => toast.title)).toEqual([
      'We just sent a link. Wait a moment, then try again.',
    ])
  })

  it('another failure on the start view shows the message in place', async () => {
    serveAll({
      status: 500,
      data: { success: false, statusCode: 500, message: 'The mail service is down.' },
    })
    await openDialog()
    await fireEvent.press(screen.getByRole('button', { name: 'Email me a link' }))
    expect(await screen.findByText('The mail service is down.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeTruthy()
  })

  it('Android back cancels the start view and does nothing while a link is out', async () => {
    serveAll(linkSent())
    const outcomes = await openDialog()
    await sendLink()
    await pressBack()
    expect(screen.getByText('Confirm it’s you')).toBeTruthy()
    expect(outcomes).toEqual([])
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(outcomes).toHaveLength(1))

    await fireEvent.press(screen.getByRole('button', { name: 'Act' }))
    await screen.findByText('Confirm it’s you')
    await pressBack()
    await waitFor(() => expect(outcomes).toHaveLength(2))
    await waitFor(() => expect(screen.queryByText('Confirm it’s you')).toBeNull())
  })

  it('hides while maintenance covers the app, and keeps its place', async () => {
    serveAll(linkSent())
    await openDialog()
    await sendLink()
    await act(() => {
      useMaintenanceModeStore.setState({ mode: 'full' })
    })
    await waitFor(() => expect(screen.queryByText('Confirm it’s you')).toBeNull())
    expect(screen.getByText('Waiting for you to confirm…')).toBeTruthy()
    await act(() => {
      useMaintenanceModeStore.setState({ mode: 'off' })
    })
    expect(
      screen.getByText('Check your email. Open the link on this phone to continue.')
    ).toBeTruthy()
  })
})

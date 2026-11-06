import { jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { broadcastAuthMessage, resetSessionForTests } from '@/http/session'
import { stepUpRefusal } from '@/lib/step-up'
import { useAuthStore } from '@/states/auth.store'
import { restoreApi, serve, type FakeAnswer } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import {
  ACTION_PATH,
  DONE_ANSWER,
  REAUTH_ANSWER,
  renderCaller,
  tokenWith,
} from '@/tests/support/step-up'

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }))

/** The `auth_time` of the token held when each test starts. */
const OLD_AUTH_TIME = 1_000

/** A link request's 202: the resend opens in a minute, the link expires in 15. */
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

beforeEach(() => {
  resetSessionForTests()
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

/** Presses the caller's button. */
async function act_() {
  await fireEvent.press(screen.getByRole('button', { name: 'Act' }))
}

/** Sends the link from the start view, then confirms as `/auth/confirm` does: a newer token, then the signal. */
async function sendAndConfirm() {
  await fireEvent.press(await screen.findByRole('button', { name: 'Email me a link' }))
  await screen.findByText('Check your email. Open the link on this phone to continue.')
  await act(() => {
    useAuthStore.getState().setToken(tokenWith(OLD_AUTH_TIME + 60, 'b'))
    broadcastAuthMessage('step_up_confirmed')
  })
}

describe('useStepUp().run', () => {
  it('a non-reauth failure passes through', async () => {
    const sent = serve(() => ({
      status: 403,
      data: { success: false, statusCode: 403, code: 'FORBIDDEN', message: 'No.' },
    }))
    const outcomes = await renderCaller()
    await act_()
    await waitFor(() => expect(outcomes).toHaveLength(1))
    const [outcome] = outcomes
    expect(outcome && 'error' in outcome && outcome.error).toMatchObject({
      response: { status: 403 },
    })
    expect(sent).toHaveLength(1)
    await waitFor(() => expect(screen.queryByText('Confirm it’s you')).toBeNull())
  })

  it('a refusal sent with an older token retries without a dialog', async () => {
    let calls = 0
    serve(() => {
      calls += 1
      if (calls > 1) return DONE_ANSWER
      // Another action's confirmation lands while this request is out.
      useAuthStore.getState().setToken(tokenWith(OLD_AUTH_TIME + 60, 'b'))
      return REAUTH_ANSWER
    })
    const outcomes = await renderCaller()
    await act_()
    await waitFor(() => expect(outcomes).toEqual([{ value: 'done' }]))
    expect(calls).toBe(2)
    await waitFor(() => expect(screen.queryByText('Confirm it’s you')).toBeNull())
  })

  it('cancel rejects with the original error', async () => {
    serve(() => REAUTH_ANSWER)
    const outcomes = await renderCaller()
    await act_()
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(outcomes).toHaveLength(1))
    const [outcome] = outcomes
    const error = outcome && 'error' in outcome ? outcome.error : null
    expect(error).toMatchObject({ response: { status: 401, data: { code: 'REAUTH_REQUIRED' } } })
    expect(stepUpRefusal(error)).toBe('Confirm it’s you to continue.')
    await waitFor(() => expect(screen.queryByText('Confirm it’s you')).toBeNull())
  })

  it('a second refusal after confirming is marked', async () => {
    serve((config) => (config.url === ACTION_PATH ? REAUTH_ANSWER : LINK_SENT))
    const outcomes = await renderCaller()
    await act_()
    await sendAndConfirm()
    await waitFor(() => expect(outcomes).toHaveLength(1))
    const [outcome] = outcomes
    const error = outcome && 'error' in outcome ? outcome.error : null
    expect(stepUpRefusal(error)).toBe('We couldn’t confirm it’s you. Try the action again.')
    await waitFor(() => expect(screen.queryByText('Confirm it’s you')).toBeNull())
  })

  it('two refused actions share one dialog', async () => {
    let confirmed = false
    const sent = serve((config) => {
      if (config.url !== ACTION_PATH) return LINK_SENT
      return confirmed ? DONE_ANSWER : REAUTH_ANSWER
    })
    const outcomes = await renderCaller()
    await act_()
    await screen.findByText('Confirm it’s you')
    await act_()
    await waitFor(() => expect(sent.filter((c) => c.url === ACTION_PATH)).toHaveLength(2))
    expect(screen.getAllByText('Confirm it’s you')).toHaveLength(1)
    confirmed = true
    await sendAndConfirm()
    await waitFor(() => expect(outcomes).toEqual([{ value: 'done' }, { value: 'done' }]))
    expect(sent.filter((c) => c.url === ACTION_PATH)).toHaveLength(4)
    expect(sent.filter((c) => c.url === '/auth/step-up/link/request')).toHaveLength(1)
  })

  it('useStepUpWaiting is true while the dialog is open', async () => {
    serve(() => REAUTH_ANSWER)
    await renderCaller()
    expect(screen.queryByText('Waiting for you to confirm…')).toBeNull()
    await act_()
    await screen.findByText('Waiting for you to confirm…')
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Waiting for you to confirm…')).toBeNull())
  })
})

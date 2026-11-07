import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import type { InternalAxiosRequestConfig } from 'axios'
import { router, useLocalSearchParams } from 'expo-router'
import { StrictMode, useState, type ReactElement } from 'react'
import Confirm from '@/app/auth/confirm'
import { Button } from '@/components/ui/button'
import { StepUpWaitingContext } from '@/hooks/use-step-up'
import { ensureSession, resetSessionForTests } from '@/http/session'
import { useSessionStatus, type SessionStatus } from '@/http/session-lifecycle'
import { refreshTokenStore } from '@/http/token-store'
import { authTimeOf } from '@/lib/step-up'
import { clientSettingsKeys } from '@/queries/client-settings.queries'
import { useAuthStore } from '@/states/auth.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { assertAccessible } from '@/tests/support/a11y'
import {
  bodyOf,
  renderScreen,
  restoreApi,
  screenTree,
  serve,
  type FakeAnswer,
  type FakeHandler,
} from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import {
  ACTION_PATH,
  DONE_ANSWER,
  REAUTH_ANSWER,
  renderCaller,
  tokenWith,
} from '@/tests/support/step-up'
import type { ClientSettings, User } from '@/types/api.types'

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    setParams: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
}))
jest.mock('@/http/session-lifecycle', () => ({ useSessionStatus: jest.fn(() => 'signed-in') }))

/** The `auth_time` of the token held when each test starts. */
const OLD_AUTH_TIME = 1_000

/** The `auth_time` of the token a confirmation brings. */
const NEW_AUTH_TIME = 2_000

/** The path the screen posts the token to. */
const VERIFY_PATH = '/auth/step-up/link/verify'

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

/** The verify's success: an access token whose `auth_time` is newer. Built per call. */
const confirmed = (): FakeAnswer => ({
  status: 200,
  data: { success: true, data: { accessToken: tokenWith(NEW_AUTH_TIME, 'v') } },
})

/** Express's 400 for a link that is expired, used or another session's. */
const LINK_INVALID: FakeAnswer = {
  status: 400,
  data: { success: false, statusCode: 400, code: 'LINK_INVALID', message: 'Bad link' },
}

/** Express's 401 for a session that ended. */
const SESSION_ENDED: FakeAnswer = {
  status: 401,
  data: { success: false, statusCode: 401, code: 'SESSION_REVOKED', message: 'Ended' },
}

/** A refresh answer that keeps the old `auth_time`, and the profile read after it. */
const refreshedOld: FakeHandler = (config) => {
  if (config.url === '/profile') return { status: 200, data: { success: true, data: ADA } }
  return {
    status: 200,
    data: {
      success: true,
      data: { accessToken: tokenWith(OLD_AUTH_TIME, 'r'), refreshToken: 'rotated' },
    },
  }
}

/**
 * Sets the route's query parameters.
 * @param params - What the route carries.
 */
function openWith(params: Record<string, string>): void {
  jest.mocked(useLocalSearchParams).mockReturnValue(params)
}

/**
 * Sets the session status the mocked hook reports.
 * @param status - The status to report.
 */
function setStatus(status: SessionStatus): void {
  jest.mocked(useSessionStatus).mockReturnValue(status)
}

/**
 * A query client holding the client settings.
 * @param stepUpLinkTtlSeconds - The step-up link's lifetime, or null for an API without the route.
 */
function clientWith(stepUpLinkTtlSeconds: number | null = null): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const settings: ClientSettings | null =
    stepUpLinkTtlSeconds === null
      ? null
      : {
          signInLinkTtlSeconds: 900,
          stepUpLinkTtlSeconds,
          invitationTtlSeconds: 604_800,
          supportEmail: 'help@example.com',
        }
  client.setQueryData(clientSettingsKeys.all, settings)
  return client
}

/**
 * Renders the screen with the client settings in place.
 * @param element - The screen, or the screen in a wrapper.
 * @param client - The query client.
 */
async function renderConfirm(element: ReactElement = <Confirm />, client = clientWith()) {
  return renderScreen(element, client)
}

/**
 * The verify posts the adapter saw.
 * @param sent - Every request the adapter saw.
 */
function verifies(sent: InternalAxiosRequestConfig[]): InternalAxiosRequestConfig[] {
  return sent.filter((config) => config.url === VERIFY_PATH)
}

beforeEach(async () => {
  resetSecureStore()
  resetSessionForTests()
  await refreshTokenStore.write('stored')
  useAuthStore.getState().login(tokenWith(OLD_AUTH_TIME), ADA)
  setStatus('signed-in')
  openWith({ token: 'tok', utm_source: 'email', utm_medium: 'step_up' })
  jest.mocked(router.canGoBack).mockReturnValue(true)
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  jest.clearAllMocks()
})

describe('Confirm', () => {
  it('reads the token once and clears it from the route', async () => {
    let release: ((answer: FakeAnswer) => void) | undefined
    const sent = serve(
      () =>
        new Promise<FakeAnswer>((resolve) => {
          release = resolve
        })
    )
    await renderConfirm()
    await waitFor(() => {
      expect(verifies(sent)).toHaveLength(1)
    })
    // The verify has not resolved.
    expect(router.setParams).toHaveBeenCalledWith({ token: undefined })
    expect(bodyOf(sent[0])).toMatchObject({ token: 'tok' })
    expect(bodyOf(sent[0])).not.toHaveProperty('utm_source')
    openWith({})
    await act(async () => {
      release?.(confirmed())
      await Promise.resolve()
    })
    expect(await screen.findByRole('header', { name: 'Confirmed' })).toBeTruthy()
    expect(verifies(sent)).toHaveLength(1)
  })

  it('posts once under StrictMode', async () => {
    const sent = serve(() => confirmed())
    await renderConfirm(
      <StrictMode>
        <Confirm />
      </StrictMode>
    )
    expect(await screen.findByRole('header', { name: 'Confirmed' })).toBeTruthy()
    expect(verifies(sent)).toHaveLength(1)
  })

  it('waits for the restore before deciding', async () => {
    setStatus('restoring')
    const sent = serve(() => confirmed())
    const client = clientWith()
    const view = await renderConfirm(<Confirm />, client)
    expect(screen.getByRole('header', { name: 'Confirming it’s you' })).toBeTruthy()
    await act(async () => {
      await Promise.resolve()
    })
    expect(sent).toHaveLength(0)
    setStatus('signed-in')
    await view.rerender(screenTree(<Confirm />, client))
    await waitFor(() => {
      expect(verifies(sent)).toHaveLength(1)
    })
  })

  it('signed out posts nothing', async () => {
    useAuthStore.getState().logout()
    setStatus('signed-out')
    const sent = serve(() => confirmed())
    await renderConfirm()
    expect(await screen.findByRole('header', { name: 'Sign in to confirm' })).toBeTruthy()
    expect(
      screen.getByText(
        'This link works only on the device and session that asked for it. If you signed out, sign in and repeat the action.'
      )
    ).toBeTruthy()
    assertAccessible()
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(router.replace).toHaveBeenCalledWith('/login')
    expect(sent).toHaveLength(0)
  })

  it('no token shows the incomplete link and never posts', async () => {
    openWith({ utm_source: 'email' })
    const sent = serve(() => confirmed())
    await renderConfirm()
    expect(await screen.findByRole('header', { name: 'This link is incomplete' })).toBeTruthy()
    expect(screen.getByText('Open the latest confirmation email and use its link.')).toBeTruthy()
    await act(async () => {
      await Promise.resolve()
    })
    expect(sent).toHaveLength(0)
  })

  it('verifying says it is confirming and passes the accessibility harness', async () => {
    serve(() => new Promise<FakeAnswer>(() => {}))
    await renderConfirm()
    expect(screen.getByRole('header', { name: 'Confirming it’s you' })).toBeTruthy()
    assertAccessible()
  })

  it('confirmed with a dialog waiting says Continuing… and goes back', async () => {
    serve(() => confirmed())
    await renderConfirm(
      <StepUpWaitingContext value={true}>
        <Confirm />
      </StepUpWaitingContext>
    )
    expect(await screen.findByRole('header', { name: 'Confirmed' })).toBeTruthy()
    expect(screen.getByText('Continuing…')).toBeTruthy()
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('confirmed with a dialog waiting and nowhere to go back replaces with Home', async () => {
    jest.mocked(router.canGoBack).mockReturnValue(false)
    serve(() => confirmed())
    await renderConfirm(
      <StepUpWaitingContext value={true}>
        <Confirm />
      </StepUpWaitingContext>
    )
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/')
    })
    expect(router.back).not.toHaveBeenCalled()
  })

  it('confirmed with none waiting asks to try the action again', async () => {
    serve(() => confirmed())
    await renderConfirm()
    expect(await screen.findByRole('header', { name: 'Confirmed' })).toBeTruthy()
    expect(screen.getByText('Go back and try the action again.')).toBeTruthy()
    expect(authTimeOf(useAuthStore.getState().accessToken)).toBe(NEW_AUTH_TIME)
    assertAccessible()
    expect(router.back).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Go to Home' }))
    expect(router.replace).toHaveBeenCalledWith('/')
  })

  it('400 names the link’s lifetime and offers no retry', async () => {
    serve(() => LINK_INVALID)
    await renderConfirm(<Confirm />, clientWith(900))
    expect(
      await screen.findByRole('header', { name: 'This link didn’t confirm it’s you' })
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Open the link on the phone where you asked for it, within 15 minutes. For a new link, try the action again.'
      )
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    assertAccessible()
  })

  it('400 leaves the lifetime out when it is unknown', async () => {
    serve(() => LINK_INVALID)
    await renderConfirm()
    expect(
      await screen.findByText(
        'Open the link on the phone where you asked for it. For a new link, try the action again.'
      )
    ).toBeTruthy()
  })

  it('401 says the session ended, and Sign in signs out to /login', async () => {
    const sent = serve((config) => (config.url === VERIFY_PATH ? SESSION_ENDED : DONE_ANSWER))
    await renderConfirm()
    expect(await screen.findByRole('header', { name: 'Your session ended' })).toBeTruthy()
    expect(screen.getByText('Sign in again, then repeat the action.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    assertAccessible()
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/login')
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(verifies(sent)).toHaveLength(1)
  })

  it('another failure says why, and Try again posts again', async () => {
    let calls = 0
    const sent = serve(() => {
      calls += 1
      return calls === 1 ? 'network-error' : confirmed()
    })
    await renderConfirm()
    expect(
      await screen.findByRole('header', { name: 'Confirmation didn’t go through' })
    ).toBeTruthy()
    expect(
      screen.getByText('We couldn’t reach the server. Check your connection, then try again.')
    ).toBeTruthy()
    assertAccessible()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('header', { name: 'Confirmed' })).toBeTruthy()
    expect(verifies(sent)).toHaveLength(2)
  })

  it('Try again pressed twice in one frame posts once', async () => {
    let calls = 0
    const sent = serve(() => {
      calls += 1
      return calls === 1 ? 'network-error' : confirmed()
    })
    await renderConfirm()
    const retry = await screen.findByRole('button', { name: 'Try again' })
    await act(async () => {
      void fireEvent.press(retry)
      void fireEvent.press(retry)
      await Promise.resolve()
    })
    expect(await screen.findByRole('header', { name: 'Confirmed' })).toBeTruthy()
    expect(verifies(sent)).toHaveLength(2)
  })

  it('waits for a refresh in flight, so the confirmed token is the one kept', async () => {
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const sent = serve(async (config) => {
      if (config.url === VERIFY_PATH) return confirmed()
      if (config.url === '/auth/refresh') await held
      return refreshedOld(config)
    })
    void ensureSession()
    await renderConfirm()
    await waitFor(() => {
      expect(sent.map((config) => config.url)).toContain('/auth/refresh')
    })
    expect(verifies(sent)).toHaveLength(0)
    await act(async () => {
      release?.()
      await Promise.resolve()
    })
    expect(await screen.findByRole('header', { name: 'Confirmed' })).toBeTruthy()
    const urls = sent.map((config) => config.url)
    expect(urls.indexOf(VERIFY_PATH)).toBeGreaterThan(urls.indexOf('/profile'))
    expect(authTimeOf(useAuthStore.getState().accessToken)).toBe(NEW_AUTH_TIME)
  })
})

/** The mailed link's screen, mounted when "Open the link" is pressed, as a link opened from the mail app. */
function MailedLink() {
  const [isOpen, setIsOpen] = useState(false)
  if (isOpen) return <Confirm />
  return (
    <Button
      variant="secondary"
      label="Open the link"
      onPress={() => {
        setIsOpen(true)
      }}
    />
  )
}

/**
 * Serves the action, the link request and the refresh, with `verify` answering the confirmation.
 * @param verify - What the verify post answers.
 * @returns The requests seen.
 */
function serveWithDialog(verify: () => FakeAnswer | 'network-error') {
  return serve((config) => {
    if (config.url === ACTION_PATH) {
      const bearer = String(config.headers.get('Authorization'))
      return bearer === `Bearer ${tokenWith(OLD_AUTH_TIME)}` ? REAUTH_ANSWER : DONE_ANSWER
    }
    if (config.url === '/auth/step-up/link/request') {
      return {
        status: 202,
        data: {
          success: true,
          data: { resendAvailableAt: new Date(Date.now() - 1_000).toISOString() },
        },
      }
    }
    if (config.url === VERIFY_PATH) return verify()
    return refreshedOld(config)
  })
}

/**
 * Opens the dialog through the caller, mails a link, then opens the mailed link.
 * @returns The caller's outcomes.
 */
async function openLinkWhileWaiting() {
  const outcomes = await renderCaller(<MailedLink />)
  await fireEvent.press(screen.getByRole('button', { name: 'Act' }))
  await fireEvent.press(await screen.findByRole('button', { name: 'Email me a link' }))
  await screen.findByText('Check your email. Open the link on this phone to continue.')
  await fireEvent.press(screen.getByRole('button', { name: 'Open the link' }))
  return outcomes
}

describe('Confirm with the step-up dialog', () => {
  it('a dead link says so in the dialog, keeps Resend, and goes back', async () => {
    serveWithDialog(() => LINK_INVALID)
    const outcomes = await openLinkWhileWaiting()
    expect(
      await screen.findByText(
        'This link didn’t confirm it’s you. Open the link on the phone where you asked for it.'
      )
    ).toBeTruthy()
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Resend link' })).toBeTruthy()
    expect(screen.getByText('Confirm it’s you')).toBeTruthy()
    expect(outcomes).toEqual([])
  })

  it('an ended session says so in the dialog and goes back', async () => {
    serveWithDialog(() => SESSION_ENDED)
    await openLinkWhileWaiting()
    expect(
      await screen.findByText('Your session ended. Sign in again, then repeat the action.')
    ).toBeTruthy()
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Resend link' })).toBeTruthy()
  })

  it('a network failure says so in the dialog and, with nowhere to go back, replaces with Home', async () => {
    jest.mocked(router.canGoBack).mockReturnValue(false)
    serveWithDialog(() => 'network-error')
    await openLinkWhileWaiting()
    expect(
      await screen.findByText(
        'Confirmation didn’t go through. We couldn’t reach the server. Check your connection, then try again.'
      )
    ).toBeTruthy()
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(router.back).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Resend link' })).toBeTruthy()
  })

  it('a link opened while waiting retries the action once', async () => {
    const sent = serve((config) => {
      if (config.url === ACTION_PATH) {
        const bearer = String(config.headers.get('Authorization'))
        return bearer === `Bearer ${tokenWith(OLD_AUTH_TIME)}` ? REAUTH_ANSWER : DONE_ANSWER
      }
      if (config.url === '/auth/step-up/link/request') {
        return {
          status: 202,
          data: {
            success: true,
            data: { resendAvailableAt: new Date(Date.now() + 60_000).toISOString() },
          },
        }
      }
      if (config.url === VERIFY_PATH) return confirmed()
      return refreshedOld(config)
    })
    const outcomes = await renderCaller(<MailedLink />)
    await fireEvent.press(screen.getByRole('button', { name: 'Act' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Email me a link' }))
    await screen.findByText('Check your email. Open the link on this phone to continue.')

    await fireEvent.press(screen.getByRole('button', { name: 'Open the link' }))
    await waitFor(() => {
      expect(outcomes).toEqual([{ value: 'done' }])
    })
    expect(sent.filter((config) => config.url === ACTION_PATH)).toHaveLength(2)
    expect(sent.some((config) => config.url === '/auth/refresh')).toBe(false)
    await waitFor(() => {
      expect(screen.queryByText('Confirm it’s you')).toBeNull()
    })
    expect(router.back).toHaveBeenCalledTimes(1)
  })
})

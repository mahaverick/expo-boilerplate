import { jest } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import type { InternalAxiosRequestConfig } from 'axios'
import { router, useLocalSearchParams } from 'expo-router'
import { StrictMode } from 'react'
import ConfirmInvitation from '@/app/invitations/confirm'
import { useSessionStatus } from '@/http/session-lifecycle'
import type { SessionStatus } from '@/http/session-lifecycle'
import { refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { resetSecureStore, setItemAsync } from '@/tests/mocks/expo-secure-store'
import { bodyOf, renderScreen, restoreApi, serve } from '@/tests/support/api'
import type { FakeAnswer, FakeHandler } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { envelope, NOT_FOUND } from '@/tests/support/workspace-api'
import type { User } from '@/types/api.types'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(),
}))
/** The in-memory stand-in for MMKV. */
const mockStorage = new Map<string, string>()
jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => {
      mockStorage.set(key, value)
    },
    remove: (key: string) => mockStorage.delete(key),
  },
}))
jest.mock('@/http/session-lifecycle', () => ({ useSessionStatus: jest.fn(() => 'signed-out') }))

/** A well-formed token: 43 base64url characters. */
const TOKEN = 'A'.repeat(43)

/**
 * A user.
 * @param email - Their address.
 */
function userOf(email: string): User {
  return {
    id: `id-${email}`,
    email,
    firstName: null,
    lastName: null,
    createdAt: '2026-01-01',
    platformRole: null,
    analyticsOptOut: false,
  }
}

/** A confirm answer. Built per call: the client strips the refresh token from it. */
const joined = (): FakeAnswer => ({
  status: 200,
  data: {
    success: true,
    data: {
      accessToken: 'access',
      refreshToken: 'refresh',
      refreshTokenExpiresAt: '2027-01-01',
      user: userOf('ada@example.com'),
      isNewUser: false,
      tenant: { name: 'Acme', slug: 'acme' },
      role: 'editor',
    },
  },
})

/** An eligible membership in Acme. */
const ACME_MEMBERSHIP = {
  tenant: { slug: 'acme', name: 'Acme', lifecycleState: 'active' },
  role: 'editor',
  joinedAt: '2026-01-05',
  isPlatform: false,
}

/**
 * Serves the confirm route and records every other call.
 * @param confirm - The confirm's answer.
 * @returns The recorded requests, `GET /tenants` and the client-settings read left out.
 */
function serveConfirm(confirm: FakeHandler | FakeAnswer = joined) {
  const seen: InternalAxiosRequestConfig[] = []
  serve((config) => {
    if (config.url === '/status/client-settings') return NOT_FOUND
    if (config.url === '/tenants')
      return envelope({ items: [ACME_MEMBERSHIP], page: { hasNext: false, nextCursor: null } })
    seen.push(config)
    if (config.url === '/invitations/confirm') {
      return typeof confirm === 'function' ? confirm(config) : confirm
    }
    if (config.url === '/auth/logout') return envelope(null)
    return NOT_FOUND
  })
  return seen
}

/**
 * The paths the requests went to.
 * @param seen - The recorded requests.
 */
function urls(seen: InternalAxiosRequestConfig[]): Array<string | undefined> {
  return seen.map((config) => config.url)
}

/**
 * Sets the route's query parameters.
 * @param params - The `token` and `email` the link carries.
 */
function openWith(params: { token?: string; email?: string; utm_source?: string }): void {
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
 * Signs a user in.
 * @param email - Their address.
 */
function signInAs(email: string): void {
  useAuthStore.getState().login('a', userOf(email))
  setStatus('signed-in')
}

beforeEach(() => {
  resetSecureStore()
  mockStorage.clear()
  useCurrentTenantStore.setState({ remembered: {} })
  useToastQueueStore.getState().remove()
  setStatus('signed-out')
  openWith({ token: TOKEN, email: 'ada@example.com', utm_source: 'email' })
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  jest.clearAllMocks()
})

describe('ConfirmInvitation', () => {
  it('reads token and email once, and clears both from the route', async () => {
    const seen = serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalled()
    })
    expect(router.setParams).toHaveBeenCalledWith({ token: undefined, email: undefined })
    expect(bodyOf(seen[0])).toEqual({ token: TOKEN, email: 'ada@example.com' })
  })

  it('signed out, it posts, signs in and keeps the refresh token off the response', async () => {
    serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })
    expect(useAuthStore.getState().user?.email).toBe('ada@example.com')
    expect(await refreshTokenStore.read()).toBe('refresh')
  })

  it('a join lands on the Workspace tab with the workspace remembered', async () => {
    serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/workspace', { withAnchor: true })
    })
    expect(useCurrentTenantStore.getState().recall('id-ada@example.com')).toBe('acme')
    expect(useToastQueueStore.getState().toasts[0]?.title).toBe(
      'You joined Acme as ada@example.com.'
    )
  })

  it('shows Joining your team and the address while it posts', async () => {
    serveConfirm(() => new Promise<FakeAnswer>(() => undefined))
    await renderScreen(<ConfirmInvitation />)
    expect(await screen.findByRole('header', { name: 'Joining your team' })).toBeTruthy()
    expect(screen.getByText('Joining your team…')).toBeTruthy()
    expect(screen.getByText('This link is for ada@example.com.')).toBeTruthy()
  })

  it('waits for the restore before it posts', async () => {
    setStatus('restoring')
    const seen = serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    expect(seen).toHaveLength(0)
  })

  it('posts once under StrictMode', async () => {
    const seen = serveConfirm()
    await renderScreen(
      <StrictMode>
        <ConfirmInvitation />
      </StrictMode>
    )
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalled()
    })
    expect(urls(seen)).toEqual(['/invitations/confirm'])
  })

  it('signed in as the same address in another case, it posts', async () => {
    signInAs('Ada@Example.com')
    const seen = serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/workspace', { withAnchor: true })
    })
    expect(urls(seen)).toEqual(['/invitations/confirm'])
  })

  it('asks before switching, and spends nothing first', async () => {
    signInAs('bob@example.com')
    const seen = serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    expect(await screen.findByRole('header', { name: 'Join your team' })).toBeTruthy()
    expect(
      screen.getByText(
        'This invitation is for ada@example.com. You’re signed in as bob@example.com.'
      )
    ).toBeTruthy()
    expect(seen).toHaveLength(0)

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(seen).toHaveLength(0)
    expect(useAuthStore.getState().user?.email).toBe('bob@example.com')
  })

  it('Continue signs out, then posts once, however often it is pressed', async () => {
    signInAs('bob@example.com')
    jest
      .mocked(useSessionStatus)
      .mockImplementation(() =>
        useAuthStore((state) => state.isAuthenticated) ? 'signed-in' : 'signed-out'
      )
    const seen = serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    const button = await screen.findByRole('button', { name: 'Continue as ada@example.com' })
    await fireEvent.press(button)
    await fireEvent.press(button)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/workspace', { withAnchor: true })
    })
    expect(urls(seen).filter((url) => url === '/invitations/confirm')).toHaveLength(1)
    expect(urls(seen).indexOf('/auth/logout')).toBeLessThan(
      urls(seen).indexOf('/invitations/confirm')
    )
    expect(useAuthStore.getState().user?.email).toBe('ada@example.com')
  })

  it('a missing email is incomplete and nothing is posted', async () => {
    openWith({ token: TOKEN })
    const seen = serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    expect(await screen.findByRole('header', { name: 'This link is incomplete' })).toBeTruthy()
    expect(seen).toHaveLength(0)
  })

  it('a missing token is incomplete', async () => {
    openWith({ email: 'ada@example.com' })
    const seen = serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    expect(await screen.findByRole('header', { name: 'This link is incomplete' })).toBeTruthy()
    expect(seen).toHaveLength(0)
  })

  it('a malformed token is dead and never posted, with the sign-in form prefilled', async () => {
    openWith({ token: 'short', email: 'ada@example.com' })
    const seen = serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    expect(await screen.findByRole('header', { name: 'This link can’t be used' })).toBeTruthy()
    expect(screen.getByDisplayValue('ada@example.com')).toBeTruthy()
    expect(seen).toHaveLength(0)
  })

  it('a 404 is dead, signed out', async () => {
    serveConfirm(NOT_FOUND)
    await renderScreen(<ConfirmInvitation />)
    expect(await screen.findByRole('header', { name: 'This link can’t be used' })).toBeTruthy()
    expect(screen.getByDisplayValue('ada@example.com')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('a 404 is dead, signed in, with a way Home', async () => {
    signInAs('ada@example.com')
    serveConfirm(NOT_FOUND)
    await renderScreen(<ConfirmInvitation />)
    expect(await screen.findByRole('header', { name: 'This link can’t be used' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Go to Home' }))
    expect(router.replace).toHaveBeenCalledWith('/')
  })

  it('another failure offers Try again, which posts again', async () => {
    let calls = 0
    const seen = serveConfirm(() => {
      calls += 1
      return calls === 1
        ? { status: 500, data: { success: false, message: 'Boom', code: 'INTERNAL' } }
        : joined()
    })
    await renderScreen(<ConfirmInvitation />)
    expect(
      await screen.findByRole('header', { name: 'You weren’t added to your team' })
    ).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/workspace', { withAnchor: true })
    })
    expect(urls(seen)).toEqual(['/invitations/confirm', '/invitations/confirm'])
  })

  it.each([
    [
      'express’s full-workspace 402',
      {
        success: false,
        message: 'This workspace is full on its current plan. Ask an owner to upgrade.',
        code: 'PLAN_LIMIT_REACHED',
      },
    ],
    ['a bare 402', { success: false, message: 'Upgrade to join.' }],
  ])('%s shows the app’s members-limit copy, never the server’s', async (_name, data) => {
    serveConfirm({ status: 402, data })
    await renderScreen(<ConfirmInvitation />)
    expect(
      await screen.findByText(
        'This workspace is at its members limit, so you can’t join it yet. Ask an owner of the workspace.'
      )
    ).toBeTruthy()
    expect(screen.queryByText(/upgrade/i)).toBeNull()
    expect(screen.queryByText(/full on its current plan/)).toBeNull()
  })

  it('a sign-in the device could not keep says so inline', async () => {
    const realSet = setItemAsync.getMockImplementation()!
    setItemAsync.mockImplementation((key, value, options) =>
      key === 'refresh_token' ? Promise.reject(new Error('keychain')) : realSet(key, value, options)
    )
    serveConfirm()
    await renderScreen(<ConfirmInvitation />)
    expect(
      await screen.findByText(
        'We couldn’t keep you signed in on this device. Request a new link.',
        {},
        { timeout: 5000 }
      )
    ).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})

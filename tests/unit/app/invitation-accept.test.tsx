import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import type { InternalAxiosRequestConfig } from 'axios'
import { router, useLocalSearchParams } from 'expo-router'
import { StrictMode } from 'react'
import AcceptInvitation from '@/app/invitations/accept'
import { useSessionStatus } from '@/http/session-lifecycle'
import type { SessionStatus } from '@/http/session-lifecycle'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { renderScreen, restoreApi, screenTree, serve } from '@/tests/support/api'
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

/** What the preview says. */
const PREVIEW = envelope({
  tenant: { name: 'Acme', slug: 'acme' },
  role: 'editor',
  invitedBy: { firstName: 'Grace', lastName: 'Hopper' },
  email: 'ada@example.com',
})

/** The `202` of a verify. */
const MAILED = {
  status: 202,
  data: { success: true, data: { confirmationSent: true, email: 'ada@example.com' } },
} satisfies FakeAnswer

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

/** What `GET /tenants` lists. */
let memberships: unknown[] = []

/**
 * Serves the invitation routes and records them, leaving out the settings read.
 * @param routes - Answers by `"POST /path"`; the preview and verify default to a live invitation.
 * @returns The recorded requests.
 */
function serveInvitation(routes: Record<string, FakeHandler | FakeAnswer> = {}) {
  const seen: InternalAxiosRequestConfig[] = []
  serve(async (config) => {
    if (config.url === '/status/client-settings') return NOT_FOUND
    if (config.url === '/tenants')
      return envelope({ items: memberships, page: { hasNext: false, nextCursor: null } })
    seen.push(config)
    const route = routes[`POST ${config.url}`]
    if (typeof route === 'function') return route(config)
    if (route) return route
    if (config.url === '/invitations/preview') return PREVIEW
    if (config.url === '/invitations/verify') return MAILED
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
 * @param params - The `token` the route carries.
 */
function openWith(params: { token?: string; utm_source?: string }): void {
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
  memberships = []
  mockStorage.clear()
  useToastQueueStore.getState().remove()
  setStatus('signed-out')
  openWith({ token: TOKEN, utm_source: 'email' })
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  jest.clearAllMocks()
  jest.useRealTimers()
})

describe('AcceptInvitation', () => {
  it('reads the token once and clears it from the route', async () => {
    const seen = serveInvitation()
    await renderScreen(<AcceptInvitation />)
    await screen.findByText('Check your inbox')
    expect(router.setParams).toHaveBeenCalledWith({ token: undefined })
    expect(JSON.parse(seen[0]?.data as string)).toEqual({ token: TOKEN })
  })

  it('waits for the restore before deciding', async () => {
    setStatus('restoring')
    const seen = serveInvitation()
    const client = new QueryClient()
    const view = await renderScreen(<AcceptInvitation />, client)
    expect(seen).toHaveLength(0)
    setStatus('signed-out')
    await view.rerender(screenTree(<AcceptInvitation />, client))
    await screen.findByText('Check your inbox')
    expect(urls(seen)).toEqual(['/invitations/preview', '/invitations/verify'])
  })

  it('signed out, it previews, verifies and shows Check your inbox', async () => {
    const seen = serveInvitation()
    await renderScreen(<AcceptInvitation />)
    expect(await screen.findByRole('header', { name: 'Check your inbox' })).toBeTruthy()
    expect(urls(seen)).toEqual(['/invitations/preview', '/invitations/verify'])
    expect(screen.getByText('We sent a link to ada@example.com.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resend in 1:00' })).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('names the inviter, the workspace and the role while it joins', async () => {
    serveInvitation({ 'POST /invitations/verify': () => new Promise<FakeAnswer>(() => undefined) })
    await renderScreen(<AcceptInvitation />)
    expect(await screen.findByRole('header', { name: 'Joining Acme' })).toBeTruthy()
    expect(screen.getByText('Grace Hopper invited you to join Acme as Editor.')).toBeTruthy()
  })

  it('signed in as the invitee, it accepts, toasts and lands on the Workspace tab', async () => {
    signInAs('Ada@Example.com')
    const seen = serveInvitation({
      'POST /invitations/accept': envelope({
        tenant: { name: 'Acme', slug: 'acme' },
        role: 'editor',
        alreadyMember: false,
      }),
    })
    await renderScreen(<AcceptInvitation />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/workspace', { withAnchor: true })
    })
    // The accept refreshes the profile after it joins.
    expect(urls(seen).slice(0, 2)).toEqual(['/invitations/preview', '/invitations/accept'])
    expect(useCurrentTenantStore.getState().recall('id-Ada@Example.com')).toBe('acme')
    expect(useToastQueueStore.getState().toasts[0]?.title).toBe(
      'You joined Acme as Ada@Example.com.'
    )
  })

  it('does not remember the platform workspace', async () => {
    signInAs('ada@example.com')
    serveInvitation({
      'POST /invitations/accept': envelope({
        tenant: { name: 'Platform', slug: 'platform' },
        role: 'admin',
        alreadyMember: false,
      }),
    })
    await renderScreen(<AcceptInvitation />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/workspace', { withAnchor: true })
    })
    expect(useCurrentTenantStore.getState().recall('id-ada@example.com')).toBeNull()
  })

  it('does not remember a suspended workspace', async () => {
    signInAs('ada@example.com')
    memberships = [
      {
        tenant: { slug: 'acme', name: 'Acme', lifecycleState: 'suspended' },
        role: 'editor',
        joinedAt: '2026-01-05',
        isPlatform: false,
      },
    ]
    serveInvitation({
      'POST /invitations/accept': envelope({
        tenant: { name: 'Acme', slug: 'acme' },
        role: 'editor',
        alreadyMember: false,
      }),
    })
    await renderScreen(<AcceptInvitation />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/workspace', { withAnchor: true })
    })
    expect(useCurrentTenantStore.getState().recall('id-ada@example.com')).toBeNull()
  })

  it('says so when the invitee had already joined', async () => {
    signInAs('ada@example.com')
    serveInvitation({
      'POST /invitations/accept': envelope({
        tenant: { name: 'Acme', slug: 'acme' },
        role: 'viewer',
        alreadyMember: true,
      }),
    })
    await renderScreen(<AcceptInvitation />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalled()
    })
    expect(useToastQueueStore.getState().toasts[0]?.title).toBe(
      'You’ve already joined Acme as ada@example.com.'
    )
  })

  it('a refused accept is dead', async () => {
    signInAs('ada@example.com')
    serveInvitation({
      'POST /invitations/accept': {
        status: 403,
        data: { success: false, message: 'no', code: 'invitation_email_mismatch' },
      },
    })
    await renderScreen(<AcceptInvitation />)
    expect(
      await screen.findByRole('header', { name: 'This invitation can’t be used' })
    ).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('asks before switching, and spends nothing first', async () => {
    signInAs('bob@example.com')
    const seen = serveInvitation()
    await renderScreen(<AcceptInvitation />)
    expect(await screen.findByRole('header', { name: 'Join Acme' })).toBeTruthy()
    expect(
      screen.getByText(
        'This invitation is for ada@example.com. You’re signed in as bob@example.com.'
      )
    ).toBeTruthy()
    expect(urls(seen)).toEqual(['/invitations/preview'])

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(urls(seen)).toEqual(['/invitations/preview'])
  })

  it('Continue signs out, then verifies once, however often it is pressed', async () => {
    signInAs('bob@example.com')
    // The status follows the auth store, as the real hook does, so the sign-out re-renders the screen.
    jest
      .mocked(useSessionStatus)
      .mockImplementation(() =>
        useAuthStore((state) => state.isAuthenticated) ? 'signed-in' : 'signed-out'
      )
    const seen = serveInvitation()
    await renderScreen(<AcceptInvitation />)
    const button = await screen.findByRole('button', { name: 'Continue as ada@example.com' })
    await fireEvent.press(button)
    await fireEvent.press(button)
    expect(await screen.findByRole('header', { name: 'Check your inbox' })).toBeTruthy()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(urls(seen).filter((url) => url === '/invitations/preview')).toHaveLength(1)
    expect(urls(seen).filter((url) => url === '/invitations/verify')).toHaveLength(1)
    expect(urls(seen).indexOf('/auth/logout')).toBeLessThan(
      urls(seen).indexOf('/invitations/verify')
    )
  })

  it('a malformed token is dead and is never posted', async () => {
    openWith({ token: 'short' })
    const seen = serveInvitation()
    await renderScreen(<AcceptInvitation />)
    expect(
      await screen.findByRole('header', { name: 'This invitation can’t be used' })
    ).toBeTruthy()
    expect(seen).toHaveLength(0)
  })

  it('no token is incomplete', async () => {
    openWith({})
    const seen = serveInvitation()
    await renderScreen(<AcceptInvitation />)
    expect(await screen.findByRole('header', { name: 'This link is incomplete' })).toBeTruthy()
    expect(seen).toHaveLength(0)
  })

  it('a 404 preview is dead', async () => {
    const seen = serveInvitation({ 'POST /invitations/preview': NOT_FOUND })
    await renderScreen(<AcceptInvitation />)
    expect(
      await screen.findByRole('header', { name: 'This invitation can’t be used' })
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeTruthy()
    expect(urls(seen)).toEqual(['/invitations/preview'])
  })

  it('a failed verify offers Try again', async () => {
    let calls = 0
    serveInvitation({
      'POST /invitations/verify': () => {
        calls += 1
        return calls === 1
          ? { status: 500, data: { success: false, message: 'Boom', code: 'INTERNAL' } }
          : MAILED
      },
    })
    await renderScreen(<AcceptInvitation />)
    expect(await screen.findByRole('header', { name: 'You weren’t added to Acme' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('header', { name: 'Check your inbox' })).toBeTruthy()
  })

  it('posts once under StrictMode', async () => {
    const seen = serveInvitation()
    await renderScreen(
      <StrictMode>
        <AcceptInvitation />
      </StrictMode>
    )
    await screen.findByText('Check your inbox')
    expect(urls(seen)).toEqual(['/invitations/preview', '/invitations/verify'])
  })

  it('a resend 429 holds Resend for Retry-After', async () => {
    jest.useFakeTimers({ advanceTimers: true })
    let calls = 0
    const seen = serveInvitation({
      'POST /invitations/verify': () => {
        calls += 1
        return calls === 1
          ? MAILED
          : {
              status: 429,
              headers: { 'retry-after': '120' },
              data: { success: false, message: 'Slow down', code: 'RATE_LIMITED' },
            }
      },
    })
    await renderScreen(<AcceptInvitation />)
    await screen.findByRole('button', { name: 'Resend in 1:00' })
    await act(() => {
      jest.advanceTimersByTime(61_000)
    })
    await fireEvent.press(await screen.findByRole('button', { name: 'Resend link' }))
    expect(await screen.findByRole('button', { name: 'Resend in 2:00' })).toBeTruthy()
    expect(urls(seen).filter((url) => url === '/invitations/verify')).toHaveLength(2)
    expect(useToastQueueStore.getState().toasts[0]?.title).toBe(
      'Too many attempts. Try again in 2 minutes.'
    )
  })
})

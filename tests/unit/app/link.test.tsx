import { jest } from '@jest/globals'
import { onlineManager, QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import type { InternalAxiosRequestConfig } from 'axios'
import { router, useLocalSearchParams } from 'expo-router'
import { StrictMode } from 'react'
import Link from '@/app/auth/link'
import { useSessionStatus } from '@/http/session-lifecycle'
import type { SessionStatus } from '@/http/session-lifecycle'
import { refreshTokenStore } from '@/http/token-store'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/states/auth.store'
import { resetSecureStore, setItemAsync } from '@/tests/mocks/expo-secure-store'
import { bodyOf, renderScreen, restoreApi, screenTree, serve } from '@/tests/support/api'
import type { FakeAnswer, FakeHandler } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(),
}))
jest.mock('@/http/session-lifecycle', () => ({ useSessionStatus: jest.fn(() => 'signed-out') }))

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

/** A verify answer in express's envelope. Built per call: the client strips the token from it. */
const verified = (over: { isNewUser?: boolean; redirect?: string | null } = {}): FakeAnswer => ({
  status: 200,
  data: {
    success: true,
    data: {
      accessToken: 'access',
      refreshToken: 'refresh',
      refreshTokenExpiresAt: '2027-01-01',
      user: userOf('ada@example.com'),
      isNewUser: false,
      redirect: null,
      ...over,
    },
  },
})

/**
 * A `GET /tenants` answer: one page that holds the given memberships.
 * @param rows - The memberships.
 */
function tenantList(rows: unknown[]): FakeAnswer {
  return {
    status: 200,
    data: { success: true, data: { items: rows, page: { hasNext: false, nextCursor: null } } },
  }
}

/** What `GET /tenants` answers. Each test starts with one workspace. */
let tenants: FakeAnswer = tenantList([{ tenant: { id: 't' } }])

/**
 * Serves the API like `serve`, but answers `GET /tenants` from `tenants` and
 * leaves it out of the record, so a test counts the sign-in calls alone.
 * @param handler - Picks the answer for every other request.
 * @returns The other requests the adapter saw, in order.
 */
function serveLink(handler: FakeHandler): InternalAxiosRequestConfig[] {
  const seen: InternalAxiosRequestConfig[] = []
  serve((config) => {
    if (config.url === '/tenants') return tenants
    seen.push(config)
    return handler(config)
  })
  return seen
}

/** The paths `router.replace` was called with. */
function replaced(): unknown[] {
  return jest.mocked(router.replace).mock.calls.map(([href]) => href)
}

/** An empty success. */
const OK: FakeAnswer = { status: 200, data: { success: true, data: null } }

/**
 * Sets the link's query parameters.
 * @param params - The `token`, `email` and `redirect` the route carries.
 */
function openWith(params: { token?: string; email?: string; redirect?: string }): void {
  jest.mocked(useLocalSearchParams).mockReturnValue(params)
}

/**
 * Sets the session status the mocked hook reports.
 * @param status - The status to report.
 */
function setStatus(status: SessionStatus): void {
  jest.mocked(useSessionStatus).mockReturnValue(status)
}

beforeEach(() => {
  resetSecureStore()
  tenants = tenantList([{ tenant: { id: 't' } }])
  setStatus('signed-out')
  openWith({ token: 'tok', email: 'ada@example.com' })
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  jest.clearAllMocks()
})

describe('Link', () => {
  it('reads token and email once, then clears them from the route', async () => {
    let release: ((answer: FakeAnswer) => void) | undefined
    const sent = serveLink(
      () =>
        new Promise<FakeAnswer>((resolve) => {
          release = resolve
        })
    )
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    // The verify has not resolved.
    expect(router.setParams).toHaveBeenCalledWith({ token: undefined, email: undefined })
    expect(bodyOf(sent[0])).toMatchObject({ token: 'tok', email: 'ada@example.com' })
    expect(screen.getByRole('header', { name: 'Signing you in as ada@example.com' })).toBeTruthy()
    // The route no longer carries them, and the screen still posts nothing more.
    openWith({})
    await act(async () => {
      release?.(verified())
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/', { withAnchor: true })
    })
    expect(sent).toHaveLength(1)
  })

  it('offline, the verify and the workspace read still run, and the landing does not hang', async () => {
    onlineManager.setOnline(false)
    try {
      serveLink(() => verified())
      await renderScreen(<Link />, queryClient)
      await waitFor(() => {
        expect(router.replace).toHaveBeenCalledWith('/', { withAnchor: true })
      })
    } finally {
      onlineManager.setOnline(true)
      queryClient.clear()
    }
  })

  it('posts once under StrictMode', async () => {
    const sent = serveLink(() => verified())
    await renderScreen(
      <StrictMode>
        <Link />
      </StrictMode>
    )
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/', { withAnchor: true })
    })
    expect(sent).toHaveLength(1)
  })

  it('lands on Home after a success when the account has a workspace', async () => {
    serveLink(() => verified())
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledTimes(1)
    })
    expect(router.replace).toHaveBeenCalledWith('/', { withAnchor: true })
    expect(await refreshTokenStore.read()).toBe('refresh')
  })

  it('lands on /welcome for a new account, whatever was asked for', async () => {
    openWith({ token: 'tok', email: 'ada@example.com', redirect: '/tenants/acme' })
    serveLink(() => verified({ isNewUser: true, redirect: '/somewhere' }))
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(replaced()).toContain('/welcome')
    })
  })

  it('lands on the verify answer’s safe redirect', async () => {
    openWith({ token: 'tok', email: 'ada@example.com', redirect: '/other' })
    serveLink(() => verified({ redirect: '/tenants/acme?tab=x' }))
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(replaced()).toContain('/tenants/acme?tab=x')
    })
  })

  it('lands on the link’s own redirect when the answer has none', async () => {
    openWith({ token: 'tok', email: 'ada@example.com', redirect: '/tenants/acme' })
    serveLink(() => verified())
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(replaced()).toContain('/tenants/acme')
    })
  })

  it('ignores an unsafe redirect', async () => {
    openWith({ token: 'tok', email: 'ada@example.com', redirect: '//evil.example' })
    serveLink(() => verified({ redirect: '/auth/link' }))
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/', { withAnchor: true })
    })
    expect(router.replace).toHaveBeenCalledTimes(1)
  })

  it('lands on /welcome when the account has no workspace', async () => {
    tenants = tenantList([])
    serveLink(() => verified())
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(replaced()).toContain('/welcome')
    })
  })

  it('lands on / when the workspace list read fails', async () => {
    tenants = 'network-error'
    serveLink(() => verified())
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/', { withAnchor: true })
    })
    expect(router.replace).toHaveBeenCalledTimes(1)
  })

  it('trims the email', async () => {
    openWith({ token: 'tok', email: '  ada@example.com ' })
    const sent = serveLink(() => verified())
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    expect(bodyOf(sent[0])).toMatchObject({ email: 'ada@example.com' })
  })

  it('waits for the restore before it decides', async () => {
    setStatus('restoring')
    const sent = serveLink(() => verified())
    const client = new QueryClient()
    const view = await renderScreen(<Link />, client)
    expect(sent).toHaveLength(0)
    expect(router.replace).not.toHaveBeenCalled()
    setStatus('signed-out')
    await view.rerender(screenTree(<Link />, client))
    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
  })

  it('signed in as the same address, it goes Home without posting', async () => {
    useAuthStore.getState().login('a', userOf('Ada@Example.com'))
    setStatus('signed-in')
    const sent = serveLink(() => verified())
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/')
    })
    expect(sent).toHaveLength(0)
  })

  it('signed in with no token, it goes Home without posting', async () => {
    openWith({})
    useAuthStore.getState().login('a', userOf('ada@example.com'))
    setStatus('signed-in')
    const sent = serveLink(() => verified())
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/')
    })
    expect(sent).toHaveLength(0)
  })

  it('asks before switching, and signs out before verifying', async () => {
    useAuthStore.getState().login('a', userOf('bob@example.com'))
    setStatus('signed-in')
    await refreshTokenStore.write('bobs-token')
    let releaseLogout: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseLogout = resolve
    })
    const sent = serveLink(async (config) => {
      if (config.url === '/auth/logout') {
        await gate
        return OK
      }
      return verified()
    })
    await renderScreen(<Link />)
    expect(screen.getByRole('header', { name: 'You’re signed in as bob@example.com' })).toBeTruthy()
    expect(screen.getByText('This link signs in ada@example.com.')).toBeTruthy()
    expect(sent).toHaveLength(0)

    await fireEvent.press(screen.getByRole('button', { name: 'Continue as ada@example.com' }))
    await waitFor(() => {
      expect(sent.map((c) => c.url)).toEqual(['/auth/logout'])
    })
    // The sign-out is still waiting on the API: nothing has been verified.
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    await act(async () => {
      await Promise.resolve()
    })
    expect(sent.map((c) => c.url)).toEqual(['/auth/logout'])

    releaseLogout?.()
    await waitFor(() => {
      expect(sent.map((c) => c.url)).toEqual(['/auth/logout', '/auth/link/verify'])
    })
    // Sign-out stayed on this screen.
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/', { withAnchor: true })
    })
    expect(router.replace).not.toHaveBeenCalledWith('/login')
  })

  it('Stay signed in goes Home', async () => {
    useAuthStore.getState().login('a', userOf('bob@example.com'))
    setStatus('signed-in')
    const sent = serveLink(() => verified())
    await renderScreen(<Link />)
    await fireEvent.press(screen.getByRole('button', { name: 'Stay signed in' }))
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(sent).toHaveLength(0)
  })

  it('400 shows the dead-link state', async () => {
    const sent = serveLink((config) =>
      config.url === '/auth/link/verify'
        ? { status: 400, data: { success: false, message: 'Bad link' } }
        : OK
    )
    await renderScreen(<Link />)
    expect(
      await screen.findByRole('header', { name: 'This link has expired or was already used' })
    ).toBeTruthy()
    expect(screen.getByLabelText('Email').props.value).toBe('ada@example.com')
    await fireEvent.press(screen.getByRole('button', { name: 'Email me a new link' }))
    expect(await screen.findByRole('header', { name: 'Check your inbox' })).toBeTruthy()
    expect(sent.map((c) => c.url)).toEqual(['/auth/link/verify', '/auth/link/request'])
  })

  it.each([
    ['no token', { email: 'ada@example.com' }],
    ['no email', { token: 'tok' }],
    ['a blank email', { token: 'tok', email: '   ' }],
  ])('%s is the dead-link state and is never posted', async (_name, params) => {
    openWith(params)
    const sent = serveLink(() => verified())
    await renderScreen(<Link />)
    expect(
      await screen.findByRole('header', { name: 'This link has expired or was already used' })
    ).toBeTruthy()
    expect(sent).toHaveLength(0)
  })

  it('another failure says so, and Try again posts again', async () => {
    let calls = 0
    const sent = serveLink(() => {
      calls += 1
      return calls === 1 ? 'network-error' : verified()
    })
    await renderScreen(<Link />)
    expect(
      await screen.findByText('We couldn’t sign you in. Check your connection and try again.')
    ).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/', { withAnchor: true })
    })
    expect(sent).toHaveLength(2)
  })

  it('Try again pressed twice in one frame posts once', async () => {
    let calls = 0
    const sent = serveLink(() => {
      calls += 1
      return calls === 1 ? 'network-error' : verified()
    })
    await renderScreen(<Link />)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    await act(async () => {
      void fireEvent.press(retry)
      void fireEvent.press(retry)
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/', { withAnchor: true })
    })
    expect(sent.filter((c) => c.url === '/auth/link/verify')).toHaveLength(2)
  })

  it('Continue pressed twice in one frame posts once', async () => {
    useAuthStore.getState().login('a', userOf('bob@example.com'))
    setStatus('signed-in')
    await refreshTokenStore.write('bobs-token')
    const sent = serveLink((config) => (config.url === '/auth/logout' ? OK : verified()))
    await renderScreen(<Link />)
    const proceed = screen.getByRole('button', { name: 'Continue as ada@example.com' })
    await act(async () => {
      void fireEvent.press(proceed)
      void fireEvent.press(proceed)
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/', { withAnchor: true })
    })
    expect(sent.filter((c) => c.url === '/auth/link/verify')).toHaveLength(1)
  })

  it('a 500 is another failure, not a dead link', async () => {
    serveLink(() => ({ status: 500, data: { success: false } }))
    await renderScreen(<Link />)
    expect(
      await screen.findByText('We couldn’t sign you in. Check your connection and try again.')
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('SignInNotKeptError shows its row, with a way to request a new link', async () => {
    const realSet = setItemAsync.getMockImplementation()!
    setItemAsync.mockImplementation((key, value, options) =>
      key === 'refresh_token' ? Promise.reject(new Error('keychain')) : realSet(key, value, options)
    )
    serveLink((config) =>
      config.url === '/auth/link/verify' ? verified() : { status: 500, data: {} }
    )
    await renderScreen(<Link />)
    expect(
      await screen.findByText(
        'We couldn’t keep you signed in on this device. Request a new link.',
        {},
        { timeout: 5000 }
      )
    ).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Email me a new link' })).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
  })
})

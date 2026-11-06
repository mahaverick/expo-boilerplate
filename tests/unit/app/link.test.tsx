import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { StrictMode } from 'react'
import Link from '@/app/auth/link'
import { useSessionStatus } from '@/http/session-lifecycle'
import type { SessionStatus } from '@/http/session-lifecycle'
import { refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { resetSecureStore, setItemAsync } from '@/tests/mocks/expo-secure-store'
import { bodyOf, renderScreen, restoreApi, screenTree, serve } from '@/tests/support/api'
import type { FakeAnswer } from '@/tests/support/api'
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
const verified = (): FakeAnswer => ({
  status: 200,
  data: {
    success: true,
    data: {
      accessToken: 'access',
      refreshToken: 'refresh',
      refreshTokenExpiresAt: '2027-01-01',
      user: userOf('ada@example.com'),
      isNewUser: true,
      redirect: '/somewhere',
    },
  },
})

/** An empty success. */
const OK: FakeAnswer = { status: 200, data: { success: true, data: null } }

/**
 * Sets the link's query parameters.
 * @param params - The `token` and `email` the route carries.
 */
function openWith(params: { token?: string; email?: string }): void {
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
    const sent = serve(
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
      expect(router.replace).toHaveBeenCalledWith('/')
    })
    expect(sent).toHaveLength(1)
  })

  it('posts once under StrictMode', async () => {
    const sent = serve(() => verified())
    await renderScreen(
      <StrictMode>
        <Link />
      </StrictMode>
    )
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/')
    })
    expect(sent).toHaveLength(1)
  })

  it('lands on Home after a success, and ignores the redirect', async () => {
    serve(() => verified())
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledTimes(1)
    })
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(await refreshTokenStore.read()).toBe('refresh')
  })

  it('trims the email', async () => {
    openWith({ token: 'tok', email: '  ada@example.com ' })
    const sent = serve(() => verified())
    await renderScreen(<Link />)
    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    expect(bodyOf(sent[0])).toMatchObject({ email: 'ada@example.com' })
  })

  it('waits for the restore before it decides', async () => {
    setStatus('restoring')
    const sent = serve(() => verified())
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
    const sent = serve(() => verified())
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
    const sent = serve(() => verified())
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
    const sent = serve(async (config) => {
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
      expect(router.replace).toHaveBeenCalledWith('/')
    })
    expect(router.replace).not.toHaveBeenCalledWith('/login')
  })

  it('Stay signed in goes Home', async () => {
    useAuthStore.getState().login('a', userOf('bob@example.com'))
    setStatus('signed-in')
    const sent = serve(() => verified())
    await renderScreen(<Link />)
    await fireEvent.press(screen.getByRole('button', { name: 'Stay signed in' }))
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(sent).toHaveLength(0)
  })

  it('400 shows the dead-link state', async () => {
    const sent = serve((config) =>
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
    const sent = serve(() => verified())
    await renderScreen(<Link />)
    expect(
      await screen.findByRole('header', { name: 'This link has expired or was already used' })
    ).toBeTruthy()
    expect(sent).toHaveLength(0)
  })

  it('another failure says so, and Try again posts again', async () => {
    let calls = 0
    const sent = serve(() => {
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
      expect(router.replace).toHaveBeenCalledWith('/')
    })
    expect(sent).toHaveLength(2)
  })

  it('a 500 is another failure, not a dead link', async () => {
    serve(() => ({ status: 500, data: { success: false } }))
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
    serve((config) => (config.url === '/auth/link/verify' ? verified() : { status: 500, data: {} }))
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

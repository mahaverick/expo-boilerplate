import { jest } from '@jest/globals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { AxiosError, type AxiosAdapter } from 'axios'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { useSignOut } from '@/hooks/use-sign-out'
import { isAuthVerdict } from '@/http/auth-verdict'
import { apiClient } from '@/http/client'
import { ensureSession, resetSessionForTests } from '@/http/session'
import { pendingRevokeStore, refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { useOwnSignOutStore } from '@/states/own-sign-out.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { getItemAsync, resetSecureStore, setItemAsync } from '@/tests/mocks/expo-secure-store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

/** The adapter `apiClient` had before each test. */
const realAdapter = apiClient.defaults.adapter

/** One ordered log of the steps a sign-out takes. */
let log: string[]
let queryClient: QueryClient

/**
 * Answers the logout with a status, or with no response when `undefined`.
 * Logs `logout` with the state the device had when the request left.
 * @param status - The HTTP status, or `undefined` for a network failure.
 */
function answerWith(status: number | undefined): void {
  /** Logs the request, then answers or rejects as `status` says. */
  const adapter: AxiosAdapter = async (config) => {
    log.push(`logout(stored=${await refreshTokenStore.read().catch(() => 'unreadable')})`)
    if (status === undefined) throw new AxiosError('offline', 'ERR_NETWORK', config)
    return { data: {}, status, statusText: '', headers: {}, config }
  }
  apiClient.defaults.adapter = adapter
}

/** Wraps a hook in the test's query client. */
function wrapper({ children }: { children: ReactNode }): ReactNode {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

beforeEach(async () => {
  resetSecureStore()
  log = []
  queryClient = new QueryClient()
  jest.spyOn(queryClient, 'clear').mockImplementation(() => void log.push('queryClient.clear'))
  jest
    .mocked(router.replace)
    .mockReset()
    .mockImplementation(() => void log.push('replace'))
  useAuthStore.setState({ accessToken: 'access', isAuthenticated: true, isBootstrapped: true })
  usePasskeySetupStore.setState({ required: true })
  await refreshTokenStore.write('tok')
})

afterEach(() => {
  apiClient.defaults.adapter = realAdapter
})

describe('useSignOut', () => {
  it('marks the sign-out as the person’s own before the store signs out', async () => {
    answerWith(200)
    useOwnSignOutStore.setState({ isOwn: false })
    const seen: boolean[] = []
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (!state.isAuthenticated) seen.push(useOwnSignOutStore.getState().isOwn)
    })
    const { result } = await renderHook(() => useSignOut(), { wrapper })
    await act(() => result.current.signOut())
    unsubscribe()
    expect(seen[0]).toBe(true)
  })

  it('clears the token, the query cache and the store before the logout request', async () => {
    answerWith(200)
    const { result } = await renderHook(() => useSignOut(), { wrapper })
    await act(() => result.current.signOut())
    expect(log).toEqual(['queryClient.clear', 'replace', 'logout(stored=null)'])
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(usePasskeySetupStore.getState().required).toBe(false)
    expect(await pendingRevokeStore.list()).toEqual([])
  })

  it('navigates to /login unless navigate is false', async () => {
    answerWith(200)
    const { result } = await renderHook(() => useSignOut(), { wrapper })
    await act(() => result.current.signOut())
    expect(router.replace).toHaveBeenCalledWith('/login')
    jest.mocked(router.replace).mockClear()
    await refreshTokenStore.write('tok2')
    await act(() => result.current.signOut({ navigate: false }))
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('ends signed out on the device when the logout gets no response', async () => {
    answerWith(undefined)
    const { result } = await renderHook(() => useSignOut(), { wrapper })
    await act(() => result.current.signOut())
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(await refreshTokenStore.read()).toBeNull()
    expect(await pendingRevokeStore.list()).toEqual(['tok'])
  })

  it('still signs out and revokes when pending_revoke cannot be written', async () => {
    answerWith(200)
    setItemAsync.mockRejectedValue(
      Object.assign(new Error('keychain locked'), { code: 'ERR_KEY_CHAIN' })
    )
    const { result } = await renderHook(() => useSignOut(), { wrapper })
    await act(() => result.current.signOut())
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(router.replace).toHaveBeenCalledWith('/login')
    expect(log).toContain('logout(stored=null)')
  })

  it('posts the logout when the keychain refuses both the save and the later reads', async () => {
    answerWith(200)
    setItemAsync.mockRejectedValue(
      Object.assign(new Error('keychain locked'), { code: 'ERR_KEY_CHAIN' })
    )
    const { result } = await renderHook(() => useSignOut(), { wrapper })
    // The token is read once; every read after that fails.
    getItemAsync.mockImplementationOnce(() => Promise.resolve('tok'))
    getItemAsync.mockRejectedValue(
      Object.assign(new Error('keychain locked'), { code: 'ERR_KEY_CHAIN' })
    )
    await act(() => result.current.signOut())
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(log.some((entry) => entry.startsWith('logout('))).toBe(true)
  })

  it('signs out without a request when no token is stored', async () => {
    answerWith(200)
    await refreshTokenStore.clear()
    const { result } = await renderHook(() => useSignOut(), { wrapper })
    await act(() => result.current.signOut())
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(log).toEqual(['queryClient.clear', 'replace'])
  })

  it('is pending until the logout settles, and a second call returns the same promise', async () => {
    let release!: () => void
    /** Captures the resolver, so the test decides when the logout answers. */
    const hold = (resolve: () => void): void => {
      release = resolve
    }
    const gate = new Promise<void>(hold)
    /** Holds the logout until the test releases it. */
    const held: AxiosAdapter = async (config) => {
      await gate
      return { data: {}, status: 200, statusText: '', headers: {}, config }
    }
    apiClient.defaults.adapter = held
    const { result } = await renderHook(() => useSignOut(), { wrapper })
    let first!: Promise<void>
    let second!: Promise<void>
    await act(async () => {
      first = result.current.signOut()
      second = result.current.signOut()
      await Promise.resolve()
    })
    expect(second).toBe(first)
    expect(result.current.isPending).toBe(true)
    await act(async () => {
      release()
      await first
    })
    expect(result.current.isPending).toBe(false)
  })
})

describe('useSignOut during a refresh', () => {
  /** Releases the held answer, when a case holds one. */
  let release: (() => void) | undefined

  /**
   * Serves the refresh, the profile and the logout. Holds the route `held`
   * until `release()`, and logs each logout's token.
   * @param held - The route whose answer waits.
   */
  function serveHolding(held: '/auth/refresh' | '/profile'): void {
    /** Answers each route; the held one waits. */
    const adapter: AxiosAdapter = async (config) => {
      const url = config.url ?? ''
      if (url === held) await new Promise<void>((resolve) => (release = resolve))
      if (url === '/auth/logout') {
        log.push(
          `logout:${(JSON.parse(config.data as string) as { refreshToken: string }).refreshToken}`
        )
      }
      const data =
        url === '/auth/refresh'
          ? { accessToken: 'refreshed', refreshToken: 'rotated' }
          : url === '/profile'
            ? { id: 'user-1' }
            : {}
      return { data: { success: true, data }, status: 200, statusText: '', headers: {}, config }
    }
    apiClient.defaults.adapter = adapter
  }

  beforeEach(() => {
    resetSessionForTests()
    release = undefined
  })

  it.each(['/auth/refresh', '/profile'] as const)(
    'stays signed out when the refresh answers after the sign-out (%s held)',
    async (held) => {
      serveHolding(held)
      const { result } = await renderHook(() => useSignOut(), { wrapper })
      const refresh = ensureSession().catch((error: unknown) => error)
      await waitFor(() => {
        expect(release).toBeDefined()
      })
      await act(() => result.current.signOut())
      release?.()
      const outcome = await refresh
      expect(outcome).toBeInstanceOf(Error)
      expect(isAuthVerdict(outcome)).toBe(false)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      await expect(refreshTokenStore.read()).resolves.toBeNull()
    }
  )

  it('revokes the rotated token a stale refresh could not keep', async () => {
    serveHolding('/auth/refresh')
    const { result } = await renderHook(() => useSignOut(), { wrapper })
    const refresh = ensureSession().catch(() => {})
    await waitFor(() => {
      expect(release).toBeDefined()
    })
    await act(() => result.current.signOut())
    release?.()
    await refresh
    await waitFor(() => {
      expect(log).toContain('logout:rotated')
    })
    await expect(refreshTokenStore.read()).resolves.toBeNull()
  })
})

import { jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { AxiosError } from 'axios'
import { AppState, type AppStateStatus } from 'react-native'
import { apiClient } from '@/http/client'
import * as session from '@/http/session'
import { resetSessionForTests } from '@/http/session'
import {
  installForegroundRefresh,
  resetSessionLifecycleForTests,
  restoreSession,
  useSessionStatus,
} from '@/http/session-lifecycle'
import { pendingRevokeStore, refreshTokenStore } from '@/http/token-store'
import { useAuthStore } from '@/states/auth.store'
import { resetSecureStore } from '@/tests/mocks/expo-secure-store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import type { User } from '@/types/api.types'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

/** What the mocked MMKV instance holds. */
const mockStorage = new Map<string, string>()
jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => {
      mockStorage.set(key, value)
    },
  },
}))

/** The ordered log of the API calls a case made. */
let log: string[]
/** Resolves a held `/auth/logout` answer, when a case holds one. */
let releaseLogout: (() => void) | undefined

/**
 * Answers every API call, in the shape the case needs.
 * @param options - `refresh` is the refresh outcome; `holdLogout` delays the logout answer.
 */
function serve(options: { refresh: 'ok' | 'verdict' | 'offline'; holdLogout?: boolean }): void {
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? ''
    log.push(
      url === '/auth/logout'
        ? `logout:${(JSON.parse(config.data as string) as { refreshToken: string }).refreshToken}`
        : url
    )
    /** Builds a response with a status. */
    const respond = (status: number, data: unknown = {}) => ({
      data: { success: status < 400, data },
      status,
      statusText: '',
      headers: {},
      config,
    })
    /** Rejects the way axios does. */
    const fail = (status?: number) => {
      const error =
        status === undefined
          ? new AxiosError('offline', 'ERR_NETWORK', config)
          : new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, {
              ...respond(status),
              data: {
                success: false,
                code: 'INVALID_REFRESH_TOKEN',
                message: 'no',
              },
            })
      return Promise.reject(error)
    }
    if (url === '/auth/logout') {
      if (options.holdLogout) {
        return new Promise((resolve) => {
          releaseLogout = () => {
            resolve(respond(200))
          }
        })
      }
      return Promise.resolve(respond(200))
    }
    if (url === '/auth/refresh') {
      if (options.refresh === 'verdict') return fail(401)
      if (options.refresh === 'offline') return fail()
      return Promise.resolve(respond(200, { accessToken: 'access', refreshToken: 'rotated' }))
    }
    return Promise.resolve(respond(200, { id: 'user-1' }))
  }
}

beforeEach(() => {
  resetSecureStore()
  resetSessionForTests()
  resetSessionLifecycleForTests()
  mockStorage.clear()
  log = []
  releaseLogout = undefined
})

afterEach(() => {
  useAuthStore.getState().logout()
  jest.restoreAllMocks()
})

describe('restoreSession', () => {
  it('runs the reinstall check, then the pending revoke, then ensureSession', async () => {
    await refreshTokenStore.write('previous-owner')
    await pendingRevokeStore.add('earlier')
    serve({ refresh: 'ok' })
    const calls = jest.spyOn(session, 'ensureSession')
    calls.mockImplementation(() => {
      log.push('ensureSession')
      return Promise.reject(new Error('stop'))
    })
    await restoreSession()
    // The reinstall revoke, then the retry of the earlier pending token, then ensureSession.
    expect(log).toEqual(['logout:previous-owner', 'logout:earlier', 'ensureSession'])
    expect(mockStorage.get('installed')).toBe('1')
  })

  it('with no installed marker, it revokes any stored token, clears it, then writes the marker', async () => {
    await refreshTokenStore.write('previous-owner')
    serve({ refresh: 'ok', holdLogout: true })
    const done = restoreSession()
    await waitFor(() => {
      expect(log).toEqual(['logout:previous-owner'])
    })
    // The delayed logout holds the restore: no refresh and no marker yet.
    expect(log).toEqual(['logout:previous-owner'])
    expect(mockStorage.get('installed')).toBeUndefined()
    releaseLogout?.()
    await done
    expect(mockStorage.get('installed')).toBe('1')
    // The old token was cleared before the refresh, so the refresh found no token.
    expect(log).toEqual(['logout:previous-owner'])
    await expect(refreshTokenStore.read()).resolves.toBeNull()
  })

  it('with the marker present, it leaves a stored token alone', async () => {
    mockStorage.set('installed', '1')
    await refreshTokenStore.write('mine')
    serve({ refresh: 'ok' })
    await restoreSession()
    expect(log).toEqual(['/auth/refresh', '/profile'])
    await expect(refreshTokenStore.read()).resolves.toBe('rotated')
  })

  it('writes the marker when no token is stored', async () => {
    serve({ refresh: 'ok' })
    await restoreSession()
    expect(mockStorage.get('installed')).toBe('1')
    expect(log).toEqual([])
  })

  it('a verdict ends signed-out', async () => {
    mockStorage.set('installed', '1')
    await refreshTokenStore.write('dead')
    serve({ refresh: 'verdict' })
    await restoreSession()
    const { result } = await renderHook(() => useSessionStatus())
    expect(result.current).toBe('signed-out')
    await expect(refreshTokenStore.read()).resolves.toBeNull()
  })

  it('a network failure ends signed-out too, and keeps the token for the next foreground', async () => {
    mockStorage.set('installed', '1')
    await refreshTokenStore.write('kept')
    serve({ refresh: 'offline' })
    await expect(restoreSession()).resolves.toBeUndefined()
    const { result } = await renderHook(() => useSessionStatus())
    expect(result.current).toBe('signed-out')
    await expect(refreshTokenStore.read()).resolves.toBe('kept')
  })

  it('reports restoring until it settles, then follows the auth store', async () => {
    mockStorage.set('installed', '1')
    serve({ refresh: 'ok' })
    const { result } = await renderHook(() => useSessionStatus())
    expect(result.current).toBe('restoring')
    await refreshTokenStore.write('mine')
    await restoreSession()
    expect(result.current).toBe('signed-in')
    useAuthStore.getState().logout()
    expect((await renderHook(() => useSessionStatus())).result.current).toBe('signed-out')
    useAuthStore.getState().login('a', { id: 'u' } as User)
    expect((await renderHook(() => useSessionStatus())).result.current).toBe('signed-in')
  })

  it('runs once per process: a second call returns the same promise', async () => {
    mockStorage.set('installed', '1')
    serve({ refresh: 'ok' })
    const first = restoreSession()
    expect(restoreSession()).toBe(first)
    await first
  })
})

describe('installForegroundRefresh', () => {
  /**
   * Captures the AppState listener the install registers.
   * @returns The listener and the unsubscribe spy.
   */
  function captureListener() {
    const remove = jest.fn()
    let listener: ((state: AppStateStatus) => void) | undefined
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listener = handler
      return { remove }
    })
    return { remove, emit: (state: AppStateStatus) => listener?.(state) }
  }

  it('runs ensureSession when AppState becomes active, and ignores a non-verdict failure', async () => {
    mockStorage.set('installed', '1')
    await refreshTokenStore.write('kept')
    serve({ refresh: 'offline' })
    await restoreSession()
    log = []
    const { emit, remove } = captureListener()
    const off = installForegroundRefresh()
    emit('background')
    emit('active')
    await waitFor(() => {
      expect(log.length).toBeGreaterThan(0)
    })
    // The client may retry a network failure; every call is a refresh.
    expect(log.length).toBeGreaterThan(0)
    expect(new Set(log)).toEqual(new Set(['/auth/refresh']))
    await expect(refreshTokenStore.read()).resolves.toBe('kept')
    // A later success signs the person in.
    serve({ refresh: 'ok' })
    emit('inactive')
    emit('active')
    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    off()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('does not refresh on a change that is not a return to active', async () => {
    mockStorage.set('installed', '1')
    serve({ refresh: 'ok' })
    await restoreSession()
    log = []
    const { emit } = captureListener()
    installForegroundRefresh()
    emit('background')
    emit('inactive')
    await act(async () => {})
    expect(log).toEqual([])
  })
})

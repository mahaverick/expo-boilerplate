import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { resetExposureForTests } from '@/observability/flags/exposure'
import { forgetFeatureProperties } from '@/observability/flags/feature-property-names'
import {
  resetFlagHooksForTests,
  useFeaturePropertiesSync,
  useFlagValues,
  useVariant,
} from '@/observability/flags/flag-hooks'
import { flagsKey } from '@/observability/flags/flag-query'
import { fallbackFlags } from '@/observability/flags/flag-values'
import { useAuthStore } from '@/states/auth.store'
import { restoreApi, screenTree, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { envelope, NOT_FOUND } from '@/tests/support/workspace-api'

const mockRegister = jest.fn()
const mockUnregister = jest.fn()
let mockParams: Record<string, string> = {}

jest.mock('expo-router', () => ({ useGlobalSearchParams: () => mockParams }))
jest.mock('@/observability/telemetry/telemetry', () => ({
  getAnalyticsSessionIdFor: () => null,
  registerFeatureProperties: (props: unknown) => mockRegister(props),
  unregisterFeatureProperties: (names: unknown) => mockUnregister(names),
}))

let client: QueryClient
/** Each request as `METHOD url`, in order. */
let sent: string[]
let answers: Record<string, ReturnType<typeof envelope>>
/** When set, every answer waits for it, so a test sees the state before the answer. */
let gate: Promise<void> | null = null

/** Serves the answers by `METHOD url`; unlisted exposure posts answer 204. */
function serveFlags(more: typeof answers) {
  answers = more
  serve(async (config) => {
    if (gate) await gate
    const key = `${(config.method ?? 'get').toUpperCase()} ${config.url ?? ''}`
    sent.push(key)
    return answers[key] ?? (key.startsWith('POST') ? { status: 204, data: null } : NOT_FOUND)
  })
}

/** Wraps a hook in the shared query client. */
function wrapper({ children }: { children: ReactNode }) {
  return screenTree(<>{children}</>, client)
}

/** A `/flags` answer over the fallbacks. */
function flags(overrides: Record<string, boolean | string>) {
  return envelope({ flags: { ...fallbackFlags(), ...overrides } })
}

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  sent = []
  gate = null
  mockParams = {}
  mockRegister.mockClear()
  mockUnregister.mockClear()
  resetExposureForTests()
  resetFlagHooksForTests()
  forgetFeatureProperties()
  useAuthStore.getState().login('tok', { id: 'u1' } as never)
})

afterEach(() => {
  jest.useRealTimers()
  restoreApi()
  client.clear()
  useAuthStore.getState().logout()
})

describe('useFlagValues', () => {
  it('reads the workspace given by slug over the route', async () => {
    serveFlags({ 'GET /tenants/acme/flags': flags({ example_beta_page: true }) })
    const { result } = await renderHook(() => useFlagValues('acme'), { wrapper })
    await waitFor(() => {
      expect(result.current.example_beta_page).toBe(true)
    })
    expect(sent).toEqual(['GET /tenants/acme/flags'])
  })

  it('returns the fallbacks while pending, then the server’s values', async () => {
    serveFlags({ 'GET /flags': flags({ example_beta_page: true }) })
    const { result } = await renderHook(() => useFlagValues(), { wrapper })
    expect(result.current).toEqual(fallbackFlags())
    await waitFor(() => {
      expect(result.current.example_beta_page).toBe(true)
    })
  })

  it('reads the workspace’s flags under a slug route', async () => {
    mockParams = { slug: 'acme' }
    serveFlags({ 'GET /tenants/acme/flags': flags({ example_beta_page: true }) })
    const { result } = await renderHook(() => useFlagValues(), { wrapper })
    await waitFor(() => {
      expect(result.current.example_beta_page).toBe(true)
    })
    expect(sent).toContain('GET /tenants/acme/flags')
    expect(client.getQueryData(flagsKey({ kind: 'tenant', slug: 'acme' }))).toBeDefined()
  })

  it('returns the fallbacks when the read fails, without a retry', async () => {
    serveFlags({})
    const { result } = await renderHook(() => useFlagValues(), { wrapper })
    await waitFor(() => {
      expect(sent).toEqual(['GET /flags'])
    })
    expect(result.current).toEqual(fallbackFlags())
  })

  it('returns the fallbacks when a refetch fails after a good read', async () => {
    serveFlags({ 'GET /flags': flags({ example_beta_page: true }) })
    const { result } = await renderHook(() => useFlagValues(), { wrapper })
    await waitFor(() => {
      expect(result.current.example_beta_page).toBe(true)
    })
    serveFlags({})
    await client.refetchQueries({ queryKey: flagsKey({ kind: 'none' }) })
    await waitFor(() => {
      expect(result.current.example_beta_page).toBe(false)
    })
  })

  it('a different person never sees the last person’s flags', async () => {
    serveFlags({ 'GET /flags': flags({ example_beta_page: true }) })
    const first = await renderHook(() => useFlagValues(), { wrapper })
    await waitFor(() => {
      expect(first.result.current.example_beta_page).toBe(true)
    })
    await first.unmount()
    // Sign-out empties the cache (useSignOut and the forced sign-out do).
    client.clear()
    serveFlags({ 'GET /flags': new Promise(() => {}) as never })
    const second = await renderHook(() => useFlagValues(), { wrapper })
    expect(second.result.current).toEqual(fallbackFlags())
  })
})

describe('useVariant', () => {
  it('posts nothing and reads nothing while signed out', async () => {
    useAuthStore.getState().logout()
    serveFlags({ 'GET /flags': flags({ example_cta_experiment: 'bold' }) })
    const { result } = await renderHook(() => useVariant('example_cta_experiment'), { wrapper })
    await jest.advanceTimersByTimeAsync(200)
    expect(result.current).toBe('control')
    expect(sent).toEqual([])
  })

  it('reads the workspace given by slug over the route', async () => {
    serveFlags({ 'GET /tenants/acme/flags': flags({ example_cta_experiment: 'bold' }) })
    const { result } = await renderHook(() => useVariant('example_cta_experiment', 'acme'), {
      wrapper,
    })
    await waitFor(() => {
      expect(result.current).toBe('bold')
    })
    await waitFor(() => {
      expect(sent).toContain('POST /tenants/acme/flags/exposures')
    })
    expect(sent).not.toContain('GET /flags')
  })

  it('returns the fallback variant until loaded, then reports one exposure', async () => {
    const deferred = Promise.withResolvers<void>()
    gate = deferred.promise
    serveFlags({ 'GET /flags': flags({ example_cta_experiment: 'bold' }) })
    const { result } = await renderHook(() => useVariant('example_cta_experiment'), { wrapper })
    expect(result.current).toBe('control')
    deferred.resolve()
    await waitFor(() => {
      expect(result.current).toBe('bold')
    })
    await waitFor(() => {
      expect(sent).toContain('POST /flags/exposures')
    })
    expect(sent.filter((entry) => entry.startsWith('POST'))).toHaveLength(1)
  })

  it('reports nothing while pending or after a failed read', async () => {
    serveFlags({})
    await renderHook(() => useVariant('example_cta_experiment'), { wrapper })
    await waitFor(() => {
      expect(sent).toEqual(['GET /flags'])
    })
    await jest.advanceTimersByTimeAsync(200)
    expect(sent).toEqual(['GET /flags'])
  })

  it('reports to the workspace’s endpoint under a slug route', async () => {
    mockParams = { slug: 'acme' }
    serveFlags({ 'GET /tenants/acme/flags': flags({}) })
    await renderHook(() => useVariant('example_cta_experiment'), { wrapper })
    await waitFor(() => {
      expect(sent).toContain('POST /tenants/acme/flags/exposures')
    })
  })
})

describe('useFeaturePropertiesSync', () => {
  beforeEach(() => {
    useAuthStore.getState().login('tok', { id: 'u1' } as never)
  })

  afterEach(() => {
    useAuthStore.getState().logout()
  })

  it('registers again after an in-place switch of person whose values are equal', async () => {
    serveFlags({ 'GET /flags': flags({ example_beta_page: true }) })
    await renderHook(() => useFeaturePropertiesSync(), { wrapper })
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1)
    })
    // The identity forgets the registered names, then the next person signs in.
    forgetFeatureProperties()
    await act(() => {
      useAuthStore.getState().login('tok2', { id: 'u2' } as never)
    })
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(2)
    })
  })

  it('unregisters the old workspace’s set when the route moves to one still loading', async () => {
    mockParams = { slug: 'a' }
    serve((config) => {
      if (config.url === '/tenants/a/flags') return flags({ example_beta_page: true })
      return new Promise(() => {})
    })
    const { rerender } = await renderHook(() => useFeaturePropertiesSync(), { wrapper })
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1)
    })
    mockParams = { slug: 'b' }
    await rerender({})
    await waitFor(() => {
      expect(mockUnregister).toHaveBeenCalledWith([
        '$feature/example_beta_page',
        '$feature/example_cta_experiment',
      ])
    })
  })

  it('reads and registers nothing while signed out', async () => {
    useAuthStore.getState().logout()
    serveFlags({ 'GET /flags': flags({}) })
    await renderHook(() => useFeaturePropertiesSync(), { wrapper })
    await jest.advanceTimersByTimeAsync(100)
    expect(sent).toEqual([])
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('registers $feature/<key> for each value, and skips an unchanged set', async () => {
    serveFlags({ 'GET /flags': flags({ example_beta_page: true, example_cta_experiment: 'bold' }) })
    await renderHook(() => useFeaturePropertiesSync(), { wrapper })
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        '$feature/example_beta_page': true,
        '$feature/example_cta_experiment': 'bold',
      })
    })
    await client.refetchQueries({ queryKey: flagsKey({ kind: 'none' }) })
    await jest.advanceTimersByTimeAsync(50)
    expect(mockRegister).toHaveBeenCalledTimes(1)
  })

  it('unregisters the names when the latest read fails', async () => {
    serveFlags({ 'GET /flags': flags({}) })
    await renderHook(() => useFeaturePropertiesSync(), { wrapper })
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1)
    })
    serveFlags({})
    await client.refetchQueries({ queryKey: flagsKey({ kind: 'none' }) })
    await waitFor(() => {
      expect(mockUnregister).toHaveBeenCalledWith([
        '$feature/example_beta_page',
        '$feature/example_cta_experiment',
      ])
    })
  })
})

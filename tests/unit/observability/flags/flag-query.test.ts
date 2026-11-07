import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react-native'
import {
  fetchFlags,
  flagsKey,
  flagsPathFor,
  flagsQueryOptions,
  FLAGS_REFETCH_MS,
  FLAGS_STALE_MS,
  flagScopeId,
  useFlagScope,
} from '@/observability/flags/flag-query'
import { tenantKeys } from '@/queries/tenant.queries'
import { restoreApi } from '@/tests/support/api'
import { afterEach, describe, expect, it } from '@/tests/support/runner'
import { envelope, NOT_FOUND, serveWorkspace } from '@/tests/support/workspace-api'

let mockParams: Record<string, string | string[] | undefined> = {}

jest.mock('expo-router', () => ({ useGlobalSearchParams: () => mockParams }))

afterEach(() => {
  restoreApi()
  mockParams = {}
})

describe('useFlagScope', () => {
  it('is the workspace under a slug route', async () => {
    mockParams = { slug: 'acme' }
    const { result } = await renderHook(() => useFlagScope())
    expect(result.current).toEqual({ kind: 'tenant', slug: 'acme' })
  })

  it.each([[{}], [{ slug: '' }], [{ slug: ['a', 'b'] }], [{ other: 'x' }]])(
    'is none for %j',
    async (params) => {
      mockParams = params
      const { result } = await renderHook(() => useFlagScope())
      expect(result.current).toEqual({ kind: 'none' })
    }
  )

  it('is the same object while the slug is unchanged', async () => {
    mockParams = { slug: 'acme' }
    const { result, rerender } = await renderHook(() => useFlagScope())
    const first = result.current
    await rerender({})
    expect(result.current).toBe(first)
  })
})

describe('scope paths and keys', () => {
  it('reads /tenants/<slug>/flags for a workspace and /flags otherwise', () => {
    expect(flagsPathFor({ kind: 'tenant', slug: 'acme' })).toBe('/tenants/acme/flags')
    expect(flagsPathFor({ kind: 'none' })).toBe('/flags')
  })

  it('keys a workspace under its detail key, so dropTenantCache clears it', () => {
    expect(flagsKey({ kind: 'tenant', slug: 'acme' })).toEqual([
      ...tenantKeys.detail('acme'),
      'flags',
    ])
    expect(flagsKey({ kind: 'none' })).toEqual(['flags', 'none'])
  })

  it('names a scope for the exposure dedupe', () => {
    expect(flagScopeId({ kind: 'tenant', slug: 'acme' })).toBe('tenant:acme')
    expect(flagScopeId({ kind: 'none' })).toBe('none')
  })
})

describe('flagsQueryOptions', () => {
  it('is fresh 5 minutes, refetches every 10 and never retries', () => {
    const options = flagsQueryOptions({ kind: 'none' })
    expect(options.staleTime).toBe(5 * 60_000)
    expect(options.refetchInterval).toBe(10 * 60_000)
    expect(FLAGS_STALE_MS).toBe(5 * 60_000)
    expect(FLAGS_REFETCH_MS).toBe(10 * 60_000)
    expect(options.retry).toBe(false)
  })

  it('reads the scope’s path through normalizeFlags', async () => {
    const sent = serveWorkspace({
      'GET /tenants/acme/flags': envelope({
        flags: { example_beta_page: true, example_cta_experiment: 'bold', other: true },
      }),
    })
    const client = new QueryClient()
    const values = await client.fetchQuery(flagsQueryOptions({ kind: 'tenant', slug: 'acme' }))
    expect(values).toEqual({ example_beta_page: true, example_cta_experiment: 'bold' })
    expect(sent.map((request) => request.url)).toEqual(['/tenants/acme/flags'])
  })
})

describe('fetchFlags', () => {
  it('throws when the answer has no flags object', async () => {
    serveWorkspace({ 'GET /flags': envelope({ evaluatedAt: 'x' }) })
    await expect(fetchFlags({ kind: 'none' })).rejects.toThrow('no flags object')
  })

  it('throws when the request fails', async () => {
    serveWorkspace({ 'GET /flags': NOT_FOUND })
    await expect(fetchFlags({ kind: 'none' })).rejects.toThrow()
  })
})

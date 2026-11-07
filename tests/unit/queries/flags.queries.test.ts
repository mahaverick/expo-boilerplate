import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import { createElement, type ReactNode } from 'react'
import { useTenantFlags } from '@/queries/flags.queries'
import { restoreApi } from '@/tests/support/api'
import { afterEach, describe, expect, it } from '@/tests/support/runner'
import { envelope, NOT_FOUND, serveWorkspace } from '@/tests/support/workspace-api'

afterEach(() => {
  restoreApi()
})

/**
 * A wrapper holding a fresh query client.
 * @returns The wrapper component.
 */
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
}

describe('useTenantFlags', () => {
  it('reads the workspace’s flags through normalizeFlags', async () => {
    const sent = serveWorkspace({
      'GET /tenants/acme/flags': envelope({
        flags: { example_beta_page: true, example_cta_experiment: 'bold', other: true },
        evaluatedAt: '2026-11-07T00:00:00.000Z',
      }),
    })
    const { result } = await renderHook(() => useTenantFlags('acme'), { wrapper: wrapper() })
    await waitFor(() => {
      expect(result.current.example_beta_page).toBe(true)
    })
    expect(result.current).toEqual({ example_beta_page: true, example_cta_experiment: 'bold' })
    expect(sent.some((request) => request.url === '/tenants/acme/flags')).toBe(true)
  })

  it('is off while the read is pending', async () => {
    serveWorkspace({
      'GET /tenants/acme/flags': envelope({ flags: { example_beta_page: true } }),
    })
    const { result } = await renderHook(() => useTenantFlags('acme'), { wrapper: wrapper() })
    expect(result.current.example_beta_page).toBe(false)
  })

  it('falls back to each flag’s default when the read fails, without a retry', async () => {
    const sent = serveWorkspace({ 'GET /tenants/acme/flags': NOT_FOUND })
    const { result } = await renderHook(() => useTenantFlags('acme'), { wrapper: wrapper() })
    await waitFor(() => {
      expect(sent.filter((request) => request.url === '/tenants/acme/flags')).toHaveLength(1)
    })
    expect(result.current).toEqual({ example_beta_page: false, example_cta_experiment: 'control' })
  })

  it('falls back when the answer has no flags object', async () => {
    serveWorkspace({ 'GET /tenants/acme/flags': envelope({ evaluatedAt: 'x' }) })
    const { result } = await renderHook(() => useTenantFlags('acme'), { wrapper: wrapper() })
    await waitFor(() => {
      expect(result.current.example_beta_page).toBe(false)
    })
  })
})

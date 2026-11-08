import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { resetExposureForTests } from '@/observability/flags/exposure'
import { useVariant } from '@/observability/flags/flag-hooks'
import type { MultivariateClientFlagKey } from '@/observability/flags/flag-types'
import { useAuthStore } from '@/states/auth.store'
import { restoreApi, screenTree, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { envelope, NOT_FOUND } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({ useGlobalSearchParams: () => ({}) }))
jest.mock('@/observability/telemetry/telemetry', () => ({ getAnalyticsSessionIdFor: () => null }))
jest.mock('@/observability/flags/flag-keys', () => ({
  CLIENT_FLAGS: {
    test_exp: {
      kind: 'multivariate',
      variants: ['control', 'bold'],
      fallback: 'control',
      experiment: true,
    },
    test_plain: {
      kind: 'multivariate',
      variants: ['a', 'b'],
      fallback: 'a',
      experiment: false,
    },
  },
}))

const PLAIN = 'test_plain' as MultivariateClientFlagKey
const EXP = 'test_exp' as MultivariateClientFlagKey
let sent: string[]

/** Wraps a hook in a fresh query client. */
function wrapper({ children }: { children: ReactNode }) {
  return screenTree(
    <>{children}</>,
    new QueryClient({ defaultOptions: { queries: { retry: false } } })
  )
}

beforeEach(() => {
  useAuthStore.getState().login('tok', { id: 'u1' } as never)
  jest.useFakeTimers({ advanceTimers: true })
  sent = []
  resetExposureForTests()
  serve((config) => {
    const key = `${(config.method ?? 'get').toUpperCase()} ${config.url ?? ''}`
    sent.push(key)
    if (key === 'GET /flags') {
      return envelope({ flags: { test_exp: 'bold', test_plain: 'b' } })
    }
    return key.startsWith('POST') ? { status: 204, data: null } : NOT_FOUND
  })
})

afterEach(() => {
  useAuthStore.getState().logout()
  jest.useRealTimers()
  restoreApi()
})

describe('useVariant on a slice with a plain flag', () => {
  it('sends an exposure for an experiment, never for a non-experiment flag', async () => {
    const plain = await renderHook(() => useVariant(PLAIN), { wrapper })
    await waitFor(() => {
      expect(plain.result.current).toBe('b')
    })
    await jest.advanceTimersByTimeAsync(200)
    expect(sent.some((entry) => entry.startsWith('POST'))).toBe(false)
    await renderHook(() => useVariant(EXP), { wrapper })
    await waitFor(() => {
      expect(sent).toContain('POST /flags/exposures')
    })
  })
})

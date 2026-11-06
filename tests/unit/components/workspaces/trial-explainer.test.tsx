import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { act, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { useTrialExplainer } from '@/components/workspaces/trial-explainer'
import type { TenantDetail } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { renderScreen, restoreApi } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { acme, envelope, serveWorkspace } from '@/tests/support/workspace-api'

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

/** The spy on the platform alert. */
let alert: jest.SpiedFunction<typeof Alert.alert>

const mockUpdateRequired = { value: false }
jest.mock('@/lib/minimum-version', () => ({
  useUpdateRequired: () => mockUpdateRequired.value,
}))

/** The clock's reading in every test. */
const NOW = new Date('2026-01-05T06:00:00.000Z')
/** Hours before now, as an ISO date. */
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3600_000).toISOString()
/** Days after now, as an ISO date. */
const ahead = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

/** Calls the hook for `tenant`. */
function Probe({ tenant }: { tenant: TenantDetail }) {
  useTrialExplainer('acme', tenant)
  return null
}

/**
 * Renders the hook over a workspace created `createdHoursAgo` ago.
 * @param overrides - Fields of the workspace to replace.
 */
async function open(overrides: Record<string, unknown> = {}, client?: QueryClient) {
  const tenant = acme({ createdAt: ago(1), ...overrides }) as unknown as TenantDetail
  return renderScreen(<Probe tenant={tenant} />, client)
}

/** The billing answer of a trial that ends `days` days from now. */
const trialing = (days: number) => ({
  'GET /tenants/acme/billing': envelope({ state: 'trialing', trialEndsAt: ahead(days) }),
})

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] })
  jest.setSystemTime(NOW)
  mockStorage.clear()
  mockUpdateRequired.value = false
  useMaintenanceModeStore.setState({ mode: 'off' })
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  useAuthStore.getState().login('a', {
    id: 'u1',
    email: 'ada@example.com',
    firstName: null,
    lastName: null,
    createdAt: '2026-01-01',
    platformRole: null,
    analyticsOptOut: false,
  })
})

afterEach(() => {
  jest.useRealTimers()
  restoreApi()
  useAuthStore.getState().logout()
  jest.restoreAllMocks()
})

describe('useTrialExplainer', () => {
  it('shows the explainer once, with the days and the end date in the workspace zone', async () => {
    serveWorkspace({
      'GET /tenants/acme/billing': envelope({
        state: 'trialing',
        trialEndsAt: '2026-01-19T06:00:00.000Z',
      }),
      'GET /tenants/acme/settings': envelope({
        tenantId: 't-acme',
        timezone: 'America/Los_Angeles',
      }),
    })
    await open({ createdAt: ago(0) })
    await waitFor(() => {
      expect(alert).toHaveBeenCalledTimes(1)
    })
    const [title, body, buttons] = alert.mock.calls[0] as [string, string, unknown]
    expect(title).toBe('You’re on a 14-day Paid trial')
    // 06:00 UTC on 19 January is 22:00 on 18 January in Los Angeles (UTC-8).
    expect(body).toBe(
      'Everything in Paid is on until 18 January 2026. Then you move to Free. Nothing is deleted, and no card is needed.'
    )
    expect(buttons).toEqual([{ text: 'Got it' }])
    expect(mockStorage.get('trial-explainer:u1:t-acme')).toBe('1')
  })

  it('falls back to UTC when the settings cannot be read', async () => {
    serveWorkspace({
      'GET /tenants/acme/billing': envelope({
        state: 'trialing',
        trialEndsAt: '2026-01-19T06:00:00.000Z',
      }),
      'GET /tenants/acme/settings': { status: 500, data: { success: false } },
    })
    await open()
    await waitFor(() => {
      expect(alert).toHaveBeenCalledTimes(1)
    })
    expect(alert.mock.calls[0]?.[1]).toContain('until 19 January 2026')
  })

  it('does not show it again once stored', async () => {
    mockStorage.set('trial-explainer:u1:t-acme', '1')
    serveWorkspace(trialing(14))
    await open()
    await settle()
    expect(alert).not.toHaveBeenCalled()
  })

  it('shows it for access member only', async () => {
    serveWorkspace(trialing(14))
    await open({ access: 'platform' })
    await settle()
    expect(alert).not.toHaveBeenCalled()
  })

  it('shows it only in a trialing billing state', async () => {
    serveWorkspace({
      'GET /tenants/acme/billing': envelope({ state: 'active', trialEndsAt: null }),
    })
    await open()
    await settle()
    expect(alert).not.toHaveBeenCalled()
  })

  it('shows it only for a workspace at most 24 hours old', async () => {
    serveWorkspace(trialing(14))
    await open({ createdAt: ago(25) })
    await settle()
    expect(alert).not.toHaveBeenCalled()
  })

  it('waits while the update screen is up', async () => {
    mockUpdateRequired.value = true
    serveWorkspace(trialing(14))
    await open()
    await settle()
    expect(alert).not.toHaveBeenCalled()
  })

  it('waits while maintenance blocks the app', async () => {
    useMaintenanceModeStore.setState({ mode: 'full' })
    serveWorkspace(trialing(14))
    await open()
    await settle()
    expect(alert).not.toHaveBeenCalled()
    expect(mockStorage.size).toBe(0)
  })
})

/** Lets the queries land. */
async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(200)
  })
}

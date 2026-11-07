import { jest } from '@jest/globals'
import { screen } from '@testing-library/react-native'
import Insights from '@/app/(app)/tenants/[slug]/insights'
import { useAuthStore } from '@/states/auth.store'
import { renderScreen, restoreApi } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { acme, envelope, NOT_FOUND, serveWorkspace } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'acme' }),
}))

/** Entitlements with the feature on or off. */
function entitlements(feature: boolean) {
  return envelope({
    plan: { key: 'paid', name: 'Paid' },
    features: { advanced_example: feature },
    limits: {},
  })
}

beforeEach(() => {
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
  restoreApi()
  useAuthStore.getState().logout()
  jest.clearAllMocks()
})

describe('Insights', () => {
  it('shows the not-available panel, and reads no plan, when the workspace answers 404', async () => {
    const sent = serveWorkspace({
      'GET /tenants/acme': NOT_FOUND,
      'GET /tenants/acme/entitlements': entitlements(true),
    })
    await renderScreen(<Insights />)
    expect(await screen.findByRole('header', { name: 'Workspace not available' })).toBeTruthy()
    expect(
      screen.getByText('We couldn’t open /acme. It doesn’t exist, or you aren’t a member.')
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to your workspaces' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(sent.some((config) => config.url === '/tenants/acme/entitlements')).toBe(false)
    expect(sent.some((config) => config.url === '/tenants/acme/insights')).toBe(false)
  })

  it('shows the workspace load error when the workspace read fails', async () => {
    serveWorkspace({
      'GET /tenants/acme': { status: 500, data: { success: false, message: 'x' } },
      'GET /tenants/acme/entitlements': entitlements(true),
    })
    await renderScreen(<Insights />)
    expect(
      await screen.findByText(
        'We couldn’t load this workspace because the request failed. Select Try again.'
      )
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('shows the two counts when the plan includes the feature', async () => {
    serveWorkspace({
      'GET /tenants/acme/entitlements': entitlements(true),
      'GET /tenants/acme/insights': envelope({
        membersJoinedLast30Days: 4,
        invitationsSentLast30Days: 9,
      }),
    })
    await renderScreen(<Insights />)
    expect(await screen.findByText('Members joined, last 30 days')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('Invitations sent, last 30 days')).toBeTruthy()
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Insights' })).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
  })

  it('shows the locked card, with no action, when the plan lacks the feature', async () => {
    const sent = serveWorkspace({ 'GET /tenants/acme/entitlements': entitlements(false) })
    await renderScreen(<Insights />)
    expect(await screen.findByText('Workspace insights')).toBeTruthy()
    expect(
      screen.getByText('See who joined and how many invitations went out in the last 30 days.')
    ).toBeTruthy()
    expect(screen.getByText('Included in Paid.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(sent.some((request) => request.url === '/tenants/acme/insights')).toBe(false)
  })

  it('shows the locked card when the API answers 402 PLAN_FEATURE_REQUIRED', async () => {
    serveWorkspace({
      'GET /tenants/acme/entitlements': entitlements(true),
      'GET /tenants/acme/insights': {
        status: 402,
        data: {
          success: false,
          message: 'Not on your plan',
          code: 'PLAN_FEATURE_REQUIRED',
          details: { key: 'advanced_example' },
        },
      },
    })
    await renderScreen(<Insights />)
    expect(await screen.findByText('Included in Paid.')).toBeTruthy()
    expect(screen.queryByText('Members joined, last 30 days')).toBeNull()
  })

  it('shows Try again when the insights fail to load', async () => {
    serveWorkspace({
      'GET /tenants/acme/entitlements': entitlements(true),
      'GET /tenants/acme/insights': { status: 500, data: { success: false, message: 'x' } },
    })
    await renderScreen(<Insights />)
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('Included in Paid.')).toBeNull()
  })

  it('shows Try again, not a spinner, when the entitlements fail to load', async () => {
    serveWorkspace({
      'GET /tenants/acme/entitlements': { status: 500, data: { success: false, message: 'x' } },
    })
    await renderScreen(<Insights />)
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByLabelText('Loading insights')).toBeNull()
  })

  it('tells staff with platform access whose workspace this is', async () => {
    serveWorkspace({
      'GET /tenants/acme': envelope(acme({ access: 'platform' })),
      'GET /tenants/acme/entitlements': entitlements(false),
    })
    await renderScreen(<Insights />)
    expect(await screen.findByText(/as platform staff \(Owner\)\./)).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
  })
})

import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { screen } from '@testing-library/react-native'
import Plan from '@/app/(app)/settings/workspace/[slug]/billing'
import { formatDate } from '@/lib/format'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, describe, expect, it } from '@/tests/support/runner'
import { acme, envelope, membership, NOT_FOUND } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: 'acme' }),
}))

afterEach(() => {
  restoreApi()
})

const CATALOG = [
  { key: 'members', kind: 'limit', label: 'Members', description: 'People in the workspace.' },
  { key: 'advanced_example', kind: 'feature', label: 'Advanced example', description: 'x' },
  { key: 'audit_export', kind: 'feature', label: 'Audit export', description: 'y' },
]

/** A catalog plan that carries prices and buying words, so a screen that rendered plans would fail `BANNED`. */
const PAID_PLAN = {
  key: 'paid',
  name: 'Upgrade to Paid',
  description: 'Upgrade to Paid for ₹999 a month. Subscribe now to buy more members.',
  sortOrder: 1,
  entitlements: { members: 50, advanced_example: true },
  prices: [{ id: 'price_1', interval: 'month', amountMinor: 99_900, currency: 'INR' }],
}

/**
 * Entitlements; a test overrides fields.
 * @param overrides - Fields to change.
 * @returns The body.
 */
function entitlements(overrides: Record<string, unknown> = {}) {
  return {
    plan: { key: 'free', name: 'Free' },
    state: 'free',
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    pastDue: null,
    features: { advanced_example: false, audit_export: true, mystery: true },
    limits: {
      members: { limit: 3, used: 2, approaching: false },
      widgets: { limit: null, used: 1, approaching: false },
    },
    ...overrides,
  }
}

/** What a test changes in the served API. */
interface Serving {
  tenant?: Record<string, unknown>
  entitlements?: Record<string, unknown>
  failEntitlements?: boolean
  tenantAnswer?: ReturnType<typeof envelope>
}

/**
 * Serves the workspace, its entitlements and the plans catalog.
 * @param serving - Overrides.
 * @returns The requests seen.
 */
function servePlan(serving: Serving = {}) {
  return serve((config) => {
    const url = config.url ?? ''
    if (url === '/tenants/acme') return serving.tenantAnswer ?? envelope(serving.tenant ?? acme())
    if (url === '/tenants') {
      return envelope({
        items: [membership('acme', 'Acme')],
        page: { hasNext: false, nextCursor: null },
      })
    }
    if (url === '/tenants/acme/entitlements') {
      if (serving.failEntitlements) return { status: 500, data: { success: false, message: 'x' } }
      return envelope(serving.entitlements ?? entitlements())
    }
    if (url === '/plans') {
      return envelope({
        plans: [PAID_PLAN],
        catalog: CATALOG,
        trial: { enabled: true, days: 14 },
        paymentsEnabled: true,
        gstRegistered: false,
      })
    }
    return NOT_FOUND
  })
}

/** Renders the screen. */
async function renderPlan(): Promise<void> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  await renderScreen(<Plan />, client)
}

/**
 * Every string the rendered tree shows.
 * @returns The text, joined.
 */
function treeText(): string {
  const out: string[] = []
  /**
   * Collects strings below a node.
   * @param node - A rendered node.
   */
  const walk = (node: unknown): void => {
    if (typeof node === 'string') out.push(node)
    else if (Array.isArray(node)) node.forEach(walk)
    else if (node !== null && typeof node === 'object' && 'children' in node) {
      walk(node.children)
    }
  }
  walk(screen.toJSON())
  return out.join('\n')
}

const BANNED = [/₹/, /Upgrade/i, /\bBuy\b/i, /price/i, /checkout/i, /subscribe/i, /999/]

describe('Plan screen', () => {
  it('shows the plan, usage in catalog order with key fallback, and the features', async () => {
    servePlan()
    await renderPlan()
    expect(await screen.findByRole('header', { name: 'Plan' })).toBeTruthy()
    expect(await screen.findByText('Free')).toBeTruthy()
    expect(screen.getByText('2 of 3 members')).toBeTruthy()
    expect(screen.getByText('1 widget · No limit')).toBeTruthy()
    expect(screen.getByText('Advanced example: Not included')).toBeTruthy()
    expect(screen.getByText('Audit export: Included')).toBeTruthy()
    expect(screen.getByText('mystery: Included')).toBeTruthy()
    const text = treeText()
    expect(text.indexOf('Advanced example')).toBeLessThan(text.indexOf('Audit export'))
    expect(text.indexOf('Audit export')).toBeLessThan(text.indexOf('mystery'))
  })

  it('shows the trial end', async () => {
    servePlan({
      entitlements: entitlements({
        plan: { key: 'paid', name: 'Paid' },
        state: 'trialing',
        trialEndsAt: '2026-12-01T00:00:00.000Z',
      }),
    })
    await renderPlan()
    expect(
      await screen.findByText(`Trial ends on ${formatDate('2026-12-01T00:00:00.000Z', 'long')}.`)
    ).toBeTruthy()
  })

  const PAID = { plan: { key: 'paid', name: 'Paid' } }
  it.each([
    ['Free', entitlements()],
    ['a trial', entitlements({ ...PAID, state: 'trialing', trialEndsAt: '2026-12-01T00:00:00Z' })],
    [
      'cancelled',
      entitlements({
        ...PAID,
        state: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-12-15T00:00:00Z',
      }),
    ],
    [
      'past due',
      entitlements({
        ...PAID,
        state: 'past_due',
        pastDue: { since: '2026-11-01T00:00:00Z', graceEndsAt: null, paused: false },
      }),
    ],
  ])('shows no price, upgrade, purchase or checkout text for %s', async (_name, body) => {
    const sent = servePlan({ entitlements: body })
    await renderPlan()
    expect(await screen.findByText(/members/)).toBeTruthy()
    const text = treeText()
    for (const word of BANNED) expect(text).not.toMatch(word)
    expect(sent.filter((config) => (config.url ?? '').endsWith('/billing'))).toHaveLength(0)
  })

  it('never requests the billing route', async () => {
    const sent = servePlan()
    await renderPlan()
    await screen.findByText('Free')
    expect(sent.some((config) => config.url === '/tenants/acme/billing')).toBe(false)
  })

  it('shows the not-available panel when the workspace answers 404', async () => {
    servePlan({ tenantAnswer: NOT_FOUND as never })
    await renderPlan()
    expect(await screen.findByRole('header', { name: 'Workspace not available' })).toBeTruthy()
  })

  it('shows the staff banner for platform access', async () => {
    servePlan({ tenant: acme({ access: 'platform', role: 'admin' }) })
    await renderPlan()
    expect(await screen.findByText(/as platform staff/)).toBeTruthy()
  })

  it('says the platform workspace has no plan, and reads no entitlements', async () => {
    const sent = servePlan({ tenant: acme({ isPlatform: true }) })
    await renderPlan()
    expect(await screen.findByText('The platform workspace has no plan.')).toBeTruthy()
    expect(sent.some((config) => config.url === '/tenants/acme/entitlements')).toBe(false)
  })

  it('shows the load error when the read fails', async () => {
    servePlan({ failEntitlements: true })
    await renderPlan()
    expect(
      await screen.findByText(
        'We couldn’t load this workspace’s plan. Select Try again to load it.'
      )
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

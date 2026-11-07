import { planStateLine, usageLine } from '@/copy/billing'
import { formatDate } from '@/lib/format'
import { describe, expect, it } from '@/tests/support/runner'
import type { TenantEntitlements } from '@/types/billing.types'

/**
 * Entitlements on Free; a test overrides fields.
 * @param overrides - Fields to change.
 * @returns The entitlements.
 */
function entitlements(overrides: Partial<TenantEntitlements> = {}): TenantEntitlements {
  return {
    plan: { key: 'free', name: 'Free' },
    state: 'free',
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    pastDue: null,
    features: {},
    limits: {},
    ...overrides,
  }
}

const PAST_DUE = { since: '2026-11-01T00:00:00.000Z', graceEndsAt: null, paused: false }
const TRIAL_END = '2026-12-01T00:00:00.000Z'
const PERIOD_END = '2026-12-15T00:00:00.000Z'

describe('planStateLine', () => {
  it('has no line on Free', () => {
    expect(planStateLine(entitlements())).toBeUndefined()
  })

  it('names the trial end', () => {
    const line = planStateLine(entitlements({ state: 'trialing', trialEndsAt: TRIAL_END }))
    expect(line).toBe(`Trial ends on ${formatDate(TRIAL_END, 'long')}.`)
  })

  it('says a payment is overdue', () => {
    expect(planStateLine(entitlements({ state: 'past_due', pastDue: PAST_DUE }))).toBe(
      'A payment is overdue.'
    )
  })

  it('names the end of a cancelled plan', () => {
    const line = planStateLine(
      entitlements({ state: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: PERIOD_END })
    )
    expect(line).toBe(`Ends on ${formatDate(PERIOD_END, 'long')}.`)
  })

  it('prefers the trial, then past due, then cancelled', () => {
    const all = entitlements({
      state: 'trialing',
      trialEndsAt: TRIAL_END,
      pastDue: PAST_DUE,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: PERIOD_END,
    })
    expect(planStateLine(all)).toMatch(/^Trial ends on /)
    expect(planStateLine({ ...all, state: 'active' })).toBe('A payment is overdue.')
    expect(planStateLine({ ...all, state: 'active', pastDue: null })).toMatch(/^Ends on /)
  })

  it('has no line when the date is missing', () => {
    expect(planStateLine(entitlements({ state: 'trialing' }))).toBeUndefined()
    expect(
      planStateLine(entitlements({ state: 'active', cancelAtPeriodEnd: true }))
    ).toBeUndefined()
  })
})

describe('usageLine', () => {
  it('counts against a limit, with the noun following the limit', () => {
    expect(usageLine('Members', { limit: 3, used: 1, approaching: false })).toBe('1 of 3 members')
    expect(usageLine('Members', { limit: 1, used: 1, approaching: false })).toBe('1 of 1 member')
  })

  it('says there is no limit, with the noun following the count', () => {
    expect(usageLine('Members', { limit: null, used: 7, approaching: false })).toBe(
      '7 members · No limit'
    )
    expect(usageLine('Members', { limit: null, used: 1, approaching: false })).toBe(
      '1 member · No limit'
    )
  })
})

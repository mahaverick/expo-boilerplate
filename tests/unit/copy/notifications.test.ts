import { NEUTRAL_KINDS, neutralNoticeBody, tabBadge } from '@/copy/notifications'
import { describe, expect, it } from '@/tests/support/runner'

describe('NEUTRAL_KINDS', () => {
  it('holds the five billing kinds and workspace_full', () => {
    expect([...NEUTRAL_KINDS].toSorted()).toEqual([
      'billing_paid_cancelled',
      'billing_payer_left',
      'billing_payment_failed',
      'billing_trial_ending',
      'billing_upgrade_requested',
      'workspace_full',
    ])
  })
})

describe('neutralNoticeBody', () => {
  it.each([
    ['billing_trial_ending', 'The trial for Acme is ending. Open Plan for the date.'],
    ['billing_payment_failed', 'A payment for Acme failed. Open Plan for its current plan.'],
    ['billing_payer_left', 'The person who paid for Acme left it.'],
    ['billing_upgrade_requested', 'A member of Acme asked about its plan.'],
    [
      'billing_paid_cancelled',
      'The Paid plan for Acme is cancelled. Open Plan for the date it ends.',
    ],
    ['workspace_full', 'Someone cannot join Acme because it’s at its members limit.'],
  ])('words %s with the workspace’s name', (type, line) => {
    expect(neutralNoticeBody(type, 'Acme')).toBe(line)
  })

  it('says "your workspace" when the name is unknown', () => {
    expect(neutralNoticeBody('billing_payer_left', undefined)).toBe(
      'The person who paid for your workspace left it.'
    )
  })

  it('has no line for a kind that shows the server’s text', () => {
    expect(neutralNoticeBody('tenant_invitation', 'Acme')).toBeUndefined()
  })
})

describe('tabBadge', () => {
  it('hides at zero and while unknown', () => {
    expect(tabBadge(undefined)).toEqual({ badge: undefined, label: 'Notifications' })
    expect(tabBadge({ count: 0, capped: false })).toEqual({
      badge: undefined,
      label: 'Notifications',
    })
  })

  it('shows the count and says it in the label', () => {
    expect(tabBadge({ count: 3, capped: false })).toEqual({
      badge: '3',
      label: 'Notifications, 3 unread',
    })
  })

  it('adds a plus when the count is capped', () => {
    expect(tabBadge({ count: 1000, capped: true })).toEqual({
      badge: '1000+',
      label: 'Notifications, 1000+ unread',
    })
  })
})

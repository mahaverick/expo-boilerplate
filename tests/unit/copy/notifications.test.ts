import {
  isNeutralKind,
  neutralNoticeBody,
  notificationTypeLabel,
  tabBadge,
} from '@/copy/notifications'
import { describe, expect, it } from '@/tests/support/runner'

describe('isNeutralKind', () => {
  it.each([
    'billing_trial_ending',
    'billing_payment_failed',
    'billing_payer_left',
    'billing_upgrade_requested',
    'billing_paid_cancelled',
    'billing_renewal_notice',
    'workspace_full',
  ])('treats %s as neutral', (type) => {
    expect(isNeutralKind(type)).toBe(true)
  })

  it.each(['tenant_invitation', 'workspace_full_soon', 'my_billing_note'])(
    'shows the server’s text for %s',
    (type) => {
      expect(isNeutralKind(type)).toBe(false)
    }
  )
})

describe('notificationTypeLabel', () => {
  it('calls a plan request "Plan request"', () => {
    expect(notificationTypeLabel('billing_upgrade_requested')).toBe('Plan request')
  })

  it('uses the shared label for a known kind', () => {
    expect(notificationTypeLabel('billing_payment_failed')).toBe('Payment failed')
    expect(notificationTypeLabel('workspace_full')).toBe('Workspace full')
  })

  it('calls an unknown neutral kind "Plan update"', () => {
    expect(notificationTypeLabel('billing_renewal_notice')).toBe('Plan update')
    expect(notificationTypeLabel('billing_upgrade_offer')).toBe('Plan update')
  })

  it('keeps the shared humanizer for a kind that is not neutral', () => {
    expect(notificationTypeLabel('tenant_invitation')).toBe('Workspace invitation')
    expect(notificationTypeLabel('some_new_kind')).toBe('Some new kind')
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

  it('words a billing kind it has no line for with the general line', () => {
    expect(neutralNoticeBody('billing_renewal_notice', 'Acme')).toBe(
      'There’s an update about the plan for Acme. Open Plan for details.'
    )
    expect(neutralNoticeBody('billing_renewal_notice', undefined)).toBe(
      'There’s an update about the plan for your workspace. Open Plan for details.'
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

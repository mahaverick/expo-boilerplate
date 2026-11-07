import { notificationHref } from '@/lib/notification-href'
import type { Notification } from '@/queries/notification.queries'
import { describe, expect, it } from '@/tests/support/runner'

/**
 * A notification.
 * @param type - Its type.
 * @param metadata - Its metadata.
 * @returns The notification.
 */
function make(type: string, metadata: Record<string, unknown> | null): Notification {
  return {
    id: 'n1',
    userId: 'u1',
    type,
    title: 't',
    body: 'b',
    metadata,
    readAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
  }
}

describe('notificationHref', () => {
  it('opens the Plan screen for a billing notice', () => {
    expect(notificationHref(make('billing_payment_failed', { slug: 'acme' }))).toEqual({
      href: '/settings/workspace/acme/billing',
      label: 'Open Plan',
    })
  })

  it('opens Members for workspace_full', () => {
    expect(notificationHref(make('workspace_full', { slug: 'acme' }))).toEqual({
      href: '/settings/workspace/acme/members',
      label: 'Open Members',
    })
  })

  it('gives no link without a usable slug or for another kind', () => {
    expect(notificationHref(make('billing_trial_ending', null))).toBeNull()
    expect(notificationHref(make('billing_trial_ending', { slug: '_platform' }))).toBeNull()
    expect(notificationHref(make('tenant_invitation', { slug: 'acme' }))).toBeNull()
  })
})

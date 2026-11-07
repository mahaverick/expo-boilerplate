import { jest } from '@jest/globals'
import { notificationHref } from '@/lib/notification-href'
import type { NotificationLink } from '@/lib/notification-link'
import type { Notification } from '@/queries/notification.queries'
import { afterEach, describe, expect, it } from '@/tests/support/runner'

/** A link target the shared `notificationLink` returns in place of its own, when set. */
let mockLink: { value: unknown } | null = null

jest.mock('@/lib/notification-link', () => {
  const actual: { notificationLink: (notification: Notification) => NotificationLink | null } =
    jest.requireActual('@/lib/notification-link')
  return {
    notificationLink: (notification: Notification) =>
      mockLink === null ? actual.notificationLink(notification) : mockLink.value,
  }
})

afterEach(() => {
  mockLink = null
})

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

  it('gives no link for a target this app does not know', () => {
    mockLink = {
      value: { to: '/settings/workspace/$slug/checkout', params: { slug: 'acme' }, label: 'x' },
    }
    expect(notificationHref(make('billing_payment_failed', { slug: 'acme' }))).toBeNull()
  })
})

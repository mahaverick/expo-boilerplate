import type { Href } from 'expo-router'
import { notificationLink } from '@/lib/notification-link'
import type { Notification } from '@/queries/notification.queries'

/**
 * The Plan link for a `billing_*` kind the shared link does not know. The slug
 * follows the shared rule: a string, non-empty, not starting with `_`.
 * @param notification - The notification.
 * @returns The Plan route and its link text, or null.
 */
function unknownBillingHref(notification: Notification): { href: Href; label: string } | null {
  if (!notification.type.startsWith('billing_')) return null
  const slug = notification.metadata?.slug
  if (typeof slug !== 'string' || slug === '' || slug.startsWith('_')) return null
  return { href: `/settings/workspace/${slug}/billing`, label: 'Open Plan' }
}

/**
 * Where a notification leads in this app. The shared link's Billing target is
 * the Plan screen here, and so is any other `billing_*` kind the shared link
 * does not know. A notification with no destination, or a target this
 * app does not know, gives null.
 * @param notification - The notification.
 * @returns The route and its link text, or null.
 */
export function notificationHref(notification: Notification): { href: Href; label: string } | null {
  const link = notificationLink(notification)
  if (link === null) return unknownBillingHref(notification)
  const { slug } = link.params
  if (link.to === '/settings/workspace/$slug/billing') {
    return { href: `/settings/workspace/${slug}/billing`, label: 'Open Plan' }
  }
  if (link.to === '/settings/workspace/$slug/members') {
    return { href: `/settings/workspace/${slug}/members`, label: 'Open Members' }
  }
  return null
}

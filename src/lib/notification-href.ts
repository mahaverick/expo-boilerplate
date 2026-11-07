import type { Href } from 'expo-router'
import { notificationLink } from '@/lib/notification-link'
import type { Notification } from '@/queries/notification.queries'

/**
 * Where a notification leads in this app. The shared link's Billing target is
 * the Plan screen here. A notification with no destination, or a target this
 * app does not know, gives null.
 * @param notification - The notification.
 * @returns The route and its link text, or null.
 */
export function notificationHref(notification: Notification): { href: Href; label: string } | null {
  const link = notificationLink(notification)
  if (link === null) return null
  const { slug } = link.params
  if (link.to === '/settings/workspace/$slug/billing') {
    return { href: `/settings/workspace/${slug}/billing`, label: 'Open Plan' }
  }
  if (link.to === '/settings/workspace/$slug/members') {
    return { href: `/settings/workspace/${slug}/members`, label: 'Open Members' }
  }
  return null
}

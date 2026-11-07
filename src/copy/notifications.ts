import { humanizeNotificationType } from '@/lib/notification-type'

/** What a failed list says. */
export const NOTIFICATIONS_ERROR =
  'We couldn’t load your notifications, so none are listed. Select Try again to load them.'

/** What a failed later page says. */
export const NOTIFICATIONS_MORE_ERROR =
  'We couldn’t load more notifications. Select Try again to load them.'

/**
 * Whether the app words a notification itself: every `billing_*` kind, known
 * or not, and `workspace_full`. Their server text carries prices or an upgrade
 * prompt, and the app shows neither (spec section 6).
 * @param type - The notification's type.
 * @returns True for a kind whose server title and body never show.
 */
export function isNeutralKind(type: string): boolean {
  return type.startsWith('billing_') || type === 'workspace_full'
}

/** The app's labels where the shared label names an upgrade; keyed by type. */
const APP_TYPE_LABELS: Readonly<Record<string, string>> = {
  billing_upgrade_requested: 'Plan request',
}

/**
 * A notification type's label in this app: its own label where the shared
 * one names an upgrade, otherwise `humanizeNotificationType`. The inbox and
 * the preferences screen both use it, so they agree.
 * @param type - The notification's type.
 * @returns The label.
 */
export function notificationTypeLabel(type: string): string {
  return APP_TYPE_LABELS[type] ?? humanizeNotificationType(type)
}

/** The app's line for each neutral kind; `{workspace}` is filled in. */
const NEUTRAL_LINES: Readonly<Record<string, (workspace: string) => string>> = {
  billing_trial_ending: (workspace) =>
    `The trial for ${workspace} is ending. Open Plan for the date.`,
  billing_payment_failed: (workspace) =>
    `A payment for ${workspace} failed. Open Plan for its current plan.`,
  billing_payer_left: (workspace) => `The person who paid for ${workspace} left it.`,
  billing_upgrade_requested: (workspace) => `A member of ${workspace} asked about its plan.`,
  billing_paid_cancelled: (workspace) =>
    `The Paid plan for ${workspace} is cancelled. Open Plan for the date it ends.`,
  workspace_full: (workspace) =>
    `Someone cannot join ${workspace} because it’s at its members limit.`,
}

/**
 * The line for a neutral kind with no entry in `NEUTRAL_LINES`.
 * @param workspace - The workspace's name.
 * @returns The sentence.
 */
function generalPlanLine(workspace: string): string {
  return `There’s an update about the plan for ${workspace}. Open Plan for details.`
}

/**
 * The app's own body for a neutral kind, in place of the server's. A neutral
 * kind with no line of its own gets the general plan line.
 * @param type - The notification's type.
 * @param workspace - The workspace's name, or undefined when it is unknown.
 * @returns The sentence, or undefined for a kind that shows the server's text.
 */
export function neutralNoticeBody(type: string, workspace: string | undefined): string | undefined {
  if (!isNeutralKind(type)) return undefined
  return (NEUTRAL_LINES[type] ?? generalPlanLine)(workspace ?? 'your workspace')
}

/**
 * The Notifications tab's badge and accessibility label for the unread count.
 * @param total - The capped unread count, or undefined while it is unknown.
 * @param total.count - How many are unread.
 * @param total.capped - True when the server stopped counting at its cap.
 * @returns The badge text (undefined at zero or while unknown) and the label.
 */
export function tabBadge(total: { count: number; capped: boolean } | undefined): {
  badge: string | undefined
  label: string
} {
  if (total === undefined || total.count <= 0) return { badge: undefined, label: 'Notifications' }
  const badge = `${String(total.count)}${total.capped ? '+' : ''}`
  return { badge, label: `Notifications, ${badge} unread` }
}

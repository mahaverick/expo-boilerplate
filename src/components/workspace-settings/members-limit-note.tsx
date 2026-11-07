import { Text } from 'react-native'
import { nounFor } from '@/lib/plural'
import { useEntitlements, useLimit } from '@/queries/billing.queries'

/**
 * The line for a workspace that has reached or passed its members limit,
 * with counts only. Counts include pending invitations, as the API's do.
 * @param used - Members plus pending invitations.
 * @param limit - The plan's member limit.
 * @param plan - The plan's name, or undefined while it is unknown.
 * @returns The sentence.
 */
function limitLine(used: number, limit: number, plan: string | undefined): string {
  const members = nounFor(limit, 'members')
  const onPlan = plan === undefined ? '' : ` on ${plan}`
  if (used > limit) {
    return `${String(used)} of ${String(limit)} ${members}${onPlan}. Remove ${String(used - limit)} to invite more.`
  }
  return `You’ve used ${String(limit)} of ${String(limit)} ${members}${onPlan}.`
}

/**
 * A warning above the invite form when members plus pending invitations have
 * reached the plan's limit. It shows counts and no billing action. It renders
 * nothing below the limit, with an unlimited plan, or while the entitlements
 * are unread. The form stays enabled: the API is the guard, and a stale count
 * must not block a valid invite.
 * @param props - The workspace.
 * @param props.slug - The workspace's web address.
 * @returns The note, or nothing.
 */
export function MembersLimitNote({ slug }: { slug: string }) {
  const usage = useLimit(slug, 'members')
  const plan = useEntitlements(slug).data?.plan.name
  if (!usage || usage.limit === null || usage.used < usage.limit) return null
  return (
    <Text
      accessibilityRole="alert"
      className="rounded-md border border-border bg-muted p-3 text-sm text-foreground"
    >
      {limitLine(usage.used, usage.limit, plan)}
    </Text>
  )
}

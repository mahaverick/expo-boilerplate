import { Text } from 'react-native'
import { limitLine } from '@/copy/members-limit'
import { useEntitlements, useLimit } from '@/queries/billing.queries'

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

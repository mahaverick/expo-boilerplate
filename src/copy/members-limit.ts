import { nounFor } from '@/lib/plural'

/**
 * The line for a workspace that has reached or passed its members limit,
 * with counts only. Counts include pending invitations, as the API's do.
 * @param used - Members plus pending invitations.
 * @param limit - The plan's member limit.
 * @param plan - The plan's name, or undefined while it is unknown.
 * @returns The sentence.
 */
export function limitLine(used: number, limit: number, plan: string | undefined): string {
  const members = nounFor(limit, 'members')
  const onPlan = plan === undefined ? '' : ` on ${plan}`
  if (used > limit) {
    return `${String(used)} of ${String(limit)} ${members}${onPlan}. Remove ${String(used - limit)} to invite more.`
  }
  return `You’ve used ${String(limit)} of ${String(limit)} ${members}${onPlan}.`
}

import { formatDate } from '@/lib/format'
import { countOf, nounFor } from '@/lib/plural'
import type { LimitUsage, TenantEntitlements } from '@/types/billing.types'

/** What the Plan screen says for the platform workspace. */
export const PLATFORM_NO_PLAN = 'The platform workspace has no plan.'

/** What a failed plan read says. */
export const PLAN_LOAD_ERROR =
  'We couldn’t load this workspace’s plan. Select Try again to load it.'

/**
 * The line under the plan's name, or undefined when the plan has nothing to
 * add. A trial wins over an overdue payment, which wins over a cancellation.
 * A state whose date is missing says nothing.
 * @param entitlements - What the workspace may use now.
 * @returns The sentence, or undefined.
 */
export function planStateLine(entitlements: TenantEntitlements): string | undefined {
  const { state, trialEndsAt, pastDue, cancelAtPeriodEnd, currentPeriodEnd } = entitlements
  if (state === 'trialing' && trialEndsAt !== null) {
    const date = formatDate(trialEndsAt, 'long')
    if (date !== null) return `Trial ends on ${date}.`
  }
  if (pastDue !== null) return 'A payment is overdue.'
  if (cancelAtPeriodEnd && currentPeriodEnd !== null) {
    const date = formatDate(currentPeriodEnd, 'long')
    if (date !== null) return `Ends on ${date}.`
  }
  return undefined
}

/**
 * One limit's use: "3 of 3 members", or "7 members · No limit". The noun
 * follows the number before it, as the web's usage meter does.
 * @param label - The catalog label, such as "Members", or the limit's key.
 * @param usage - The limit's use, from the entitlements.
 * @returns The sentence.
 */
export function usageLine(label: string, usage: LimitUsage): string {
  const noun = label.toLowerCase()
  if (usage.limit === null) return `${countOf(usage.used, noun)} · No limit`
  return `${String(usage.used)} of ${String(usage.limit)} ${nounFor(usage.limit, noun)}`
}

/**
 * One feature's line: "Audit export: Included".
 * @param label - The catalog label, or the feature's key.
 * @param included - Whether the plan includes the feature.
 * @returns The sentence.
 */
export function featureLine(label: string, included: boolean): string {
  return `${label}: ${included ? 'Included' : 'Not included'}`
}

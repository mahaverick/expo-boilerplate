/**
 * @file Keeps analytics' identity in step with the auth store's user.
 */
import { clearExposureDedupe } from '@/observability/flags/exposure'
import { forgetFeatureProperties } from '@/observability/flags/feature-property-names'
import { useAuthStore } from '@/states/auth.store'
import type { User } from '@/types/api.types'
import { forgetStaleIdentity, identifyUser, resetAnalytics, setAnalyticsOptOut } from './telemetry'

/**
 * Brings analytics in step with a change of the signed-in user. A different
 * person, or none, resets first and forgets the flags module's per-person
 * state. A user then has their own opt-out applied, and is identified by id alone only when not opted
 * out, so an opted-out person is never identified.
 * @param user - The user now.
 * @param previous - The user before, or null.
 */
function apply(user: User | null, previous: User | null): void {
  if (previous && previous.id !== user?.id) {
    resetAnalytics()
    // The reset dropped the feature properties; the next person reports exposures afresh.
    forgetFeatureProperties()
    clearExposureDedupe()
  }
  if (!user) return
  // Fails closed: a profile without the field is treated as opted out.
  const isOptedOut = user.analyticsOptOut !== false
  setAnalyticsOptOut(isOptedOut)
  if (!isOptedOut) identifyUser(user.id)
}

/**
 * Forgets the person the SDK stored from an earlier launch. Call it once the
 * session restore settles: with no user left, the SDK's stored person is
 * stale. A restored user is left alone.
 */
export function forgetStaleIdentityWithoutUser(): void {
  if (useAuthStore.getState().user === null) forgetStaleIdentity()
}

/**
 * Subscribes to the auth store and applies each change of user id or of
 * `analyticsOptOut`: sign-in, a restored session, the profile switch, a
 * sign-out and a forced sign-out. A user already in the store, such as a
 * restored session, is applied at once.
 * @returns The unsubscribe.
 */
export function installAnalyticsIdentity(): () => void {
  apply(useAuthStore.getState().user, null)
  return useAuthStore.subscribe((state, previousState) => {
    const { user } = state
    const previous = previousState.user
    if (user?.id === previous?.id && user?.analyticsOptOut === previous?.analyticsOptOut) return
    apply(user, previous)
  })
}

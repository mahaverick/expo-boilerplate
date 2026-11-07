/**
 * @file Keeps analytics' identity in step with the auth store's user.
 */
import { useAuthStore } from '@/states/auth.store'
import type { User } from '@/types/api.types'
import { identifyUser, resetAnalytics, setAnalyticsOptOut } from './telemetry'

/**
 * Brings analytics in step with a change of the signed-in user. A different
 * person, or none, resets first. A user then has their own opt-out applied,
 * and is identified by id alone only when not opted out, so an opted-out
 * person is never identified.
 * @param user - The user now.
 * @param previous - The user before, or null.
 */
function apply(user: User | null, previous: User | null): void {
  if (previous && previous.id !== user?.id) resetAnalytics()
  if (!user) return
  const isOptedOut = user.analyticsOptOut === true
  setAnalyticsOptOut(isOptedOut)
  if (!isOptedOut) identifyUser(user.id)
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

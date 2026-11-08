import Constants from 'expo-constants'
import { isAnalyticsAvailable } from '@/observability/telemetry/config'

/**
 * The privacy policy's address, from the build's `extra.privacyPolicyUrl`
 * (`PRIVACY_POLICY_URL` when the config was built).
 * @returns The https URL, or undefined when the build sets none.
 */
export function privacyPolicyUrl(): string | undefined {
  const url = Constants.expoConfig?.extra?.privacyPolicyUrl as string | undefined
  return url ? url : undefined
}

/**
 * Whether the Privacy screen has anything to show: the analytics switch or the
 * policy link.
 * @returns True when analytics can run or the build names a policy.
 */
export function hasPrivacyContent(): boolean {
  return isAnalyticsAvailable() || privacyPolicyUrl() !== undefined
}

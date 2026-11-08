/**
 * @file The `$feature/*` properties the flags module last registered: the
 * state `register.ts` syncs against, and the state the identity forgets when
 * analytics forgets the person.
 */
import type { FeaturePropertyName } from '@/observability/telemetry/telemetry'

/** The names and values last registered, so a later sync can drop or skip them. */
export const registeredFeatureProperties = new Map<FeaturePropertyName, boolean | string>()

/**
 * Forgets the registered properties without unregistering them: for a reset
 * of analytics, which already dropped them from the SDK. The next sync then
 * registers its values afresh rather than unregistering names.
 */
export function forgetFeatureProperties(): void {
  registeredFeatureProperties.clear()
}

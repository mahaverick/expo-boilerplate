/**
 * @file The hooks screens read flags with. Each reads the focused route's
 * scope (`useFlagScope`) and shows the fallback until the server's values
 * arrive, and whenever the latest read failed. An experiment flag's value,
 * once it came from the server, is reported as an exposure after the commit
 * that used it.
 */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect } from 'react'
import { useAuthStore } from '@/states/auth.store'
import { reportExposure } from './exposure'
import { flagsQueryOptions, useFlagScope, type FlagScope } from './flag-query'
import type {
  ClientFlagKey,
  ClientFlagValue,
  ClientFlagValues,
  ClientVariantOf,
  MultivariateClientFlagKey,
} from './flag-types'
import { clientFlagFallback, fallbackFlags, isExperimentFlag } from './flag-values'
import { syncFeatureProperties } from './register'

/** One shared fallback record, so readers see a stable object while nothing has loaded. */
let fallbacks: ClientFlagValues | null = null

/** The shared fallback record, built on first use. */
function sharedFallbacks(): ClientFlagValues {
  fallbacks ??= fallbackFlags()
  return fallbacks
}

/**
 * The current scope and its server values, or null while pending and
 * whenever the latest read failed, even after a good one: a stale `true`
 * would keep a closed feature on screen.
 * @param enabled - False to read nothing.
 * @returns The scope and the values.
 */
function useScopeValues(enabled = true): { scope: FlagScope; values: ClientFlagValues | null } {
  const scope = useFlagScope()
  const { data, isError } = useQuery({ ...flagsQueryOptions(scope), enabled })
  return { scope, values: isError || data === undefined ? null : data }
}

/**
 * Every flag's value in the current scope.
 * @returns The server's values, or every fallback while loading or after a failure.
 */
export function useFlagValues(): ClientFlagValues {
  return useScopeValues().values ?? sharedFallbacks()
}

/**
 * One flag's value in the current scope, reporting an experiment's exposure
 * once the value came from the server.
 * @param key - A flag this app reads.
 * @returns Its value, or its fallback while loading or after a failure.
 */
function useFlagValue<K extends ClientFlagKey>(key: K): ClientFlagValue<K> {
  const { scope, values } = useScopeValues()
  const isLoaded = values !== null
  const value: ClientFlagValue<K> = values ? values[key] : clientFlagFallback(key)

  useEffect(() => {
    if (isLoaded && isExperimentFlag(key)) reportExposure(scope, key, value)
  }, [isLoaded, key, scope, value])

  return value
}

/**
 * A multivariate flag's variant.
 * @param key - A multivariate flag this app reads.
 * @returns Its variant, or its fallback variant while loading or after a failure.
 */
export function useVariant<K extends MultivariateClientFlagKey>(key: K): ClientVariantOf<K> {
  return useFlagValue(key) as ClientVariantOf<K>
}

/**
 * Keeps the `$feature/*` super properties on the current scope's values,
 * unregistering them all while the scope has none. Mount it once, in the
 * authenticated layout, so a screen's own flag hooks never register a
 * scope. It reads nothing while signed out. A layout effect, so a screen's
 * first event already carries the values.
 */
export function useFeaturePropertiesSync(): void {
  const isSignedIn = useAuthStore((state) => state.isAuthenticated)
  const { values } = useScopeValues(isSignedIn)
  useLayoutEffect(() => {
    syncFeatureProperties(values)
  }, [values])
}

/** Test-only: forget the shared fallback record. */
export function resetFlagHooksForTests(): void {
  fallbacks = null
}

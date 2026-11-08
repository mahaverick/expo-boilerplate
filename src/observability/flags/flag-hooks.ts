/**
 * @file The hooks screens read flags with. Each reads the focused route's
 * scope (`useFlagScope`) and shows the fallback until the server's values
 * arrive, and whenever the latest read failed. An experiment flag's value,
 * once it came from the server, is reported as an exposure after the commit
 * that used it.
 */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect } from 'react'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
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
 * The scope and its server values, or null while pending, signed out and
 * whenever the latest read failed, even after a good one: a stale `true`
 * would keep a closed feature on screen.
 * @param slug - A workspace to read instead of the route's.
 * @returns The scope, the values and whether a person is signed in.
 */
function useScopeValues(slug?: string): {
  scope: FlagScope
  values: ClientFlagValues | null
  isSignedIn: boolean
} {
  const isSignedIn = useAuthStore((state) => state.isAuthenticated)
  const scope = useFlagScope(slug)
  const { data, isError } = useQuery({ ...flagsQueryOptions(scope), enabled: isSignedIn })
  return { scope, values: isError || data === undefined ? null : data, isSignedIn }
}

/**
 * Every flag's value in the current scope.
 * @param slug - A workspace to read instead of the route's.
 * @returns The server's values, or every fallback while loading or after a failure.
 */
export function useFlagValues(slug?: string): ClientFlagValues {
  return useScopeValues(slug).values ?? sharedFallbacks()
}

/**
 * One flag's value in the current scope, reporting an experiment's exposure
 * once the value came from the server and a person is signed in.
 * @param key - A flag this app reads.
 * @param slug - A workspace to read instead of the route's.
 * @returns Its value, or its fallback while loading or after a failure.
 */
function useFlagValue<K extends ClientFlagKey>(key: K, slug?: string): ClientFlagValue<K> {
  const { scope, values, isSignedIn } = useScopeValues(slug)
  const isLoaded = values !== null
  const value: ClientFlagValue<K> = values ? values[key] : clientFlagFallback(key)

  useEffect(() => {
    if (isSignedIn && isLoaded && isExperimentFlag(key)) reportExposure(scope, key, value)
  }, [isSignedIn, isLoaded, key, scope, value])

  return value
}

/**
 * A multivariate flag's variant.
 * @param key - A multivariate flag this app reads.
 * @param slug - A workspace to read instead of the route's.
 * @returns Its variant, or its fallback variant while loading or after a failure.
 */
export function useVariant<K extends MultivariateClientFlagKey>(
  key: K,
  slug?: string
): ClientVariantOf<K> {
  return useFlagValue(key, slug) as ClientVariantOf<K>
}

/**
 * Keeps the `$feature/*` super properties on the values of the workspace the
 * person is looking at: the route's workspace, else, on a route with none
 * (the Workspace tab), the current workspace that `useCurrentTenant` resolves
 * (the last one used, else the first eligible). While neither resolves it
 * reads the account scope. Mount it once, in the authenticated layout. It
 * reads nothing while signed out. A layout effect, so a screen's first event
 * already carries the values. It re-syncs on a change of person, because the
 * identity forgets the registered names while an equal read keeps its data
 * reference.
 */
export function useFeaturePropertiesSync(): void {
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const routeScope = useFlagScope()
  const current = useCurrentTenant(undefined, userId !== null)
  const slug =
    routeScope.kind === 'none' && current.status === 'ready' && current.slug !== null
      ? current.slug
      : undefined
  const { values } = useScopeValues(slug)
  useLayoutEffect(() => {
    syncFeatureProperties(values)
  }, [values, userId])
}

/** Test-only: forget the shared fallback record. */
export function resetFlagHooksForTests(): void {
  fallbacks = null
}

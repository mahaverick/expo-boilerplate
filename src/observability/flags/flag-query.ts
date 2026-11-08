/**
 * @file The flags query: one per scope, read from the server, which is the
 * only evaluator. A failed or malformed read never reaches a screen as an
 * error: every reader falls back to the registry fallbacks.
 */
import { queryOptions } from '@tanstack/react-query'
import { useGlobalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { apiClient } from '@/http/client'
import { tenantKeys } from '@/queries/tenant.queries'
import type { ClientFlagValues } from './flag-types'
import { normalizeFlags } from './flag-values'

/** Where a flags read is evaluated: in a workspace, or with none. */
export type FlagScope = { kind: 'tenant'; slug: string } | { kind: 'none' }

/** How long a scope's values are fresh. */
export const FLAGS_STALE_MS = 5 * 60_000

/** How often an open screen refetches its scope's values. */
export const FLAGS_REFETCH_MS = 10 * 60_000

/**
 * The scope of the focused route: the workspace in `slug`, or none.
 * @param slug - A workspace to read instead of the route's, for a screen that shows one without a route param.
 * @returns The scope, stable while the slug is unchanged.
 */
export function useFlagScope(slug?: string): FlagScope {
  const params = useGlobalSearchParams<{ slug?: string | string[] }>()
  const routeSlug = slug ?? params.slug
  const workspace = typeof routeSlug === 'string' && routeSlug !== '' ? routeSlug : null
  return useMemo(
    () => (workspace === null ? { kind: 'none' } : { kind: 'tenant', slug: workspace }),
    [workspace]
  )
}

/**
 * The API path that answers a scope's flags. Its exposure endpoint is this
 * path plus `/exposures`.
 * @param scope - The scope.
 * @returns The path.
 */
export function flagsPathFor(scope: FlagScope): string {
  return scope.kind === 'tenant' ? `/tenants/${scope.slug}/flags` : '/flags'
}

/**
 * The query key for a scope. A workspace's sits under its detail key, so
 * `dropTenantCache` removes it with the rest of the workspace.
 * @param scope - The scope.
 * @returns The key.
 */
export function flagsKey(scope: FlagScope): readonly string[] {
  return scope.kind === 'tenant' ? [...tenantKeys.detail(scope.slug), 'flags'] : ['flags', 'none']
}

/**
 * A scope as one string, for the exposure dedupe.
 * @param scope - The scope.
 * @returns `tenant:<slug>` or `none`.
 */
export function flagScopeId(scope: FlagScope): string {
  return scope.kind === 'tenant' ? `tenant:${scope.slug}` : scope.kind
}

/** The read endpoints' answer inside the API's success envelope. */
interface FlagsEnvelope {
  data?: { flags?: unknown }
}

/**
 * Reads a scope's values from the server and checks them against
 * `CLIENT_FLAGS`.
 * @param scope - The scope.
 * @param signal - Aborts the request.
 * @returns A value for every flag this app reads.
 * @throws When the request fails or the answer has no `flags` object.
 */
export async function fetchFlags(
  scope: FlagScope,
  signal?: AbortSignal
): Promise<ClientFlagValues> {
  const response = await apiClient.get<FlagsEnvelope>(flagsPathFor(scope), { signal })
  const flags = response.data.data?.flags
  if (typeof flags !== 'object' || flags === null || Array.isArray(flags)) {
    throw new Error('The flags response has no flags object.')
  }
  return normalizeFlags(flags as Record<string, unknown>)
}

/**
 * The query for a scope. It never retries: a failed read leaves every flag at
 * its fallback until the next focus or interval.
 * @param scope - The scope.
 * @returns Options for `useQuery` and for cache calls.
 */
export function flagsQueryOptions(scope: FlagScope) {
  return queryOptions({
    queryKey: flagsKey(scope),
    queryFn: ({ signal }) => fetchFlags(scope, signal),
    staleTime: FLAGS_STALE_MS,
    refetchInterval: FLAGS_REFETCH_MS,
    retry: false,
  })
}

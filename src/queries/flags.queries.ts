import { queryOptions, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/http/client'
import type { ClientFlagValues } from '@/observability/flags/flag-types'
import { fallbackFlags, normalizeFlags } from '@/observability/flags/flag-values'
import { tenantKeys } from '@/queries/tenant.queries'

/** How long a workspace's flag values stay fresh: 5 minutes, as react's flags client holds them. */
const FLAGS_STALE_MS = 5 * 60_000

/**
 * The flags read's key, under the workspace's detail key, so `dropTenantCache`
 * removes it with the rest of the workspace.
 * @param slug - The workspace's web address.
 * @returns The key.
 */
export function tenantFlagsKey(slug: string) {
  return [...tenantKeys.detail(slug), 'flags'] as const
}

/**
 * `GET /tenants/:slug/flags`, checked against `CLIENT_FLAGS`. It never
 * retries: a failed read leaves every flag at its fallback.
 * @param slug - The workspace's web address.
 * @returns Options for `useQuery` and for cache calls.
 */
function tenantFlagsQueryOptions(slug: string) {
  return queryOptions({
    queryKey: tenantFlagsKey(slug),
    staleTime: FLAGS_STALE_MS,
    retry: false,
    queryFn: async ({ signal }): Promise<ClientFlagValues> => {
      const response = await apiClient.get<{ data?: { flags?: unknown } }>(
        `/tenants/${slug}/flags`,
        { signal }
      )
      const flags = response.data.data?.flags
      if (typeof flags !== 'object' || flags === null || Array.isArray(flags)) {
        throw new Error('The flags response has no flags object.')
      }
      return normalizeFlags(flags as Record<string, unknown>)
    },
  })
}

/**
 * A workspace's flag values. A flag is off, or at its fallback, until the
 * server answers, and whenever the latest read failed, even after a good one.
 * Plan 3d replaces this hook with the full flags client.
 * @param slug - The workspace's web address.
 * @returns A value for every flag this app reads.
 */
export function useTenantFlags(slug: string): ClientFlagValues {
  const { data, isError } = useQuery(tenantFlagsQueryOptions(slug))
  return isError || data === undefined ? fallbackFlags() : data
}

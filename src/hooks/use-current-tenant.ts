import { useEffect, useMemo } from 'react'
import { correctTenant } from '@/lib/tenant-guard'
import { isEligibleTenant, useTenants } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'

/** Where the current workspace stands. */
export interface CurrentTenant {
  /** `error` is a failed list read, never `none`. */
  status: 'pending' | 'error' | 'none' | 'ready'
  slug: string | null
  /** Reads the workspace list again. */
  retry: () => void
}

/**
 * The workspace the person is in: the requested one when eligible, else the one
 * they last used, else the first eligible. An eligible result is remembered
 * for the signed-in person. Without a signed-in person the status is `none`.
 * @param requested - A web address from the route, if any.
 * @returns The status, the web address when `ready`, and a retry.
 */
export function useCurrentTenant(requested?: string): CurrentTenant {
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const tenants = useTenants()
  // Subscribes to writes, so a remembered change re-resolves.
  const remembered = useCurrentTenantStore((state) =>
    userId === null ? null : (state.remembered[userId] ?? null)
  )
  const remember = useCurrentTenantStore((state) => state.remember)

  const resolved = useMemo(() => {
    if (userId === null || tenants.data === undefined) return null
    const stored = remembered ?? useCurrentTenantStore.getState().recall(userId)
    return correctTenant({
      list: tenants.data,
      raw: requested,
      requested,
      remembered: stored,
    }).resolved
  }, [userId, tenants.data, requested, remembered])

  const eligible =
    resolved !== null &&
    (tenants.data?.some((e) => e.tenant.slug === resolved && isEligibleTenant(e)) ?? false)

  useEffect(() => {
    if (userId !== null && resolved !== null && eligible && resolved !== remembered) {
      remember(userId, resolved)
    }
  }, [userId, resolved, eligible, remembered, remember])

  /** Reads the workspace list again. */
  const retry = () => {
    void tenants.refetch()
  }
  if (userId === null) return { status: 'none', slug: null, retry }
  if (tenants.data !== undefined) {
    return resolved === null
      ? { status: 'none', slug: null, retry }
      : { status: 'ready', slug: resolved, retry }
  }
  if (tenants.isError) return { status: 'error', slug: null, retry }
  return { status: 'pending', slug: null, retry }
}

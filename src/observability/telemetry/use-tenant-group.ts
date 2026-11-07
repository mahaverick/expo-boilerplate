/**
 * @file Puts analytics events in the current workspace's group.
 */
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { PLATFORM_TENANT_SLUG } from '@/constants/routes'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import { tenantQueryOptions } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'
import { setTenantGroup } from './telemetry'

/**
 * Groups analytics events by the current workspace's id, with the access the
 * API reports. The group is cleared when no workspace resolves or the
 * workspace is not found. A member is never grouped in the platform
 * workspace.
 */
export function useTenantGroup(): void {
  // The workspace list needs a token: nothing is read while restoring or signed out.
  const isSignedIn = useAuthStore((state) => state.isAuthenticated)
  const current = useCurrentTenant(undefined, isSignedIn)
  const slug = isSignedIn && current.status === 'ready' ? current.slug : null
  const tenant = useQuery({ ...tenantQueryOptions(slug ?? ''), enabled: slug !== null })
  const detail = slug === null ? null : (tenant.data ?? null)
  const isPlatformMember =
    detail !== null &&
    detail.access === 'member' &&
    (detail.isPlatform || detail.slug === PLATFORM_TENANT_SLUG)
  const id = detail === null || isPlatformMember ? null : detail.id
  const access = detail?.access ?? null
  useEffect(() => {
    setTenantGroup(id !== null && access !== null ? { id, access } : null)
  }, [id, access])
}

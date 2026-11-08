/**
 * @file Puts analytics events in the group of the workspace on screen.
 */
import { useQuery } from '@tanstack/react-query'
import { usePathname } from 'expo-router'
import { useEffect } from 'react'
import { PLATFORM_TENANT_SLUG } from '@/constants/routes'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import { useFlagScope } from '@/observability/flags/flag-query'
import { tenantQueryOptions } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'
import { setTenantGroup } from './telemetry'

/** The Workspace tab's path. It draws the current workspace with no slug in the route. */
const WORKSPACE_TAB_PATH = '/workspace'

/**
 * Groups analytics events by the id of the workspace on screen, with the
 * access the API reports. The workspace is the route's (its `slug`, as
 * `useFeaturePropertiesSync` reads it), or on the Workspace tab the current
 * one that `useCurrentTenant` resolves. Any other screen is no workspace's
 * page and carries no group, as react clears it off a page outside a tenant
 * route. The group is cleared while the workspace's detail loads, when it is
 * not found, and for a member of the platform workspace.
 */
export function useTenantGroup(): void {
  // The workspace list needs a token: nothing is read while restoring or signed out.
  const isSignedIn = useAuthStore((state) => state.isAuthenticated)
  const routeScope = useFlagScope()
  const isWorkspaceTab = usePathname() === WORKSPACE_TAB_PATH
  const current = useCurrentTenant(undefined, isSignedIn)
  const tabSlug = isWorkspaceTab && current.status === 'ready' ? current.slug : null
  const wanted = routeScope.kind === 'tenant' ? routeScope.slug : tabSlug
  const slug = isSignedIn ? wanted : null
  const tenant = useQuery({ ...tenantQueryOptions(slug ?? ''), enabled: slug !== null })
  // A query's data belongs to its own key, so a workspace still loading has none.
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

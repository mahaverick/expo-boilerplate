import { useLocalSearchParams } from 'expo-router'
import { WorkspaceOverview } from '@/components/workspaces/workspace-overview'
import { useCurrentTenant } from '@/hooks/use-current-tenant'

/**
 * A workspace's overview at `/tenants/{slug}`: where deep links, the list and
 * Welcome land. The route's slug is the source for the current workspace, so
 * it goes to `useCurrentTenant`, which remembers an eligible one. The stack's
 * header takes the top inset.
 * @returns The screen.
 */
export default function TenantOverview() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  useCurrentTenant(slug)
  return <WorkspaceOverview slug={slug} topInset={false} />
}

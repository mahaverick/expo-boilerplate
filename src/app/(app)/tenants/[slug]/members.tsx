import { WorkspaceSettingsRedirect } from '@/components/settings/workspace-settings-redirect'

/**
 * The legacy `/tenants/{slug}/members` path. It sends the person to the
 * workspace's members settings and keeps the query.
 * @returns The redirect.
 */
export default function LegacyWorkspaceMembers() {
  return <WorkspaceSettingsRedirect to="members" />
}

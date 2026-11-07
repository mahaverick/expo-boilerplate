import { WorkspaceSettingsRedirect } from '@/components/settings/workspace-settings-redirect'

/**
 * The legacy `/tenants/{slug}/activity` path. It sends the person to the
 * workspace's activity settings and keeps the query.
 * @returns The redirect.
 */
export default function LegacyWorkspaceActivity() {
  return <WorkspaceSettingsRedirect to="activity" />
}

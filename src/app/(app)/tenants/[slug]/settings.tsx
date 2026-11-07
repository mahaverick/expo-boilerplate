import { WorkspaceSettingsRedirect } from '@/components/settings/workspace-settings-redirect'

/**
 * The legacy `/tenants/{slug}/settings` path. It sends the person to the
 * workspace's general settings and keeps the query.
 * @returns The redirect.
 */
export default function LegacyWorkspaceSettings() {
  return <WorkspaceSettingsRedirect to="general" />
}

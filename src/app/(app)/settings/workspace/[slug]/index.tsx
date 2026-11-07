import { WorkspaceSettingsRedirect } from '@/components/settings/workspace-settings-redirect'

/**
 * The workspace settings root. It sends the person to General and keeps the
 * query.
 * @returns The redirect.
 */
export default function WorkspaceSettingsIndex() {
  return <WorkspaceSettingsRedirect to="general" />
}

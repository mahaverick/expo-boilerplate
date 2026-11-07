import { ActivityIndicator, Text, View } from 'react-native'
import { SettingsRow } from '@/components/settings/settings-row'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { ACCOUNT_SECTIONS, SETTINGS_GROUPS, WORKSPACE_SECTIONS } from '@/constants/settings'
import { useCurrentTenant, type CurrentTenant } from '@/hooks/use-current-tenant'
import { useSignOut } from '@/hooks/use-sign-out'
import { hasPrivacyContent } from '@/lib/privacy-policy'
import { TENANTS_ERROR } from '@/lib/tenants-error'

/**
 * The Workspace group's body: the rows for the current workspace, a spinner
 * while the list loads, the load error with Try again when it failed, and
 * "Choose a workspace first." only when there is none.
 * @param props - The resolved current workspace.
 * @param props.current - What `useCurrentTenant` returned.
 * @returns The rows or the state that stands in for them.
 */
function WorkspaceRows({ current }: { current: CurrentTenant }) {
  if (current.status === 'ready' && current.slug !== null) {
    const { slug } = current
    return WORKSPACE_SECTIONS.map((section) => (
      <SettingsRow
        key={section.key}
        title={section.title}
        description={section.description}
        href={section.path(slug)}
      />
    ))
  }
  if (current.status === 'pending') {
    return <ActivityIndicator accessibilityLabel="Loading your workspaces" />
  }
  if (current.status === 'error')
    return <LoadError message={TENANTS_ERROR} onRetry={current.retry} />
  return <Text className="text-base text-muted-foreground">Choose a workspace first.</Text>
}

/**
 * The settings tab: the Account rows that open the account screens, the
 * Workspace rows for the current workspace, and Sign out.
 * @returns The screen.
 */
export default function Settings() {
  const { signOut, isPending } = useSignOut()
  const current = useCurrentTenant()
  return (
    <Screen title="Settings" bottomInset={false}>
      {SETTINGS_GROUPS.map((group) => (
        <View key={group.key} className="gap-1">
          <Text className="text-lg font-semibold text-foreground">{group.title}</Text>
          <Text className="text-base text-muted-foreground">{group.description}</Text>
          {group.key === 'account'
            ? ACCOUNT_SECTIONS.filter(
                (section) => section.key !== 'privacy' || hasPrivacyContent()
              ).map((section) => (
                <SettingsRow
                  key={section.key}
                  title={section.title}
                  description={section.description}
                  href={section.href}
                />
              ))
            : null}
          {group.key === 'workspace' ? <WorkspaceRows current={current} /> : null}
        </View>
      ))}
      <Button
        variant="secondary"
        label="Sign out"
        loading={isPending}
        onPress={() => void signOut()}
      />
    </Screen>
  )
}

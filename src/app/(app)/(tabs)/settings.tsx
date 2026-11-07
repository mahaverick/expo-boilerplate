import { Text, View } from 'react-native'
import { SettingsRow } from '@/components/settings/settings-row'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { ACCOUNT_SECTIONS, SETTINGS_GROUPS, WORKSPACE_SECTIONS } from '@/constants/settings'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import { useSignOut } from '@/hooks/use-sign-out'

/**
 * The settings tab: the Account rows that open the account screens, the
 * Workspace rows for the current workspace, and Sign out.
 * @returns The screen.
 */
export default function Settings() {
  const { signOut, isPending } = useSignOut()
  const current = useCurrentTenant()
  const slug = current.status === 'ready' ? current.slug : null
  return (
    <Screen title="Settings" bottomInset={false}>
      {SETTINGS_GROUPS.map((group) => (
        <View key={group.key} className="gap-1">
          <Text className="text-lg font-semibold text-foreground">{group.title}</Text>
          <Text className="text-base text-muted-foreground">{group.description}</Text>
          {group.key === 'account'
            ? ACCOUNT_SECTIONS.map((section) => (
                <SettingsRow
                  key={section.key}
                  title={section.title}
                  description={section.description}
                  href={section.href}
                />
              ))
            : null}
          {group.key === 'workspace' ? (
            slug !== null ? (
              WORKSPACE_SECTIONS.map((section) => (
                <SettingsRow
                  key={section.key}
                  title={section.title}
                  description={section.description}
                  href={section.path(slug)}
                />
              ))
            ) : (
              <Text className="text-base text-muted-foreground">Choose a workspace first.</Text>
            )
          ) : null}
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

import { Text, View } from 'react-native'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { useSignOut } from '@/hooks/use-sign-out'

/**
 * The settings tab: the two groups as text, and Sign out. The groups carry no
 * links until their screens exist.
 * @returns The screen.
 */
export default function Settings() {
  const { signOut, isPending } = useSignOut()
  return (
    <Screen title="Settings" bottomInset={false}>
      <View className="gap-1">
        <Text className="text-lg font-semibold text-foreground">Account</Text>
        <Text className="text-base text-muted-foreground">
          Your profile, sign-in and notifications.
        </Text>
      </View>
      <View className="gap-1">
        <Text className="text-lg font-semibold text-foreground">Workspace</Text>
        <Text className="text-base text-muted-foreground">
          The current workspace’s details, members and activity.
        </Text>
      </View>
      <Button
        variant="secondary"
        label="Sign out"
        loading={isPending}
        onPress={() => void signOut()}
      />
    </Screen>
  )
}

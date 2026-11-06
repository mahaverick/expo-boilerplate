import { Text } from 'react-native'
import { Screen } from '@/components/ui/screen'

/**
 * The notifications tab: a placeholder until the notification list ships.
 * @returns The screen.
 */
export default function Notifications() {
  return (
    <Screen title="Notifications" bottomInset={false}>
      <Text className="text-base text-muted-foreground">
        Notifications are not in this version of the app.
      </Text>
    </Screen>
  )
}

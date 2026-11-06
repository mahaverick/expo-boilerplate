import { Text, View } from 'react-native'
import { APP_NAME } from '@/constants/app'

/** The placeholder screen the app opens to: the app's name on the theme's background. */
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        {APP_NAME}
      </Text>
    </View>
  )
}

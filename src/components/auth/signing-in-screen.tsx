import { ActivityIndicator } from 'react-native'
import { Screen } from '@/components/ui/screen'

/**
 * What a screen that needs a session shows while the launch restore runs: a
 * title and a spinner in the theme's colours, never a blank frame.
 * @returns The screen.
 */
export function SigningInScreen() {
  return (
    <Screen title="Signing you in">
      <ActivityIndicator
        testID="session-spinner"
        size="large"
        className="text-foreground"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Screen>
  )
}

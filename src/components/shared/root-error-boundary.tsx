import type { ErrorBoundaryProps } from 'expo-router'
import { useEffect } from 'react'
import { Text } from 'react-native'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { noteError } from '@/observability/errors/listen'

/**
 * The screen Expo Router shows when the root layout, or a route below it
 * with no boundary of its own, throws while rendering. It replaces the root
 * layout, so it renders outside the query client and the gates, and uses no
 * hook that needs them. It reports the error once, as unhandled, and never
 * shows its message, which can carry server or stack detail. Try again
 * re-renders the layout.
 * @param props - What Expo Router passes.
 * @param props.error - The error that was thrown.
 * @param props.retry - Clears the error and renders the layout again.
 * @returns The screen.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    noteError(error, 'react', false)
  }, [error])
  return (
    <Screen title="The app hit a problem" coversBanners>
      <Text className="text-base text-foreground">
        The app hit a problem. Try again, and if it keeps happening, restart the app.
      </Text>
      <Button
        label="Try again"
        variant="primary"
        onPress={() => {
          retry().catch(() => undefined)
        }}
      />
    </Screen>
  )
}

import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Subscribes to the online state.
 * @param notify - Called on each change.
 * @returns The unsubscribe function.
 */
function subscribe(notify: () => void): () => void {
  return onlineManager.subscribe(notify)
}

/**
 * A line under the status bar that says the device is offline. It renders
 * nothing while online. Only its own area takes touches.
 * @returns The banner, or nothing.
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(subscribe, () => onlineManager.isOnline())
  const insets = useSafeAreaInsets()
  if (isOnline) return null
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="bg-muted px-4 pb-2"
      style={{ paddingTop: insets.top + 8, paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <Text className="text-sm text-foreground">
        You’re offline. The app refreshes when you reconnect.
      </Text>
    </View>
  )
}

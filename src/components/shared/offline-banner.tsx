import { Text, View } from 'react-native'
import { useIsOnline } from '@/hooks/use-is-online'

/**
 * A line that says the device is offline. It renders nothing while online.
 * It pads by no inset: `TopBanners` takes the top inset once for every
 * banner.
 * @returns The banner, or nothing.
 */
export function OfflineBanner() {
  if (useIsOnline()) return null
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="px-4 py-2"
    >
      <Text className="text-sm text-foreground">
        You’re offline. The app refreshes when you reconnect.
      </Text>
    </View>
  )
}

import { useState } from 'react'
import { Text, View } from 'react-native'
import { DEFAULT_MAINTENANCE_MESSAGE } from '@/components/shared/maintenance-screen'
import { Button } from '@/components/ui/button'

/**
 * A band under the offline banner while maintenance is `read_only`. It
 * cannot be dismissed, because it stays true while writes are refused. The
 * owner's message is the part that collapses. It pads by no inset: the top
 * banner container does that once.
 * @param props - The owner's message.
 * @param props.message - The message, or `null` for the default.
 * @returns The banner.
 */
export function ReadOnlyBanner({ message }: { message: string | null }) {
  const [isCollapsed, setCollapsed] = useState(false)
  return (
    <View className="gap-1 px-4 py-2">
      <Text className="text-sm font-medium text-foreground">
        Maintenance is in progress: you can look around, but changes are paused.
      </Text>
      <Button
        variant="ghost"
        label={isCollapsed ? 'Show details' : 'Hide details'}
        onPress={() => {
          setCollapsed((collapsed) => !collapsed)
        }}
      />
      {!isCollapsed && (
        <Text className="text-sm text-foreground">{message ?? DEFAULT_MAINTENANCE_MESSAGE}</Text>
      )}
    </View>
  )
}

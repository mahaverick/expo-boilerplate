import { router, type Href } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { cn } from '@/lib/cn'

/** The props of a settings row. */
interface SettingsRowProps {
  title: string
  description: string
  href: Href
}

/**
 * A row that opens a settings screen. It pushes the route, so Back returns to
 * the Settings tab.
 * @param props - The row's title, description and route.
 * @returns The row.
 */
export function SettingsRow({ title, description, href }: SettingsRowProps) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={() => {
        router.push(href)
      }}
      className={cn(TOUCH_TARGET, 'justify-center py-2')}
    >
      <View>
        <Text className="text-base font-medium text-foreground">{title}</Text>
        <Text className="text-sm text-muted-foreground">{description}</Text>
      </View>
    </Pressable>
  )
}

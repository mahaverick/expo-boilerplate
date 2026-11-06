import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Props of `Screen`. */
interface ScreenProps {
  title: string
  children: ReactNode
}

/**
 * A screen's frame: padding by the safe-area insets, and the title as the
 * screen's one header.
 * @param props - The title and the content.
 * @param props.title - The header text.
 * @param props.children - The content below the header.
 * @returns The screen.
 */
export function Screen({ title, children }: ScreenProps) {
  const insets = useSafeAreaInsets()
  return (
    <View
      testID="screen"
      className="flex-1 gap-4 bg-background px-4"
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        {title}
      </Text>
      {children}
    </View>
  )
}

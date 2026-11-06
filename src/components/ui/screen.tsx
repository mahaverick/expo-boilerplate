import type { ReactNode } from 'react'
import { ScrollView, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Props of `Screen`. */
interface ScreenProps {
  title: string
  children: ReactNode
}

/**
 * A screen's frame: padding by the safe-area insets, and the title as the
 * screen's one header. The frame scrolls, so no control is out of reach at
 * large text sizes, and taps work while the keyboard is up.
 * @param props - The title and the content.
 * @param props.title - The header text.
 * @param props.children - The content below the header.
 * @returns The screen.
 */
export function Screen({ title, children }: ScreenProps) {
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      testID="screen"
      keyboardShouldPersistTaps="handled"
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4"
      contentContainerStyle={{
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
    </ScrollView>
  )
}

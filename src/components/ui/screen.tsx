import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Props of `Screen`. */
interface ScreenProps {
  title: string
  children: ReactNode
  scroll?: boolean
}

/**
 * A screen's frame: padding by the safe-area insets, and the title as the
 * screen's one header.
 * @param props - The title, the content and whether the frame scrolls.
 * @param props.title - The header text.
 * @param props.children - The content below the header.
 * @param props.scroll - Scrolls the header and content together, so a form stays reachable at large font sizes. Taps work while the keyboard is up.
 * @returns The screen.
 */
export function Screen({ title, children, scroll = false }: ScreenProps) {
  const insets = useSafeAreaInsets()
  const padding = {
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  }
  const content = (
    <>
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        {title}
      </Text>
      {children}
    </>
  )
  if (scroll) {
    return (
      <ScrollView
        testID="screen-scroll"
        keyboardShouldPersistTaps="handled"
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 px-4"
        contentContainerStyle={padding}
      >
        {content}
      </ScrollView>
    )
  }
  return (
    <View testID="screen" className="flex-1 gap-4 bg-background px-4" style={padding}>
      {content}
    </View>
  )
}

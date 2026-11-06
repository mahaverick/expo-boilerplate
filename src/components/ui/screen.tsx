import type { ReactNode } from 'react'
import { ScrollView, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTopBanner } from '@/hooks/use-top-banner'

/** Props of `Screen`. */
interface ScreenProps {
  title: string
  children: ReactNode
  /** False under a header that takes the top inset. Defaults to true. */
  topInset?: boolean
  /** False above a tab bar that takes the bottom inset. Defaults to true. */
  bottomInset?: boolean
  /** True on an overlay drawn over the top banners, which then take no inset below it. Defaults to false. */
  coversBanners?: boolean
}

/**
 * A screen's frame: padding by the safe-area insets, and the title as the
 * screen's one header. The frame scrolls, so no control is out of reach at
 * large text sizes, and taps work while the keyboard is up. Exactly one thing
 * takes the top inset: this frame, unless a navigator header (`topInset` false)
 * or a top banner takes it. An overlay that covers the banners
 * (`coversBanners`) takes it whatever the banners show.
 * @param props - The title, the content and the insets this frame takes.
 * @param props.title - The header text.
 * @param props.children - The content below the header.
 * @param props.topInset - False when a navigator header takes the top inset.
 * @param props.bottomInset - False when a tab bar takes the bottom inset.
 * @param props.coversBanners - True on an overlay drawn over the top banners.
 * @returns The screen.
 */
export function Screen({
  title,
  children,
  topInset = true,
  bottomInset = true,
  coversBanners = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets()
  const bannerShows = useTopBanner()
  const padding = {
    paddingTop: topInset && (coversBanners || !bannerShows) ? insets.top : 0,
    paddingBottom: bottomInset ? insets.bottom : 0,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  }
  return (
    <ScrollView
      testID="screen"
      keyboardShouldPersistTaps="handled"
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4"
      contentContainerStyle={padding}
    >
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        {title}
      </Text>
      {children}
    </ScrollView>
  )
}

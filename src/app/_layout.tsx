import '../../global.css'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme, useColorScheme } from 'nativewind'
import { useEffect, useRef } from 'react'
import { resolvedScheme, useThemeStore } from '@/states/theme.store'

// Before the first render, so the splash screen covers every frame until the stored theme paints.
void SplashScreen.preventAutoHideAsync()

/**
 * The root layout: one stack, with no header on the placeholder screen. It
 * applies the stored theme to NativeWind, and hides the splash screen once
 * NativeWind reports that scheme, so a stored dark theme never shows a light
 * frame.
 */
export default function RootLayout() {
  const preference = useThemeStore((state) => state.preference)
  const { colorScheme: applied } = useColorScheme()
  const isSplashHidden = useRef(false)

  useEffect(() => {
    colorScheme.set(preference)
  }, [preference])

  useEffect(() => {
    if (isSplashHidden.current || applied !== resolvedScheme(preference, applied)) return
    isSplashHidden.current = true
    void SplashScreen.hideAsync()
  }, [preference, applied])

  return <Stack screenOptions={{ headerShown: false }} />
}

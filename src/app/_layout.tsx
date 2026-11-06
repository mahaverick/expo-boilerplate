import '../../global.css'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme, useColorScheme } from 'nativewind'
import { useEffect, useRef } from 'react'
import {
  installForegroundRefresh,
  restoreSession,
  useSessionStatus,
} from '@/http/session-lifecycle'
import { resolvedScheme, useThemeStore } from '@/states/theme.store'

/**
 * How long the splash screen waits for NativeWind to report the stored scheme.
 * The report rides a native appearance event, which NativeWind drops while
 * the app is not active, so without a bound a lost event would hold the
 * splash screen until a force-quit.
 */
const SPLASH_FALLBACK_MS = 2000

/** Whether the splash screen has been hidden, and the fallback timer still pending. */
interface SplashState {
  isHidden: boolean
  fallback: ReturnType<typeof setTimeout> | undefined
}

// Before the first render, so the splash screen covers every frame until the stored theme paints.
void SplashScreen.preventAutoHideAsync()

/**
 * Hides the splash screen, once, and cancels the pending fallback.
 * @param splash - The layout's splash state.
 */
function hideSplash(splash: SplashState): void {
  if (splash.isHidden) return
  splash.isHidden = true
  clearTimeout(splash.fallback)
  void SplashScreen.hideAsync()
}

/**
 * The root layout: one stack, with no header on any screen. Each screen draws
 * its own title. It applies the stored theme to NativeWind, restores the
 * session, and hides the splash screen once NativeWind reports that scheme and
 * the restore settles, so a stored dark theme never shows a light frame. It
 * hides after `SPLASH_FALLBACK_MS` whatever is still pending.
 */
export default function RootLayout() {
  const preference = useThemeStore((state) => state.preference)
  const { colorScheme: applied } = useColorScheme()
  const status = useSessionStatus()
  const splash = useRef<SplashState>({ isHidden: false, fallback: undefined })

  useEffect(() => {
    colorScheme.set(preference)
  }, [preference])

  useEffect(() => {
    const state = splash.current
    if (state.isHidden) return
    state.fallback = setTimeout(() => {
      hideSplash(state)
    }, SPLASH_FALLBACK_MS)
    return () => {
      clearTimeout(state.fallback)
    }
  }, [])

  useEffect(() => {
    void restoreSession()
    return installForegroundRefresh()
  }, [])

  useEffect(() => {
    const isThemeReported = applied === resolvedScheme(preference, applied)
    if (isThemeReported && status !== 'restoring') hideSplash(splash.current)
  }, [preference, applied, status])

  return <Stack screenOptions={{ headerShown: false }} />
}

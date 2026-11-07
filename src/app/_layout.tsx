import '../../global.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme, useColorScheme } from 'nativewind'
import { useEffect, useRef } from 'react'
import { MaintenanceGate } from '@/components/shared/maintenance-screen'
import { TopBanners } from '@/components/shared/top-banners'
import { UpdateGate } from '@/components/shared/update-screen'
import { StepUpProvider } from '@/components/step-up/step-up-provider'
import { Toaster } from '@/components/ui/toaster'
import { installMaintenanceRecovery } from '@/http/maintenance'
import {
  installForegroundRefresh,
  restoreSession,
  useSessionStatus,
} from '@/http/session-lifecycle'
import { queryClient } from '@/lib/query-client'
import { installQueryManagers } from '@/lib/query-managers'
import { installErrorListeners } from '@/observability/errors/listen'
import {
  forgetStaleIdentityWithoutUser,
  installAnalyticsIdentity,
} from '@/observability/telemetry/install-identity'
import { initAnalytics } from '@/observability/telemetry/telemetry'
import { useScreenViews } from '@/observability/telemetry/use-screen-views'
import { resolvedScheme, useThemeStore } from '@/states/theme.store'

export { RootErrorBoundary as ErrorBoundary } from '@/components/shared/root-error-boundary'

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

// Before the first render, so the session restore's identity and a sign-in's first event find the SDK started.
initAnalytics()

// Before the first render, so a crash in the first frame is reported.
installErrorListeners()

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
 * The root layout: one stack, with no header on any screen, inside the app's
 * query client, under the update gate, the maintenance gate and the top banners, with the toaster over the stack. Each screen draws its own title. The step-up provider wraps the stack once, so a root route such as `/auth/confirm` never unmounts a waiting "Confirm it’s you". It applies the stored theme
 * to NativeWind, restores the session, and hides the splash screen once NativeWind reports that scheme and
 * the restore settles, so a stored dark theme never shows a light frame. It
 * hides after `SPLASH_FALLBACK_MS` whatever is still pending.
 */
export default function RootLayout() {
  const preference = useThemeStore((state) => state.preference)
  const { colorScheme: applied } = useColorScheme()
  const status = useSessionStatus()
  const splash = useRef<SplashState>({ isHidden: false, fallback: undefined })
  useScreenViews()

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

  // Before the restore, so a restored session is identified before any event.
  useEffect(() => installAnalyticsIdentity(), [])

  useEffect(() => {
    void restoreSession().then(forgetStaleIdentityWithoutUser)
    return installForegroundRefresh()
  }, [])

  useEffect(() => installQueryManagers(), [])

  useEffect(() => installMaintenanceRecovery(), [])

  useEffect(() => {
    const isThemeReported = applied === resolvedScheme(preference, applied)
    if (isThemeReported && status !== 'restoring') hideSplash(splash.current)
  }, [preference, applied, status])

  return (
    <QueryClientProvider client={queryClient}>
      <UpdateGate>
        <MaintenanceGate>
          <TopBanners />
          <StepUpProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </StepUpProvider>
          <Toaster />
        </MaintenanceGate>
      </UpdateGate>
    </QueryClientProvider>
  )
}

import {
  Redirect,
  Stack,
  useGlobalSearchParams,
  usePathname,
  useSegments,
  type Href,
} from 'expo-router'
import { useEffect } from 'react'
import { SigningInScreen } from '@/components/auth/signing-in-screen'
import { NotificationStream } from '@/components/notifications/notification-stream'
import { useMaintenanceMode } from '@/http/maintenance'
import { useSessionStatus } from '@/http/session-lifecycle'
import { safePath } from '@/lib/safe-path'
import { useFeaturePropertiesSync } from '@/observability/flags/flag-hooks'
import { useTenantGroup } from '@/observability/telemetry/use-tenant-group'
import { useOwnSignOutStore } from '@/states/own-sign-out.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'

/**
 * The login route for a signed-out person, carrying the path they asked for as
 * `redirect`. A `token` parameter never goes into it. The root, and any path
 * `safePath` refuses, carry none.
 * @param pathname - The current path.
 * @param params - The current global parameters: the query and the dynamic path segments.
 * @param segments - The current route segments, where `[name]` and `[...name]` name the dynamic ones.
 * @returns `/login`, with `?redirect=` when there is a path worth returning to.
 */
function loginHref(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
  segments: string[]
): string {
  const dynamic = new Set(
    segments.flatMap((segment) => /^\[(?:\.\.\.)?(.+)\]$/.exec(segment)?.[1] ?? [])
  )
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'token' || dynamic.has(key) || value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item)
  }
  const text = query.toString()
  const path = safePath(text ? `${pathname}?${text}` : pathname)
  return path === null || path === '/' ? '/login' : `/login?redirect=${encodeURIComponent(path)}`
}

/**
 * The `(app)` stack's route settings. The tabs sit at the bottom of the stack
 * whatever route opens it, so a cold deep link, a sign-in landing and a
 * replace from Welcome all leave Back and the tab bar beneath the screen.
 */
export const unstable_settings = { anchor: '(tabs)' }

/**
 * The options of the stack screens above the tabs: a navigator header with an
 * empty title and a Back button. `Screen` draws the one header-role title, and
 * the header takes the top inset. The back label is the arrow alone, so the
 * group name `(tabs)` never shows.
 */
const STACK_SCREEN_OPTIONS = {
  headerShown: true,
  headerTitle: '',
  headerBackButtonDisplayMode: 'minimal',
} as const

/**
 * The guard for every screen that needs a session. It shows "Signing you in"
 * while the session restores, sends a signed-out person to `/login` with the path they asked for, and sends an
 * account that must add a passkey to `/passkey-required`, which sits outside
 * this group so the guard cannot loop. During maintenance `full` it redirects
 * nowhere: the screen over the stack blocks it, and the person keeps their place.
 * A sign-out the person asked for carries no `redirect`, so the next person on
 * the device never lands on the previous person's path.
 * The tabs show no navigator header; the screens above them show an
 * empty-titled header with Back. The one notification stream renders beside
 * the stack, after the redirects, so it never mounts signed out.
 */
export default function AppLayout() {
  const status = useSessionStatus()
  const isFull = useMaintenanceMode() === 'full'
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const segments: string[] = useSegments()
  const passkeyRequired = usePasskeySetupStore((state) => state.required)
  const isOwnSignOut = useOwnSignOutStore((state) => state.isOwn)
  useTenantGroup()
  useFeaturePropertiesSync()
  useEffect(() => {
    if (status === 'signed-in' && isOwnSignOut) useOwnSignOutStore.setState({ isOwn: false })
  }, [status, isOwnSignOut])
  if (status === 'restoring') return <SigningInScreen />
  if (status === 'signed-out' && !isFull) {
    if (isOwnSignOut) return <Redirect href="/login" />
    return (
      // The redirect is any path the person asked for, which typed routes cannot list.
      <Redirect href={loginHref(pathname, params, segments) as Href} />
    )
  }
  if (passkeyRequired && !isFull) return <Redirect href="/passkey-required" />
  return (
    <>
      <NotificationStream />
      <Stack screenOptions={STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tenants/[slug]/[...rest]" options={{ headerShown: false }} />
        <Stack.Screen name="tenants/[slug]/settings" options={{ headerShown: false }} />
        <Stack.Screen name="tenants/[slug]/members" options={{ headerShown: false }} />
        <Stack.Screen name="tenants/[slug]/activity" options={{ headerShown: false }} />
        <Stack.Screen name="settings/workspace/[slug]/index" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}

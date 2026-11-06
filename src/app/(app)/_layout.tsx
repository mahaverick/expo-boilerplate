import { Redirect, Stack, useGlobalSearchParams, usePathname, type Href } from 'expo-router'
import { SigningInScreen } from '@/components/auth/signing-in-screen'
import { useMaintenanceMode } from '@/http/maintenance'
import { useSessionStatus } from '@/http/session-lifecycle'
import { safePath } from '@/lib/safe-path'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'

/**
 * The login route for a signed-out person, carrying the path they asked for as
 * `redirect`. A `token` parameter never goes into it. The root, and any path
 * `safePath` refuses, carry none.
 * @param pathname - The current path.
 * @param params - The current query parameters.
 * @returns `/login`, with `?redirect=` when there is a path worth returning to.
 */
function loginHref(
  pathname: string,
  params: Record<string, string | string[] | undefined>
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'token' || value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item)
  }
  const text = query.toString()
  const path = safePath(text ? `${pathname}?${text}` : pathname)
  return path === null || path === '/' ? '/login' : `/login?redirect=${encodeURIComponent(path)}`
}

/**
 * The guard for every screen that needs a session. It shows "Signing you in"
 * while the session restores, sends a signed-out person to `/login` with the path they asked for, and sends an
 * account that must add a passkey to `/passkey-required`, which sits outside
 * this group so the guard cannot loop. During maintenance `full` it redirects
 * nowhere: the screen over the stack blocks it, and the person keeps their place.
 */
export default function AppLayout() {
  const status = useSessionStatus()
  const isFull = useMaintenanceMode() === 'full'
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const passkeyRequired = usePasskeySetupStore((state) => state.required)
  if (status === 'restoring') return <SigningInScreen />
  if (status === 'signed-out' && !isFull)
    return (
      // The redirect is any path the person asked for, which typed routes cannot list.
      <Redirect href={loginHref(pathname, params) as Href} />
    )
  if (passkeyRequired && !isFull) return <Redirect href="/passkey-required" />
  return <Stack screenOptions={{ headerShown: false }} />
}

import { Redirect, Stack } from 'expo-router'
import { SigningInScreen } from '@/components/auth/signing-in-screen'
import { useMaintenanceMode } from '@/http/maintenance'
import { useSessionStatus } from '@/http/session-lifecycle'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'

/**
 * The guard for every screen that needs a session. It shows "Signing you in"
 * while the session restores, sends a signed-out person to `/login`, and sends an
 * account that must add a passkey to `/passkey-required`, which sits outside
 * this group so the guard cannot loop. During maintenance `full` it redirects
 * nowhere: the screen over the stack blocks it, and the person keeps their place.
 */
export default function AppLayout() {
  const status = useSessionStatus()
  const isFull = useMaintenanceMode() === 'full'
  const passkeyRequired = usePasskeySetupStore((state) => state.required)
  if (status === 'restoring') return <SigningInScreen />
  if (status === 'signed-out' && !isFull) return <Redirect href="/login" />
  if (passkeyRequired && !isFull) return <Redirect href="/passkey-required" />
  return <Stack screenOptions={{ headerShown: false }} />
}

import { Redirect, Stack } from 'expo-router'
import { useSessionStatus } from '@/http/session-lifecycle'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'

/**
 * The guard for every screen that needs a session. It renders nothing while
 * the session restores, sends a signed-out person to `/login`, and sends an
 * account that must add a passkey to `/passkey-required`, which sits outside
 * this group so the guard cannot loop.
 */
export default function AppLayout() {
  const status = useSessionStatus()
  const passkeyRequired = usePasskeySetupStore((state) => state.required)
  if (status === 'restoring') return null
  if (status === 'signed-out') return <Redirect href="/login" />
  if (passkeyRequired) return <Redirect href="/passkey-required" />
  return <Stack screenOptions={{ headerShown: false }} />
}

import { router } from 'expo-router'
import { useEffect } from 'react'
import { SignInLinkScreen } from '@/components/auth/sign-in-link-screen'
import { useMaintenanceMode } from '@/http/maintenance'
import { useSessionStatus } from '@/http/session-lifecycle'

/**
 * The sign-in screen. It asks for an address and mails a link. A session that
 * becomes signed in while it shows, such as a refresh that succeeds after an
 * offline start, replaces it with Home, except during maintenance `full`.
 */
export default function Login() {
  const status = useSessionStatus()
  const isFull = useMaintenanceMode() === 'full'
  useEffect(() => {
    if (status === 'signed-in' && !isFull) router.replace('/')
  }, [status, isFull])
  return <SignInLinkScreen title="Sign in" submitLabel="Email me a link" />
}

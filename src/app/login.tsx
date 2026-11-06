import { router, useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'
import { SignInLinkScreen } from '@/components/auth/sign-in-link-screen'
import { useMaintenanceMode } from '@/http/maintenance'
import { useSessionStatus } from '@/http/session-lifecycle'
import { safePath } from '@/lib/safe-path'
import { useOwnSignOutStore } from '@/states/own-sign-out.store'

/** What the notice says. Only `?notice=sign-in-link` shows it. */
const SIGN_IN_LINK_NOTICE = 'Sign in with an email link. This app doesn’t use passwords.'

/**
 * Reads one route parameter as its first string.
 * @param value - The parameter: a string, a list or nothing.
 * @returns The text, or `undefined`.
 */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * The sign-in screen. It asks for an address and mails a link. A safe
 * `redirect` parameter goes with the request, and the link screen lands there.
 * `?notice=sign-in-link` adds a line saying the app uses no passwords. A session that
 * becomes signed in while it shows, such as a refresh that succeeds after an
 * offline start, replaces it with Home, except during maintenance `full`.
 * Once it shows, a sign-out of the person's own is over, so it clears that mark.
 */
export default function Login() {
  const params = useLocalSearchParams<{ redirect?: string; notice?: string }>()
  const redirect = safePath(first(params.redirect)) ?? undefined
  const notice = first(params.notice) === 'sign-in-link' ? SIGN_IN_LINK_NOTICE : undefined
  const status = useSessionStatus()
  const isFull = useMaintenanceMode() === 'full'
  useEffect(() => {
    useOwnSignOutStore.setState({ isOwn: false })
  }, [])
  useEffect(() => {
    if (status === 'signed-in' && !isFull) router.replace('/')
  }, [status, isFull])
  return (
    <SignInLinkScreen
      title="Sign in"
      submitLabel="Email me a link"
      redirect={redirect}
      notice={notice}
    />
  )
}

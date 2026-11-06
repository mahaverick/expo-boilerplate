import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Text } from 'react-native'
import { SignInLinkScreen } from '@/components/auth/sign-in-link-screen'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { Screen } from '@/components/ui/screen'
import { useSignOut } from '@/hooks/use-sign-out'
import { SignInNotKeptError } from '@/http/body-token'
import { useSessionStatus } from '@/http/session-lifecycle'
import { statusFrom } from '@/lib/api-error'
import { useVerifySignInLink } from '@/queries/auth.queries'
import { useAuthStore } from '@/states/auth.store'

/** What the screen says when a verify failed for a reason that may pass. */
const SIGN_IN_FAILED = 'We couldn’t sign you in. Check your connection and try again.'

/** The title of the screens that report a verify that did not finish. */
const NOT_FINISHED_TITLE = 'Sign-in didn’t finish'

/** What the screen is doing. `deciding` lasts until the session restore settles. */
type Mode = 'deciding' | 'dead' | 'switch' | 'verifying'

/**
 * Reads one route parameter as a trimmed string.
 * @param value - The parameter: a string, a list or nothing.
 * @returns The text, or `undefined` when it is missing or blank.
 */
function paramText(value: string | string[] | undefined): string | undefined {
  const text = (Array.isArray(value) ? value[0] : value)?.trim()
  return text || undefined
}

/**
 * Where a mailed sign-in link opens: `/auth/link?token=…&email=…`.
 *
 * The screen reads `token` and `email` once, then clears them from the route.
 * It waits for the session restore, then decides from who was signed in at
 * that moment: the same address goes Home without posting, another address
 * asks first, and no one posts the token once. A link with no token or no
 * address is the dead-link state and is never posted. A 400 is a dead link.
 * Any other failure leaves the link usable, so it offers Try again. A second
 * press while a post is in flight posts nothing, since the link is single-use.
 * Every landing replaces the route, so Back never returns to the token.
 */
export default function Link() {
  const params = useLocalSearchParams<{ token?: string; email?: string }>()
  const [link] = useState(() => ({
    token: paramText(params.token),
    email: paramText(params.email),
  }))
  const status = useSessionStatus()
  const verify = useVerifySignInLink()
  const { signOut, isPending: isSigningOut } = useSignOut()
  const [mode, setMode] = useState<Mode>('deciding')
  const [current, setCurrent] = useState('')
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)
  const decided = useRef(false)

  useEffect(() => {
    router.setParams({ token: undefined, email: undefined })
  }, [])

  /** Set while a post is in flight, and after a success, so a second press in the same frame posts nothing. */
  const posting = useRef(false)

  /** Posts the token, once at a time. The outcome decides what shows next. */
  const post = () => {
    if (posting.current) return
    posting.current = true
    setMode('verifying')
    verify.mutate(
      { token: link.token ?? '', email: link.email },
      {
        onSuccess: () => {
          setFailure(null)
          router.replace('/')
        },
        onError: (error) => {
          // Try again may post the link again.
          posting.current = false
          setFailure({ error })
        },
      }
    )
  }

  const decide = useEffectEvent(() => {
    const user = useAuthStore.getState().user
    if (user) {
      const isSamePerson = link.email?.toLowerCase() === user.email.toLowerCase()
      if (!link.token || !link.email || isSamePerson) {
        router.replace('/')
        return
      }
      setCurrent(user.email)
      setMode('switch')
      return
    }
    if (!link.token || !link.email) {
      setMode('dead')
      return
    }
    post()
  })

  useEffect(() => {
    if (status === 'restoring' || decided.current) return
    decided.current = true
    decide()
  }, [status])

  if (mode === 'switch') {
    return (
      <Screen title={`You’re signed in as ${current}`}>
        <Text className="text-base text-foreground">{`This link signs in ${link.email}.`}</Text>
        <Button
          variant="primary"
          label={`Continue as ${link.email}`}
          loading={isSigningOut}
          onPress={() => {
            void signOut({ navigate: false }).then(post)
          }}
        />
        <Button
          variant="secondary"
          label="Stay signed in"
          onPress={() => {
            router.replace('/')
          }}
        />
      </Screen>
    )
  }

  if (mode === 'dead') {
    return (
      <SignInLinkScreen
        title="This link has expired or was already used"
        submitLabel="Email me a new link"
        defaultEmail={link.email}
      />
    )
  }

  if (failure) {
    if (failure.error instanceof SignInNotKeptError) {
      return (
        <SignInLinkScreen
          title={NOT_FINISHED_TITLE}
          submitLabel="Email me a new link"
          defaultEmail={link.email}
          notice={failure.error.message}
        />
      )
    }
    if (statusFrom(failure.error) === 400) {
      return (
        <SignInLinkScreen
          title="This link has expired or was already used"
          submitLabel="Email me a new link"
          defaultEmail={link.email}
        />
      )
    }
    return (
      <Screen title={NOT_FINISHED_TITLE}>
        <InlineError message={SIGN_IN_FAILED} />
        <Button variant="primary" label="Try again" loading={verify.isPending} onPress={post} />
      </Screen>
    )
  }

  return (
    <Screen title={link.email ? `Signing you in as ${link.email}` : 'Signing you in'}>
      {null}
    </Screen>
  )
}

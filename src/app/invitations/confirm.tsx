import { useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Text } from 'react-native'
import { SignInLinkScreen } from '@/components/auth/sign-in-link-screen'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { Screen } from '@/components/ui/screen'
import { joinFailureMessage } from '@/copy/invitations'
import { useSignOut } from '@/hooks/use-sign-out'
import { SignInNotKeptError } from '@/http/body-token'
import { useSessionStatus } from '@/http/session-lifecycle'
import { statusFrom } from '@/lib/api-error'
import { invitationTokenSchema } from '@/lib/invitation-token'
import { landJoined } from '@/lib/land-joined'
import { useConfirmInvitation } from '@/queries/invitation.queries'
import { useAuthStore } from '@/states/auth.store'
import { useOwnSignOutStore } from '@/states/own-sign-out.store'
import type { User } from '@/types/api.types'

/** The title of a link the server refused or that is malformed. */
const DEAD_TITLE = 'This link can’t be used'

/** What the dead link tells the person to do. */
const DEAD_DESCRIPTION =
  'Open your invitation email and select Join again to get a new link, or ask the person who invited you for a new invite.'

/** The title of the screen that reports a join that did not finish. */
const FAILED_TITLE = 'You weren’t added to your team'

/** Where the screen is: waiting for the restore, asking, posting, or ended without joining. */
type Phase = 'deciding' | 'switch' | 'joining' | 'failed' | 'dead'

/**
 * Reads one route parameter as a trimmed string.
 * @param value - The parameter: a string, a list or nothing.
 * @returns The text, or `undefined` when it is missing or blank.
 */
function paramText(value: string | string[] | undefined): string | undefined {
  const text = (Array.isArray(value) ? value[0] : value)?.trim()
  return text || undefined
}

/** Leaves for Home, replacing this screen so Back never returns to the token. */
function goHome(): void {
  router.replace('/')
}

/**
 * Where the emailed confirmation link opens: `/invitations/confirm?token=…&email=…`.
 *
 * The screen reads `token` and `email` once and clears both from the route,
 * ignoring the `utm_*` keys. A missing one is the incomplete state, and a token
 * that is not 43 base64url characters is dead and never posted. It waits for
 * the session restore, then decides from who was signed in at that moment.
 * Signed out, or signed in as the link's address in any case, it posts once.
 * Signed in as someone else, it asks first and spends nothing; Continue signs
 * out, then posts. The server signs the invitee in and joins them, so the
 * screen toasts, remembers an eligible workspace and lands on the Workspace
 * tab. A 404 is the dead link, and anything else leaves the link usable, so it
 * offers Try again. A refresh token the device could not keep spent the link
 * and shows the sign-in form instead. Each post runs once: a ref guards
 * StrictMode's second effect and a second press.
 */
export default function ConfirmInvitation() {
  const params = useLocalSearchParams<{ token?: string; email?: string }>()
  const [link] = useState(() => ({
    token: paramText(params.token),
    email: paramText(params.email),
  }))
  const status = useSessionStatus()
  const queryClient = useQueryClient()
  const confirm = useConfirmInvitation()
  const { signOut } = useSignOut()
  const signedIn = useAuthStore((state) => state.isAuthenticated)
  const [phase, setPhase] = useState<Phase>('deciding')
  const [startedAs, setStartedAs] = useState<User | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const decided = useRef(false)
  /** Set while a post is in flight and after a success, so a second press posts nothing. */
  const busy = useRef(false)

  const complete = link.token !== undefined && link.email !== undefined
  const valid = link.token !== undefined && invitationTokenSchema.safeParse(link.token).success

  useEffect(() => {
    router.setParams({ token: undefined, email: undefined })
  }, [])

  /** Posts the link. The outcome decides what shows next. */
  const send = () => {
    // A sign-in starting ends any sign-out of the person's own.
    useOwnSignOutStore.setState({ isOwn: false })
    setPhase('joining')
    confirm.mutate(
      { token: link.token ?? '', email: link.email },
      {
        onSuccess: ({ tenant, user }) => {
          setFailure(null)
          void landJoined(queryClient, tenant, user, false)
        },
        onError: (error) => {
          // Try again may post the link again.
          busy.current = false
          if (statusFrom(error) === 404) {
            setPhase('dead')
            return
          }
          setFailure(error)
          setPhase('failed')
        },
      }
    )
  }

  /** Posts once at a time. */
  const post = () => {
    if (busy.current) return
    busy.current = true
    send()
  }

  /** Signs out, then posts. The joining phase is set first, so the panel does not flash. */
  const continueAs = () => {
    if (busy.current) return
    busy.current = true
    setPhase('joining')
    void signOut({ navigate: false }).then(send)
  }

  const decide = useEffectEvent(() => {
    const user = useAuthStore.getState().user
    if (!complete || !valid) {
      setPhase('dead')
      return
    }
    // Case-insensitive: neither side is trusted to stay lowercased. A mismatch never reaches the server.
    if (user && user.email.toLowerCase() !== link.email?.toLowerCase()) {
      setStartedAs(user)
      setPhase('switch')
      return
    }
    post()
  })

  useEffect(() => {
    if (status === 'restoring' || decided.current) return
    decided.current = true
    decide()
  }, [status])

  if (!complete) {
    return (
      <Screen title="This link is incomplete">
        <Text className="text-base text-foreground">
          Part of this link is missing. Open the latest email from us and select its link.
        </Text>
        <Button variant="secondary" label="Go to Home" onPress={goHome} />
      </Screen>
    )
  }

  if (phase === 'dead' || (phase === 'deciding' && !valid)) {
    if (signedIn) {
      return (
        <Screen title={DEAD_TITLE}>
          <Text className="text-base text-foreground">{DEAD_DESCRIPTION}</Text>
          <Button variant="primary" label="Go to Home" onPress={goHome} />
        </Screen>
      )
    }
    return (
      <SignInLinkScreen
        title={DEAD_TITLE}
        description={DEAD_DESCRIPTION}
        submitLabel="Email me a new link"
        defaultEmail={link.email}
      />
    )
  }

  if (phase === 'switch' && startedAs) {
    return (
      <Screen title="Join your team">
        <Text className="text-base text-foreground">
          {`This invitation is for ${link.email}. You’re signed in as ${startedAs.email}.`}
        </Text>
        <Button variant="primary" label={`Continue as ${link.email}`} onPress={continueAs} />
        <Button variant="secondary" label="Cancel" onPress={goHome} />
      </Screen>
    )
  }

  if (phase === 'failed') {
    if (failure instanceof SignInNotKeptError) {
      // The link is spent: a new one is the only way on.
      return signedIn ? (
        <Screen title={FAILED_TITLE}>
          <InlineError message={failure.message} />
          <Button variant="primary" label="Go to Home" onPress={goHome} />
        </Screen>
      ) : (
        <SignInLinkScreen
          title={FAILED_TITLE}
          submitLabel="Email me a new link"
          defaultEmail={link.email}
          notice={failure.message}
        />
      )
    }
    return (
      <Screen title={FAILED_TITLE}>
        <InlineError message={joinFailureMessage(failure)} />
        <Button variant="primary" label="Try again" loading={confirm.isPending} onPress={post} />
      </Screen>
    )
  }

  return (
    <Screen title="Joining your team">
      <Text accessibilityLiveRegion="polite" className="text-base text-foreground">
        Joining your team…
      </Text>
      <Text className="text-base text-muted-foreground">{`This link is for ${link.email}.`}</Text>
    </Screen>
  )
}

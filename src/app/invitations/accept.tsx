import { useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Text } from 'react-native'
import { InvitationInbox } from '@/components/invitations/invitation-inbox'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { Screen } from '@/components/ui/screen'
import { ROLE_LABELS } from '@/constants/roles'
import { useSignOut } from '@/hooks/use-sign-out'
import { useSessionStatus } from '@/http/session-lifecycle'
import { retryAfterSecondsFrom, statusFrom } from '@/lib/api-error'
import { fullName } from '@/lib/format'
import { invitationTokenSchema } from '@/lib/invitation-token'
import { landJoined } from '@/lib/land-joined'
import { retryableFailureMessage } from '@/lib/retry'
import { toast } from '@/lib/toast'
import {
  inviterName,
  useAcceptInvitation,
  useInvitationPreview,
  useVerifyInvitation,
} from '@/queries/invitation.queries'
import { useAuthStore } from '@/states/auth.store'
import type { InvitationConfirmationSent, InvitationPreview, User } from '@/types/api.types'

/** How long Resend stays closed after a link is mailed, in seconds. */
const RESEND_COOLDOWN_SECONDS = 60

/** The title of every invitation that cannot join anyone, whatever the reason. */
const DEAD_TITLE = 'This invitation can’t be used'

/** A failed preview is the request's failure, not the invitation's: the link is untouched. */
const PREVIEW_ERROR = 'The check failed, and your invitation link is unchanged. Select Try again.'

/** Which call the screen makes: `verify` mails a signed-out invitee a link, `accept` joins the signed-in one. */
type JoinCall = 'verify' | 'accept'

/** The call the screen made, and the invitation it showed while making it: null when the preview had 404ed. */
interface Joining {
  call: JoinCall
  invitation: InvitationPreview | null
}

/** How a join ended without landing: the invitation is dead, or the request failed and may pass. */
type JoinFailure = { kind: 'dead' } | { kind: 'failed'; error: unknown }

/** The address a `202` says it mailed, and when Resend opens again. */
interface Inbox {
  email: string
  resendAt: number
}

/**
 * Reads the route's `token` as a trimmed string.
 * @param value - The parameter: a string, a list or nothing.
 * @returns The text, or `undefined` when it is missing or blank.
 */
function paramText(value: string | string[] | undefined): string | undefined {
  const text = (Array.isArray(value) ? value[0] : value)?.trim()
  return text || undefined
}

/**
 * "{inviter} invited you to join {workspace} as {Role}."
 * @param invitation - The preview.
 */
function invitationSentence(invitation: InvitationPreview): string {
  return `${inviterName(invitation.invitedBy)} invited you to join ${invitation.tenant.name} as ${ROLE_LABELS[invitation.role]}.`
}

/** Leaves for Home, replacing this screen so Back never returns to the token. */
function goHome(): void {
  router.replace('/')
}

/**
 * The call the screen makes for a settled preview and whoever was signed in
 * when the restore settled, or null when it makes none.
 * @param invitation - The preview, when it answered.
 * @param gone - True when the preview answered 404.
 * @param startedAs - The person signed in at that moment, or null.
 */
function joinCallFor(
  invitation: InvitationPreview | undefined,
  gone: boolean,
  startedAs: User | null
): JoinCall | null {
  if (invitation) {
    if (!startedAs) return 'verify'
    // Case-insensitive: neither side is trusted to stay lowercased. A mismatch never reaches the server.
    return startedAs.email.toLowerCase() === invitation.email.toLowerCase() ? 'accept' : null
  }
  // A used link is a 404 to everyone but the invitee, who gets `alreadyMember`; the server decides.
  return gone && startedAs ? 'accept' : null
}

/**
 * A screen with a message and the way out.
 * @param props - The header, the optional lines and the optional extra button.
 * @param props.title - The header.
 * @param props.lines - Plain text lines under it.
 * @param props.error - An inline error under the lines.
 * @param props.retry - A Try again button, when the request may pass.
 * @param props.retrying - True while the retry is in flight.
 * @returns The screen.
 */
function Notice({
  title,
  lines = [],
  error,
  retry,
  retrying = false,
}: {
  title: string
  lines?: string[]
  error?: string
  retry?: () => void
  retrying?: boolean
}) {
  return (
    <Screen title={title}>
      {lines.map((line) => (
        <Text key={line} className="text-base text-foreground">
          {line}
        </Text>
      ))}
      {error ? <InlineError message={error} /> : null}
      {retry ? (
        <Button variant="primary" label="Try again" loading={retrying} onPress={retry} />
      ) : null}
      <Button variant="secondary" label="Go to Home" onPress={goHome} />
    </Screen>
  )
}

/**
 * Where a mailed invitation link opens: `/invitations/accept?token=…`.
 *
 * The screen reads `token` once and clears it from the route, ignoring the
 * `utm_*` keys. A missing token is the incomplete state, and a token that is
 * not 43 base64url characters is dead and never posted. It waits for the
 * session restore, asks the public preview, then decides from who was signed
 * in at that moment. Signed out, it verifies: the server mails a confirmation
 * link and sets no session, so the screen shows "Check your inbox". Signed in
 * as the invitee, it accepts, remembers the workspace and lands on the
 * Workspace tab. Signed in as someone else, it asks first, and Continue signs
 * out before it verifies. Each post runs once: a ref guards the effect under
 * StrictMode, and a second press of Continue or Resend posts nothing.
 */
export default function AcceptInvitation() {
  const params = useLocalSearchParams<{ token?: string }>()
  const [token] = useState(() => paramText(params.token))
  const valid = token !== undefined && invitationTokenSchema.safeParse(token).success
  const status = useSessionStatus()
  const queryClient = useQueryClient()
  const verify = useVerifyInvitation()
  const accept = useAcceptInvitation()
  const { signOut, isPending: isSigningOut } = useSignOut()
  /** Who was signed in when the restore settled; null until it settles. */
  const [started, setStarted] = useState<{ user: User | null } | null>(null)
  const [joining, setJoining] = useState<Joining | null>(null)
  const [failure, setFailure] = useState<JoinFailure | null>(null)
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const decided = useRef(false)
  const startedCall = useRef(false)
  /** Set while a Continue, a Resend or a retry is in flight, so a second press posts nothing. */
  const busy = useRef(false)

  useEffect(() => {
    router.setParams({ token: undefined })
  }, [])

  const decide = useEffectEvent(() => {
    setStarted({ user: useAuthStore.getState().user })
  })

  useEffect(() => {
    if (status === 'restoring' || decided.current) return
    decided.current = true
    decide()
  }, [status])

  const preview = useInvitationPreview(valid && started && !joining ? token : undefined)
  const invitation = preview.data
  const gone = !invitation && preview.isError && statusFrom(preview.error) === 404
  const startedAs = started?.user ?? null
  const nextCall = started ? joinCallFor(invitation, gone, startedAs) : null

  /** Keeps a failure in screen state: a 404 (and, for accept, a 403) is the dead invitation, anything else may pass. */
  const failWith = (call: JoinCall, error: unknown) => {
    busy.current = false
    const code = statusFrom(error)
    const dead = code === 404 || (call === 'accept' && code === 403)
    setFailure(dead ? { kind: 'dead' } : { kind: 'failed', error })
  }

  /** A verify's `202` shows the inbox and restarts the resend clock. */
  const verified = (result: InvitationConfirmationSent) => {
    busy.current = false
    setFailure(null)
    setInbox({ email: result.email, resendAt: Date.now() + RESEND_COOLDOWN_SECONDS * 1_000 })
  }

  /**
   * Posts the token for `call`. The accept's bearer is the session that was
   * signed in when the screen decided.
   * @param call - Which call to make.
   * @param account - The signed-in person, for an accept.
   */
  const post = (call: JoinCall, account: User | null) => {
    if (call === 'verify') {
      verify.mutate(token ?? '', { onSuccess: verified, onError: (error) => failWith(call, error) })
    } else if (account) {
      accept.mutate(token ?? '', {
        onSuccess: ({ tenant, alreadyMember }) => {
          busy.current = false
          setFailure(null)
          void landJoined(queryClient, tenant, account, alreadyMember)
        },
        onError: (error) => failWith(call, error),
      })
    }
  }

  /** Try again on a failed call: posts once at a time. */
  const retry = (call: JoinCall) => {
    if (busy.current) return
    busy.current = true
    post(call, startedAs)
  }

  /** Signs out, then verifies as a signed-out visitor. Once at a time. */
  const continueAs = (waiting: InvitationPreview) => {
    if (busy.current) return
    busy.current = true
    // Set before the sign-out clears the cache, so the preview is not asked again.
    startedCall.current = true
    setJoining({ call: 'verify', invitation: waiting })
    void signOut({ navigate: false }).then(() => {
      post('verify', null)
    })
  }

  /**
   * Resend: the same verify with the same token. A rate limit keeps the inbox,
   * toasts how long to wait and holds Resend for that long; any other failure
   * is handled as the first verify's would be.
   */
  const resend = () => {
    if (busy.current) return
    busy.current = true
    verify.mutate(token ?? '', {
      onSuccess: verified,
      onError: (error) => {
        if (statusFrom(error) !== 429) {
          failWith('verify', error)
          return
        }
        busy.current = false
        toast.error(retryableFailureMessage(error, 'attempts'))
        const wait = retryAfterSecondsFrom(error)
        if (wait === null) return
        setInbox(
          (current) =>
            current && {
              ...current,
              resendAt: Math.max(current.resendAt, Date.now() + wait * 1_000),
            }
        )
      },
    })
  }

  const start = useEffectEvent(() => {
    if (startedCall.current || !nextCall) return
    startedCall.current = true
    busy.current = true
    setJoining({ call: nextCall, invitation: invitation ?? null })
    post(nextCall, startedAs)
  })

  useEffect(() => {
    start()
  }, [nextCall])

  if (!token) {
    return (
      <Notice
        title="This link is incomplete"
        lines={['Part of this link is missing. Open the latest invitation email and select Join.']}
      />
    )
  }

  /** The dead state: names the inviter only when a live preview gave one, and never an address. */
  const dead = (inviter: InvitationPreview['invitedBy'] | undefined) => {
    const name = fullName(inviter)
    return (
      <Notice
        title={DEAD_TITLE}
        lines={[
          name
            ? `Ask ${name} for a new invite.`
            : 'Ask the person who invited you for a new invite.',
        ]}
      />
    )
  }

  if (!valid) return dead(undefined)

  if (joining) {
    if (failure?.kind === 'dead') return dead(joining.invitation?.invitedBy)
    if (failure) {
      return (
        <Notice
          title={
            joining.invitation
              ? `You weren’t added to ${joining.invitation.tenant.name}`
              : 'This invitation didn’t open'
          }
          error={retryableFailureMessage(failure.error, 'attempts')}
          retry={() => {
            retry(joining.call)
          }}
          retrying={joining.call === 'verify' ? verify.isPending : accept.isPending}
        />
      )
    }
    if (inbox && joining.invitation) {
      return (
        <InvitationInbox
          email={inbox.email}
          workspace={joining.invitation.tenant.name}
          resendAt={inbox.resendAt}
          resending={verify.isPending}
          onResend={resend}
          onHome={goHome}
        />
      )
    }
    return <Joining call={joining.call} invitation={joining.invitation} account={startedAs} />
  }

  if (nextCall) {
    return <Joining call={nextCall} invitation={invitation ?? null} account={startedAs} />
  }

  if (invitation && startedAs) {
    return (
      <Screen title={`Join ${invitation.tenant.name}`}>
        <Text className="text-base text-foreground">{invitationSentence(invitation)}</Text>
        <Text className="text-base text-foreground">
          {`This invitation is for ${invitation.email}. You’re signed in as ${startedAs.email}.`}
        </Text>
        <Button
          variant="primary"
          label={`Continue as ${invitation.email}`}
          loading={isSigningOut}
          onPress={() => {
            continueAs(invitation)
          }}
        />
        <Button variant="secondary" label="Cancel" disabled={isSigningOut} onPress={goHome} />
      </Screen>
    )
  }

  if (gone) return dead(undefined)

  if (preview.isError) {
    return (
      <Notice
        title="This invitation wasn’t checked"
        error={PREVIEW_ERROR}
        retry={() => void preview.refetch()}
        retrying={preview.isFetching}
      />
    )
  }

  return (
    <Screen title="Checking your invitation">
      <Text className="text-base text-muted-foreground">Checking your invitation…</Text>
    </Screen>
  )
}

/**
 * The frame while a join call runs. With the preview it names the inviter and
 * the address: a signed-out verify reads "Emailing a link to {address}…",
 * because it only mails the confirmation link; a signed-in accept reads
 * "Joining {workspace} as {address}…". The address is the preview's, the
 * server's record of who was invited, never a route parameter.
 * @param props - The call, the preview and the signed-in person.
 * @param props.call - Which call is running.
 * @param props.invitation - The preview, or null after a 404 preview.
 * @param props.account - The signed-in person, if any.
 * @returns The screen.
 */
function Joining({
  call,
  invitation,
  account,
}: {
  call: JoinCall
  invitation: InvitationPreview | null
  account: User | null
}) {
  if (!invitation) {
    return (
      <Screen title="Checking your invitation">
        <Text className="text-base text-muted-foreground">Checking your invitation…</Text>
      </Screen>
    )
  }
  const name = invitation.tenant.name
  const address = call === 'accept' ? (account?.email ?? invitation.email) : invitation.email
  return (
    <Screen title={`Joining ${name}`}>
      <Text className="text-base text-foreground">{invitationSentence(invitation)}</Text>
      <Text accessibilityLiveRegion="polite" className="text-base text-muted-foreground">
        {call === 'verify' ? `Emailing a link to ${address}…` : `Joining ${name} as ${address}…`}
      </Text>
    </Screen>
  )
}

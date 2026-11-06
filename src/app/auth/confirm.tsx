import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Text } from 'react-native'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { Screen } from '@/components/ui/screen'
import { useSignOut } from '@/hooks/use-sign-out'
import { useStepUpWaiting } from '@/hooks/use-step-up'
import { broadcastStepUpLinkFailed, refreshSettled } from '@/http/session'
import { useSessionStatus } from '@/http/session-lifecycle'
import { messageFrom, statusFrom } from '@/lib/api-error'
import { useClientSettings } from '@/queries/client-settings.queries'
import { useConfirmStepUpLink } from '@/queries/step-up.queries'

/** A verify's settled answer, and whether a "Confirm it’s you" dialog was waiting for it. */
type Outcome = { confirmed: true; waited: boolean } | { confirmed: false; error: unknown }

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
 * A link lifetime in minutes, rounded to the nearest and at least 1, as the
 * step-up mail writes it: "15 minutes", "1 minute".
 * @param seconds - The lifetime in seconds.
 */
function inMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes === 1 ? '1 minute' : `${String(minutes)} minutes`
}

/**
 * What a waiting dialog shows when the verify fails: the screen's title and
 * reason for that failure, without its own next step, since the dialog offers
 * Resend.
 * @param error - The verify's failure.
 * @param stepUpTtl - The link's lifetime in seconds, when known.
 * @returns The inline notice.
 */
function dialogNotice(error: unknown, stepUpTtl: number | undefined): string {
  const failed = statusFrom(error)
  if (failed === 400) {
    const within = stepUpTtl === undefined ? '' : `, within ${inMinutes(stepUpTtl)}`
    return `This link didn’t confirm it’s you. Open the link on the phone where you asked for it${within}.`
  }
  if (failed === 401) return 'Your session ended. Sign in again, then repeat the action.'
  return `Confirmation didn’t go through. ${messageFrom(error)}`
}

/**
 * Leaves the screen once the dialog it opened beneath has its answer: back,
 * or Home when there is nowhere to go back to.
 */
function leave(): void {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

/**
 * Where the emailed "Confirm it’s you" link opens: `/auth/confirm?token=…`.
 *
 * The screen reads `token` once and clears it from the route; the mail's
 * `utm_*` parameters are ignored. No token is the incomplete-link state and is
 * never posted. Otherwise it waits for the session restore and decides once:
 * signed out, nothing is posted, since the link is bound to the session that
 * asked for it. Signed in, it waits for any refresh in flight
 * (`refreshSettled`), so an older token cannot land after the confirmed one,
 * then posts the token once. A ref guard keeps StrictMode and a double press
 * from posting twice.
 *
 * It often opens beneath the full-screen dialog, which shows "Confirmed.
 * Continuing…" itself. When a dialog was waiting, the screen goes back, or
 * replaces itself with Home when there is nowhere to go back to. A failure
 * with a dialog still open goes to the dialog (`broadcastStepUpLinkFailed`),
 * which shows it inline, and the screen leaves the same way. Without a
 * dialog the screen shows the failure itself. A 400 is a
 * dead link and a 401 the session's end; neither offers Try again. Any other
 * failure leaves the link usable, so Try again posts it again on purpose.
 */
export default function Confirm() {
  const params = useLocalSearchParams<{ token?: string }>()
  const [token] = useState(() => paramText(params.token))
  const status = useSessionStatus()
  const stepUpTtl = useClientSettings()?.stepUpLinkTtlSeconds
  const waiting = useStepUpWaiting()
  const confirm = useConfirmStepUpLink()
  const { signOut, isPending: isSigningOut } = useSignOut()
  const [isSignedOut, setIsSignedOut] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const decided = useRef(false)
  /** Set from a post's start until it settles, so a second press in the same frame posts nothing. */
  const inFlight = useRef(false)
  /** Whether a dialog is waiting, as last rendered. */
  const dialogWaiting = useRef(waiting)

  useEffect(() => {
    dialogWaiting.current = waiting
  }, [waiting])

  useEffect(() => {
    router.setParams({ token: undefined })
  }, [])

  /**
   * Posts the token, once at a time, after any refresh in flight. A dialog
   * counts as waiting if it was open when the post started or still is at the
   * success: the confirmation itself closes it, so a read at the success
   * alone can come too late.
   */
  const post = () => {
    if (inFlight.current || !token) return
    inFlight.current = true
    setIsPosting(true)
    const waitedAtStart = dialogWaiting.current
    void refreshSettled().then(() => {
      confirm.mutate(token, {
        onSuccess: () => {
          const waited = waitedAtStart || dialogWaiting.current
          setOutcome({ confirmed: true, waited })
          if (waited) leave()
        },
        onError: (error) => {
          // A failure leaves the dialog open, so only one still open hears it.
          if (dialogWaiting.current) {
            broadcastStepUpLinkFailed(dialogNotice(error, stepUpTtl))
            leave()
            return
          }
          setOutcome({ confirmed: false, error })
        },
        onSettled: () => {
          inFlight.current = false
          setIsPosting(false)
        },
      })
    })
  }

  const decide = useEffectEvent(() => {
    if (status === 'signed-out') {
      setIsSignedOut(true)
      return
    }
    post()
  })

  useEffect(() => {
    if (!token || status === 'restoring' || decided.current) return
    decided.current = true
    decide()
  }, [token, status])

  if (!token) {
    return (
      <Screen title="This link is incomplete">
        <Text className="text-base text-foreground">
          Open the latest confirmation email and use its link.
        </Text>
      </Screen>
    )
  }

  if (isSignedOut) {
    return (
      <Screen title="Sign in to confirm">
        <Text className="text-base text-foreground">
          This link works only on the device and session that asked for it. If you signed out, sign
          in and repeat the action.
        </Text>
        <Button
          variant="primary"
          label="Sign in"
          onPress={() => {
            router.replace('/login')
          }}
        />
      </Screen>
    )
  }

  if (outcome?.confirmed) {
    if (outcome.waited) {
      return (
        <Screen title="Confirmed">
          <Text accessibilityLiveRegion="polite" className="text-base text-foreground">
            Continuing…
          </Text>
        </Screen>
      )
    }
    return (
      <Screen title="Confirmed">
        <Text className="text-base text-foreground">Go back and try the action again.</Text>
        <Button
          variant="primary"
          label="Go to Home"
          onPress={() => {
            router.replace('/')
          }}
        />
      </Screen>
    )
  }

  if (outcome) {
    const failed = statusFrom(outcome.error)
    if (failed === 400) {
      const within = stepUpTtl === undefined ? '' : `, within ${inMinutes(stepUpTtl)}`
      return (
        <Screen title="This link didn’t confirm it’s you">
          <Text className="text-base text-foreground">
            {`Open the link on the phone where you asked for it${within}. For a new link, try the action again.`}
          </Text>
        </Screen>
      )
    }
    if (failed === 401) {
      return (
        <Screen title="Your session ended">
          <Text className="text-base text-foreground">Sign in again, then repeat the action.</Text>
          {/* Signs the device out first: a store still signed in would bounce off /login to Home. */}
          <Button
            variant="primary"
            label="Sign in"
            loading={isSigningOut}
            onPress={() => {
              void signOut()
            }}
          />
        </Screen>
      )
    }
    return (
      <Screen title="Confirmation didn’t go through">
        <InlineError message={messageFrom(outcome.error)} />
        <Button variant="primary" label="Try again" loading={isPosting} onPress={post} />
      </Screen>
    )
  }

  return <Screen title="Confirming it’s you">{null}</Screen>
}

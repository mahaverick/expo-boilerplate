import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Modal, Text, View } from 'react-native'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { Screen } from '@/components/ui/screen'
import { useSecondsLeft } from '@/hooks/use-seconds-left'
import { isAuthVerdict } from '@/http/auth-verdict'
import { useMaintenanceMode } from '@/http/maintenance'
import { ensureSession, subscribeAuthMessage } from '@/http/session'
import { codeFrom, messageFrom, retryAfterSecondsFrom, statusFrom } from '@/lib/api-error'
import { formatClock } from '@/lib/countdown'
import { useUpdateRequired } from '@/lib/minimum-version'
import { authTimeOf, isNewConfirmation } from '@/lib/step-up'
import { toast } from '@/lib/toast'
import { useRequestStepUpLink } from '@/queries/step-up.queries'
import { useAuthStore } from '@/states/auth.store'
import { STEP_UP_LINK_COOLDOWN } from '@/types/passkey.types'

/**
 * Where the dialog is:
 * - `start`: why it asks, and Email me a link;
 * - `email`: waiting on an emailed link;
 * - `resuming`: confirmed, checking the session;
 * - `resume_failed`: that check could not reach the server, with Try again.
 */
type DialogView = 'start' | 'email' | 'resuming' | 'resume_failed'

/** Props of `StepUpDialog`. */
interface StepUpDialogProps {
  /** Called once the session holds a newer confirmation. */
  onConfirmed: () => void
  /** Called on Cancel, on back from the start, or when the session ended. */
  onDismissed: () => void
}

/**
 * A link expiry as a time of day in the reader's locale, such as "3:45 PM".
 * @param expiresAt - Epoch milliseconds.
 */
function expiryTime(expiresAt: number): string {
  return new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * "Confirm it’s you", by an emailed link. The provider mounts it while a
 * step-up waits, so each one starts at the start view, with the `auth_time`
 * of the token held then as the confirmation to beat. It hides, keeping its
 * place, while the update or maintenance screen covers the app, because a
 * React Native `Modal` draws over everything. Android's back button cancels
 * from the start and from a failed resume; while it waits on a link, or
 * resumes, only Cancel leaves.
 * @param props - The handlers the provider settles the waiters with.
 * @param props.onConfirmed - Retries the waiting actions.
 * @param props.onDismissed - Rejects the waiting actions.
 * @returns The modal.
 */
export function StepUpDialog({ onConfirmed, onDismissed }: StepUpDialogProps) {
  const requestLink = useRequestStepUpLink()
  const email = useAuthStore((state) => state.user?.email)
  const isUpdateRequired = useUpdateRequired()
  const maintenance = useMaintenanceMode()
  const [view, setView] = useState<DialogView>('start')
  const [notice, setNotice] = useState<string | null>(null)
  const [resendAt, setResendAt] = useState<number | null>(null)
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null)
  // The auth_time the session had when the dialog opened, from the API's clock.
  const [baseline] = useState(() => authTimeOf(useAuthStore.getState().accessToken))
  const resendLeft = useSecondsLeft(view === 'email' ? resendAt : null)
  const linkLeft = useSecondsLeft(view === 'email' ? linkExpiresAt : null)
  const mounted = useRef(true)
  const resuming = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * Pushes the resend out to `seconds` from now, never earlier than it already was.
   * @param seconds - The API's `Retry-After`.
   */
  const holdResend = (seconds: number) => {
    setResendAt((current) => Math.max(current ?? 0, Date.now() + seconds * 1_000))
  }

  /**
   * Mails a link. From the start, a cooldown means one was just sent, so it
   * waits on that one. From the email view a link is already out, so a
   * refusal is a toast and the wait stays.
   * @param from - The view the request was made in.
   */
  const sendLink = (from: DialogView) => {
    setNotice(null)
    requestLink.mutateAsync().then(
      ({ resendAvailableAt, expiresAt }) => {
        if (!mounted.current) return
        setResendAt(Date.parse(resendAvailableAt))
        // An API older than the field names no expiry.
        const expires = expiresAt === undefined ? Number.NaN : Date.parse(expiresAt)
        setLinkExpiresAt(Number.isFinite(expires) ? expires : null)
        setView('email')
      },
      (error: unknown) => {
        if (!mounted.current) return
        const wait = retryAfterSecondsFrom(error)
        if (from === 'email') {
          if (statusFrom(error) === 429 && wait !== null) holdResend(wait)
          toast.error(messageFrom(error))
          return
        }
        if (codeFrom(error) === STEP_UP_LINK_COOLDOWN && wait !== null) {
          holdResend(wait)
          setView('email')
          return
        }
        setNotice(messageFrom(error))
      }
    )
  }

  /**
   * Confirmed on this phone: retries when the stored token's `auth_time` is
   * newer than the baseline. Otherwise it refreshes once and checks the new
   * token; still not newer, a stray signal, and the wait goes on. A refresh
   * verdict has signed the person out, so the dialog closes and the guard
   * leaves for the sign-in screen.
   */
  const resume = async () => {
    if (resuming.current) return
    resuming.current = true
    setView('resuming')
    try {
      if (!isNewConfirmation(baseline, authTimeOf(useAuthStore.getState().accessToken))) {
        const token = await ensureSession()
        if (!mounted.current) return
        if (!isNewConfirmation(baseline, authTimeOf(token))) {
          setView('email')
          return
        }
      }
      onConfirmed()
    } catch (error) {
      if (!mounted.current) return
      if (isAuthVerdict(error)) {
        onDismissed()
        return
      }
      setView('resume_failed')
    } finally {
      resuming.current = false
    }
  }

  const onConfirmedHere = useEffectEvent(() => {
    void resume()
  })
  useEffect(() => {
    if (view !== 'email') return
    return subscribeAuthMessage('step_up_confirmed', onConfirmedHere)
  }, [view])

  const cancel = <Button variant="ghost" label="Cancel" onPress={onDismissed} />

  let body
  if (view === 'resuming') {
    body = (
      <Text accessibilityLiveRegion="polite" className="text-base text-foreground">
        Confirmed. Continuing…
      </Text>
    )
  } else if (view === 'resume_failed') {
    body = (
      <>
        <Text className="text-base text-foreground">
          You confirmed, but we couldn’t reach the server. Check your connection, then select Try
          again.
        </Text>
        <Button
          variant="primary"
          label="Try again"
          onPress={() => {
            void resume()
          }}
        />
        {cancel}
      </>
    )
  } else if (view === 'email') {
    const isExpired = linkExpiresAt !== null && linkLeft === 0
    const sentTo = `We sent the link to ${email ?? 'your email address'}.`
    const sentLine =
      linkExpiresAt === null ? sentTo : `${sentTo} It expires at ${expiryTime(linkExpiresAt)}.`
    body = (
      <>
        <Text className="text-base text-foreground">
          Check your email. Open the link on this phone to continue.
        </Text>
        <Text accessibilityLiveRegion="polite" className="text-base text-foreground">
          {isExpired ? 'That link expired. Send a new link to continue.' : sentLine}
        </Text>
        <Button
          variant={isExpired ? 'primary' : 'secondary'}
          label={resendLeft > 0 ? `Resend in ${formatClock(resendLeft)}` : 'Resend link'}
          disabled={resendLeft > 0}
          loading={requestLink.isPending}
          onPress={() => {
            sendLink('email')
          }}
        />
        {cancel}
      </>
    )
  } else {
    body = (
      <>
        <Text className="text-base text-foreground">
          This action needs a confirmation from the last 10 minutes. We’ll email you a link to open
          on this phone.
        </Text>
        {notice !== null && <InlineError message={notice} />}
        <Button
          variant="primary"
          label="Email me a link"
          loading={requestLink.isPending}
          onPress={() => {
            sendLink('start')
          }}
        />
        {cancel}
      </>
    )
  }

  return (
    <Modal
      visible={!isUpdateRequired && maintenance !== 'full'}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (view === 'start' || view === 'resume_failed') onDismissed()
      }}
    >
      <View className="flex-1 bg-background">
        <Screen title="Confirm it’s you" coversBanners>
          {body}
        </Screen>
      </View>
    </Modal>
  )
}

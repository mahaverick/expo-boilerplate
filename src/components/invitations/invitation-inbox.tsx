import { Text } from 'react-native'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { useSecondsLeft } from '@/hooks/use-seconds-left'
import { formatClock } from '@/lib/countdown'
import { linkRules } from '@/lib/link-lifetime'
import { useClientSettings } from '@/queries/client-settings.queries'

/** Props of `InvitationInbox`. */
interface InvitationInboxProps {
  /** The address the server mailed, from its answer. */
  email: string
  /** The workspace the link joins. */
  workspace: string
  /** The epoch-ms time Resend opens again. */
  resendAt: number
  resending: boolean
  onResend: () => void
  onHome: () => void
}

/**
 * "Check your inbox" after a verify answered `202`: the server mailed a
 * confirmation link to `email`. Resend waits out a local countdown that the
 * caller restarts at each `202` and extends after a rate limit.
 * @param props - The address, the workspace, the clock and the handlers.
 * @param props.email - The address the link went to.
 * @param props.workspace - The workspace's name.
 * @param props.resendAt - When Resend opens, in epoch milliseconds.
 * @param props.resending - True while a resend is in flight.
 * @param props.onResend - Called on a press once the wait has passed.
 * @param props.onHome - Called by "Go to Home".
 * @returns The screen.
 */
export function InvitationInbox({
  email,
  workspace,
  resendAt,
  resending,
  onResend,
  onHome,
}: InvitationInboxProps) {
  const left = useSecondsLeft(resendAt)
  const settings = useClientSettings()
  return (
    <Screen title="Check your inbox">
      <Text
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        className="text-base text-foreground"
      >
        {`We sent a link to ${email}.`}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {`Open it to join ${workspace}. ${linkRules(settings?.signInLinkTtlSeconds)}`}
      </Text>
      <Button
        variant="secondary"
        label={left > 0 ? `Resend in ${formatClock(left)}` : 'Resend link'}
        loading={resending}
        disabled={left > 0}
        onPress={onResend}
      />
      <Button variant="ghost" label="Go to Home" onPress={onHome} />
    </Screen>
  )
}

import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { canActorGrantRole, ROLE_LABELS, type MembershipRole } from '@/constants/roles'
import { useListPages } from '@/hooks/use-list-pages'
import { useSecondsLeft } from '@/hooks/use-seconds-left'
import { STEP_UP_WAITING_LABEL, useStepUp, useStepUpWaiting } from '@/hooks/use-step-up'
import { codeFrom, retryAfterSecondsFrom } from '@/lib/api-error'
import { cn } from '@/lib/cn'
import { formatTimeLeft } from '@/lib/countdown'
import { formatDateTime } from '@/lib/format'
import { isMembersLimitRefusal, NOT_SENT_AT_LIMIT } from '@/lib/members-limit'
import { toast } from '@/lib/toast'
import { writeFailureMessage } from '@/lib/write-failure'
import { inviterName } from '@/queries/invitation.queries'
import {
  invitationsListOptions,
  useResendInvitation,
  useRevokeInvitation,
} from '@/queries/tenant.queries'
import { INVITATION_NOT_FOUND, type TenantInvitation } from '@/types/api.types'

/** What a failed first page says: a claim about the request, not "none pending". */
const INVITATIONS_ERROR = 'We couldn’t load the pending invitations. Select Try again to load them.'

/** What a failed later page says. */
const MORE_ERROR = 'We couldn’t load more invitations. Select Try again to load them.'

/** Why Resend and Revoke are off for a role the viewer cannot grant. */
const GRANT_REASON = 'Only an owner can resend or revoke an invitation for this role.'

/** What a resend or revoke says when the invitation was accepted, revoked or expired meanwhile. */
const NO_LONGER_PENDING = 'That invitation is no longer pending.'

/** The code express answers a resend with while the cooldown from the last send runs. */
const RESEND_COOLDOWN = 'invitation_resend_cooldown'

/** The list request: the default sort, so nothing is sent. */
const REQUEST = {}

/**
 * What a failed resend or revoke says.
 * @param error - The failed request's error.
 * @returns The message.
 */
function actionFailure(error: unknown): string {
  return codeFrom(error) === INVITATION_NOT_FOUND ? NO_LONGER_PENDING : writeFailureMessage(error)
}

/**
 * When Resend opens again, in epoch milliseconds: the later of the row's
 * `resendAvailableAt` and a locally held deadline. A missing or unreadable
 * time counts as none.
 * @param resendAvailableAt - The row's ISO time, or null.
 * @param localUntil - The deadline a 429 set, or null.
 * @returns The deadline, or null for none.
 */
function resendDeadline(
  resendAvailableAt: string | null,
  localUntil: number | null
): number | null {
  const server = resendAvailableAt === null ? Number.NaN : Date.parse(resendAvailableAt)
  const times = [server, localUntil ?? Number.NaN].filter(Number.isFinite)
  return times.length === 0 ? null : Math.max(...times)
}

/** Props of `RowButton`. */
interface RowButtonProps {
  label: string
  text: string
  onPress: () => void
  disabled?: boolean
  destructive?: boolean
}

/**
 * A compact outlined button for an invitation's row. The accessible label
 * names the invitee, since a list holds one of these per row.
 * @param props - The label, text and handler.
 * @param props.label - The accessibility label, with the address.
 * @param props.text - The visible text.
 * @param props.onPress - Called on a press.
 * @param props.disabled - Ignores presses when true.
 * @param props.destructive - Draws the text in the destructive colour.
 * @returns The button.
 */
function RowButton({
  label,
  text,
  onPress,
  disabled = false,
  destructive = false,
}: RowButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      className={cn(
        TOUCH_TARGET,
        'items-center justify-center rounded-md border border-input px-3',
        disabled && 'opacity-60'
      )}
    >
      <Text className={cn('text-base', destructive ? 'text-destructive' : 'text-foreground')}>
        {text}
      </Text>
    </Pressable>
  )
}

/** Props of `InvitationRow`. */
interface InvitationRowProps {
  slug: string
  invitation: TenantInvitation
  myRole: MembershipRole
  /** True for staff through platform access: no Resend and no Revoke. */
  readOnly: boolean
}

/**
 * One pending invitation. Resend and Revoke run through step-up, each behind
 * an in-flight guard. While express's resend cooldown runs, Resend reads
 * "Resend in {time}" and ignores presses; the deadline is the later of the
 * row's `resendAvailableAt` and the `Retry-After` of a 429 this row got. When
 * the viewer cannot grant the invitation's role, both are off and the reason
 * shows once. Both writes use `mutateAsync`, because the list refetch can
 * unmount the row first.
 * @param props - The invitation and the viewer.
 * @param props.slug - The workspace's web address.
 * @param props.invitation - The invitation.
 * @param props.myRole - The viewer's role.
 * @param props.readOnly - True to show no actions.
 * @returns The row.
 */
function InvitationRow({ slug, invitation, myRole, readOnly }: InvitationRowProps) {
  const resend = useResendInvitation(slug)
  const revoke = useRevokeInvitation(slug)
  const stepUp = useStepUp()
  const waiting = useStepUpWaiting()
  const [busy, setBusy] = useState<'resend' | 'revoke' | null>(null)
  const [localUntil, setLocalUntil] = useState<number | null>(null)
  const inFlight = useRef(false)
  const allowed = canActorGrantRole(myRole, invitation.role)
  const left = useSecondsLeft(
    readOnly || !allowed ? null : resendDeadline(invitation.resendAvailableAt, localUntil)
  )
  const email = invitation.email
  const expires = formatDateTime(invitation.expiresAt) ?? 'an unknown date'

  /** Resends through step-up. A 429 cooldown holds the button until Retry-After. */
  const doResend = () => {
    if (inFlight.current || left > 0) return
    inFlight.current = true
    setBusy('resend')
    stepUp
      .run(() => resend.mutateAsync(invitation.id))
      .then(
        () => {
          toast.success(`Invitation resent to ${email}.`)
        },
        (error: unknown) => {
          if (codeFrom(error) === RESEND_COOLDOWN) {
            const wait = retryAfterSecondsFrom(error)
            if (wait !== null) setLocalUntil(Date.now() + wait * 1_000)
          }
          toast.error(isMembersLimitRefusal(error) ? NOT_SENT_AT_LIMIT : actionFailure(error))
        }
      )
      .finally(() => {
        inFlight.current = false
        setBusy(null)
      })
  }

  /** Revokes through step-up. */
  const doRevoke = () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy('revoke')
    stepUp
      .run(() => revoke.mutateAsync(invitation.id))
      .then(
        () => {
          toast.success(`Invitation to ${email} revoked.`)
        },
        (error: unknown) => {
          toast.error(actionFailure(error))
        }
      )
      .finally(() => {
        inFlight.current = false
        setBusy(null)
      })
  }

  /** Asks before revoking. */
  const confirmRevoke = () => {
    Alert.alert(
      `Revoke the invitation to ${email}?`,
      'The link in their email stops working immediately. You can invite them again from this page.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: doRevoke },
      ]
    )
  }

  const cooling = left > 0
  let resendText = 'Resend'
  if (busy === 'resend' && waiting) resendText = STEP_UP_WAITING_LABEL
  else if (cooling) resendText = `Resend in ${formatTimeLeft(left)}`
  const resendLabel = cooling
    ? `Resend in ${formatTimeLeft(left)}, invitation to ${email}`
    : `Resend, invitation to ${email}`
  return (
    <View testID={`invitation-${invitation.id}`} className="gap-2 border-b border-border py-3">
      <Text className="text-base font-medium text-foreground">{email}</Text>
      <Text className="text-sm text-foreground">{ROLE_LABELS[invitation.role]}</Text>
      <Text className="text-sm text-muted-foreground">
        Invited by {inviterName(invitation.invitedBy)}
      </Text>
      <Text className="text-sm text-muted-foreground">Expires {expires}</Text>
      {readOnly ? null : (
        <View className="flex-row flex-wrap gap-2">
          <RowButton
            label={resendLabel}
            text={resendText}
            disabled={!allowed || cooling || busy !== null}
            onPress={doResend}
          />
          <RowButton
            label={`Revoke invitation to ${email}`}
            text={busy === 'revoke' && waiting ? STEP_UP_WAITING_LABEL : 'Revoke'}
            destructive
            disabled={!allowed || busy !== null}
            onPress={confirmRevoke}
          />
        </View>
      )}
      {!readOnly && !allowed ? (
        <Text className="text-sm text-muted-foreground">{GRANT_REASON}</Text>
      ) : null}
    </View>
  )
}

/** Props of `PendingInvitations`. */
interface PendingInvitationsProps {
  slug: string
  myRole: MembershipRole
  /** True for staff through platform access: the list with no Resend or Revoke. */
  readOnly?: boolean
}

/**
 * Invitations sent and not yet accepted. Mount it for owners and admins only:
 * the list endpoint is owner and admin only, and mounting issues the request.
 * It shows a spinner while the first page loads, `LoadError` when that page
 * failed, the empty state only for a list that answered with no rows, and
 * "Load more" while another page follows.
 * @param props - The workspace and the viewer.
 * @param props.slug - The workspace's web address.
 * @param props.myRole - The viewer's role.
 * @param props.readOnly - True to list with no Resend or Revoke.
 * @returns The card.
 */
export function PendingInvitations({ slug, myRole, readOnly = false }: PendingInvitationsProps) {
  const invitations = useListPages((request) => invitationsListOptions(slug, request), REQUEST)
  let body
  if (invitations.isError) {
    body = <LoadError message={INVITATIONS_ERROR} onRetry={invitations.retry} />
  } else if (invitations.isPending) {
    body = <ActivityIndicator accessibilityLabel="Loading invitations" />
  } else if (invitations.items.length === 0) {
    body = (
      <Text className="text-base font-medium text-foreground">
        No invitations are waiting to be accepted.
      </Text>
    )
  } else {
    body = (
      <View>
        {invitations.items.map((invitation) => (
          <InvitationRow
            key={invitation.id}
            slug={slug}
            invitation={invitation}
            myRole={myRole}
            readOnly={readOnly}
          />
        ))}
        {invitations.loadMoreFailed ? (
          <LoadError message={MORE_ERROR} onRetry={invitations.retry} />
        ) : null}
        {invitations.hasNext && !invitations.loadMoreFailed ? (
          <Button
            variant="secondary"
            label="Load more"
            loading={invitations.isLoadingMore}
            onPress={invitations.loadMore}
          />
        ) : null}
      </View>
    )
  }
  return (
    <View className="gap-3 rounded-lg border border-border p-4">
      <Text className="text-lg font-semibold text-foreground">Pending invitations</Text>
      <Text className="text-base text-muted-foreground">Sent, and not yet accepted.</Text>
      {body}
    </View>
  )
}

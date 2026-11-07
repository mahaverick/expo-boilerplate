import { useForm } from '@tanstack/react-form'
import { useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import { ChoiceSheet } from '@/components/ui/choice-sheet'
import { InlineError } from '@/components/ui/inline-error'
import { TextField } from '@/components/ui/text-field'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { MembersLimitNote } from '@/components/workspace-settings/members-limit-note'
import {
  canActorGrantRole,
  DEFAULT_MEMBER_ROLE,
  MEMBERSHIP_ROLES,
  ROLE_LABELS,
  type MembershipRole,
} from '@/constants/roles'
import { STEP_UP_WAITING_LABEL, useStepUp, useStepUpWaiting } from '@/hooks/use-step-up'
import { codeFrom, messageFrom } from '@/lib/api-error'
import { inDays } from '@/lib/link-lifetime'
import { isMembersLimitRefusal, NOT_SENT_AT_LIMIT } from '@/lib/members-limit'
import { isReauthRequired, stepUpRefusal } from '@/lib/step-up'
import { toast } from '@/lib/toast'
import { useClientSettings } from '@/queries/client-settings.queries'
import { useInviteMember } from '@/queries/tenant.queries'
import { inviteMemberSchema } from '@/schemas/tenant.schemas'
import { ALREADY_MEMBER, INVITATION_CONFLICT } from '@/types/api.types'

/** A 409 `invitation_conflict`: another invite for this address just won the race. */
const RACED =
  'Another member invited this address first. Their invitation is under Pending invitations.'

/** What the card says after its title. */
const AFTER_JOIN = 'After they select Join, we email them a link to confirm.'

/** Props of `InviteForm`. */
interface InviteFormProps {
  slug: string
  myRole: MembershipRole
}

/**
 * Pulls the first message out of the errors TanStack Form holds for a field.
 * @param errors - The field's errors: schema issues, strings or nothing.
 * @returns The message to show, if any.
 */
function firstMessage(errors: unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === 'string') return error
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String(error.message)
    }
  }
  return undefined
}

/**
 * Invite someone by email. Mount it for owners and admins only. The roles
 * offered come from `canActorGrantRole`, so an admin cannot invite an admin or
 * an owner. The send runs through step-up. `already_member` goes on the email
 * field and clears when the address changes. A conflict, the members limit
 * and any other refusal show above the button, and so does a refused step-up.
 * @param props - The workspace and the viewer's role.
 * @param props.slug - The workspace's web address.
 * @param props.myRole - The viewer's role.
 * @returns The card.
 */
export function InviteForm({ slug, myRole }: InviteFormProps) {
  const inviteMember = useInviteMember(slug)
  const stepUp = useStepUp()
  const waiting = useStepUpWaiting()
  const ttl = useClientSettings()?.invitationTtlSeconds
  const [emailError, setEmailError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const inFlight = useRef(false)
  const grantable = MEMBERSHIP_ROLES.filter((role) => canActorGrantRole(myRole, role))

  /** The schema's input type, so `role` stays a MembershipRole. */
  const defaultValues: z.input<typeof inviteMemberSchema> = {
    email: '',
    role: DEFAULT_MEMBER_ROLE,
  }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: inviteMemberSchema },
    onSubmit: async ({ value }) => {
      if (inFlight.current) return
      inFlight.current = true
      setSending(true)
      setEmailError(null)
      setFormError(null)
      try {
        const input = inviteMemberSchema.parse(value)
        await stepUp.run(() => inviteMember.mutateAsync(input))
        toast.success(`Invitation sent to ${input.email}.`)
        form.reset()
      } catch (error) {
        const code = codeFrom(error)
        if (code === ALREADY_MEMBER) setEmailError(messageFrom(error))
        else if (code === INVITATION_CONFLICT) setFormError(RACED)
        else if (isMembersLimitRefusal(error)) setFormError(NOT_SENT_AT_LIMIT)
        else if (isReauthRequired(error)) setFormError(stepUpRefusal(error))
        else setFormError(messageFrom(error))
      } finally {
        inFlight.current = false
        setSending(false)
      }
    },
  })

  return (
    <View className="gap-3 rounded-lg border border-border p-4">
      <Text className="text-lg font-semibold text-foreground">Invite a member</Text>
      <Text className="text-base text-muted-foreground">
        {ttl === undefined
          ? 'We email them an invitation.'
          : `We email them an invitation that expires in ${inDays(ttl)}.`}{' '}
        {AFTER_JOIN}
      </Text>
      <MembersLimitNote slug={slug} />
      <form.Field name="email">
        {(field) => (
          <TextField
            label="Email"
            value={field.state.value}
            onChangeText={(text) => {
              setEmailError(null)
              field.handleChange(text)
            }}
            onBlur={field.handleBlur}
            error={firstMessage(field.state.meta.errors) ?? emailError ?? undefined}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
        )}
      </form.Field>
      <form.Field name="role">
        {(field) => {
          const role = field.state.value
          return (
            <View className="gap-1">
              <Text className="text-sm font-medium text-foreground">Role</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Role: ${ROLE_LABELS[role]}`}
                onPress={() => {
                  setSheetOpen(true)
                }}
                className={`${TOUCH_TARGET} justify-center rounded-md border border-input px-3`}
              >
                <Text className="text-base text-foreground">{ROLE_LABELS[role]}</Text>
              </Pressable>
              <ChoiceSheet
                visible={sheetOpen}
                title="Role"
                value={role}
                options={grantable.map((option) => ({
                  value: option,
                  label: ROLE_LABELS[option],
                }))}
                onChoose={(next) => {
                  field.handleChange(next)
                }}
                onClose={() => {
                  setSheetOpen(false)
                }}
              />
            </View>
          )
        }}
      </form.Field>
      {formError ? <InlineError message={formError} /> : null}
      <Button
        variant="primary"
        label={sending && waiting ? STEP_UP_WAITING_LABEL : 'Invite member'}
        loading={sending}
        onPress={() => void form.handleSubmit()}
      />
    </View>
  )
}

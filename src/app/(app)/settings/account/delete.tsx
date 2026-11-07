import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Text, View } from 'react-native'
import { WhatWeDelete } from '@/components/account/what-we-delete'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { Screen } from '@/components/ui/screen'
import { TextField } from '@/components/ui/text-field'
import { STEP_UP_WAITING_LABEL, useStepUp, useStepUpWaiting } from '@/hooks/use-step-up'
import { formatDate, formatDateTime } from '@/lib/format'
import { toast } from '@/lib/toast'
import { writeFailureMessage } from '@/lib/write-failure'
import {
  deletionRequestQueryOptions,
  useRequestAccountDeletion,
  type DeletionRequestAnswer,
} from '@/queries/account-deletion.queries'
import { useClientSettings } from '@/queries/client-settings.queries'
import { useAuthStore } from '@/states/auth.store'
import type { DeletionRequest } from '@/types/api.types'

/** The most characters express accepts in the reason. */
const REASON_MAX_LENGTH = 500

/** What a failed load says. */
const LOAD_ERROR = 'We couldn’t load your deletion request. Select Try again to load it.'

/**
 * Where to withdraw a request. Express has no cancel route, so the words point
 * at the support address, or at the receipt email when there is none.
 * @param supportEmail - The support address, if known.
 * @returns The clause.
 */
function writeToSupport(supportEmail: string | undefined): string {
  return supportEmail === undefined
    ? 'write to the support address in your receipt email'
    : `write to ${supportEmail}`
}

/**
 * The toast after a request: express's own message, else one for 201 or 200.
 * @param answer - The POST's answer.
 * @returns The sentence.
 */
function receiptToast(answer: DeletionRequestAnswer): string {
  return (
    answer.message ||
    (answer.created
      ? 'We’ve got your request. Check your email for a receipt.'
      : 'You already asked us to delete your account. We sent the receipt then.')
  )
}

/**
 * The open request: when it was made and when we will have deleted the account by.
 * @param props - The request.
 * @param props.request - The open request.
 * @returns The sentence.
 */
function OpenRequest({ request }: { request: DeletionRequest }) {
  const supportEmail = useClientSettings()?.supportEmail
  const asked = formatDate(request.requestedAt, 'long') ?? request.requestedAt
  const due = formatDateTime(request.dueAt) ?? request.dueAt
  return (
    <Text className="text-base text-foreground">
      {`You asked us to delete your account on ${asked}. We’ll delete it by ${due}. To withdraw the request, ${writeToSupport(supportEmail)} before then.`}
    </Text>
  )
}

/**
 * The reason field and the request button. The button asks in an `Alert`, and
 * "Send request" runs the write through `useStepUp().run`. One ref covers the
 * whole path, from the first press to the write settling. A refused step-up or
 * any other failure shows above the button and keeps the reason.
 * @returns The form.
 */
function RequestForm() {
  const mutation = useRequestAccountDeletion()
  const { run } = useStepUp()
  const waiting = useStepUpWaiting()
  const supportEmail = useClientSettings()?.supportEmail
  const email = useAuthStore((state) => state.user?.email)
  const [reason, setReason] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const inFlight = useRef(false)
  const sending = useRef(false)

  /** Ends the path, so the button works again. */
  const release = () => {
    inFlight.current = false
    sending.current = false
    setAsking(false)
  }

  /** Posts the request, with the reason only when it has text. */
  const send = () => {
    if (sending.current) return
    sending.current = true
    const trimmed = reason.trim()
    run(() => mutation.mutateAsync(trimmed === '' ? {} : { reason: trimmed }))
      .then(
        (answer) => {
          toast.success(receiptToast(answer))
        },
        (error: unknown) => {
          setFailure(writeFailureMessage(error))
        }
      )
      .finally(release)
  }

  /** Asks before sending. */
  const ask = () => {
    if (inFlight.current) return
    inFlight.current = true
    setAsking(true)
    setFailure(null)
    Alert.alert(
      'Ask us to delete your account?',
      `Our team deletes it by the date in your receipt email, at most 30 days from now. You stay signed in until then. If you’re the only owner of a workspace or pay for a running subscription, we can’t delete it until that’s settled. To withdraw the request, ${writeToSupport(supportEmail)}.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: release },
        { text: 'Send request', style: 'destructive', onPress: send },
      ],
      { cancelable: true, onDismiss: release }
    )
  }

  return (
    <View className="gap-4">
      <Text className="text-base text-foreground">
        Ask us to delete your account. Our team deletes it within 30 days and emails you when it’s
        done. If you’re the only owner of a workspace or pay for a running subscription, we can’t
        delete it until that’s settled.
      </Text>
      <TextField
        label="Why are you leaving?"
        hint={`Optional. Up to ${String(REASON_MAX_LENGTH)} characters.`}
        value={reason}
        onChangeText={(text) => {
          setFailure(null)
          setReason(text)
        }}
        maxLength={REASON_MAX_LENGTH}
        multiline
      />
      {email ? (
        <Text className="text-sm text-muted-foreground">
          {`We send the confirmation to ${email}.`}
        </Text>
      ) : null}
      {failure ? <InlineError message={failure} /> : null}
      <Button
        variant="secondary"
        label={waiting ? STEP_UP_WAITING_LABEL : 'Request deletion'}
        loading={asking || mutation.isPending || waiting}
        onPress={ask}
      />
    </View>
  )
}

/**
 * Settings, Delete account. It shows a spinner while the open request loads
 * and `LoadError` when that fails, never the form. With no request it shows
 * the form; with one open it shows the dates instead. Both show "What we
 * delete".
 * @returns The screen.
 */
export default function DeleteAccount() {
  const request = useQuery(deletionRequestQueryOptions())
  let body
  if (request.data !== undefined) {
    body = request.data === null ? <RequestForm /> : <OpenRequest request={request.data} />
  } else if (request.isError) {
    body = (
      <LoadError
        message={LOAD_ERROR}
        onRetry={() => {
          void request.refetch()
        }}
      />
    )
  } else {
    body = <ActivityIndicator accessibilityLabel="Loading your deletion request" />
  }
  return (
    <Screen title="Delete account" topInset={false}>
      {body}
      <WhatWeDelete />
    </Screen>
  )
}

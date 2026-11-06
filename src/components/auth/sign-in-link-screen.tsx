import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { Text } from 'react-native'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { Screen } from '@/components/ui/screen'
import { TextField } from '@/components/ui/text-field'
import { useRequestSignInLink } from '@/queries/auth.queries'
import { signInLinkRequestSchema } from '@/schemas/auth.schemas'

/** What the screen says when the request did not go through. */
const SEND_FAILED = 'We couldn’t send the link. Check your connection and try again.'

/** Props of `SignInLinkScreen`. */
interface SignInLinkScreenProps {
  title: string
  submitLabel: string
  defaultEmail?: string
  notice?: string
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
 * A screen that asks for an email address and mails a sign-in link to it. The
 * address is checked with `signInLinkRequestSchema` before anything posts.
 * After a send it shows "Check your inbox" in place of the form. A failed send
 * shows an inline error and keeps the address.
 * @param props - The title, the button label, the address to start with and a notice above the form.
 * @param props.title - The header while the form shows.
 * @param props.submitLabel - The send button's label.
 * @param props.defaultEmail - The address the form starts with.
 * @param props.notice - A line of text above the form.
 * @returns The screen.
 */
export function SignInLinkScreen({
  title,
  submitLabel,
  defaultEmail = '',
  notice,
}: SignInLinkScreenProps) {
  const request = useRequestSignInLink()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const form = useForm({
    defaultValues: { email: defaultEmail },
    validators: { onSubmit: signInLinkRequestSchema },
    onSubmit: async ({ value }) => {
      const { email } = signInLinkRequestSchema.parse(value)
      setFailed(false)
      try {
        await request.mutateAsync({ email })
        setSentTo(email)
      } catch {
        setFailed(true)
      }
    },
  })

  if (sentTo !== null) {
    return (
      <Screen title="Check your inbox" scroll>
        <Text className="text-base text-foreground">
          {`We sent a sign-in link to ${sentTo}. Open it on this phone. Each link works once.`}
        </Text>
        <Button
          variant="secondary"
          label="Use a different email"
          onPress={() => {
            form.reset({ email: '' })
            setSentTo(null)
          }}
        />
      </Screen>
    )
  }

  return (
    <Screen title={title} scroll>
      {notice ? <InlineError message={notice} /> : null}
      <form.Field name="email">
        {(field) => (
          <TextField
            label="Email"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            onSubmitEditing={() => void form.handleSubmit()}
            error={firstMessage(field.state.meta.errors)}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
          />
        )}
      </form.Field>
      {failed ? <InlineError message={SEND_FAILED} /> : null}
      <Button
        variant="primary"
        label={submitLabel}
        loading={request.isPending}
        onPress={() => void form.handleSubmit()}
      />
    </Screen>
  )
}

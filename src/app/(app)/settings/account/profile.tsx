import { useForm } from '@tanstack/react-form'
import { useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { Screen } from '@/components/ui/screen'
import { TextField } from '@/components/ui/text-field'
import { useChangedFields } from '@/hooks/use-changed-fields'
import { fieldErrorsFrom, formErrorsFrom, messageFrom, statusFrom } from '@/lib/api-error'
import { formatDate } from '@/lib/format'
import { toast } from '@/lib/toast'
import { useProfile, useUpdateProfile } from '@/queries/profile.queries'
import { updateProfileSchema } from '@/schemas/profile.schemas'
import type { User } from '@/types/api.types'

/** The form's two fields. */
type FieldName = 'firstName' | 'lastName'

/** The form's values. */
interface Names extends Record<string, string> {
  firstName: string
  lastName: string
}

/** Messages by field, from the schema or the server. */
type FieldMessages = Partial<Record<FieldName, string>>

/** What an unchanged save says. */
const UNCHANGED_MESSAGE = 'Change a name before saving.'

/** What a failed load says. */
const PROFILE_ERROR = 'Your profile didn’t load. Select Try again.'

/**
 * The name form and the read-only email and join date. Only a name the person
 * changed from the stored names (as loaded until the first edit, blur or save,
 * or as last saved) is checked and sent, so a stored name that today’s rules
 * refuse does not block changing the other. The changed subset is checked with
 * `updateProfileSchema.partial()`; the parsed value, trimmed, reaches the wire.
 * @param props - The loaded user.
 * @param props.user - The signed-in user.
 * @returns The form and rows.
 */
function ProfileDetails({ user }: { user: User }) {
  const updateProfile = useUpdateProfile()
  const [messages, setMessages] = useState<FieldMessages>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const submitting = useRef(false)
  const stored: Names = { firstName: user.firstName ?? '', lastName: user.lastName ?? '' }
  const { changed, freeze, rebase } = useChangedFields(stored)

  const form = useForm({
    defaultValues: stored,
    onSubmit: async ({ value }) => {
      if (submitting.current) return
      submitting.current = true
      setMessages({})
      setFormError(null)
      setNotice(null)
      try {
        const diff = changed(value)
        if (!diff) {
          setNotice(UNCHANGED_MESSAGE)
          return
        }
        const parsed = updateProfileSchema.partial().safeParse(diff)
        if (!parsed.success) {
          const found: FieldMessages = {}
          for (const issue of parsed.error.issues) {
            const key = issue.path[0]
            if ((key === 'firstName' || key === 'lastName') && found[key] === undefined) {
              found[key] = issue.message
            }
          }
          setMessages(found)
          return
        }
        try {
          await updateProfile.mutateAsync(parsed.data)
        } catch (error) {
          const found: FieldMessages = {}
          const loose: string[] = [...formErrorsFrom(error)]
          if (statusFrom(error) === 400) {
            for (const [key, list] of Object.entries(fieldErrorsFrom(error))) {
              const message = list[0]
              if (message === undefined) continue
              if (key === 'firstName' || key === 'lastName') found[key] = message
              else loose.push(message)
            }
          }
          setMessages(found)
          if (Object.keys(found).length === 0 || loose.length > 0) {
            setFormError(loose[0] ?? messageFrom(error))
          }
          return
        }
        const saved: Names = { ...value, ...parsed.data }
        rebase(saved)
        form.reset(saved)
        toast.success('Profile updated.')
      } finally {
        submitting.current = false
      }
    },
  })

  /**
   * Builds a change handler that freezes the baseline, drops the messages that
   * no longer apply, then passes the text on.
   * @param name - The field.
   * @param handleChange - The field's TanStack handler.
   * @returns The handler for `onChangeText`.
   */
  const editing = (name: FieldName, handleChange: (text: string) => void) => (text: string) => {
    freeze()
    setNotice(null)
    setMessages((current) =>
      current[name] === undefined ? current : { ...current, [name]: undefined }
    )
    handleChange(text)
  }

  return (
    <>
      <form.Field name="firstName">
        {(field) => (
          <TextField
            label="First name"
            value={field.state.value}
            onChangeText={editing('firstName', field.handleChange)}
            onBlur={() => {
              freeze()
              field.handleBlur()
            }}
            error={messages.firstName}
            autoCapitalize="words"
            autoComplete="given-name"
            returnKeyType="next"
          />
        )}
      </form.Field>
      <form.Field name="lastName">
        {(field) => (
          <TextField
            label="Last name"
            value={field.state.value}
            onChangeText={editing('lastName', field.handleChange)}
            onBlur={() => {
              freeze()
              field.handleBlur()
            }}
            error={messages.lastName}
            autoCapitalize="words"
            autoComplete="family-name"
            returnKeyType="done"
          />
        )}
      </form.Field>
      {notice ? <InlineError message={notice} /> : null}
      {formError ? <InlineError message={formError} /> : null}
      <Button
        variant="primary"
        label="Save changes"
        loading={updateProfile.isPending}
        onPress={() => void form.handleSubmit()}
      />
      <View className="gap-3 border-t border-border pt-4">
        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Email</Text>
          <Text className="text-base text-foreground">{user.email}</Text>
        </View>
        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Member since</Text>
          <Text className="text-base text-foreground">
            {formatDate(user.createdAt, 'long') ?? 'Unknown'}
          </Text>
        </View>
      </View>
    </>
  )
}

/**
 * Settings, Profile: the name form. It shows a spinner while the profile loads
 * and `LoadError` when it fails with nothing to show, never an empty form.
 * @returns The screen.
 */
export default function Profile() {
  const profile = useProfile()
  let body
  if (profile.data !== undefined) {
    body = (
      <>
        <Text className="text-base text-muted-foreground">
          Update your name. Your email address can’t be changed here.
        </Text>
        <ProfileDetails key={profile.data.id} user={profile.data} />
      </>
    )
  } else if (profile.isError) {
    body = (
      <LoadError
        message={PROFILE_ERROR}
        onRetry={() => {
          void profile.refetch()
        }}
      />
    )
  } else {
    body = <ActivityIndicator accessibilityLabel="Loading your profile" />
  }
  return (
    <Screen title="Profile" topInset={false}>
      {body}
    </Screen>
  )
}

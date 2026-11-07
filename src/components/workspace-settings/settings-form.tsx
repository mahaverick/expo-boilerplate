import { useForm } from '@tanstack/react-form'
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { TextField } from '@/components/ui/text-field'
import { DetailRow } from '@/components/workspace-settings/detail-row'
import { failureFrom, issuesByField } from '@/components/workspace-settings/form-errors'
import { useChangedFields } from '@/hooks/use-changed-fields'
import { toast } from '@/lib/toast'
import { useUpdateTenantSettings } from '@/queries/tenant-forms.queries'
import type { TenantSettings } from '@/queries/tenant.queries'
import { MAX_TENANT_METADATA_LENGTH, tenantSettingsFormSchema } from '@/schemas/tenant.schemas'

/** The form's fields. */
const FIELDS = ['timezone', 'locale', 'metadata'] as const

/** One of the form's fields. */
type FieldName = (typeof FIELDS)[number]

/** The form's values. */
interface Values extends Record<string, string> {
  timezone: string
  locale: string
  metadata: string
}

/** Messages by field, from the schema or the server. */
type FieldMessages = Partial<Record<FieldName, string>>

/** What an unchanged save says. */
const UNCHANGED_MESSAGE = 'Change a field before saving.'

/** The custom data field's hint. */
const METADATA_HINT = `A JSON (JavaScript Object Notation) object of at most ${MAX_TENANT_METADATA_LENGTH.toLocaleString('en-US')} characters. Leave empty unless your integration reads it.`

/**
 * The custom data as text: pretty JSON, or empty for none.
 * @param metadata - The stored object.
 * @returns The text.
 */
function metadataText(metadata: Record<string, unknown> | null): string {
  return metadata === null ? '' : JSON.stringify(metadata, null, 2)
}

/**
 * The stored settings as the form holds them.
 * @param settings - The stored settings.
 * @returns The form's values.
 */
function valuesOf(settings: TenantSettings): Values {
  return {
    timezone: settings.timezone,
    locale: settings.locale,
    metadata: metadataText(settings.metadata),
  }
}

/**
 * The settings form for owners and admins. Only a field changed from the
 * stored values is checked and sent. The shared schema parses the custom data
 * text to an object, or to `null` for empty text, which clears it.
 * @param props - The workspace and its settings.
 * @param props.slug - The workspace's web address.
 * @param props.settings - The loaded settings.
 * @returns The fields and the save button.
 */
export function SettingsForm({ slug, settings }: { slug: string; settings: TenantSettings }) {
  const updateSettings = useUpdateTenantSettings(slug)
  const [messages, setMessages] = useState<FieldMessages>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const submitting = useRef(false)
  const stored = valuesOf(settings)
  const { changed, freeze, isFrozen, rebase } = useChangedFields(stored)

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
        const parsed = tenantSettingsFormSchema.partial().safeParse(diff)
        if (!parsed.success) {
          setMessages(issuesByField(parsed.error.issues, FIELDS))
          return
        }
        let updated: TenantSettings
        try {
          updated = await updateSettings.mutateAsync(parsed.data)
        } catch (error) {
          const failure = failureFrom(error, FIELDS)
          setMessages(failure.fields)
          setFormError(failure.form)
          return
        }
        const saved = valuesOf(updated)
        rebase(saved)
        form.reset(saved)
        toast.success('Settings updated.')
      } finally {
        submitting.current = false
      }
    },
  })

  /** While the form is pristine, it follows the stored values, so it and the baseline agree. */
  useEffect(() => {
    if (!isFrozen()) {
      form.reset({
        timezone: stored.timezone,
        locale: stored.locale,
        metadata: stored.metadata,
      })
    }
  }, [form, isFrozen, stored.timezone, stored.locale, stored.metadata])

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
    <View className="gap-4">
      <form.Field name="timezone">
        {(field) => (
          <TextField
            label="Time zone"
            value={field.state.value}
            onChangeText={editing('timezone', field.handleChange)}
            onBlur={() => {
              freeze()
              field.handleBlur()
            }}
            error={messages.timezone}
            hint="A time zone name such as Europe/London."
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        )}
      </form.Field>
      <form.Field name="locale">
        {(field) => (
          <TextField
            label="Language and region"
            value={field.state.value}
            onChangeText={editing('locale', field.handleChange)}
            onBlur={() => {
              freeze()
              field.handleBlur()
            }}
            error={messages.locale}
            hint="A language code, such as en, or language and region, such as en-IN. Up to 10 characters."
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        )}
      </form.Field>
      <form.Field name="metadata">
        {(field) => (
          <TextField
            label="Custom data (for developers)"
            value={field.state.value}
            onChangeText={editing('metadata', field.handleChange)}
            onBlur={() => {
              freeze()
              field.handleBlur()
            }}
            error={messages.metadata}
            hint={METADATA_HINT}
            className="font-mono"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
        )}
      </form.Field>
      {notice ? <InlineError message={notice} /> : null}
      {formError ? <InlineError message={formError} /> : null}
      <Button
        variant="primary"
        label="Save settings"
        loading={updateSettings.isPending}
        onPress={() => void form.handleSubmit()}
      />
    </View>
  )
}

/**
 * The settings as read-only rows, for people who may not change them.
 * @param props - The settings.
 * @param props.settings - The loaded settings.
 * @returns The rows.
 */
export function SettingsRows({ settings }: { settings: TenantSettings }) {
  return (
    <View className="gap-3">
      <DetailRow label="Time zone" value={settings.timezone} />
      <DetailRow label="Language and region" value={settings.locale} />
      <DetailRow
        label="Custom data (for developers)"
        value={settings.metadata === null ? null : metadataText(settings.metadata)}
        mono
      />
    </View>
  )
}

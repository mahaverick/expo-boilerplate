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
import { useUpdateTenant } from '@/queries/tenant-forms.queries'
import type { Tenant } from '@/queries/tenant.queries'
import { updateTenantSchema } from '@/schemas/tenant.schemas'

/** The form's fields. */
const FIELDS = ['name', 'description', 'website', 'logo'] as const

/** One of the form's fields. */
type FieldName = (typeof FIELDS)[number]

/** The form's values. */
interface Details extends Record<string, string> {
  name: string
  description: string
  website: string
  logo: string
}

/** Messages by field, from the schema or the server. */
type FieldMessages = Partial<Record<FieldName, string>>

/** What an unchanged save says. */
const UNCHANGED_MESSAGE = 'Change a field before saving.'

/**
 * The stored values as the form holds them: an empty box for no value.
 * @param tenant - The workspace.
 * @returns The form's values.
 */
function detailsOf(tenant: Tenant): Details {
  return {
    name: tenant.name,
    description: tenant.description ?? '',
    website: tenant.website ?? '',
    logo: tenant.logo ?? '',
  }
}

/**
 * The details form for owners and admins. Only a field changed from the stored
 * values (as loaded until the first edit, blur or save, or as the save's
 * answer stored them) is checked and sent. The schema turns an emptied
 * optional field into `null`, which clears it; `''` would be a 400 and an
 * omitted key would keep the old value.
 * @param props - The workspace.
 * @param props.tenant - The loaded workspace.
 * @returns The fields and the save button.
 */
export function DetailsForm({ tenant }: { tenant: Tenant }) {
  const updateTenant = useUpdateTenant(tenant.slug)
  const [messages, setMessages] = useState<FieldMessages>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const submitting = useRef(false)
  const stored = detailsOf(tenant)
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
        const parsed = updateTenantSchema.safeParse(diff)
        if (!parsed.success) {
          setMessages(issuesByField(parsed.error.issues, FIELDS))
          return
        }
        let updated: Tenant
        try {
          updated = await updateTenant.mutateAsync(parsed.data)
        } catch (error) {
          const failure = failureFrom(error, FIELDS)
          setMessages(failure.fields)
          setFormError(failure.form)
          return
        }
        // The answer, not the form: another device may have changed an untouched field.
        const saved = detailsOf(updated)
        rebase(saved)
        form.reset(saved)
        toast.success('Workspace updated.')
      } finally {
        submitting.current = false
      }
    },
  })

  /** While the form is pristine, it follows the stored values, so it and the baseline agree. */
  useEffect(() => {
    if (!isFrozen()) {
      form.reset({
        name: stored.name,
        description: stored.description,
        website: stored.website,
        logo: stored.logo,
      })
    }
  }, [form, isFrozen, stored.name, stored.description, stored.website, stored.logo])

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
      <form.Field name="name">
        {(field) => (
          <TextField
            label="Name"
            value={field.state.value}
            onChangeText={editing('name', field.handleChange)}
            onBlur={() => {
              freeze()
              field.handleBlur()
            }}
            error={messages.name}
            autoCapitalize="words"
            returnKeyType="next"
          />
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <TextField
            label="Description"
            value={field.state.value}
            onChangeText={editing('description', field.handleChange)}
            onBlur={() => {
              freeze()
              field.handleBlur()
            }}
            error={messages.description}
            hint="Leave empty to clear it."
            multiline
          />
        )}
      </form.Field>
      <form.Field name="website">
        {(field) => (
          <TextField
            label="Website"
            value={field.state.value}
            onChangeText={editing('website', field.handleChange)}
            onBlur={() => {
              freeze()
              field.handleBlur()
            }}
            error={messages.website}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
          />
        )}
      </form.Field>
      <form.Field name="logo">
        {(field) => (
          <TextField
            label="Logo URL"
            value={field.state.value}
            onChangeText={editing('logo', field.handleChange)}
            onBlur={() => {
              freeze()
              field.handleBlur()
            }}
            error={messages.logo}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
          />
        )}
      </form.Field>
      {notice ? <InlineError message={notice} /> : null}
      {formError ? <InlineError message={formError} /> : null}
      <Button
        variant="primary"
        label="Save changes"
        loading={updateTenant.isPending}
        onPress={() => void form.handleSubmit()}
      />
    </View>
  )
}

/**
 * The workspace's details as read-only rows, for people who may not edit them.
 * @param props - The workspace and its creation date.
 * @param props.tenant - The loaded workspace.
 * @param props.created - The creation date, formatted.
 * @returns The rows.
 */
export function DetailsRows({ tenant, created }: { tenant: Tenant; created: string }) {
  return (
    <View className="gap-3">
      <DetailRow label="Name" value={tenant.name} />
      <DetailRow label="Web address" value={`/${tenant.slug}`} />
      <DetailRow label="Description" value={tenant.description} />
      <DetailRow label="Website" value={tenant.website} />
      <DetailRow label="Logo" value={tenant.logo} />
      <DetailRow label="Created" value={created} />
    </View>
  )
}

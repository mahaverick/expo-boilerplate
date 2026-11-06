import { useForm } from '@tanstack/react-form'
import { useRef, useState } from 'react'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/ui/inline-error'
import { TextField } from '@/components/ui/text-field'
import { codeFrom, fieldErrorsFrom, formErrorsFrom, messageFrom, statusFrom } from '@/lib/api-error'
import { useCreateTenant } from '@/queries/tenant-forms.queries'
import type { Tenant } from '@/queries/tenant.queries'
import { MAX_SLUG_LENGTH, MIN_SLUG_LENGTH } from '@/schemas/slug.schemas'
import { newTenantSchema, slugSchema } from '@/schemas/tenant.schemas'
import { SLUG_TAKEN } from '@/types/api.types'

/** Props of `CreateWorkspaceForm`. */
interface CreateWorkspaceFormProps {
  /** Runs after the create succeeds. The form stays busy until it resolves. */
  onCreated: (tenant: Tenant) => void | Promise<void>
}

/** The fields a server error can name. */
type FieldName = 'name' | 'slug' | 'description'

/** The server's messages by field. */
type ServerFields = Partial<Record<FieldName, string>>

/** The hint under the web address field. */
const SLUG_HINT = `Your workspace’s address: /tenants/your-name. Use ${String(MIN_SLUG_LENGTH)} to ${String(MAX_SLUG_LENGTH)} lowercase letters, digits and hyphens. Capitals are refused, not converted.`

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
 * Checks the web address as the person types. An empty field passes here, so a
 * submit reaches the schema and every field shows its error at once.
 * @param props - The validator's argument.
 * @param props.value - The field's text.
 * @returns The first issue's message, or nothing.
 */
function liveSlugError({ value }: { value: string }): string | undefined {
  if (value === '') return undefined
  const result = slugSchema.safeParse(value)
  return result.success ? undefined : result.error.issues[0]?.message
}

/**
 * Sorts a failed create into messages under fields and one message above the
 * button. A taken web address names no field in the envelope, so it goes under
 * the web address by hand.
 * @param error - What the create rejected with.
 * @returns The field messages and the form-level message, if any.
 */
function sortFailure(error: unknown): { fields: ServerFields; form: string | null } {
  if (codeFrom(error) === SLUG_TAKEN) return { fields: { slug: messageFrom(error) }, form: null }
  const fields: ServerFields = {}
  const loose: string[] = [...formErrorsFrom(error)]
  if (statusFrom(error) === 400) {
    for (const [key, messages] of Object.entries(fieldErrorsFrom(error))) {
      const message = messages[0]
      if (message === undefined) continue
      if (key === 'name' || key === 'slug' || key === 'description') fields[key] = message
      else loose.push(message)
    }
  }
  if (Object.keys(fields).length > 0 && loose.length === 0) return { fields, form: null }
  return { fields, form: loose[0] ?? messageFrom(error) }
}

/**
 * The create-workspace form: Name, Web address and Description. The whole
 * schema validates on submit; the web address alone validates as the person
 * types, since its shape is not one a reader can guess. The value is parsed
 * before posting, so trimming reaches the wire and a blank description is
 * dropped. The form stays busy until `onCreated` resolves, and a ref refuses a
 * press that arrives before the busy state renders.
 * @param props - The handler to run with the new workspace.
 * @param props.onCreated - Runs after the create succeeds.
 * @returns The form.
 */
export function CreateWorkspaceForm({ onCreated }: CreateWorkspaceFormProps) {
  const createTenant = useCreateTenant()
  const [landing, setLanding] = useState(false)
  const [serverFields, setServerFields] = useState<ServerFields>({})
  const [formError, setFormError] = useState<string | null>(null)
  const submitting = useRef(false)
  /** The schema's input type: TanStack needs the validator's input assignable to the form values. */
  const defaultValues: z.input<typeof newTenantSchema> = { name: '', slug: '', description: '' }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: newTenantSchema },
    onSubmit: async ({ value }) => {
      if (submitting.current) return
      submitting.current = true
      setServerFields({})
      setFormError(null)
      try {
        let tenant: Tenant
        try {
          tenant = await createTenant.mutateAsync(newTenantSchema.parse(value))
        } catch (error) {
          const sorted = sortFailure(error)
          setServerFields(sorted.fields)
          setFormError(sorted.form)
          return
        }
        setLanding(true)
        try {
          await onCreated(tenant)
        } finally {
          setLanding(false)
        }
        form.reset()
      } finally {
        submitting.current = false
      }
    },
  })

  /**
   * Builds a change handler that drops the server's message for a field, then
   * passes the text on.
   * @param name - The field.
   * @param handleChange - The field's TanStack handler.
   * @returns The handler for `onChangeText`.
   */
  const clearing = (name: FieldName, handleChange: (text: string) => void) => (text: string) => {
    setServerFields((current) => {
      if (current[name] === undefined) return current
      return { ...current, [name]: undefined }
    })
    handleChange(text)
  }

  return (
    <>
      <form.Field name="name">
        {(field) => (
          <TextField
            label="Name"
            value={field.state.value}
            onChangeText={clearing(field.name, field.handleChange)}
            onBlur={field.handleBlur}
            error={firstMessage(field.state.meta.errors) ?? serverFields.name}
            autoCapitalize="words"
            returnKeyType="next"
          />
        )}
      </form.Field>
      <form.Field name="slug" validators={{ onChange: liveSlugError }}>
        {(field) => (
          <TextField
            label="Web address"
            hint={SLUG_HINT}
            value={field.state.value}
            onChangeText={clearing(field.name, field.handleChange)}
            onBlur={field.handleBlur}
            error={firstMessage(field.state.meta.errors) ?? serverFields.slug}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <TextField
            label="Description"
            hint="Optional."
            value={field.state.value ?? ''}
            onChangeText={clearing(field.name, field.handleChange)}
            onBlur={field.handleBlur}
            error={firstMessage(field.state.meta.errors) ?? serverFields.description}
            multiline
          />
        )}
      </form.Field>
      {formError ? <InlineError message={formError} /> : null}
      <Button
        variant="primary"
        label="Create workspace"
        loading={createTenant.isPending || landing}
        onPress={() => void form.handleSubmit()}
      />
    </>
  )
}

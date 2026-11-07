import { fieldErrorsFrom, formErrorsFrom, messageFrom, statusFrom } from '@/lib/api-error'

/** What a failed save shows: messages by field, and one line for the form. */
export interface SaveFailure<K extends string> {
  fields: Partial<Record<K, string>>
  form: string | null
}

/**
 * Sorts a failed save's messages. A 400's field errors for known fields show
 * under their field; every other message, and any failure with no field to
 * show it under, becomes the form's line.
 * @param error - What the mutation threw.
 * @param keys - The form's field names.
 * @returns The messages by field and the form's line.
 */
export function failureFrom<K extends string>(error: unknown, keys: readonly K[]): SaveFailure<K> {
  const fields: Partial<Record<K, string>> = {}
  const loose: string[] = [...formErrorsFrom(error)]
  if (statusFrom(error) === 400) {
    for (const [key, list] of Object.entries(fieldErrorsFrom(error))) {
      const message = list[0]
      if (message === undefined) continue
      const known = keys.find((candidate) => candidate === key)
      if (known === undefined) loose.push(message)
      else fields[known] = message
    }
  }
  const showForm = Object.keys(fields).length === 0 || loose.length > 0
  return { fields, form: showForm ? (loose[0] ?? messageFrom(error)) : null }
}

/**
 * The first schema issue for each known field.
 * @param issues - A Zod error's issues.
 * @param keys - The form's field names.
 * @returns The messages by field.
 */
export function issuesByField<K extends string>(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
  keys: readonly K[]
): Partial<Record<K, string>> {
  const found: Partial<Record<K, string>> = {}
  for (const issue of issues) {
    const known = keys.find((candidate) => candidate === issue.path[0])
    if (known !== undefined && found[known] === undefined) found[known] = issue.message
  }
  return found
}

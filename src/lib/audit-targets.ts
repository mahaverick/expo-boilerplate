import type { AuditTargetType, KnownAuditTargetType } from '@/types/api.types'

/** What an entry acted on, in a word. */
export const AUDIT_TARGET_LABELS: Record<KnownAuditTargetType, string> = {
  tenant: 'Workspace',
  membership: 'Membership',
  invitation: 'Invitation',
  settings: 'Settings',
  user: 'User',
  email_message: 'Email',
  email_suppression: 'Email suppression',
  platform: 'Platform',
}

/**
 * What an entry acted on, in words: the known label, else the API's name as
 * words ("billing_plan" reads "Billing plan"), so a kind this app has no label
 * for never renders blank.
 * @param type - The target's kind.
 */
export function auditTargetLabel(type: AuditTargetType): string {
  if (Object.hasOwn(AUDIT_TARGET_LABELS, type))
    return AUDIT_TARGET_LABELS[type as KnownAuditTargetType]
  const words = type.replaceAll(/[._]+/g, ' ').trim()
  return words === '' ? '—' : words.charAt(0).toUpperCase() + words.slice(1)
}

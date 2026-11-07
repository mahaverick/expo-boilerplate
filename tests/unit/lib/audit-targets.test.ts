import { AUDIT_TARGET_LABELS, auditTargetLabel } from '@/lib/audit-targets'
import { describe, expect, it } from '@/tests/support/runner'

describe('auditTargetLabel', () => {
  it('names every known target', () => {
    expect(auditTargetLabel('tenant')).toBe('Workspace')
    expect(auditTargetLabel('email_suppression')).toBe('Email suppression')
    expect(Object.keys(AUDIT_TARGET_LABELS)).toHaveLength(8)
  })

  it('reads an unknown target as words', () => {
    expect(auditTargetLabel('billing_plan')).toBe('Billing plan')
    expect(auditTargetLabel('a.b_c')).toBe('A b c')
  })

  it('never renders blank', () => {
    expect(auditTargetLabel('__')).toBe('—')
  })
})

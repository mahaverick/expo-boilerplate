import { analyticsKey, getAnalyticsSessionIdFor, track } from '@/observability/telemetry'
import { describe, expect, it } from '@/tests/support/runner'

describe('telemetry', () => {
  it('sends nothing and links no session', () => {
    expect(() => {
      track('sign_in_completed', { method: 'link' })
    }).not.toThrow()
    expect(getAnalyticsSessionIdFor('user-1')).toBeNull()
  })

  it('returns the key it is given', () => {
    expect(analyticsKey('members')).toBe('members')
  })
})

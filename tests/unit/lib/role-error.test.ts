import { ROLE_ERROR } from '@/lib/role-error'
import { describe, expect, it } from '@/tests/support/runner'

describe('ROLE_ERROR', () => {
  it('says the controls are hidden and points to Try again', () => {
    expect(ROLE_ERROR).toBe(
      'We couldn’t load your role in this workspace, so its controls are hidden. Select Try again to show them.'
    )
  })
})

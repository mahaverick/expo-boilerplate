import { limitLine } from '@/copy/members-limit'
import { describe, expect, it } from '@/tests/support/runner'

describe('limitLine', () => {
  it('says the limit is used at the limit', () => {
    expect(limitLine(5, 5, 'Free')).toBe('You’ve used 5 of 5 members on Free.')
  })

  it('says how many to remove over the limit', () => {
    expect(limitLine(7, 5, 'Free')).toBe('7 of 5 members on Free. Remove 2 to invite more.')
  })

  it('leaves the plan out while it is unknown and uses the singular for one', () => {
    expect(limitLine(1, 1, undefined)).toBe('You’ve used 1 of 1 member.')
  })
})

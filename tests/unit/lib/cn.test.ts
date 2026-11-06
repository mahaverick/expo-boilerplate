import { cn } from '@/lib/cn'
import { describe, expect, it } from '@/tests/support/runner'

describe('cn', () => {
  it('joins the truthy parts with one space', () => {
    expect(cn('a', false, 'b', null, undefined, '', 'c')).toBe('a b c')
  })

  it('returns an empty string for no parts', () => {
    expect(cn()).toBe('')
  })

  it('does not merge conflicting classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-2 p-4')
  })
})

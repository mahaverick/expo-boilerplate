import { isDev } from '@/ports/runtime'
import { describe, expect, it } from '@/tests/support/runner'

describe('isDev', () => {
  it('follows __DEV__', () => {
    expect(isDev).toBe(__DEV__)
  })
})

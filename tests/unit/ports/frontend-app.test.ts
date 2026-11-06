import { FRONTEND_APP } from '@/constants/frontend-app'
import { describe, expect, it } from '@/tests/support/runner'

describe('FRONTEND_APP', () => {
  it('names the app express builds links for', () => {
    expect(FRONTEND_APP).toBe('web')
  })
})

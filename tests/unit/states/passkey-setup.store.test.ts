import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { afterEach, describe, expect, it } from '@/tests/support/runner'

afterEach(() => {
  usePasskeySetupStore.getState().setRequired(false)
})

describe('usePasskeySetupStore', () => {
  it('starts not required', () => {
    expect(usePasskeySetupStore.getState().required).toBe(false)
  })

  it('sets and clears the flag', () => {
    usePasskeySetupStore.getState().setRequired(true)
    expect(usePasskeySetupStore.getState().required).toBe(true)
    usePasskeySetupStore.getState().setRequired(false)
    expect(usePasskeySetupStore.getState().required).toBe(false)
  })
})

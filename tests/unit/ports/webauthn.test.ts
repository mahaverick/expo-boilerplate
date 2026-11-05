import { webauthn } from '@/ports/webauthn'
import { describe, expect, it } from '@/tests/support/runner'

describe('webauthn', () => {
  it('reports no passkey support', async () => {
    await expect(webauthn.isSupported()).resolves.toEqual({ create: false, autofill: false })
  })

  it('rejects an assertion and a registration as not supported', async () => {
    await expect(webauthn.get({ challenge: 'c' }, 'modal')).rejects.toThrow(/not supported/)
    await expect(
      webauthn.create({
        rp: { name: 'rp' },
        user: { id: 'u', name: 'n', displayName: 'd' },
        challenge: 'c',
        pubKeyCredParams: [],
      })
    ).rejects.toThrow(/not supported/)
  })

  it('has no prompt to cancel and ignores signals', () => {
    expect(webauthn.cancelGeneration()).toBe(0)
    expect(() => {
      webauthn.signalUnknown('rp', 'id')
      webauthn.signalAccepted('rp', 'handle', [])
      webauthn.signalUser('rp', { id: 'u', email: 'e', firstName: 'f', lastName: 'l' })
    }).not.toThrow()
  })
})

/**
 * @file The WebAuthn port. This plan ships no passkeys: support reads false,
 * each ceremony rejects, and each signal does nothing.
 */
import type { WebAuthnPort } from '@/types/webauthn.types'

/**
 * The error each ceremony rejects with.
 * @returns A not-supported error.
 */
function notSupported(): Error {
  return new Error('Passkeys are not supported in this app yet.')
}

/** No passkey support. */
export const webauthn: WebAuthnPort = {
  isSupported: () => Promise.resolve({ create: false, autofill: false }),
  get: () => Promise.reject(notSupported()),
  create: () => Promise.reject(notSupported()),
  cancelGeneration: () => 0,
  signalUnknown: () => {},
  signalAccepted: () => {},
  signalUser: () => {},
}

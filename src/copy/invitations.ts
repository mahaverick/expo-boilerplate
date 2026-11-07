import { statusFrom } from '@/lib/api-error'
import { retryableFailureMessage } from '@/lib/retry'

/**
 * What an invitee reads when a full workspace refuses the join. Express's own
 * message asks for an upgrade, which the app never shows (spec section 6).
 */
const JOIN_AT_LIMIT =
  'This workspace is at its members limit, so you can’t join it yet. Ask an owner of the workspace.'

/**
 * What an invitation screen's Try again panel says. Any `402` is the
 * members limit, with or without `details`, and shows the app's copy, never
 * the server's message. Anything else reads as `retryableFailureMessage` says.
 * @param error - The failed join's error.
 * @returns The sentence.
 */
export function joinFailureMessage(error: unknown): string {
  return statusFrom(error) === 402 ? JOIN_AT_LIMIT : retryableFailureMessage(error, 'attempts')
}

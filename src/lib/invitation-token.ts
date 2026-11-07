import { z } from 'zod'

/**
 * The shape of an invitation token: 43 base64url characters, the length of 32
 * random bytes. A token that fails it is caught before any request. The
 * pattern is react's `invitationTokenSchema`.
 */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

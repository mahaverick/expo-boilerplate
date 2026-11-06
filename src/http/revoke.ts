/**
 * @file Revokes refresh tokens with the API. A token is kept in
 * `pending_revoke` until its logout settles, so a later sign-out never drops
 * an earlier token that the API has not revoked.
 */
import { apiClient } from '@/http/client'
import { pendingRevokeStore } from '@/http/token-store'
import { statusFrom } from '@/lib/api-error'

/** Statuses after which a retry cannot help: success, or a token the API refuses. */
const SETTLED_STATUSES = new Set([400, 401])

/**
 * Posts `/auth/logout` for one token and removes it from `pending_revoke`
 * when the answer settles it: a 2xx, 400 or 401. No response, a 5xx or a 429
 * leaves it there. Never rejects.
 * @param token - The refresh token to revoke.
 */
async function postRevoke(token: string): Promise<void> {
  try {
    await apiClient.post(
      '/auth/logout',
      { refreshToken: token },
      { skipAuthRetry: true, headers: { Authorization: false } }
    )
  } catch (error) {
    const status = statusFrom(error)
    if (status === undefined || !SETTLED_STATUSES.has(status)) return
  }
  await pendingRevokeStore.remove(token)
}

/**
 * Adds the token to `pending_revoke`, then posts its logout. Other pending
 * tokens are never touched. Never rejects.
 * @param token - The refresh token to revoke.
 */
export async function revokeToken(token: string): Promise<void> {
  // A failed save must not stop the attempt: the post may still settle it.
  await pendingRevokeStore.add(token).catch(() => {})
  await postRevoke(token)
}

/** Revokes every token in `pending_revoke`, one after the other. */
export async function retryPendingRevoke(): Promise<void> {
  for (const token of await pendingRevokeStore.list()) await postRevoke(token)
}

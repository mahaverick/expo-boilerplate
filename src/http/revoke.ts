/**
 * @file Revokes a refresh token with the API. A token whose logout gets no
 * answer stays in `pending_revoke` until a later call reaches the API.
 */
import { apiClient } from '@/http/client'
import { pendingRevokeStore } from '@/http/token-store'
import { statusFrom } from '@/lib/api-error'

/** Statuses after which a retry cannot help: success, or a token the API refuses. */
const SETTLED_STATUSES = new Set([400, 401])

/**
 * Posts the token to `/auth/logout`. A 2xx, 400 or 401 settles it, so
 * `pending_revoke` is cleared. No response, a 5xx or a 429 keeps the token in
 * `pending_revoke` for `retryPendingRevoke`. Never rejects.
 * @param token - The refresh token to revoke.
 */
export async function revokeToken(token: string): Promise<void> {
  try {
    await apiClient.post(
      '/auth/logout',
      { refreshToken: token },
      { skipAuthRetry: true, headers: { Authorization: false } }
    )
  } catch (error) {
    const status = statusFrom(error)
    if (status === undefined || !SETTLED_STATUSES.has(status)) {
      await pendingRevokeStore.write(token).catch(() => {})
      return
    }
  }
  await pendingRevokeStore.clear()
}

/** Revokes the token in `pending_revoke`, if there is one. */
export async function retryPendingRevoke(): Promise<void> {
  const token = await pendingRevokeStore.read()
  if (token !== null) await revokeToken(token)
}

/**
 * @file Decides, at launch and on every return to the foreground, whether the
 * person is signed in. A reinstalled iPhone keeps the previous install's
 * Keychain items, so the first launch of an install drops any token it finds
 * and queues its revoke.
 */
import { AppState } from 'react-native'
import { create } from 'zustand'
import { retryPendingRevoke, revokeToken } from '@/http/revoke'
import { ensureSession } from '@/http/session'
import { pendingRevokeStore, refreshTokenStore } from '@/http/token-store'
import { storage } from '@/lib/storage'
import { useAuthStore } from '@/states/auth.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'

/** Whether the launch restore is running, and who the person is after it. */
export type SessionStatus = 'restoring' | 'signed-in' | 'signed-out'

/** The MMKV key that marks this install as having launched before. */
const INSTALLED_KEY = 'installed'

/** Whether the launch restore has settled. */
interface RestoreState {
  isSettled: boolean
}

const useRestoreStore = create<RestoreState>()(() => ({ isSettled: false }))

/** The one restore of this process, once started. */
let restoring: Promise<void> | null = null

/**
 * Moves a token left by a previous install to `pending_revoke`, clears it,
 * then writes the install marker. Only local steps: the revoke itself runs
 * with the other pending revokes, and never holds the launch. When the token
 * cannot join the list, it is still cleared and its revoke posts directly.
 * A failed read leaves the marker unwritten, so the next launch checks again.
 */
async function checkReinstall(): Promise<void> {
  if (storage.getString(INSTALLED_KEY) !== undefined) return
  const token = await refreshTokenStore.read()
  if (token) {
    const saved = await pendingRevokeStore.add(token).then(
      () => true,
      () => false
    )
    // Cleared either way: the next step must not restore the previous owner's session.
    await refreshTokenStore.clear()
    if (!saved) void revokeToken(token)
  }
  storage.set(INSTALLED_KEY, '1')
}

/**
 * Runs the restore: the reinstall check, then the refresh. The pending
 * revokes start between the two and are not awaited; the list keeps each
 * token until its revoke settles. A failure of any step never rejects.
 */
async function runRestore(): Promise<void> {
  try {
    await checkReinstall()
  } catch {
    // The marker stays unwritten; the next launch checks again.
  }
  void retryPendingRevoke().catch(() => {})
  // A verdict signs the store out inside the core; any other failure leaves the token for the next foreground.
  await ensureSession().catch(() => {})
  useRestoreStore.setState({ isSettled: true })
}

/**
 * Restores the session once per process: the reinstall check, then the
 * refresh, with the pending revokes running beside it. Never rejects.
 * @returns The same promise on every call.
 */
export function restoreSession(): Promise<void> {
  restoring ??= runRestore()
  return restoring
}

/**
 * The session status. It is `restoring` until `restoreSession()` settles, then
 * follows the auth store, so a later sign-in or sign-out updates it.
 * @returns The current status.
 */
export function useSessionStatus(): SessionStatus {
  const isSettled = useRestoreStore((state) => state.isSettled)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  if (!isSettled) return 'restoring'
  return isAuthenticated ? 'signed-in' : 'signed-out'
}

/**
 * Refreshes the session each time the app returns to the foreground, after
 * the launch restore has settled, and clears the passkey-setup flag. With no
 * stored token the core rejects at once; every rejection is swallowed.
 * @returns A function that removes the listener.
 */
export function installForegroundRefresh(): () => void {
  let previous: string | null | undefined = AppState.currentState
  const subscription = AppState.addEventListener('change', (next) => {
    const wasAway = previous === 'background' || previous === 'inactive'
    previous = next
    if (next !== 'active' || !wasAway) return
    // The person may have added a passkey on the website; the next refused request sets the flag again.
    if (usePasskeySetupStore.getState().required) usePasskeySetupStore.getState().setRequired(false)
    void restoreSession()
      .then(() => ensureSession())
      .catch(() => {})
  })
  return () => {
    subscription.remove()
  }
}

/** Forgets the restore, so the next `restoreSession()` starts again. */
export function resetSessionLifecycleForTests(): void {
  restoring = null
  useRestoreStore.setState({ isSettled: false })
}

/**
 * @file Decides, at launch and on every return to the foreground, whether the
 * person is signed in. A reinstalled iPhone keeps the previous install's
 * Keychain items, so the first launch of an install revokes and drops any
 * token it finds.
 */
import { AppState } from 'react-native'
import { create } from 'zustand'
import { retryPendingRevoke, revokeToken } from '@/http/revoke'
import { ensureSession } from '@/http/session'
import { refreshTokenStore } from '@/http/token-store'
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
 * Revokes and clears a token left by a previous install, then writes the
 * install marker. A failure leaves the marker unwritten, so the next launch
 * checks again.
 */
async function checkReinstall(): Promise<void> {
  if (storage.getString(INSTALLED_KEY) !== undefined) return
  const token = await refreshTokenStore.read()
  if (token) {
    await revokeToken(token)
    await refreshTokenStore.clear()
  }
  storage.set(INSTALLED_KEY, '1')
}

/** Runs the three restore steps in order. A failure of any step never rejects. */
async function runRestore(): Promise<void> {
  try {
    await checkReinstall()
  } catch {
    // The marker stays unwritten; the next launch checks again.
  }
  await retryPendingRevoke().catch(() => {})
  // A verdict signs the store out inside the core; any other failure leaves the token for the next foreground.
  await ensureSession().catch(() => {})
  useRestoreStore.setState({ isSettled: true })
}

/**
 * Restores the session once per process: the reinstall check, the pending
 * revokes, then the refresh. Never rejects.
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

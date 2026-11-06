import { create } from 'zustand'

/** Whether the sign-out in progress is one the person asked for. */
interface OwnSignOutState {
  isOwn: boolean
}

/**
 * Set by `useSignOut` before the auth store signs out, so the `(app)` guard
 * sends the person to `/login` with no `redirect`: the next person on the
 * device must not land on the previous person's path. An expired session
 * never sets it, so its redirect survives. `/login` clears it once it shows,
 * and the guard clears it once a session is signed in.
 */
export const useOwnSignOutStore = create<OwnSignOutState>()(() => ({ isOwn: false }))

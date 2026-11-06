import { create } from 'zustand'
import { storage } from '@/lib/storage'

/**
 * The MMKV key that holds a person's last workspace.
 * @param userId - The signed-in person's id.
 * @returns `last-tenant:{userId}`.
 */
function keyFor(userId: string): string {
  return `last-tenant:${userId}`
}

/** The remembered workspaces and the actions that change them. */
interface CurrentTenantState {
  /** Web addresses by user id. A user appears here once they are written or forgotten, not at start. */
  remembered: Record<string, string>
  /**
   * The workspace a person last used. Reads memory first, then MMKV, so one
   * person's value is loaded on first read and no other person's is.
   */
  recall: (userId: string) => string | null
  /**
   * Saves the workspace a person is using. Callers pass the web address of an
   * eligible workspace: never the platform workspace, never a suspended one.
   */
  remember: (userId: string, slug: string) => void
  /** Deletes a person's saved workspace from memory and from MMKV. */
  forget: (userId: string) => void
}

/**
 * The workspace each person last used, saved to MMKV under
 * `last-tenant:{userId}`. Sign-out leaves it: the same person returns to their
 * workspace, and another person never reads it.
 */
export const useCurrentTenantStore = create<CurrentTenantState>()((set, get) => ({
  remembered: {},
  recall: (userId) => get().remembered[userId] ?? storage.getString(keyFor(userId)) ?? null,
  remember: (userId, slug) => {
    storage.set(keyFor(userId), slug)
    set((state) => ({ remembered: { ...state.remembered, [userId]: slug } }))
  },
  forget: (userId) => {
    storage.remove(keyFor(userId))
    set((state) => {
      const rest = { ...state.remembered }
      delete rest[userId]
      return { remembered: rest }
    })
  },
}))

import { create } from 'zustand'

/** The tab bar's height while a tab screen is focused. */
interface TabBarState {
  /** The height in points, bottom inset included; 0 while no tab screen is focused. */
  height: number
  /** Which tab screen published the height, so another tab's cleanup leaves it. */
  owner: string | null
}

/**
 * The tab bar's height, which the tabs layout publishes and the toaster reads,
 * so a toast sits above the tab bar rather than over it.
 */
export const useTabBarStore = create<TabBarState>()(() => ({ height: 0, owner: null }))

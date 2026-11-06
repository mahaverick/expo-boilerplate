import { useIsFocused } from 'expo-router'
import { useBottomTabBarHeight } from 'expo-router/tabs'
import { useEffect, useId, type ReactNode } from 'react'
import { useTabBarStore } from '@/states/tab-bar.store'

/**
 * Wraps one tab screen and publishes the tab bar's height while that screen is
 * focused. It clears the height when the screen loses focus, which includes a
 * stack screen opening over the tabs, and when it unmounts. A cleanup leaves a
 * height that another tab published.
 * @param props - The tab screen.
 * @param props.children - The tab screen.
 * @returns The tab screen.
 */
export function TabBarHeight({ children }: { children: ReactNode }) {
  const height = useBottomTabBarHeight()
  const isFocused = useIsFocused()
  const owner = useId()
  useEffect(() => {
    if (!isFocused) return
    useTabBarStore.setState({ height, owner })
    return () => {
      if (useTabBarStore.getState().owner === owner)
        useTabBarStore.setState({ height: 0, owner: null })
    }
  }, [isFocused, height, owner])
  return children
}

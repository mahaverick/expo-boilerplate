import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

/**
 * Subscribes to the online state.
 * @param notify - Called on each change.
 * @returns The unsubscribe function.
 */
function subscribe(notify: () => void): () => void {
  return onlineManager.subscribe(notify)
}

/**
 * Whether the device is online, re-rendering the caller on a change.
 * @returns True while online.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, () => onlineManager.isOnline())
}

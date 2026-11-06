/**
 * @file Ties TanStack Query to the device. Focus follows the app's foreground
 * state, and online follows the network, so queries refetch when the app
 * returns and pause while the device is offline.
 */
import NetInfo from '@react-native-community/netinfo'
import type { NetInfoState } from '@react-native-community/netinfo'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { AppState } from 'react-native'

/** The cleanup of the install in force, or `undefined` while none is. */
let installed: (() => void) | undefined

/**
 * Whether a network state counts as online. Unknown (`null`) counts as
 * online, so a slow first report never pauses every query.
 * @param state - The state NetInfo reported.
 * @returns False only when NetInfo says there is no connection or no internet.
 */
function isOnline(state: NetInfoState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false
}

/**
 * Makes TanStack Query's focus follow `AppState` and its online state follow
 * NetInfo. A second call while installed returns the same cleanup.
 * @returns The cleanup, which removes both listeners.
 */
export function installQueryManagers(): () => void {
  if (installed) return installed

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (status) => {
      handleFocus(status === 'active')
    })
    return () => {
      subscription.remove()
    }
  })
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(isOnline(state))
    })
  )

  installed = () => {
    installed = undefined
    focusManager.setEventListener(() => undefined)
    onlineManager.setEventListener(() => undefined)
  }
  return installed
}

/**
 * @file Ties TanStack Query to the device. Focus follows the app's foreground
 * state, and online follows the network, so queries refetch when the app
 * returns and pause while the device is offline. On iOS and Android alike,
 * "online" means express answers: NetInfo probes express's `/health` instead
 * of the platform's own check, which reaches Google. A network that blocks
 * Google but reaches express is not offline; one that reaches Google but not
 * express is, on both platforms.
 */
import NetInfo from '@react-native-community/netinfo'
import type { NetInfoState } from '@react-native-community/netinfo'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { AppState } from 'react-native'
import { apiOriginUrl } from '@/http/client'

/**
 * Points NetInfo's internet check at express's `/health` on both platforms.
 * `useNativeReachability: false` makes Android probe it too, instead of
 * trusting the system's own validation. `/health` sits outside the API prefix,
 * has no rate limit and passes in every maintenance mode, so the probe spends
 * no budget a real read needs. Any HTTP answer counts as reachable; only a
 * failed request or a timeout counts as unreachable. The request names the
 * native client and asks past the HTTP cache, as every API request does.
 */
function configureReachability(): void {
  NetInfo.configure({
    reachabilityUrl: apiOriginUrl('/health'),
    useNativeReachability: false,
    reachabilityMethod: 'HEAD',
    reachabilityHeaders: { 'x-client': 'native', 'Cache-Control': 'no-cache' },
    reachabilityTest: () => Promise.resolve(true),
  })
}

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
 * NetInfo, after pointing NetInfo's internet check at express. A second call
 * while installed returns the same cleanup and configures nothing.
 * @returns The cleanup, which removes both listeners.
 */
export function installQueryManagers(): () => void {
  if (installed) return installed

  configureReachability()

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

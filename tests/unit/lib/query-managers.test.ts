import { jest } from '@jest/globals'
import NetInfo from '@react-native-community/netinfo'
import type { NetInfoState } from '@react-native-community/netinfo'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { act } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { installQueryManagers } from '@/lib/query-managers'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

/** The listener the module gave NetInfo, once installed. */
type NetListener = (state: NetInfoState) => void

/** Builds a NetInfo state with the two fields the rule reads. */
function net(isConnected: boolean | null, isInternetReachable: boolean | null): NetInfoState {
  return { isConnected, isInternetReachable } as NetInfoState
}

/** The AppState listeners registered by the module under test. */
let appListeners: ((status: string) => void)[]
let netListener: NetListener | undefined
const removeApp = jest.fn()
const removeNet = jest.fn()
let cleanup: (() => void) | undefined

beforeEach(() => {
  appListeners = []
  netListener = undefined
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (status: string) => void
  ) => {
    appListeners.push(listener)
    return { remove: removeApp }
  }) as never)
  jest.mocked(NetInfo.addEventListener).mockImplementation((listener: NetListener) => {
    netListener = listener
    return removeNet
  })
})

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  jest.restoreAllMocks()
  removeApp.mockClear()
  removeNet.mockClear()
  jest.mocked(NetInfo.configure).mockClear()
  onlineManager.setOnline(true)
})

describe('installQueryManagers', () => {
  it('makes focus follow AppState', async () => {
    cleanup = installQueryManagers()
    await act(() => {
      appListeners.forEach((listener) => {
        listener('active')
      })
    })
    expect(focusManager.isFocused()).toBe(true)
    await act(() => {
      appListeners.forEach((listener) => {
        listener('background')
      })
    })
    expect(focusManager.isFocused()).toBe(false)
  })

  it('makes online follow NetInfo, counting unknown as online', async () => {
    cleanup = installQueryManagers()
    await act(() => {
      netListener?.(net(false, false))
    })
    expect(onlineManager.isOnline()).toBe(false)
    await act(() => {
      netListener?.(net(true, null))
    })
    expect(onlineManager.isOnline()).toBe(true)
    await act(() => {
      netListener?.(net(true, false))
    })
    expect(onlineManager.isOnline()).toBe(false)
    await act(() => {
      netListener?.(net(null, null))
    })
    expect(onlineManager.isOnline()).toBe(true)
  })

  it('removes both listeners on cleanup', () => {
    const remove = installQueryManagers()
    remove()
    expect(removeApp).toHaveBeenCalled()
    expect(removeNet).toHaveBeenCalled()
  })

  it('is idempotent: a second call returns the same cleanup', () => {
    cleanup = installQueryManagers()
    expect(installQueryManagers()).toBe(cleanup)
  })

  it('judges reachability by express, not Google', () => {
    cleanup = installQueryManagers()
    expect(NetInfo.configure).toHaveBeenCalledTimes(1)
    const config = jest.mocked(NetInfo.configure).mock.calls[0]?.[0]
    expect(config).toMatchObject({
      reachabilityUrl: 'https://api.example.test/api/v1/status/client-settings',
      reachabilityMethod: 'HEAD',
      reachabilityHeaders: { 'x-client': 'native', 'Cache-Control': 'no-cache' },
    })
  })

  it("counts any HTTP answer as reachable, maintenance's 503 included", async () => {
    cleanup = installQueryManagers()
    const test = jest.mocked(NetInfo.configure).mock.calls[0]?.[0].reachabilityTest
    for (const status of [204, 200, 503]) {
      await expect(test?.({ status } as Response)).resolves.toBe(true)
    }
  })

  it('configures NetInfo once when installed twice', () => {
    cleanup = installQueryManagers()
    installQueryManagers()
    expect(NetInfo.configure).toHaveBeenCalledTimes(1)
  })
})

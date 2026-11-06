import { jest } from '@jest/globals'
import NetInfo from '@react-native-community/netinfo'
import type { NetInfoState } from '@react-native-community/netinfo'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { act } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { installQueryManagers } from '@/lib/query-managers'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

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
})

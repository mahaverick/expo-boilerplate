import { jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { useIsFocused } from 'expo-router'
import { Text } from 'react-native'
import { TabBarHeight } from '@/components/shared/tab-bar-height'
import { useTabBarStore } from '@/states/tab-bar.store'
import { beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }))
jest.mock('expo-router/tabs', () => ({ useBottomTabBarHeight: () => 83 }))

beforeEach(() => {
  useTabBarStore.setState({ height: 0 })
})

describe('TabBarHeight', () => {
  it('publishes the tab bar height while its tab is focused, and renders the tab', async () => {
    jest.mocked(useIsFocused).mockReturnValue(true)
    const view = await render(
      <TabBarHeight>
        <Text>tab</Text>
      </TabBarHeight>
    )
    expect(view.getByText('tab')).toBeTruthy()
    expect(useTabBarStore.getState().height).toBe(83)
  })

  it('clears the height when its tab loses focus or unmounts', async () => {
    jest.mocked(useIsFocused).mockReturnValue(true)
    const view = await render(<TabBarHeight>{null}</TabBarHeight>)
    jest.mocked(useIsFocused).mockReturnValue(false)
    await view.rerender(<TabBarHeight>{null}</TabBarHeight>)
    expect(useTabBarStore.getState().height).toBe(0)
    jest.mocked(useIsFocused).mockReturnValue(true)
    await view.rerender(<TabBarHeight>{null}</TabBarHeight>)
    expect(useTabBarStore.getState().height).toBe(83)
    await view.unmount()
    expect(useTabBarStore.getState().height).toBe(0)
  })

  it('leaves the height of the tab that took focus after it', async () => {
    jest.mocked(useIsFocused).mockReturnValue(true)
    const view = await render(<TabBarHeight>{null}</TabBarHeight>)
    useTabBarStore.setState({ height: 90, owner: 'another tab' })
    await view.unmount()
    expect(useTabBarStore.getState().height).toBe(90)
  })
})

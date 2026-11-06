import { jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import TabsLayout from '@/app/(app)/(tabs)/_layout'
import { TabBarHeight } from '@/components/shared/tab-bar-height'
import { describe, expect, it } from '@/tests/support/runner'

/** Receives the `screenLayout` the mocked navigator gets on each render. */
const mockScreenLayout = jest.fn<(layout: (props: { children: unknown }) => unknown) => void>()

/** The options each mocked tab screen received, by name. */
const mockOptions: Record<string, Record<string, unknown>> = {}

jest.mock('expo-router', () => {
  /** The tab navigator, rendering its screens. */
  const Tabs = ({
    children,
    screenLayout,
  }: {
    children: unknown
    screenLayout: (props: { children: unknown }) => unknown
  }) => {
    mockScreenLayout(screenLayout)
    return children
  }
  /** A tab screen, recording its options. */
  Tabs.Screen = ({ name, options }: { name: string; options: Record<string, unknown> }) => {
    mockOptions[name] = options
    return null
  }
  return { Tabs }
})

describe('tabs layout', () => {
  it('wraps each tab in the reporter of the tab bar height', async () => {
    await render(<TabsLayout />)
    const layout = mockScreenLayout.mock.lastCall?.[0]
    const wrapped = layout?.({ children: 'tab' }) as { type: unknown; props: unknown }
    expect(wrapped.type).toBe(TabBarHeight)
    expect(wrapped.props).toEqual({ children: 'tab' })
  })

  it('declares four tabs, each titled and labelled, with no personal data', async () => {
    await render(<TabsLayout />)
    expect(
      Object.entries(mockOptions).map(([name, o]) => [name, o.title, o.tabBarAccessibilityLabel])
    ).toEqual([
      ['index', 'Home', 'Home'],
      ['workspace', 'Workspace', 'Workspace'],
      ['notifications', 'Notifications', 'Notifications'],
      ['settings', 'Settings', 'Settings'],
    ])
  })
})

import { jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import TabsLayout from '@/app/(app)/(tabs)/_layout'
import { describe, expect, it } from '@/tests/support/runner'

/** The options each mocked tab screen received, by name. */
const mockOptions: Record<string, Record<string, unknown>> = {}

jest.mock('expo-router', () => {
  /** The tab navigator, rendering its screens. */
  const Tabs = ({ children }: { children: unknown }) => children
  /** A tab screen, recording its options. */
  Tabs.Screen = ({ name, options }: { name: string; options: Record<string, unknown> }) => {
    mockOptions[name] = options
    return null
  }
  return { Tabs }
})

describe('tabs layout', () => {
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

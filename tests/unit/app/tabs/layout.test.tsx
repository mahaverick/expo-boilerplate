import { jest } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react-native'
import TabsLayout from '@/app/(app)/(tabs)/_layout'
import { TabBarHeight } from '@/components/shared/tab-bar-height'
import { notificationsListOptions } from '@/queries/notification.queries'
import { screenTree } from '@/tests/support/api'
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

/**
 * Renders the layout over a client that holds the unread count.
 * @param total - The count the unread read holds, or undefined for none.
 * @returns The promise `render` returns.
 */
async function renderLayout(total?: { count: number; capped: boolean }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  if (total !== undefined) {
    client.setQueryData(notificationsListOptions({ unread: true, limit: 1 }).queryKey, {
      items: [],
      page: { hasNext: false, nextCursor: null, prevCursor: null, hasPrev: false, limit: 1 },
      total,
    })
  }
  return render(screenTree(<TabsLayout />, client))
}

describe('tabs layout', () => {
  it('wraps each tab in the reporter of the tab bar height', async () => {
    await renderLayout()
    const layout = mockScreenLayout.mock.lastCall?.[0]
    const wrapped = layout?.({ children: 'tab' }) as { type: unknown; props: unknown }
    expect(wrapped.type).toBe(TabBarHeight)
    expect(wrapped.props).toEqual({ children: 'tab' })
  })

  it('declares four tabs, each titled and labelled, with no personal data', async () => {
    await renderLayout()
    expect(
      Object.entries(mockOptions).map(([name, o]) => [name, o.title, o.tabBarAccessibilityLabel])
    ).toEqual([
      ['index', 'Home', 'Home'],
      ['workspace', 'Workspace', 'Workspace'],
      ['notifications', 'Notifications', 'Notifications'],
      ['settings', 'Settings', 'Settings'],
    ])
  })

  it('shows the unread count on the Notifications tab', async () => {
    await renderLayout({ count: 3, capped: false })
    expect(mockOptions.notifications?.tabBarBadge).toBe('3')
    expect(mockOptions.notifications?.tabBarAccessibilityLabel).toBe('Notifications, 3 unread')
    expect(mockOptions.settings?.tabBarBadge).toBeUndefined()
  })

  it('hides the badge at zero', async () => {
    await renderLayout({ count: 0, capped: false })
    expect(mockOptions.notifications?.tabBarBadge).toBeUndefined()
    expect(mockOptions.notifications?.tabBarAccessibilityLabel).toBe('Notifications')
  })

  it('adds a plus when the count is capped', async () => {
    await renderLayout({ count: 1000, capped: true })
    expect(mockOptions.notifications?.tabBarBadge).toBe('1000+')
    expect(mockOptions.notifications?.tabBarAccessibilityLabel).toBe('Notifications, 1000+ unread')
  })
})

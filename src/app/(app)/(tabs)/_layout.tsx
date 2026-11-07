import { Tabs } from 'expo-router'
import { TabBarHeight } from '@/components/shared/tab-bar-height'
import { tabBadge } from '@/copy/notifications'
import { useUnreadCount } from '@/queries/notification.queries'

/** The tabs, in order: the route name, and the title and label the tab carries. */
const TABS = [
  { name: 'index', title: 'Home' },
  { name: 'workspace', title: 'Workspace' },
  { name: 'notifications', title: 'Notifications' },
  { name: 'settings', title: 'Settings' },
] as const

/**
 * The signed-in area's four tabs. No tab has a navigator header: each screen
 * draws its one title through `Screen`, which pads the top inset. The tab bar
 * takes the bottom inset. Titles carry no personal data. Each tab publishes the
 * tab bar's height while focused, so the toaster sits above the bar. The
 * Notifications tab carries the unread count as its badge, in the tab bar's
 * default colours: a tab bar badge takes a colour value, not a token class.
 * @returns The tab navigator.
 */
export default function TabsLayout() {
  const unread = tabBadge(useUnreadCount().data)
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      screenLayout={({ children }) => <TabBarHeight>{children}</TabBarHeight>}
    >
      {TABS.map(({ name, title }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarAccessibilityLabel: name === 'notifications' ? unread.label : title,
            tabBarBadge: name === 'notifications' ? unread.badge : undefined,
            tabBarIcon: () => null,
          }}
        />
      ))}
    </Tabs>
  )
}

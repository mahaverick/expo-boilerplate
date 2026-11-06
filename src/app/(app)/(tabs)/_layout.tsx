import { Tabs } from 'expo-router'

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
 * takes the bottom inset. Titles carry no personal data.
 * @returns The tab navigator.
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      {TABS.map(({ name, title }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{ title, tabBarAccessibilityLabel: title, tabBarIcon: () => null }}
        />
      ))}
    </Tabs>
  )
}

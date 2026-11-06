import type { Href } from 'expo-router'

/** A group on the Settings tab: its name and what it holds. */
export interface SettingsGroup {
  key: 'account' | 'workspace'
  title: string
  description: string
}

/** An Account row: the screen it opens and the words that describe it. */
export interface AccountSection {
  key: 'profile' | 'security' | 'notifications'
  title: string
  description: string
  href: Href
}

/** The groups the Settings tab shows, in order. */
export const SETTINGS_GROUPS: ReadonlyArray<SettingsGroup> = [
  {
    key: 'account',
    title: 'Account',
    description: 'Your profile, sign-in and notifications.',
  },
  {
    key: 'workspace',
    title: 'Workspace',
    description: 'The current workspace’s details, members and activity.',
  },
]

/** The Account group's rows, in order. */
export const ACCOUNT_SECTIONS: ReadonlyArray<AccountSection> = [
  {
    key: 'profile',
    title: 'Profile',
    description: 'Your name.',
    href: '/settings/account/profile',
  },
  {
    key: 'security',
    title: 'Security',
    description: 'Your sign-in methods and signed-in devices.',
    // Typed routes list this screen once its file exists.
    href: '/settings/account/security' as Href,
  },
  {
    key: 'notifications',
    title: 'Notifications',
    description: 'How each kind of notification reaches you.',
    // Typed routes list this screen once its file exists.
    href: '/settings/account/notifications' as Href,
  },
]

import type { Href } from 'expo-router'

/** A group on the Settings tab: its name and what it holds. */
export interface SettingsGroup {
  key: 'account' | 'workspace'
  title: string
  description: string
}

/** An Account row: the screen it opens and the words that describe it. */
export interface AccountSection {
  key: 'profile' | 'security' | 'notifications' | 'privacy' | 'delete'
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
    description: 'The current workspace’s details, members, activity and plan.',
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
    href: '/settings/account/security',
  },
  {
    key: 'notifications',
    title: 'Notifications',
    description: 'How each kind of notification reaches you.',
    href: '/settings/account/notifications',
  },
  {
    key: 'privacy',
    title: 'Privacy',
    description: 'Usage analytics and our privacy policy.',
    href: '/settings/account/privacy',
  },
  {
    key: 'delete',
    title: 'Delete account',
    description: 'Ask us to delete your account.',
    href: '/settings/account/delete',
  },
]

/** A Workspace row: the words that describe it and the screen it opens. */
export interface WorkspaceSection {
  key: 'general' | 'members' | 'activity' | 'plan'
  title: string
  description: string
  /** The route of the section for a workspace. */
  path(slug: string): Href
}

/**
 * The Workspace group's rows, in order. Each path is a typed route, written as
 * a template literal that Expo Router's generated types accept.
 */
export const WORKSPACE_SECTIONS: ReadonlyArray<WorkspaceSection> = [
  {
    key: 'general',
    title: 'General',
    description: 'The workspace’s details, time zone, and language and region.',
    path: (slug) => `/settings/workspace/${slug}/general`,
  },
  {
    key: 'members',
    title: 'Members',
    description: 'Members, roles and pending invitations.',
    path: (slug) => `/settings/workspace/${slug}/members`,
  },
  {
    key: 'activity',
    title: 'Activity',
    description: 'Every change made in this workspace, newest first.',
    path: (slug) => `/settings/workspace/${slug}/activity`,
  },
  {
    key: 'plan',
    title: 'Plan',
    description: 'The workspace’s plan and its limits.',
    path: (slug) => `/settings/workspace/${slug}/billing`,
  },
]

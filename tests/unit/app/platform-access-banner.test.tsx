import { jest } from '@jest/globals'
import { screen } from '@testing-library/react-native'
import WorkspaceActivity from '@/app/(app)/settings/workspace/[slug]/activity'
import WorkspaceGeneral from '@/app/(app)/settings/workspace/[slug]/general'
import WorkspaceMembers from '@/app/(app)/settings/workspace/[slug]/members'
import { StepUpProvider } from '@/components/step-up/step-up-provider'
import { useAuthStore } from '@/states/auth.store'
import { renderScreen, restoreApi } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { acme, envelope, serveWorkspace } from '@/tests/support/workspace-api'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'acme' }),
}))

/** The in-memory stand-in for MMKV. */
const mockStorage = new Map<string, string>()
jest.mock('@/lib/storage', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => {
      mockStorage.set(key, value)
    },
    remove: (key: string) => mockStorage.delete(key),
  },
}))

beforeEach(() => {
  useAuthStore.getState().login('a', {
    id: 'u1',
    email: 'ada@example.com',
    firstName: null,
    lastName: null,
    createdAt: '2026-01-01',
    platformRole: null,
    analyticsOptOut: false,
  })
})

afterEach(() => {
  restoreApi()
  useAuthStore.getState().logout()
  jest.clearAllMocks()
})

/** Each screen, and text that shows once its workspace has loaded. */
const SCREENS: Array<[string, () => React.JSX.Element, string]> = [
  ['General', () => <WorkspaceGeneral />, 'Settings'],
  [
    'Members',
    () => (
      <StepUpProvider>
        <WorkspaceMembers />
      </StepUpProvider>
    ),
    'Everyone with access to this workspace.',
  ],
  ['Activity', () => <WorkspaceActivity />, 'Search activity'],
]

describe.each(SCREENS)('%s', (_name, screenElement, loaded) => {
  it('tells staff with platform access whose workspace this is', async () => {
    serveWorkspace({ 'GET /tenants/acme': envelope(acme({ access: 'platform' })) })
    await renderScreen(screenElement())
    expect(await screen.findByText(/as platform staff \(Owner\)\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to your workspaces' })).toBeTruthy()
  })

  it('shows no banner to a member', async () => {
    serveWorkspace()
    await renderScreen(screenElement())
    expect(await screen.findByText(loaded)).toBeTruthy()
    expect(screen.queryByText(/platform staff/)).toBeNull()
  })
})

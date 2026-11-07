import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react-native'
import WorkspaceIndex from '@/app/(app)/settings/workspace/[slug]/index'
import TenantActivity from '@/app/(app)/tenants/[slug]/activity'
import TenantMembers from '@/app/(app)/tenants/[slug]/members'
import TenantSettings from '@/app/(app)/tenants/[slug]/settings'
import { afterEach, describe, expect, it } from '@/tests/support/runner'

/** The global search params the mocked router reports. */
let mockParams: Record<string, string | string[]> = {}

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
    useGlobalSearchParams: () => mockParams,
    useLocalSearchParams: () => ({ slug: 'acme' }),
  }
})

afterEach(() => {
  mockParams = {}
})

describe('workspace settings redirects', () => {
  it.each([
    ['/settings/workspace/acme', WorkspaceIndex, '/settings/workspace/acme/general'],
    ['/tenants/acme/settings', TenantSettings, '/settings/workspace/acme/general'],
    ['/tenants/acme/members', TenantMembers, '/settings/workspace/acme/members'],
    ['/tenants/acme/activity', TenantActivity, '/settings/workspace/acme/activity'],
  ])('%s replaces to %s', async (_path, Route, target) => {
    mockParams = { slug: 'acme' }
    await render(<Route />)
    expect(screen.getByText(`redirect:${target}`)).toBeTruthy()
  })

  it('keeps the query, drops token and the path segment', async () => {
    mockParams = { slug: 'acme', q: 'ada', tab: ['a', 'b'], token: 'secret' }
    await render(<TenantMembers />)
    expect(
      screen.getByText('redirect:/settings/workspace/acme/members?q=ada&tab=a&tab=b')
    ).toBeTruthy()
  })
})

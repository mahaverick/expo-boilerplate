import { jest } from '@jest/globals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { useGlobalSearchParams, usePathname, useSegments } from 'expo-router'
import { Text } from 'react-native'
import AppLayout, { unstable_settings } from '@/app/(app)/_layout'
import { useSignOut } from '@/hooks/use-sign-out'
import { useSessionStatus } from '@/http/session-lifecycle'
import type { SessionStatus } from '@/http/session-lifecycle'
import { useFeaturePropertiesSync } from '@/observability/flags/flag-hooks'
import { useAuthStore } from '@/states/auth.store'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { useOwnSignOutStore } from '@/states/own-sign-out.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

/** The options the mocked stack's screens received, by name. */
const mockScreens: Record<string, unknown> = {}
/** Receives the mocked stack's `screenOptions` on each render. */
const mockScreenOptions = jest.fn()

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
  /** The stack, recording its options and rendering its screens. */
  const Stack = ({ screenOptions, children }: { screenOptions: unknown; children: unknown }) => {
    mockScreenOptions(screenOptions)
    return (
      <>
        <Text>stack</Text>
        {children as never}
      </>
    )
  }
  /** A stack screen, recording its options. */
  Stack.Screen = ({ name, options }: { name: string; options: unknown }) => {
    mockScreens[name] = options
    return null
  }
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
    router: { replace: jest.fn() },
    Stack,
    usePathname: jest.fn(() => '/'),
    useGlobalSearchParams: jest.fn(() => ({})),
    useSegments: jest.fn(() => []),
  }
})
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('@/observability/flags/flag-hooks', () => ({ useFeaturePropertiesSync: jest.fn() }))
jest.mock('@/observability/telemetry/use-tenant-group', () => ({ useTenantGroup: jest.fn() }))
jest.mock('@/http/session-lifecycle', () => ({ useSessionStatus: jest.fn(() => 'signed-in') }))
jest.mock('@/components/notifications/notification-stream', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
  return { NotificationStream: () => <Text>notification-stream</Text> }
})

/**
 * Sets the session status the mocked hook reports.
 * @param status - The status to report.
 */
function setStatus(status: SessionStatus): void {
  jest.mocked(useSessionStatus).mockReturnValue(status)
}

beforeEach(() => {
  useOwnSignOutStore.setState({ isOwn: false })
  usePasskeySetupStore.setState({ required: false })
  openAt('/')
  useMaintenanceModeStore.setState({ mode: 'off', message: null, since: null })
})

afterEach(() => {
  jest.clearAllMocks()
})

/**
 * Sets the route the mocked hooks report.
 * @param path - The current path.
 * @param params - The current global parameters.
 * @param segments - The current route segments.
 */
function openAt(
  path: string,
  params: Record<string, string | string[]> = {},
  segments: string[] = []
): void {
  jest.mocked(useSegments).mockReturnValue(segments as never)
  jest.mocked(usePathname).mockReturnValue(path)
  jest.mocked(useGlobalSearchParams).mockReturnValue(params)
}

describe('(app) layout', () => {
  it.each(['restoring', 'signed-out', 'signed-in'] as const)(
    'syncs the feature properties while %s, before any early return',
    async (status) => {
      setStatus(status)
      await render(<AppLayout />)
      expect(useFeaturePropertiesSync).toHaveBeenCalled()
    }
  )

  it('sends a signed-out person to /login with the path they asked for', async () => {
    setStatus('signed-out')
    openAt('/tenants/acme', { slug: 'acme', tab: 'x' }, ['(app)', 'tenants', '[slug]'])
    await render(<AppLayout />)
    expect(
      screen.getByText(`redirect:/login?redirect=${encodeURIComponent('/tenants/acme?tab=x')}`)
    ).toBeTruthy()
  })

  it('an expired session, with no sign-out of the person’s own, keeps the redirect', async () => {
    setStatus('signed-out')
    openAt('/tenants/acme', { slug: 'acme' }, ['(app)', 'tenants', '[slug]'])
    await render(<AppLayout />)
    expect(
      screen.getByText(`redirect:/login?redirect=${encodeURIComponent('/tenants/acme')}`)
    ).toBeTruthy()
  })

  it('signing out from /tenants/acme lands on /login with no redirect', async () => {
    jest
      .mocked(useSessionStatus)
      .mockImplementation(() =>
        useAuthStore((state) => state.isAuthenticated) ? 'signed-in' : 'signed-out'
      )
    useAuthStore.setState({ accessToken: 'access', isAuthenticated: true })
    openAt('/tenants/acme', { slug: 'acme' }, ['(app)', 'tenants', '[slug]'])
    /** Signs out, as the Settings tab's button does. */
    function SignOutButton() {
      const { signOut } = useSignOut()
      return <Text onPress={() => void signOut()}>sign out</Text>
    }
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <AppLayout />
        <SignOutButton />
      </QueryClientProvider>
    )
    expect(screen.getByText('stack')).toBeTruthy()
    await act(async () => {
      await fireEvent.press(screen.getByText('sign out'))
    })
    expect(screen.getByText('redirect:/login')).toBeTruthy()
    expect(screen.queryByText(/redirect=/)).toBeNull()
  })

  it('forgets the sign-out once the next session is signed in', async () => {
    useOwnSignOutStore.setState({ isOwn: true })
    setStatus('signed-in')
    await render(<AppLayout />)
    expect(useOwnSignOutStore.getState().isOwn).toBe(false)
  })

  it('leaves a catch-all segment out of the redirect', async () => {
    setStatus('signed-out')
    openAt('/docs/a/b', { rest: ['a', 'b'], tab: 'x' }, ['(app)', 'docs', '[...rest]'])
    await render(<AppLayout />)
    expect(
      screen.getByText(`redirect:/login?redirect=${encodeURIComponent('/docs/a/b?tab=x')}`)
    ).toBeTruthy()
  })

  it('carries no redirect for the root', async () => {
    setStatus('signed-out')
    openAt('/')
    await render(<AppLayout />)
    expect(screen.getByText('redirect:/login')).toBeTruthy()
  })

  it('leaves a token parameter out of the redirect', async () => {
    setStatus('signed-out')
    openAt('/tenants/acme', { slug: 'acme', token: 'secret', tab: ['x', 'y'] }, [
      '(app)',
      'tenants',
      '[slug]',
    ])
    await render(<AppLayout />)
    expect(
      screen.getByText(
        `redirect:/login?redirect=${encodeURIComponent('/tenants/acme?tab=x&tab=y')}`
      )
    ).toBeTruthy()
  })

  it('carries no redirect for a path safePath refuses', async () => {
    setStatus('signed-out')
    openAt('/auth/link', { tab: 'x' })
    await render(<AppLayout />)
    expect(screen.getByText('redirect:/login')).toBeTruthy()
  })

  it('redirects to /login when signed out', async () => {
    setStatus('signed-out')
    await render(<AppLayout />)
    expect(screen.getByText('redirect:/login')).toBeTruthy()
  })

  it('shows Signing you in, with a spinner, while restoring', async () => {
    setStatus('restoring')
    await render(<AppLayout />)
    expect(screen.getByRole('header', { name: 'Signing you in' })).toBeTruthy()
    const spinner = screen.getByTestId('session-spinner', { includeHiddenElements: true })
    expect(spinner.props.className).toContain('text-foreground')
  })

  it('shows passkey-required when the flag is set', async () => {
    setStatus('signed-in')
    usePasskeySetupStore.setState({ required: true })
    await render(<AppLayout />)
    expect(screen.getByText('redirect:/passkey-required')).toBeTruthy()
  })

  it('shows the stack when signed in with no flag', async () => {
    setStatus('signed-in')
    await render(<AppLayout />)
    expect(screen.getByText('stack')).toBeTruthy()
  })

  it('anchors the stack on the tabs', () => {
    expect(unstable_settings).toEqual({ anchor: '(tabs)' })
  })

  it('gives the screens above the tabs an empty-titled header with Back, and the tabs none', async () => {
    setStatus('signed-in')
    await render(<AppLayout />)
    expect(mockScreenOptions).toHaveBeenLastCalledWith({
      headerShown: true,
      headerTitle: '',
      headerBackButtonDisplayMode: 'minimal',
    })
    expect(mockScreens['(tabs)']).toEqual({ headerShown: false })
    expect(mockScreens['tenants/[slug]/[...rest]']).toEqual({ headerShown: false })
  })

  it('checks the session before the flag', async () => {
    setStatus('signed-out')
    usePasskeySetupStore.setState({ required: true })
    await render(<AppLayout />)
    expect(screen.getByText('redirect:/login')).toBeTruthy()
  })

  it('redirects nowhere during full maintenance, and keeps the stack', async () => {
    useMaintenanceModeStore.setState({ mode: 'full' })
    setStatus('signed-out')
    usePasskeySetupStore.setState({ required: true })
    await render(<AppLayout />)
    expect(screen.getByText('stack')).toBeTruthy()
    expect(screen.queryByText(/redirect:/)).toBeNull()
  })

  it('still redirects during read_only maintenance', async () => {
    useMaintenanceModeStore.setState({ mode: 'read_only' })
    setStatus('signed-out')
    await render(<AppLayout />)
    expect(screen.getByText('redirect:/login')).toBeTruthy()
  })

  it('mounts the notification stream once, beside the stack, only when signed in', async () => {
    setStatus('signed-in')
    await render(<AppLayout />)
    expect(screen.getAllByText('notification-stream')).toHaveLength(1)
    expect(screen.getByText('stack')).toBeTruthy()
  })

  it('mounts no notification stream while restoring, signed out or asked for a passkey', async () => {
    setStatus('restoring')
    const view = await render(<AppLayout />)
    expect(screen.queryByText('notification-stream')).toBeNull()
    setStatus('signed-out')
    await view.rerender(<AppLayout />)
    expect(screen.queryByText('notification-stream')).toBeNull()
    setStatus('signed-in')
    usePasskeySetupStore.setState({ required: true })
    await view.rerender(<AppLayout />)
    expect(screen.queryByText('notification-stream')).toBeNull()
  })
})

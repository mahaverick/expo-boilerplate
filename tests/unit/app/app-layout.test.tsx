import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react-native'
import { useGlobalSearchParams, usePathname } from 'expo-router'
import AppLayout from '@/app/(app)/_layout'
import { useSessionStatus } from '@/http/session-lifecycle'
import type { SessionStatus } from '@/http/session-lifecycle'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
    Stack: () => <Text>stack</Text>,
    usePathname: jest.fn(() => '/'),
    useGlobalSearchParams: jest.fn(() => ({})),
  }
})
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('@/http/session-lifecycle', () => ({ useSessionStatus: jest.fn(() => 'signed-in') }))

/**
 * Sets the session status the mocked hook reports.
 * @param status - The status to report.
 */
function setStatus(status: SessionStatus): void {
  jest.mocked(useSessionStatus).mockReturnValue(status)
}

beforeEach(() => {
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
 * @param params - The current query parameters.
 */
function openAt(path: string, params: Record<string, string | string[]> = {}): void {
  jest.mocked(usePathname).mockReturnValue(path)
  jest.mocked(useGlobalSearchParams).mockReturnValue(params)
}

describe('(app) layout', () => {
  it('sends a signed-out person to /login with the path they asked for', async () => {
    setStatus('signed-out')
    openAt('/tenants/acme', { tab: 'x' })
    await render(<AppLayout />)
    expect(
      screen.getByText(`redirect:/login?redirect=${encodeURIComponent('/tenants/acme?tab=x')}`)
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
    openAt('/tenants/acme', { token: 'secret', tab: ['x', 'y'] })
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
})

import { jest } from '@jest/globals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Pressable, Text, TextInput } from 'react-native'
import Home from '@/app/(app)/index'
import NotFound from '@/app/+not-found'
import Link from '@/app/auth/link'
import Login from '@/app/login'
import PasskeyRequired from '@/app/passkey-required'
import { SigningInScreen } from '@/components/auth/signing-in-screen'
import { MaintenanceScreen } from '@/components/shared/maintenance-screen'
import { UpdateScreen } from '@/components/shared/update-screen'
import { tenantsQueryOptions } from '@/queries/tenant.queries'
import { A11Y_SCREENS, assertAccessible, renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}))
jest.mock('@/http/session-lifecycle', () => ({ useSessionStatus: () => 'signed-out' }))

/** The query client the screens below share. */
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})
// Home reads the list from the cache, so the harness makes no request.
client.setQueryData(tenantsQueryOptions().queryKey, [])

/** The screens this app ships, each inside the query client its hooks need. */
const SCREENS: Array<[string, () => React.JSX.Element]> = [
  ['Login', () => <Login />],
  ['Link (dead link)', () => <Link />],
  ['Home', () => <Home />],
  ['Passkey required', () => <PasskeyRequired />],
  ['Not found', () => <NotFound />],
  ['Signing you in', () => <SigningInScreen />],
  ['Maintenance', () => <MaintenanceScreen message={null} since={null} />],
  ['Update the app', () => <UpdateScreen url="market://details?id=x" />],
]
for (const [name, screenElement] of SCREENS) {
  A11Y_SCREENS.push({
    name,
    element: <QueryClientProvider client={client}>{screenElement()}</QueryClientProvider>,
  })
}

describe('the accessibility harness', () => {
  it('accepts a screen with one header and a labelled pressable', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Go" onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).not.toThrow()
  })

  it('rejects a pressable with no label', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityRole="button" onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a disabled pressable with no label', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityRole="button" disabled onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a pressable with no role', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Pressable accessibilityLabel="Go" onPress={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a screen with two headers', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">One</Text>
        <Text accessibilityRole="header">Two</Text>
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a screen with no header', async () => {
    await renderWithProviders(<Text>Plain</Text>)
    expect(() => assertAccessible()).toThrow()
  })

  it('rejects a text input with no label', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <TextInput onChangeText={() => {}} />
      </>
    )
    expect(() => assertAccessible()).toThrow()
  })
})

describe('A11Y_SCREENS', () => {
  for (const { name, element } of A11Y_SCREENS) {
    it(`${name} is accessible`, async () => {
      await renderWithProviders(element)
      assertAccessible()
    })
  }

  it('is a list', () => {
    expect(Array.isArray(A11Y_SCREENS)).toBe(true)
  })
})

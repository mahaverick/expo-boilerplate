import { jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react-native'
import { router, type Href } from 'expo-router'
import { Text } from 'react-native'
import { SettingsRow } from '@/components/settings/settings-row'
import { assertAccessible, renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

/** A route for the row to open. */
const HREF = '/settings/account/profile' as Href

describe('SettingsRow', () => {
  it('shows the title and description, reads the description as a hint, and pushes its href', async () => {
    await renderWithProviders(<SettingsRow title="Profile" description="Your name." href={HREF} />)
    expect(screen.getByText('Profile')).toBeTruthy()
    expect(screen.getByText('Your name.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Profile' }).props.accessibilityHint).toBe('Your name.')
    await fireEvent.press(screen.getByRole('link', { name: 'Profile' }))
    expect(router.push).toHaveBeenCalledWith(HREF)
  })

  it('is accessible under a header', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Settings</Text>
        <SettingsRow title="Profile" description="Your name." href={HREF} />
      </>
    )
    assertAccessible()
  })
})

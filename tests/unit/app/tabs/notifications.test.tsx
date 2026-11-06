import { screen } from '@testing-library/react-native'
import Notifications from '@/app/(app)/(tabs)/notifications'
import { renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

describe('Notifications', () => {
  it('says they arrive in a later version', async () => {
    await renderWithProviders(<Notifications />)
    expect(screen.getByRole('header', { name: 'Notifications' })).toBeTruthy()
    expect(screen.getByText('Notifications are not in this version of the app.')).toBeTruthy()
  })
})

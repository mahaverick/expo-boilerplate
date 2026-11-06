import { screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { assertAccessible, renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

describe('Screen', () => {
  it('renders the title as the one header, with its children', async () => {
    await renderWithProviders(
      <Screen title="Sign in">
        <Text>Body</Text>
      </Screen>
    )
    expect(screen.getByRole('header', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByText('Body')).toBeTruthy()
    expect(() => assertAccessible()).not.toThrow()
  })

  it('pads by the safe-area insets', async () => {
    await renderWithProviders(<Screen title="Sign in">{null}</Screen>)
    expect(screen.getByTestId('screen').props.style).toMatchObject({
      paddingTop: 47,
      paddingBottom: 34,
    })
  })
})

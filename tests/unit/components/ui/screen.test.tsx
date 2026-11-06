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
    expect(screen.getByTestId('screen').props.contentContainerStyle).toMatchObject({
      paddingTop: 47,
      paddingBottom: 34,
    })
  })

  it('scrolls its content, and keeps taps while the keyboard is up', async () => {
    await renderWithProviders(
      <Screen title="Sign in">
        <Text>Body</Text>
      </Screen>
    )
    const scroller = screen.getByTestId('screen')
    expect(scroller.type).toBe('RCTScrollView')
    expect(scroller.props.keyboardShouldPersistTaps).toBe('handled')
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(() => assertAccessible()).not.toThrow()
  })
})

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

  it('scrolls its content, and keeps taps while the keyboard is up, when scroll is set', async () => {
    await renderWithProviders(
      <Screen title="Sign in" scroll>
        <Text>Body</Text>
      </Screen>
    )
    const scroller = screen.getByTestId('screen-scroll')
    expect(scroller.props.keyboardShouldPersistTaps).toBe('handled')
    expect(screen.getByText('Body')).toBeTruthy()
    expect(screen.getAllByRole('header')).toHaveLength(1)
    expect(() => assertAccessible()).not.toThrow()
  })

  it('does not scroll by default', async () => {
    await renderWithProviders(<Screen title="Home">{null}</Screen>)
    expect(screen.queryByTestId('screen-scroll')).toBeNull()
  })
})

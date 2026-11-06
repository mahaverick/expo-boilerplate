import { onlineManager } from '@tanstack/react-query'
import { screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { assertAccessible, renderWithProviders } from '@/tests/support/a11y'
import { afterEach, describe, expect, it } from '@/tests/support/runner'

afterEach(() => {
  onlineManager.setOnline(true)
})

describe('Screen', () => {
  it('adds no top padding under a header that takes the inset', async () => {
    await renderWithProviders(
      <Screen title="Pick" topInset={false}>
        {null}
      </Screen>
    )
    expect(screen.getByTestId('screen').props.contentContainerStyle).toMatchObject({
      paddingTop: 0,
      paddingBottom: 34,
    })
  })

  it('adds no bottom padding above a tab bar that takes the inset', async () => {
    await renderWithProviders(
      <Screen title="Pick" bottomInset={false}>
        {null}
      </Screen>
    )
    expect(screen.getByTestId('screen').props.contentContainerStyle).toMatchObject({
      paddingTop: 47,
      paddingBottom: 0,
    })
  })

  it('adds no top padding while a top banner shows, since the banner took it', async () => {
    onlineManager.setOnline(false)
    await renderWithProviders(<Screen title="Pick">{null}</Screen>)
    expect(screen.getByTestId('screen').props.contentContainerStyle).toMatchObject({
      paddingTop: 0,
    })
  })

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

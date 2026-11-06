import { jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react-native'
import { Button } from '@/components/ui/button'
import { renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

describe('Button', () => {
  it('exposes a button role, its label and a 44 point target', async () => {
    await renderWithProviders(<Button label="Continue" variant="primary" onPress={() => {}} />)
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button.props.className).toContain('min-h-11')
  })

  it('calls onPress', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<Button label="Go" variant="primary" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('ignores presses and reports disabled when disabled', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<Button label="Go" variant="primary" disabled onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Go' })
    await fireEvent.press(button)
    expect(onPress).not.toHaveBeenCalled()
    expect(button).toBeDisabled()
  })

  it('keeps the label, reports busy and ignores presses when loading', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<Button label="Go" variant="primary" loading onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Go' })
    await fireEvent.press(button)
    expect(onPress).not.toHaveBeenCalled()
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true })
  })

  it.each([
    ['primary', 'bg-primary', 'text-primary-foreground'],
    ['secondary', 'bg-secondary', 'text-secondary-foreground'],
    ['ghost', undefined, 'text-foreground'],
  ] as const)('maps %s to token classes', async (variant, background, text) => {
    await renderWithProviders(<Button label="Go" variant={variant} onPress={() => {}} />)
    const button = screen.getByRole('button', { name: 'Go' })
    if (background) expect(button.props.className).toContain(background)
    else expect(button.props.className).not.toContain('bg-')
    expect(screen.getByText('Go').props.className).toContain(text)
  })
})

import { jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react-native'
import { Switch } from '@/components/ui/switch'
import { renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

describe('Switch', () => {
  it('exposes its role, label and checked state', async () => {
    await renderWithProviders(<Switch label="Email" value onValueChange={() => {}} />)
    const control = screen.getByRole('switch', { name: 'Email' })
    expect(control.props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByText('Email')).toBeTruthy()
  })

  it('reports unchecked', async () => {
    await renderWithProviders(<Switch label="Email" value={false} onValueChange={() => {}} />)
    expect(screen.getByRole('switch', { name: 'Email' }).props.accessibilityState).toMatchObject({
      checked: false,
    })
  })

  it('calls onValueChange with the new value', async () => {
    const onValueChange = jest.fn()
    await renderWithProviders(<Switch label="Email" value={false} onValueChange={onValueChange} />)
    await fireEvent(screen.getByRole('switch', { name: 'Email' }), 'valueChange', true)
    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it('reports disabled', async () => {
    await renderWithProviders(<Switch label="Email" value disabled onValueChange={() => {}} />)
    expect(screen.getByRole('switch', { name: 'Email' }).props.accessibilityState).toMatchObject({
      disabled: true,
    })
  })
})

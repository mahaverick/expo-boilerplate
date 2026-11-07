import { screen } from '@testing-library/react-native'
import { TextField } from '@/components/ui/text-field'
import { renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

describe('TextField', () => {
  it('shows a visible label and labels the input with it', async () => {
    await renderWithProviders(<TextField label="Email" value="a@b.co" onChangeText={() => {}} />)
    expect(screen.getByText('Email')).toBeTruthy()
    const input = screen.getByLabelText('Email')
    expect(input.props.value).toBe('a@b.co')
    expect(input.props.className).toContain('min-h-12')
    expect(input.props.accessibilityHint).toBeUndefined()
  })

  it('shows the error inline and links it with the hint', async () => {
    await renderWithProviders(
      <TextField label="Email" value="" onChangeText={() => {}} error="Enter an email address." />
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Enter an email address.')).toBeTruthy()
    expect(screen.getByLabelText('Email').props.accessibilityHint).toBe('Enter an email address.')
  })

  it('passes other TextInput props through', async () => {
    await renderWithProviders(
      <TextField label="Email" value="" onChangeText={() => {}} keyboardType="email-address" />
    )
    expect(screen.getByLabelText('Email').props.keyboardType).toBe('email-address')
  })

  it('grows to about four lines and starts at the top when multiline', async () => {
    await renderWithProviders(
      <TextField label="About" value="" onChangeText={() => {}} multiline hint="Optional." />
    )
    const input = screen.getByLabelText('About')
    expect(input.props.multiline).toBe(true)
    expect(input.props.textAlignVertical).toBe('top')
    expect(input.props.className).toContain('min-h-32')
    expect(input.props.accessibilityHint).toBe('Optional.')
    expect(screen.getByText('About')).toBeTruthy()
  })
})

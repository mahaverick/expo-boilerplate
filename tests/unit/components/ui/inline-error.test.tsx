import { screen } from '@testing-library/react-native'
import { InlineError } from '@/components/ui/inline-error'
import { renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

describe('InlineError', () => {
  it('is an alert with a polite live region', async () => {
    await renderWithProviders(<InlineError message="Something broke." />)
    const alert = screen.getByRole('alert')
    expect(alert.props.accessibilityLiveRegion).toBe('polite')
    expect(screen.getByText('Something broke.')).toBeTruthy()
  })
})

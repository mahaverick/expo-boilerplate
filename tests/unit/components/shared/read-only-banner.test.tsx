import { fireEvent, screen } from '@testing-library/react-native'
import { ReadOnlyBanner } from '@/components/shared/read-only-banner'
import { renderWithProviders } from '@/tests/support/a11y'
import { describe, expect, it } from '@/tests/support/runner'

const SUMMARY = 'Maintenance is in progress: you can look around, but changes are paused.'

describe('ReadOnlyBanner', () => {
  it('says writes are paused and shows the message', async () => {
    await renderWithProviders(<ReadOnlyBanner message="Back at noon." />)
    expect(screen.getByText(SUMMARY)).toBeTruthy()
    expect(screen.getByText('Back at noon.')).toBeTruthy()
  })

  it('shows the default when no message is known', async () => {
    await renderWithProviders(<ReadOnlyBanner message={null} />)
    expect(screen.getByText('We’re carrying out scheduled maintenance.')).toBeTruthy()
  })

  it('toggles the details between Hide details and Show details', async () => {
    await renderWithProviders(<ReadOnlyBanner message="Back at noon." />)
    const hide = screen.getByRole('button', { name: 'Hide details' })
    await fireEvent.press(hide)
    expect(screen.queryByText('Back at noon.')).toBeNull()
    expect(screen.getByText(SUMMARY)).toBeTruthy()
    const show = screen.getByRole('button', { name: 'Show details' })
    await fireEvent.press(show)
    expect(screen.getByText('Back at noon.')).toBeTruthy()
  })
})

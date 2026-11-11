import { onlineManager } from '@tanstack/react-query'
import { act, screen } from '@testing-library/react-native'
import { OfflineBanner } from '@/components/shared/offline-banner'
import { renderWithProviders } from '@/tests/support/a11y'
import { afterEach, describe, expect, it } from '@/tests/support/runner'

afterEach(() => {
  onlineManager.setOnline(true)
})

describe('OfflineBanner', () => {
  it('renders nothing while online', async () => {
    onlineManager.setOnline(true)
    await renderWithProviders(<OfflineBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says so while offline, as an alert', async () => {
    onlineManager.setOnline(false)
    await renderWithProviders(<OfflineBanner />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(
      screen.getByText(
        'You’re offline, or the app can’t reach its server. It refreshes when the connection returns.'
      )
    ).toBeTruthy()
  })

  it('follows the network as it changes', async () => {
    await renderWithProviders(<OfflineBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
    await act(() => {
      onlineManager.setOnline(false)
    })
    expect(screen.getByRole('alert')).toBeTruthy()
    await act(() => {
      onlineManager.setOnline(true)
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

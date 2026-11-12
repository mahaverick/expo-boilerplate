import { onlineManager } from '@tanstack/react-query'
import { screen } from '@testing-library/react-native'
import { TopBanners } from '@/components/shared/top-banners'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { METRICS, renderWithProviders } from '@/tests/support/a11y'
import { afterEach, describe, expect, it } from '@/tests/support/runner'

afterEach(() => {
  onlineManager.setOnline(true)
  useMaintenanceModeStore.setState({ mode: 'off', message: null, since: null })
})

describe('TopBanners', () => {
  it('renders nothing while online and not read-only', async () => {
    await renderWithProviders(<TopBanners />)
    expect(screen.queryByText(/offline|Maintenance/)).toBeNull()
  })

  it('stacks offline above read-only, under one top inset', async () => {
    onlineManager.setOnline(false)
    useMaintenanceModeStore.setState({ mode: 'read_only', message: 'Back at noon.' })
    const view = await renderWithProviders(<TopBanners />)
    const offline = screen.getByText(
      'You’re offline, or the app can’t reach its server. It refreshes when the connection returns.'
    )
    const readOnly = screen.getByText(/Maintenance is in progress/)
    const text = JSON.stringify(view.toJSON())
    expect(text.indexOf('offline')).toBeLessThan(text.indexOf('Maintenance is in progress'))
    expect(offline).toBeTruthy()
    expect(readOnly).toBeTruthy()
    expect(text.split(`"paddingTop":${METRICS.insets.top}`)).toHaveLength(2)
  })

  it('shows read-only alone', async () => {
    useMaintenanceModeStore.setState({ mode: 'read_only' })
    await renderWithProviders(<TopBanners />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Maintenance is in progress/)).toBeTruthy()
  })
})

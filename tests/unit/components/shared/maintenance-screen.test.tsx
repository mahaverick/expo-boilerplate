import { jest } from '@jest/globals'
import { onlineManager } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react-native'
import { BackHandler, Text } from 'react-native'
import { MaintenanceGate, MaintenanceScreen } from '@/components/shared/maintenance-screen'
import { formatDateTime } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { renderScreen, restoreApi, serve } from '@/tests/support/api'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('@/http/session', () => ({
  ...jest.requireActual<typeof import('@/http/session')>('@/http/session'),
  ensureSession: jest.fn(() => Promise.resolve('token')),
}))

const SINCE = '2026-11-06T10:00:00Z'

beforeEach(() => {
  useMaintenanceModeStore.setState({ mode: 'off', message: null, since: null })
  queryClient.clear()
})

afterEach(() => {
  restoreApi()
  jest.restoreAllMocks()
})

describe('MaintenanceScreen', () => {
  it('takes the top inset while the device is offline, since it covers the banners', async () => {
    onlineManager.setOnline(false)
    try {
      await renderScreen(<MaintenanceScreen message={null} since={null} />)
      expect(screen.getByTestId('screen').props.contentContainerStyle).toMatchObject({
        paddingTop: 47,
      })
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('shows the title, the start, the message and the refresh note', async () => {
    await renderScreen(<MaintenanceScreen message="Back at noon." since={SINCE} />)
    expect(screen.getByRole('header', { name: 'Maintenance in progress' })).toBeTruthy()
    expect(screen.getByText(`Maintenance started ${formatDateTime(SINCE)}.`)).toBeTruthy()
    expect(screen.getByText('Back at noon.')).toBeTruthy()
    expect(screen.getByText('This screen refreshes when we’re back.')).toBeTruthy()
  })

  it('omits the start when it is unknown and falls back to the default message', async () => {
    await renderScreen(<MaintenanceScreen message={null} since={null} />)
    expect(screen.queryByText(/Maintenance started/)).toBeNull()
    expect(screen.getByText('We’re carrying out scheduled maintenance.')).toBeTruthy()
  })

  it('swallows the Android back button while shown', async () => {
    const add = jest.spyOn(BackHandler, 'addEventListener')
    await renderScreen(<MaintenanceScreen message={null} since={null} />)
    const handler = add.mock.calls.find(([name]) => name === 'hardwareBackPress')?.[1]
    expect(handler?.(undefined as never)).toBe(true)
  })
})

describe('MaintenanceGate', () => {
  it('keeps the children mounted and covers them in full', async () => {
    useMaintenanceModeStore.setState({ mode: 'full', message: 'm', since: SINCE })
    serve(() => ({
      status: 200,
      data: { success: true, data: { mode: 'full', message: 'm', since: SINCE } },
    }))
    await renderScreen(
      <MaintenanceGate>
        <Text>underneath</Text>
      </MaintenanceGate>
    )
    expect(screen.getByRole('header', { name: 'Maintenance in progress' })).toBeTruthy()
    expect(screen.getByText('underneath', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('underneath')).toBeNull()
  })

  it('shows no screen while off', async () => {
    serve(() => ({
      status: 200,
      data: { success: true, data: { mode: 'off', message: null, since: null } },
    }))
    await renderScreen(
      <MaintenanceGate>
        <Text>underneath</Text>
      </MaintenanceGate>
    )
    expect(screen.getByText('underneath')).toBeTruthy()
    expect(screen.queryByText('Maintenance in progress')).toBeNull()
  })

  it('the screen re-reads the status when the mode is not off and since is unknown', async () => {
    useMaintenanceModeStore.setState({ mode: 'full', message: null, since: null })
    const sent = serve(() => ({
      status: 200,
      data: { success: true, data: { mode: 'full', message: 'Back at noon.', since: SINCE } },
    }))
    await renderScreen(
      <MaintenanceGate>
        <Text>underneath</Text>
      </MaintenanceGate>
    )
    await waitFor(() => {
      expect(screen.getByText('Back at noon.')).toBeTruthy()
    })
    expect(sent.some((config) => config.url === '/status/maintenance')).toBe(true)
  })
})

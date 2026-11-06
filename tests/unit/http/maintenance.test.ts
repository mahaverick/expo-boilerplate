import { jest } from '@jest/globals'
import { waitFor } from '@testing-library/react-native'
import { AxiosError, type AxiosAdapter } from 'axios'
import { apiClient } from '@/http/client'
import { installMaintenanceRecovery, recoverFromMaintenance } from '@/http/maintenance'
import { ensureSession } from '@/http/session'
import { queryClient } from '@/lib/query-client'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('@/http/session', () => ({
  ...jest.requireActual<typeof import('@/http/session')>('@/http/session'),
  ensureSession: jest.fn(() => Promise.resolve('token')),
}))

/** The adapter `apiClient` had when this module loaded. */
const realAdapter = apiClient.defaults.adapter

/**
 * Answers every request with a status, headers and body.
 * @param status - The HTTP status.
 * @param headers - The response headers.
 * @param data - The body.
 */
function answer(status: number, headers: Record<string, string>, data: unknown): void {
  /** Resolves 2xx and rejects the rest, as axios does. */
  const adapter: AxiosAdapter = (config) => {
    const response = { data, status, statusText: '', headers, config }
    if (status < 300) return Promise.resolve(response)
    return Promise.reject(new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, response))
  }
  apiClient.defaults.adapter = adapter
}

/** Resets the store to `off`. */
function reset(): void {
  useMaintenanceModeStore.setState({ mode: 'off', message: null, since: null })
}

beforeEach(() => {
  reset()
  jest.mocked(ensureSession).mockClear()
})

afterEach(() => {
  apiClient.defaults.adapter = realAdapter
  reset()
  jest.restoreAllMocks()
  jest.mocked(ensureSession).mockResolvedValue('token')
})

describe('the maintenance interceptor', () => {
  it('feeds the store from the Maintenance-Mode header on success and on error', async () => {
    answer(200, { 'maintenance-mode': 'read_only' }, { success: true, data: null })
    await apiClient.get('/x')
    expect(useMaintenanceModeStore.getState().mode).toBe('read_only')

    answer(500, { 'Maintenance-Mode': 'full' }, { success: false })
    await expect(apiClient.get('/x')).rejects.toBeInstanceOf(AxiosError)
    expect(useMaintenanceModeStore.getState().mode).toBe('full')

    answer(200, { 'maintenance-mode': 'off' }, { success: true, data: null })
    await apiClient.get('/x')
    expect(useMaintenanceModeStore.getState().mode).toBe('off')
  })

  it('a 503 MAINTENANCE_MODE body sets full with its message', async () => {
    answer(
      503,
      {},
      {
        success: false,
        code: 'MAINTENANCE_MODE',
        message: 'Back at noon.',
        since: '2026-11-06T10:00:00Z',
      }
    )
    await expect(apiClient.get('/x')).rejects.toBeInstanceOf(AxiosError)
    expect(useMaintenanceModeStore.getState()).toMatchObject({
      mode: 'full',
      message: 'Back at noon.',
      since: '2026-11-06T10:00:00Z',
    })
  })

  it('a 503 READ_ONLY_MODE body sets read_only', async () => {
    answer(503, {}, { success: false, code: 'READ_ONLY_MODE', message: 'Writes paused.' })
    await expect(apiClient.get('/x')).rejects.toBeInstanceOf(AxiosError)
    expect(useMaintenanceModeStore.getState()).toMatchObject({
      mode: 'read_only',
      message: 'Writes paused.',
    })
  })

  it('ignores an unknown header value', async () => {
    useMaintenanceModeStore.setState({ mode: 'full', message: 'm', since: 's' })
    answer(200, { 'maintenance-mode': 'banana' }, { success: true, data: null })
    await apiClient.get('/x')
    expect(useMaintenanceModeStore.getState()).toMatchObject({ mode: 'full', message: 'm' })
  })
})

describe('recovery', () => {
  it('leaves full maintenance by refreshing the session and refetching', async () => {
    const order: string[] = []
    jest.mocked(ensureSession).mockImplementation(() => {
      order.push('ensureSession')
      return Promise.resolve('token')
    })
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => {
      order.push('invalidateQueries')
      return Promise.resolve()
    })
    const remove = installMaintenanceRecovery()
    useMaintenanceModeStore.setState({ mode: 'full' })
    expect(order).toEqual([])
    useMaintenanceModeStore.setState({ mode: 'off' })
    await waitFor(() => {
      expect(order).toEqual(['ensureSession', 'invalidateQueries'])
    })
    expect(invalidate).toHaveBeenCalledWith()
    remove()
  })

  it('also recovers from full to read_only, and not from off to read_only', async () => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    const remove = installMaintenanceRecovery()
    useMaintenanceModeStore.setState({ mode: 'read_only' })
    // The subscription runs synchronously, so a recovery would have called ensureSession already.
    expect(ensureSession).not.toHaveBeenCalled()
    useMaintenanceModeStore.setState({ mode: 'full' })
    useMaintenanceModeStore.setState({ mode: 'read_only' })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledTimes(1)
    })
    remove()
  })

  it('refetches even when the session refresh rejects', async () => {
    jest.mocked(ensureSession).mockRejectedValue(new Error('offline'))
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    await recoverFromMaintenance()
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
})

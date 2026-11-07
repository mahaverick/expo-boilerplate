/**
 * @file The root error boundary: its copy, its report and Try again.
 */
import { jest } from '@jest/globals'
import { fireEvent, screen } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { RootErrorBoundary } from '@/components/shared/root-error-boundary'
import { noteError } from '@/observability/errors/listen'
import { METRICS, renderWithProviders } from '@/tests/support/a11y'
import { beforeEach, describe, expect, it } from '@/tests/support/runner'

jest.mock('@/observability/errors/listen', () => ({ noteError: jest.fn() }))

const noted = jest.mocked(noteError)

beforeEach(() => {
  noted.mockReset()
})

describe('RootErrorBoundary', () => {
  it('shows the app hit a problem, with Try again, and no query client', async () => {
    await renderWithProviders(
      <RootErrorBoundary error={new Error('boom')} retry={() => Promise.resolve()} />
    )
    expect(screen.getByRole('header', { name: 'The app hit a problem' })).toBeTruthy()
    expect(screen.getByText('Try again, and if it keeps happening, restart the app.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('boom')).toBeNull()
  })

  it('reports the error once with origin react, as handled: the screen shows it', async () => {
    const error = new Error('boom')
    const view = await renderWithProviders(
      <RootErrorBoundary error={error} retry={() => Promise.resolve()} />
    )
    await view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <RootErrorBoundary error={error} retry={() => Promise.resolve()} />
      </SafeAreaProvider>
    )
    expect(noted.mock.calls).toEqual([[error, 'react', true]])
  })

  it('Try again calls retry', async () => {
    const retry = jest.fn(() => Promise.resolve())
    await renderWithProviders(<RootErrorBoundary error={new Error('boom')} retry={retry} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

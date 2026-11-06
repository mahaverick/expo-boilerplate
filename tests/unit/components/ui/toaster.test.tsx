import { jest } from '@jest/globals'
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Toaster } from '@/components/ui/toaster'
import { toast } from '@/lib/toast'
import { useTabBarStore } from '@/states/tab-bar.store'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { assertAccessible, renderWithProviders } from '@/tests/support/a11y'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

describe('Toaster', () => {
  // Inside the describe, so the tree unmounts before the global queue reset runs.
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(async () => {
    await cleanup()
    useToastQueueStore.setState({ toasts: [] })
    jest.useRealTimers()
  })

  it('sits 8 points above the bottom inset with no tab bar', async () => {
    useTabBarStore.setState({ height: 0 })
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.error('Failed')
    })
    const container = screen.getByTestId('toaster')
    expect(container.props.style).toMatchObject({ paddingBottom: 34 + 8 })
  })

  it('sits 8 points above the tab bar while a tab shows', async () => {
    useTabBarStore.setState({ height: 83 })
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.error('Failed')
    })
    const container = screen.getByTestId('toaster')
    expect(container.props.style).toMatchObject({ paddingBottom: 83 + 8 })
    useTabBarStore.setState({ height: 0 })
  })

  it('shows a success toast and hides it after 4 seconds', async () => {
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.success('Saved', { description: 'Your changes are in.' })
    })
    expect(screen.getByText('Saved')).toBeTruthy()
    expect(screen.getByText('Your changes are in.')).toBeTruthy()
    await act(() => {
      jest.advanceTimersByTime(3999)
    })
    expect(screen.getByText('Saved')).toBeTruthy()
    await act(() => {
      jest.advanceTimersByTime(1)
    })
    expect(screen.queryByText('Saved')).toBeNull()
    expect(useToastQueueStore.getState().toasts).toHaveLength(0)
  })

  it('hides a warning after 4 seconds', async () => {
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.warning('Careful')
    })
    await act(() => {
      jest.advanceTimersByTime(4000)
    })
    expect(screen.queryByText('Careful')).toBeNull()
  })

  it('an error toast stays until dismissed', async () => {
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.error('Could not save')
    })
    await act(() => {
      jest.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('Could not save')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Could not save')).toBeNull()
  })

  it('a toast with an id replaces the one with the same id and restarts the clock', async () => {
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.success('First', { id: 'x' })
    })
    await act(() => {
      jest.advanceTimersByTime(3000)
    })
    await act(() => {
      toast.success('Second', { id: 'x' })
    })
    expect(screen.queryByText('First')).toBeNull()
    expect(screen.getAllByText('Second')).toHaveLength(1)
    await act(() => {
      jest.advanceTimersByTime(3000)
    })
    expect(screen.getByText('Second')).toBeTruthy()
    await act(() => {
      jest.advanceTimersByTime(1000)
    })
    expect(screen.queryByText('Second')).toBeNull()
  })

  it('each toast is announced', async () => {
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.error('Broken')
      toast.success('Fine')
    })
    const alert = screen.getByRole('alert')
    expect(alert.props.accessibilityLiveRegion).toBe('polite')
    expect(screen.getByText('Broken')).toBeTruthy()
    const live = screen.container.queryAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite'
    )
    expect(live).toHaveLength(2)
  })

  it('Dismiss has a label', async () => {
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.success('Hi')
    })
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    expect(dismiss.props.accessibilityLabel).toBe('Dismiss')
  })

  it('dismisses only the toast it belongs to', async () => {
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.error('One', { id: 'one' })
      toast.error('Two', { id: 'two' })
    })
    const [first] = screen.getAllByRole('button', { name: 'Dismiss' })
    if (!first) throw new Error('no Dismiss button')
    await fireEvent.press(first)
    expect(screen.queryByText('One')).toBeNull()
    expect(screen.getByText('Two')).toBeTruthy()
  })

  it('keeps a toast with an action until it is dismissed or the action runs', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.success('Deleted', { action: { label: 'Undo', onPress } })
    })
    await act(() => {
      jest.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('Deleted')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Deleted')).toBeNull()
  })

  it('shows at most 3 toasts, newest last', async () => {
    await renderWithProviders(<Toaster />)
    await act(() => {
      for (const title of ['A', 'B', 'C', 'D']) toast.error(title)
    })
    expect(screen.queryByText('A')).toBeNull()
    const text = JSON.stringify(screen.toJSON())
    expect(text.indexOf('"B"')).toBeLessThan(text.indexOf('"C"'))
    expect(text.indexOf('"C"')).toBeLessThan(text.indexOf('"D"'))
  })

  it('clears its timers on unmount', async () => {
    const view = await renderWithProviders(<Toaster />)
    await act(() => {
      toast.success('Bye')
    })
    await view.unmount()
    await act(() => {
      jest.advanceTimersByTime(5000)
    })
    expect(useToastQueueStore.getState().toasts).toHaveLength(1)
  })

  it('passes touches through outside the toasts', async () => {
    await renderWithProviders(<Toaster />)
    await act(() => {
      toast.success('Hi')
    })
    const boxes = screen.container.queryAll((node) => node.props.pointerEvents === 'box-none')
    expect(boxes.length).toBeGreaterThan(0)
  })

  it('meets the accessibility contract', async () => {
    await renderWithProviders(
      <>
        <Text accessibilityRole="header">Title</Text>
        <Toaster />
      </>
    )
    await act(() => {
      toast.error('Broken', { action: { label: 'Retry', onPress: () => undefined } })
    })
    assertAccessible()
  })
})

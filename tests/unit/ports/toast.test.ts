import { toast } from '@/lib/toast'
import { useToastQueueStore } from '@/states/toast-queue.store'
import { describe, expect, it } from '@/tests/support/runner'

describe('toast', () => {
  it('queues a raised toast and empties the queue on dismiss', () => {
    toast.error('x')
    expect(useToastQueueStore.getState().toasts).toEqual([
      expect.objectContaining({ type: 'error', title: 'x' }),
    ])
    toast.dismiss()
    expect(useToastQueueStore.getState().toasts).toEqual([])
  })

  it('replaces a queued toast that has the same id', () => {
    toast.warning('first', { id: 'k' })
    toast.success('second', { id: 'k' })
    expect(useToastQueueStore.getState().toasts).toEqual([
      expect.objectContaining({ id: 'k', type: 'success', title: 'second' }),
    ])
  })

  it('dismisses one toast by id', () => {
    toast.error('keep', { id: 'a' })
    toast.error('drop', { id: 'b' })
    toast.dismiss('b')
    expect(useToastQueueStore.getState().toasts.map((queued) => queued.id)).toEqual(['a'])
  })
})

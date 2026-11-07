import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from '@/lib/toast'
import { writeFailureMessage } from '@/lib/write-failure'

/**
 * Raises a toast for each failed notification write. A write removes its row at
 * once, so the row's own mutation observer is gone before the answer arrives,
 * and TanStack skips the per-call `onError` of an observer with no listeners.
 * The mutation cache outlives the row, so the screen listens there. The shared
 * hooks key every inbox write with `['notifications', 'write']`.
 */
export function useNotificationWriteToasts(): void {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return
        const key = event.mutation.options.mutationKey
        if (key?.[0] !== 'notifications' || key[1] !== 'write') return
        toast.error(writeFailureMessage(event.action.error))
      }),
    [queryClient]
  )
}

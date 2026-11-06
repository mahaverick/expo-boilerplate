import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/ui/button'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { cn } from '@/lib/cn'
import { useTabBarStore } from '@/states/tab-bar.store'
import { type ToastType, useToastQueueStore } from '@/states/toast-queue.store'

/** How long a success or warning toast shows, in milliseconds. */
const AUTO_HIDE_MS = 4000

/** The most toasts shown at once. */
const VISIBLE_LIMIT = 3

/** The accent border of each toast type, from the design tokens. */
const ACCENT: Record<ToastType, string> = {
  success: 'border-success',
  error: 'border-destructive',
  warning: 'border-warning-strong',
}

/** The toast the queue holds, as the store types it. */
type QueuedToast = ReturnType<typeof useToastQueueStore.getState>['toasts'][number]

/**
 * One toast. Success and warning toasts without an action hide themselves
 * after `AUTO_HIDE_MS`; the others stay until dismissed. A replacement with
 * the same id restarts the clock, and unmounting clears it.
 * @param props - The toast.
 * @param props.item - The queued toast.
 * @returns The toast.
 */
function ToastItem({ item }: { item: QueuedToast }) {
  const remove = useToastQueueStore((state) => state.remove)
  const { id, type, action } = item
  const isAutoHidden = type !== 'error' && action === undefined

  useEffect(() => {
    if (!isAutoHidden) return
    const timer = setTimeout(() => {
      remove(id)
    }, AUTO_HIDE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [item, id, isAutoHidden, remove])

  return (
    <View className={cn('gap-2 rounded-md border-l-4 bg-card p-3 shadow-md', ACCENT[type])}>
      <View
        accessible
        accessibilityRole={type === 'error' ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
        className="gap-1"
      >
        <Text className="text-base font-medium text-card-foreground">{item.title}</Text>
        {item.description ? (
          <Text className="text-sm text-muted-foreground">{item.description}</Text>
        ) : null}
      </View>
      <View className="flex-row items-center justify-end gap-2">
        {action ? (
          <Button
            label={action.label}
            variant="secondary"
            onPress={() => {
              action.onPress()
              remove(id)
            }}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => {
            remove(id)
          }}
          className={cn(TOUCH_TARGET, 'items-center justify-center px-4')}
        >
          <Text className="text-base font-medium text-foreground">Dismiss</Text>
        </Pressable>
      </View>
    </View>
  )
}

/**
 * Renders the toast queue at the bottom of the screen, 8 points above the tab
 * bar while a tab shows, else above the bottom inset: the newest 3, newest
 * last. The tab bar's height already holds the bottom inset. The container passes touches through
 * everywhere but the toasts.
 * @returns The toasts, or nothing while the queue is empty.
 */
export function Toaster() {
  const toasts = useToastQueueStore((state) => state.toasts)
  const insets = useSafeAreaInsets()
  const tabBarHeight = useTabBarStore((state) => state.height)
  if (toasts.length === 0) return null
  return (
    <View
      testID="toaster"
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 gap-2 px-4"
      style={{
        paddingBottom: (tabBarHeight > 0 ? tabBarHeight : insets.bottom) + 8,
        paddingLeft: insets.left + 16,
        paddingRight: insets.right + 16,
      }}
    >
      {toasts.slice(-VISIBLE_LIMIT).map((item) => (
        <ToastItem key={item.id} item={item} />
      ))}
    </View>
  )
}

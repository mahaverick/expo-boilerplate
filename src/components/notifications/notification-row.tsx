import { router } from 'expo-router'
import { useRef } from 'react'
import { Pressable, Text, View } from 'react-native'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { RowButton } from '@/components/workspace-settings/row-button'
import { NEUTRAL_KINDS, neutralNoticeBody } from '@/copy/notifications'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { notificationHref } from '@/lib/notification-href'
import { humanizeNotificationType } from '@/lib/notification-type'
import { toast } from '@/lib/toast'
import { writeFailureMessage } from '@/lib/write-failure'
import {
  useDeleteNotification,
  useMarkRead,
  type Notification,
} from '@/queries/notification.queries'
import { useTenants } from '@/queries/tenant.queries'

/**
 * The name of the workspace a notification is about: the member list's name for
 * `metadata.slug`, or undefined when the slug or the list lacks it.
 * @param notification - The notification.
 * @param tenants - The caller's workspaces, or undefined while unread.
 * @returns The name, or undefined.
 */
function workspaceName(
  notification: Notification,
  tenants: ReturnType<typeof useTenants>['data']
): string | undefined {
  const slug = notification.metadata?.slug
  if (typeof slug !== 'string') return undefined
  return tenants?.find((entry) => entry.tenant.slug === slug)?.tenant.name
}

/**
 * One notification: its title, an Unread mark, the body, the kind and time, a
 * link to where it leads and its two buttons. A neutral kind shows the app's
 * own title and line, never the server's. The buttons ignore presses while
 * their request runs.
 * @param props - The notification.
 * @param props.notification - The row.
 * @returns The row.
 */
export function NotificationRow({ notification }: { notification: Notification }) {
  const tenants = useTenants().data
  const markRead = useMarkRead()
  const remove = useDeleteNotification()
  const neutral = NEUTRAL_KINDS.has(notification.type)
  const kind = humanizeNotificationType(notification.type)
  const title = neutral ? kind : notification.title
  const body =
    (neutral
      ? neutralNoticeBody(notification.type, workspaceName(notification, tenants))
      : undefined) ?? notification.body
  const unread = notification.readAt === null
  const target = notificationHref(notification)
  const busy = markRead.isPending || remove.isPending
  const inFlight = useRef(false)
  /**
   * Starts a request unless one from this row is still running. The query
   * state updates a tick after a press, so the flag closes that gap.
   * @param start - Sends the request with these callbacks.
   */
  const send = (
    start: (callbacks: { onError: (error: Error) => void; onSettled: () => void }) => void
  ) => {
    if (inFlight.current) return
    inFlight.current = true
    start({
      onError: (error) => {
        toast.error(writeFailureMessage(error))
      },
      onSettled: () => {
        inFlight.current = false
      },
    })
  }

  return (
    <View
      testID={`notification-${notification.id}`}
      className={cn('gap-1 border-b border-border py-3', unread && 'bg-muted')}
    >
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-base font-medium text-foreground">{title}</Text>
        {unread ? (
          <Text className="rounded-full border border-border px-2 text-xs text-muted-foreground">
            Unread
          </Text>
        ) : null}
      </View>
      <Text className="text-base text-foreground">{body}</Text>
      <Text className="text-sm text-muted-foreground">
        {kind} · {formatDateTime(notification.createdAt) ?? 'Unknown'}
      </Text>
      {target ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={target.label}
          onPress={() => {
            router.push(target.href)
          }}
          className={cn(TOUCH_TARGET, 'justify-center')}
        >
          <Text className="text-base text-foreground underline">{target.label}</Text>
        </Pressable>
      ) : null}
      <View className="flex-row flex-wrap gap-2 pt-1">
        {unread ? (
          <RowButton
            label={`Mark "${title}" as read`}
            text="Mark read"
            disabled={busy}
            onPress={() => {
              send((callbacks) => {
                markRead.mutate(notification.id, callbacks)
              })
            }}
          />
        ) : null}
        <RowButton
          label={`Delete "${title}"`}
          text="Delete"
          destructive
          disabled={busy}
          onPress={() => {
            send((callbacks) => {
              remove.mutate(notification.id, callbacks)
            })
          }}
        />
      </View>
    </View>
  )
}

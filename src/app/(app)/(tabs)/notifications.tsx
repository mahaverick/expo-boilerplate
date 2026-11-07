import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { NotificationRow } from '@/components/notifications/notification-row'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { TextField } from '@/components/ui/text-field'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { NOTIFICATIONS_ERROR, NOTIFICATIONS_MORE_ERROR } from '@/copy/notifications'
import { useListPages } from '@/hooks/use-list-pages'
import { useNotificationWriteToasts } from '@/hooks/use-notification-write-toasts'
import { cn } from '@/lib/cn'
import {
  notificationsListOptions,
  useMarkAllRead,
  useUnreadCount,
} from '@/queries/notification.queries'
import { cleanSearch } from '@/schemas/list-request.schemas'
import { LIST_SEARCH_DEBOUNCE_MS, type ListRequest } from '@/types/list.types'

/** The status choices: the chip's key, its label and the `unread` filter it sends. */
const STATUS_CHOICES = [
  { key: 'all', label: 'All', unread: undefined },
  { key: 'unread', label: 'Unread', unread: true },
  { key: 'read', label: 'Read', unread: false },
] as const

/** A status choice's key. */
type StatusKey = (typeof STATUS_CHOICES)[number]['key']

/**
 * The Notifications tab: everything the account has been sent, newest first,
 * with search, a status filter, "Load more", Mark all read, and per-row Mark
 * read and Delete. A failed first page shows `LoadError`, never the empty
 * state; a failed refetch keeps the rows. The tab keeps its own top inset and
 * leaves the bottom one to the tab bar.
 * @returns The screen.
 */
export default function Notifications() {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusKey>('all')
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(cleanSearch(text))
    }, LIST_SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [text])

  const unread = STATUS_CHOICES.find((choice) => choice.key === status)?.unread
  const request: ListRequest = {}
  if (search !== '') request.search = search
  if (unread !== undefined) request.unread = unread
  const filtered = search !== '' || unread !== undefined
  const list = useListPages(
    (listRequest) => notificationsListOptions(listRequest),
    request,
    (row) => row.id
  )
  const count = useUnreadCount().data
  const markAll = useMarkAllRead()
  useNotificationWriteToasts()
  const markingAll = useRef(false)

  let body
  if (list.isError) {
    body = <LoadError message={NOTIFICATIONS_ERROR} onRetry={list.retry} />
  } else if (list.isPending) {
    body = <ActivityIndicator accessibilityLabel="Loading notifications" />
  } else if (list.items.length === 0) {
    body = filtered ? (
      <EmptyState
        title="Nothing matches these filters."
        action={
          <Button
            variant="secondary"
            label="Reset"
            onPress={() => {
              setText('')
              setSearch('')
              setStatus('all')
            }}
          />
        }
      />
    ) : (
      <EmptyState title="You have no notifications." />
    )
  } else {
    body = (
      <View>
        {list.items.map((row) => (
          <NotificationRow key={row.id} notification={row} />
        ))}
        {list.loadMoreFailed ? (
          <LoadError message={NOTIFICATIONS_MORE_ERROR} onRetry={list.retry} />
        ) : null}
        {list.hasNext && !list.loadMoreFailed ? (
          <Button
            variant="secondary"
            label="Load more"
            loading={list.isLoadingMore}
            onPress={list.loadMore}
          />
        ) : null}
      </View>
    )
  }

  return (
    <Screen title="Notifications" bottomInset={false}>
      <View className="gap-1">
        <Text className="text-base text-muted-foreground">
          Everything this account has been sent, newest first.
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Notification settings"
          onPress={() => {
            router.push('/settings/account/notifications')
          }}
          className={cn(TOUCH_TARGET, 'justify-center')}
        >
          <Text className="text-base text-foreground underline">Notification settings</Text>
        </Pressable>
      </View>
      <Button
        variant="secondary"
        label="Mark all read"
        disabled={count === undefined || count.count === 0}
        loading={markAll.isPending}
        onPress={() => {
          // The button's busy state lands a tick after the press; the ref closes the gap.
          if (markingAll.current) return
          markingAll.current = true
          markAll.mutate(undefined, {
            onSettled: () => {
              markingAll.current = false
            },
          })
        }}
      />
      <TextField
        label="Search notifications"
        placeholder="Search by title or text"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Status"
        className="flex-row flex-wrap gap-2"
      >
        {STATUS_CHOICES.map((choice) => {
          const checked = choice.key === status
          return (
            <Pressable
              key={choice.key}
              accessibilityRole="radio"
              accessibilityLabel={choice.label}
              accessibilityState={{ checked }}
              onPress={() => {
                setStatus(choice.key)
              }}
              className={cn(
                TOUCH_TARGET,
                'justify-center rounded-md border border-input px-3',
                checked && 'border-primary'
              )}
            >
              <Text className="text-base text-foreground">{choice.label}</Text>
            </Pressable>
          )
        })}
      </View>
      {body}
    </Screen>
  )
}

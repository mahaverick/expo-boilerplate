import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { TextField } from '@/components/ui/text-field'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { MissingWorkspace } from '@/components/workspaces/missing-workspace'
import { PlatformAccessBanner } from '@/components/workspaces/platform-access-banner'
import { APP_NAME } from '@/constants/app'
import { actorName, auditSentence } from '@/constants/audit-actions'
import { canViewActivity } from '@/constants/roles'
import { useListPages } from '@/hooks/use-list-pages'
import { statusFrom } from '@/lib/api-error'
import { auditTargetLabel } from '@/lib/audit-targets'
import { cn } from '@/lib/cn'
import { absoluteTime, relativeTime } from '@/lib/relative-time'
import { ROLE_ERROR } from '@/lib/role-error'
import { tenantAuditListOptions } from '@/queries/audit.queries'
import { tenantKeys, useMyRole, useTenant } from '@/queries/tenant.queries'
import { cleanSearch } from '@/schemas/list-request.schemas'
import type { AuditEntry } from '@/types/api.types'
import { LIST_SEARCH_DEBOUNCE_MS, type ListRequest } from '@/types/list.types'

/** What a reader who is not an owner or admin sees. */
const NOT_ALLOWED = 'Only this workspace’s owners and admins can see its activity.'

/** What a failed log says. */
const ACTIVITY_ERROR =
  'We couldn’t load the activity, so none is listed. Select Try again to load it.'

/** What a failed later page says. */
const MORE_ERROR = 'We couldn’t load more activity. Select Try again to load it.'

/** The access choices: the filter's value (empty for all) and its label. */
const ACCESS_CHOICES = [
  { value: '', label: 'All' },
  { value: 'platform', label: `Staff (${APP_NAME} support)` },
  { value: 'member', label: 'Member' },
  { value: 'system', label: 'System' },
] as const

/**
 * One log entry: what happened, who did it, when and to what.
 * @param props - The entry.
 * @param props.entry - The audit entry.
 * @returns The row.
 */
function ActivityRow({ entry }: { entry: AuditEntry }) {
  return (
    <View testID={`activity-${entry.id}`} className="gap-1 border-b border-border py-3">
      <Text className="text-base text-foreground">{auditSentence(entry)}</Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-medium text-foreground">{actorName(entry.actor)}</Text>
        {entry.access === 'platform' ? (
          <Text className="rounded-full border border-border px-2 text-xs text-muted-foreground">
            Staff
          </Text>
        ) : null}
      </View>
      <Text className="text-sm text-muted-foreground">
        {absoluteTime(entry.occurredAt)} · {relativeTime(entry.occurredAt)}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {entry.target ? auditTargetLabel(entry.target.type) : '—'}
      </Text>
    </View>
  )
}

/**
 * The log with its search and access filter. A 403 means the role that passed
 * the gate no longer qualifies, so the workspace read is refreshed (`exact`,
 * or the log under the same prefix would refetch and 403 again).
 * @param props - The workspace.
 * @param props.slug - The workspace's web address.
 * @returns The log.
 */
function ActivityLog({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [access, setAccess] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(cleanSearch(text))
    }, LIST_SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [text])

  const request: ListRequest = {}
  if (search !== '') request.search = search
  if (access !== '') request.access = access
  const log = useListPages(
    (listRequest) => tenantAuditListOptions(slug, listRequest),
    request,
    (entry) => entry.id
  )
  const forbidden = log.isError && statusFrom(log.error) === 403
  useEffect(() => {
    if (forbidden) {
      void queryClient.invalidateQueries({ queryKey: tenantKeys.detail(slug), exact: true })
    }
  }, [forbidden, slug, queryClient])
  if (forbidden) return <Text className="text-base text-muted-foreground">{NOT_ALLOWED}</Text>

  let body
  if (log.isError) {
    body = <LoadError message={ACTIVITY_ERROR} onRetry={log.retry} />
  } else if (log.isPending) {
    body = <ActivityIndicator accessibilityLabel="Loading activity" />
  } else if (log.items.length === 0) {
    body = (
      <Text className="text-base font-medium text-foreground">
        Nothing has happened in this workspace yet.
      </Text>
    )
  } else {
    body = (
      <View>
        {log.items.map((entry) => (
          <ActivityRow key={entry.id} entry={entry} />
        ))}
        {log.loadMoreFailed ? <LoadError message={MORE_ERROR} onRetry={log.retry} /> : null}
        {log.hasNext && !log.loadMoreFailed ? (
          <Button
            variant="secondary"
            label="Load more"
            loading={log.isLoadingMore}
            onPress={log.loadMore}
          />
        ) : null}
      </View>
    )
  }
  return (
    <View className="gap-3">
      <TextField
        label="Search activity"
        placeholder="Search by email or action"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Access"
        className="flex-row flex-wrap gap-2"
      >
        {ACCESS_CHOICES.map((choice) => {
          const checked = choice.value === access
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityLabel={choice.label}
              accessibilityState={{ checked }}
              onPress={() => {
                setAccess(choice.value)
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
    </View>
  )
}

/**
 * Settings, Workspace, Activity: the workspace's audit log, newest first.
 * Owners and admins (by effective role) see it; everyone else sees a note and
 * no request is made. A 404 shows `MissingWorkspace`; a failed role read with
 * nothing loaded shows `ROLE_ERROR`.
 * @returns The screen.
 */
export default function WorkspaceActivity() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const tenant = useTenant(slug)
  const { role, isPending, isError, retry } = useMyRole(slug)
  if (tenant.data === null) return <MissingWorkspace slug={slug} topInset={false} />
  let body
  if (tenant.data === undefined && isError) {
    body = <LoadError message={ROLE_ERROR} onRetry={retry} />
  } else if (isPending || role === undefined) {
    body = <ActivityIndicator accessibilityLabel="Loading workspace" />
  } else if (!canViewActivity(role)) {
    body = <Text className="text-base text-muted-foreground">{NOT_ALLOWED}</Text>
  } else {
    body = (
      <View className="gap-3 rounded-lg border border-border p-4">
        <Text className="text-base text-muted-foreground">
          Changes made by {APP_NAME} support staff are marked Staff.
        </Text>
        <ActivityLog slug={slug} />
      </View>
    )
  }
  return (
    <Screen title="Activity" topInset={false}>
      <PlatformAccessBanner slug={slug} />
      {body}
    </Screen>
  )
}

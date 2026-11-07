import { ActivityIndicator, Text, View } from 'react-native'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadError } from '@/components/shared/load-error'
import { Screen } from '@/components/ui/screen'
import { Switch } from '@/components/ui/switch'
import { notificationTypeLabel } from '@/copy/notifications'
import { toast } from '@/lib/toast'
import { writeFailureMessage } from '@/lib/write-failure'
import {
  usePreferences,
  useUpdatePreferences,
  type NotificationPreference,
} from '@/queries/notification.queries'

/** The types sent in-app only. The API lets their email flag be stored either way. */
const IN_APP_ONLY_TYPES: ReadonlySet<string> = new Set(['workspace_full'])

/** What the screen says under its title. */
const INTRO =
  'How each kind of notification reaches you. Email can’t be turned off for a kind that sends it; the in-app copy can.'

/** What a failed load says. */
const PREFERENCES_ERROR =
  'We couldn’t load your notification preferences, so none are shown. Select Try again to load them.'

/**
 * One notification type. Email is read-only text; the in-app copy is a switch.
 * Each flip sends the whole entry: `emailEnabled: true` for a type that sends
 * email (the API refuses `false`), and the stored value for an in-app-only
 * type. While the write is pending the switch is disabled and shows the
 * requested value. After it settles, the refetched server value shows. A
 * failure toasts the API’s message.
 * @param props - The preference.
 * @param props.preference - The type’s stored channels.
 * @returns The row.
 */
function PreferenceRow({ preference }: { preference: NotificationPreference }) {
  const update = useUpdatePreferences()
  const label = notificationTypeLabel(preference.notificationType)
  const inAppOnly = IN_APP_ONLY_TYPES.has(preference.notificationType)
  const email = inAppOnly ? 'Never sent' : preference.emailEnabled ? 'On' : 'Off'
  const inAppEnabled = update.isPending ? update.variables.inAppEnabled : preference.inAppEnabled

  return (
    <View className="gap-1 border-b border-border py-2">
      <Text className="text-base font-medium text-foreground">{label}</Text>
      <Text className="text-sm text-muted-foreground">Email: {email}</Text>
      <Switch
        label={`${label}: In-app`}
        value={inAppEnabled}
        disabled={update.isPending}
        onValueChange={(next) => {
          update.mutate(
            {
              notificationType: preference.notificationType,
              emailEnabled: inAppOnly ? preference.emailEnabled : true,
              inAppEnabled: next,
            },
            { onError: (error) => toast.error(writeFailureMessage(error)) }
          )
        }}
      />
    </View>
  )
}

/**
 * Settings, Notifications: how each notification type reaches the person. It
 * shows a spinner while loading and `LoadError` when the load fails with
 * nothing to show, never the empty state.
 * @returns The screen.
 */
export default function Notifications() {
  const preferences = usePreferences()
  let body
  if (preferences.data !== undefined) {
    body =
      preferences.data.length === 0 ? (
        <EmptyState title="This account has no notification types yet." />
      ) : (
        <View>
          {preferences.data.map((preference) => (
            <PreferenceRow key={preference.notificationType} preference={preference} />
          ))}
        </View>
      )
  } else if (preferences.isError) {
    body = (
      <LoadError
        message={PREFERENCES_ERROR}
        onRetry={() => {
          void preferences.refetch()
        }}
      />
    )
  } else {
    body = <ActivityIndicator accessibilityLabel="Loading your notification preferences" />
  }
  return (
    <Screen title="Notifications" topInset={false}>
      <Text className="text-base text-muted-foreground">{INTRO}</Text>
      {body}
    </Screen>
  )
}

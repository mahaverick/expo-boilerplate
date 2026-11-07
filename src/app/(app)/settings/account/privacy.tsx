import * as WebBrowser from 'expo-web-browser'
import { Pressable, Text } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { Switch } from '@/components/ui/switch'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { cn } from '@/lib/cn'
import { privacyPolicyUrl } from '@/lib/privacy-policy'
import { toast } from '@/lib/toast'
import { writeFailureMessage } from '@/lib/write-failure'
import { isAnalyticsAvailable } from '@/observability/telemetry/config'
import { useUpdateAnalyticsOptOut } from '@/queries/profile.queries'
import { useAuthStore } from '@/states/auth.store'

/** What the switch does, in the person's words. */
const ANALYTICS_DESCRIPTION =
  'Which screens you open and what you tap, with names and email addresses masked, so we can improve this app. Turning it off stops this on this device; the actions you take are still recorded on our servers.'

/**
 * Settings, Privacy: the "Share usage analytics" switch and the link to the
 * privacy policy. The switch shows only when the build can run analytics, and
 * is on only when the stored profile says `analyticsOptOut` is false, so a
 * missing value reads as off. The link shows only when the build names a
 * policy, and opens it in an in-app browser. While the write is pending the
 * switch is disabled and shows the requested value. A failure toasts the
 * API's message and the switch returns to the stored value.
 * @returns The screen.
 */
export default function Privacy() {
  const user = useAuthStore((state) => state.user)
  const update = useUpdateAnalyticsOptOut()
  const policyUrl = privacyPolicyUrl()
  const stored = user?.analyticsOptOut === false
  const sharing = update.isPending ? !update.variables : stored

  return (
    <Screen title="Privacy" topInset={false}>
      {isAnalyticsAvailable() ? (
        <>
          <Switch
            label="Share usage analytics"
            value={sharing}
            disabled={update.isPending}
            onValueChange={(next) => {
              update.mutate(!next, {
                onSuccess: () =>
                  toast.success(next ? 'Usage analytics on.' : 'Usage analytics off.'),
                onError: (error) => toast.error(writeFailureMessage(error)),
              })
            }}
          />
          <Text className="text-sm text-muted-foreground">{ANALYTICS_DESCRIPTION}</Text>
        </>
      ) : null}
      {policyUrl ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Read our privacy policy"
          onPress={() => {
            WebBrowser.openBrowserAsync(policyUrl).catch(() => {})
          }}
          className={cn(TOUCH_TARGET, 'justify-center')}
        >
          <Text className="text-base font-medium text-foreground underline">
            Read our privacy policy
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  )
}

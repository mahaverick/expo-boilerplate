import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { STEP_UP_WAITING_LABEL, useStepUp, useStepUpWaiting } from '@/hooks/use-step-up'
import { messageFrom } from '@/lib/api-error'
import { formatDate } from '@/lib/format'
import { relativeTime } from '@/lib/relative-time'
import { isReauthRequired, stepUpRefusal } from '@/lib/step-up'
import { toast } from '@/lib/toast'
import { useAuthProviders, useRevokeOtherSessions } from '@/queries/auth.queries'
import { sessionKeys, useSessions, type SignedInSession } from '@/queries/sessions.queries'
import { useAuthStore } from '@/states/auth.store'

/** What a failed methods load says. */
const PROVIDERS_ERROR = 'We couldn’t load your sign-in methods. Select Try again to load them.'

/** What a failed devices load says. */
const SESSIONS_ERROR = 'We couldn’t load your signed-in devices. Select Try again to load them.'

/** Display names by provider id. An id not listed shows as itself. */
const PROVIDER_LABELS: Record<string, string> = { google: 'Google' }

/**
 * The toast after other sessions were signed out.
 * @param revoked - How many sessions the API ended.
 * @returns The sentence.
 */
function revokedMessage(revoked: number): string {
  if (revoked === 0) return 'You have no other sessions.'
  return `Signed out ${String(revoked)} other ${revoked === 1 ? 'session' : 'sessions'}.`
}

/**
 * A device’s row label: its name, else "Web browser" for a web session, else
 * "Unknown device".
 * @param session - The session.
 * @returns The label.
 */
function deviceLabel(session: SignedInSession): string {
  if (session.deviceName !== null && session.deviceName !== '') return session.deviceName
  return session.client === 'web' ? 'Web browser' : 'Unknown device'
}

/**
 * The sign-in methods: the email link first, then each other linked method.
 * A failed load shows `LoadError`.
 * @returns The block.
 */
function SignInMethods() {
  const providers = useAuthProviders()
  const email = useAuthStore((state) => state.user?.email)
  let body
  if (providers.data !== undefined) {
    const others = providers.data.providers.filter((link) => link.provider !== 'email')
    body = (
      <View className="gap-1">
        <Text className="text-base text-foreground">
          {email ? `Email link (${email})` : 'Email link'}
        </Text>
        {others.map((link) => (
          <Text key={link.provider} className="text-base text-foreground">
            {PROVIDER_LABELS[link.provider] ?? link.provider}
          </Text>
        ))}
      </View>
    )
  } else if (providers.isError) {
    body = (
      <LoadError
        message={PROVIDERS_ERROR}
        onRetry={() => {
          void providers.refetch()
        }}
      />
    )
  } else {
    body = <ActivityIndicator accessibilityLabel="Loading your sign-in methods" />
  }
  return (
    <View className="gap-2">
      <Text className="text-lg font-semibold text-foreground">Sign-in methods</Text>
      {body}
    </View>
  )
}

/**
 * One signed-in device. The name is row text only, never a label.
 * @param props - The session.
 * @param props.session - The device.
 * @returns The row.
 */
function DeviceRow({ session }: { session: SignedInSession }) {
  const signedIn = formatDate(session.createdAt, 'medium')
  return (
    <View className="gap-1 border-b border-border py-2">
      <Text testID="device-name" className="text-base font-medium text-foreground">
        {deviceLabel(session)}
      </Text>
      {session.current ? <Text className="text-sm text-foreground">This device</Text> : null}
      <Text className="text-sm text-muted-foreground">
        Last active {relativeTime(session.lastUsedAt)}
      </Text>
      {signedIn === null ? null : (
        <Text className="text-sm text-muted-foreground">Signed in {signedIn}</Text>
      )}
    </View>
  )
}

/**
 * The signed-in devices, in the API’s order. A failed load shows `LoadError`,
 * never an empty list.
 * @returns The block.
 */
function Devices() {
  const sessions = useSessions()
  let body
  if (sessions.data !== undefined) {
    body = (
      <View>
        {sessions.data.map((session) => (
          <DeviceRow key={session.id} session={session} />
        ))}
      </View>
    )
  } else if (sessions.isError) {
    body = (
      <LoadError
        message={SESSIONS_ERROR}
        onRetry={() => {
          void sessions.refetch()
        }}
      />
    )
  } else {
    body = <ActivityIndicator accessibilityLabel="Loading your signed-in devices" />
  }
  return (
    <View className="gap-2">
      <Text className="text-lg font-semibold text-foreground">Signed-in devices</Text>
      {body}
    </View>
  )
}

/**
 * "Sign out other devices". The write needs a recent sign-in, so it runs
 * through `useStepUp().run`. It refreshes the devices list on success. A ref
 * guard keeps two presses in one frame from starting two runs.
 * @returns The block.
 */
function SignOutOthers() {
  const revoke = useRevokeOtherSessions()
  const { run } = useStepUp()
  const waiting = useStepUpWaiting()
  const queryClient = useQueryClient()
  /** Set from a run's start until it settles. */
  const inFlight = useRef(false)
  return (
    <View className="gap-2">
      <Text className="text-base text-muted-foreground">
        This signs out every other device and browser. You stay signed in on this phone.
      </Text>
      <Button
        variant="secondary"
        label={waiting ? STEP_UP_WAITING_LABEL : 'Sign out other devices'}
        loading={revoke.isPending || waiting}
        onPress={() => {
          if (inFlight.current) return
          inFlight.current = true
          run(() => revoke.mutateAsync())
            .then(
              ({ revoked }) => {
                toast.success(revokedMessage(revoked))
                void queryClient.invalidateQueries({ queryKey: sessionKeys.all })
              },
              (error: unknown) => {
                toast.error(isReauthRequired(error) ? stepUpRefusal(error) : messageFrom(error))
              }
            )
            .finally(() => {
              inFlight.current = false
            })
        }}
      />
    </View>
  )
}

/**
 * Settings, Security: sign-in methods, signed-in devices, and signing out
 * every other device.
 * @returns The screen.
 */
export default function Security() {
  return (
    <Screen title="Security" topInset={false}>
      <SignInMethods />
      <Devices />
      <SignOutOthers />
    </Screen>
  )
}

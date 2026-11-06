import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { BackHandler, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { useMaintenanceMode } from '@/http/maintenance'
import { formatDateTime } from '@/lib/format'
import { maintenanceStatusKey, useMaintenanceStatus } from '@/queries/maintenance-status.queries'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'

/** What the screen and the banner say when the owner's message has not arrived. */
export const DEFAULT_MAINTENANCE_MESSAGE = 'We’re carrying out scheduled maintenance.'

/**
 * The screen that covers the app while maintenance is `full`. The owner's
 * message is text, never markup. It ignores the Android back button, and
 * nothing here navigates: the stack underneath keeps its place.
 * @param props - What the API said about the period.
 * @param props.message - The owner's message, or `null`.
 * @param props.since - When the period began (ISO 8601), or `null`.
 * @returns The screen.
 */
export function MaintenanceScreen({
  message,
  since,
}: {
  message: string | null
  since: string | null
}) {
  const started = since ? formatDateTime(since) : null
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => {
      subscription.remove()
    }
  }, [])
  return (
    <Screen title="Maintenance in progress">
      {started && (
        <Text className="text-base text-muted-foreground">Maintenance started {started}.</Text>
      )}
      <Text className="text-base text-foreground">{message ?? DEFAULT_MAINTENANCE_MESSAGE}</Text>
      <Text className="text-base text-muted-foreground">
        This screen refreshes when we’re back.
      </Text>
    </Screen>
  )
}

/**
 * Wraps the app. It reads the maintenance status while the app is open, and
 * reads it again when a header switched the mode on without its start time or
 * message, cancelling an older read so its answer cannot revert the mode. In
 * `full` it draws the maintenance screen over `children` and hides them from
 * screen readers. The children stay mounted, so the person keeps their place.
 * @param props - The app underneath.
 * @param props.children - The app.
 * @returns The app, with the screen over it in `full`.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { refetch } = useMaintenanceStatus()
  const queryClient = useQueryClient()
  const mode = useMaintenanceMode()
  const message = useMaintenanceModeStore((state) => state.message)
  const since = useMaintenanceModeStore((state) => state.since)

  useEffect(() => {
    if (mode === 'off' || since !== null) return
    let isCancelled = false
    // `cancelRefetch` only cancels a read that has data already; the first read has none.
    void queryClient.cancelQueries({ queryKey: maintenanceStatusKey }).then(() => {
      if (!isCancelled) void refetch({ cancelRefetch: true })
    })
    return () => {
      isCancelled = true
      // A read sent before a header turned the mode off would put the old mode back.
      if (useMaintenanceModeStore.getState().mode === 'off') {
        void queryClient.cancelQueries({ queryKey: maintenanceStatusKey })
      }
    }
  }, [mode, since, refetch, queryClient])

  const isFull = mode === 'full'
  return (
    <View className="flex-1">
      <View
        className="flex-1"
        accessibilityElementsHidden={isFull}
        importantForAccessibility={isFull ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {isFull && (
        <View accessibilityViewIsModal className="absolute inset-0 bg-background">
          <MaintenanceScreen message={message} since={since} />
        </View>
      )}
    </View>
  )
}

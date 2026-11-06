import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OfflineBanner } from '@/components/shared/offline-banner'
import { ReadOnlyBanner } from '@/components/shared/read-only-banner'
import { useIsOnline } from '@/hooks/use-is-online'
import { useMaintenanceMode } from '@/http/maintenance'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'

/**
 * The banners at the top of the app: offline first, then read-only. One
 * container takes the top inset once, so two banners show no double gap. It
 * renders nothing while neither applies.
 * @returns The container, or nothing.
 */
export function TopBanners() {
  const isOnline = useIsOnline()
  const mode = useMaintenanceMode()
  const message = useMaintenanceModeStore((state) => state.message)
  const insets = useSafeAreaInsets()
  const isReadOnly = mode === 'read_only'
  if (isOnline && !isReadOnly) return null
  return (
    <View
      className="bg-muted"
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <OfflineBanner />
      {isReadOnly && <ReadOnlyBanner message={message} />}
    </View>
  )
}

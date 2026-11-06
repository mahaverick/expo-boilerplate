import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OfflineBanner } from '@/components/shared/offline-banner'
import { ReadOnlyBanner } from '@/components/shared/read-only-banner'
import { useTopBanner } from '@/hooks/use-top-banner'
import { useMaintenanceMode } from '@/http/maintenance'
import { useMaintenanceModeStore } from '@/states/maintenance-mode.store'

/**
 * The banners at the top of the app: offline first, then read-only. One
 * container takes the top inset once, so two banners show no double gap. It
 * renders nothing while neither applies.
 * @returns The container, or nothing.
 */
export function TopBanners() {
  const bannerShows = useTopBanner()
  const message = useMaintenanceModeStore((state) => state.message)
  const insets = useSafeAreaInsets()
  const isReadOnly = useMaintenanceMode() === 'read_only'
  if (!bannerShows) return null
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

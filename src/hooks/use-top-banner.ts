import { useIsOnline } from '@/hooks/use-is-online'
import { useMaintenanceMode } from '@/http/maintenance'

/**
 * Whether a top banner (offline or read-only) shows. A banner takes the top
 * safe-area inset, so a screen below it adds none.
 * @returns True while a banner shows.
 */
export function useTopBanner(): boolean {
  const isOnline = useIsOnline()
  const mode = useMaintenanceMode()
  return !isOnline || mode === 'read_only'
}

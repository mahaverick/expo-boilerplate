import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Alert } from 'react-native'
import { useNow } from '@/hooks/use-now'
import { useMaintenanceMode } from '@/http/maintenance'
import { formatBillingDate } from '@/lib/billing-format'
import { useUpdateRequired } from '@/lib/minimum-version'
import { storage } from '@/lib/storage'
import { useTenantBilling } from '@/queries/billing.queries'
import { tenantSettingsQueryOptions } from '@/queries/tenant-forms.queries'
import type { TenantDetail } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'

/** One day in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The MMKV key that records one person saw the explainer for one workspace.
 * @param userId - The signed-in person's id.
 * @param tenantId - The workspace's id.
 * @returns `trial-explainer:{userId}:{tenantId}`.
 */
function seenKey(userId: string, tenantId: string): string {
  return `trial-explainer:${userId}:${tenantId}`
}

/**
 * Tells a member that their new workspace is on a Paid trial. It shows an
 * alert once per person and workspace, for a workspace made in the last 24
 * hours that is in its trial. The trial's length is whole days from the
 * workspace's creation to the trial's end. The end date is in the
 * workspace's time zone, or UTC when its settings cannot be read. It waits
 * while the update screen or the maintenance screen covers the app, and
 * records the alert in MMKV when it shows it. Call it with `key={tenant.id}`
 * on the caller, so another workspace reads its own record.
 * @param slug - The workspace's web address.
 * @param tenant - The workspace as the API returns it.
 */
export function useTrialExplainer(slug: string, tenant: TenantDetail): void {
  const { data: billing } = useTenantBilling(slug)
  const now = useNow()
  const userId = useAuthStore((state) => state.user?.id)
  const updateRequired = useUpdateRequired()
  const maintenanceFull = useMaintenanceMode() === 'full'
  const trialEndsAt = billing?.state === 'trialing' ? billing.trialEndsAt : null
  const key = userId === undefined ? null : seenKey(userId, tenant.id)
  const eligible =
    key !== null &&
    !updateRequired &&
    !maintenanceFull &&
    tenant.access === 'member' &&
    trialEndsAt !== null &&
    now - Date.parse(tenant.createdAt) <= DAY_MS &&
    storage.getString(key) === undefined
  // The date is the workspace's day, as the server writes it; a failed read falls back to UTC.
  const settings = useQuery({
    ...tenantSettingsQueryOptions(slug),
    retry: false,
    enabled: eligible,
  })
  const ready = eligible && !settings.isPending

  useEffect(() => {
    // The record is the guard, so a second run of this effect shows nothing.
    if (!ready || key === null || trialEndsAt === null || storage.getString(key) !== undefined) {
      return
    }
    const days = Math.round((Date.parse(trialEndsAt) - Date.parse(tenant.createdAt)) / DAY_MS)
    const endsOn = formatBillingDate(trialEndsAt, settings.data?.timezone ?? 'UTC')
    Alert.alert(
      `You’re on a ${String(days)}-day Paid trial`,
      `Everything in Paid is on until ${endsOn}. Then you move to Free. Nothing is deleted, and no card is needed.`,
      [{ text: 'Got it' }]
    )
    storage.set(key, '1')
  }, [ready, key, trialEndsAt, tenant.createdAt, settings.data?.timezone])
}

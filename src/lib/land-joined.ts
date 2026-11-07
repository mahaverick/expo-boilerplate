import type { QueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { toast } from '@/lib/toast'
import {
  invalidateTenantList,
  isEligibleTenant,
  tenantsQueryOptions,
} from '@/queries/tenant.queries'
import { useCurrentTenantStore } from '@/states/current-tenant.store'
import type { User } from '@/types/api.types'

/**
 * Toasts a join and opens the Workspace tab in place of the token screen.
 *
 * The join's answer names neither the platform flag nor the lifecycle state,
 * so the list is read once. The workspace is remembered only when that read
 * succeeded and lists the workspace as eligible: a failed read or an unlisted
 * workspace remembers nothing, and the Workspace tab picks one itself.
 * @param queryClient - The app's query client.
 * @param tenant - The workspace joined.
 * @param tenant.name - Its name.
 * @param tenant.slug - Its web address.
 * @param account - The person now signed in, from the server's answer or session.
 * @param alreadyMember - True when the invitee had joined already.
 */
export async function landJoined(
  queryClient: QueryClient,
  tenant: { name: string; slug: string },
  account: Pick<User, 'id' | 'email'>,
  alreadyMember: boolean
): Promise<void> {
  // Offline the read fails at once and never waits.
  const listed = await queryClient
    .fetchQuery({ ...tenantsQueryOptions(), staleTime: 0, networkMode: 'always' })
    .catch(() => undefined)
  const entry = listed?.find((item) => item.tenant.slug === tenant.slug)
  if (entry && isEligibleTenant(entry)) {
    useCurrentTenantStore.getState().remember(account.id, tenant.slug)
  }
  void invalidateTenantList(queryClient)
  toast.success(
    alreadyMember
      ? `You’ve already joined ${tenant.name} as ${account.email}.`
      : `You joined ${tenant.name} as ${account.email}.`
  )
  router.replace('/workspace', { withAnchor: true })
}

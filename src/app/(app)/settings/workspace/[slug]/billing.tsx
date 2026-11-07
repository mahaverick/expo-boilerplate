import { useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Screen } from '@/components/ui/screen'
import { StackWorkspaceGate } from '@/components/workspaces/missing-workspace'
import { PlatformAccessBanner } from '@/components/workspaces/platform-access-banner'
import { PLATFORM_TENANT_SLUG } from '@/constants/routes'
import {
  featureLine,
  PLAN_LOAD_ERROR,
  planStateLine,
  PLATFORM_NO_PLAN,
  usageLine,
} from '@/copy/billing'
import { useEntitlements, usePlans } from '@/queries/billing.queries'
import { useTenant } from '@/queries/tenant.queries'
import type { EntitlementCatalogEntry } from '@/types/billing.types'

/**
 * Entries in the catalog's order, then the keys the catalog does not name, by key.
 * @param values - The values by key.
 * @param catalog - The catalog, or undefined while it is unread.
 * @returns The ordered entries.
 */
function inCatalogOrder<T>(
  values: Record<string, T>,
  catalog: EntitlementCatalogEntry[] | undefined
): Array<[string, T]> {
  const entries = Object.entries(values)
  /**
   * A key's place in the catalog.
   * @param key - A limit's or feature's key.
   * @returns The index, or a large number for an unknown key.
   */
  const rank = (key: string) => {
    const at = (catalog ?? []).findIndex((entry) => entry.key === key)
    return at === -1 ? Number.MAX_SAFE_INTEGER : at
  }
  return entries.sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
}

/**
 * The plan's name, its state, its limits and its features, all read-only.
 * The catalog supplies labels only; a key stands in for a missing label.
 * @param props - The workspace.
 * @param props.slug - The workspace's web address.
 * @returns The body.
 */
function PlanBody({ slug }: { slug: string }) {
  const entitlements = useEntitlements(slug)
  const catalog = usePlans().data?.catalog
  const data = entitlements.data
  if (data === undefined) {
    if (entitlements.isError) {
      return (
        <LoadError
          message={PLAN_LOAD_ERROR}
          onRetry={() => {
            void entitlements.refetch()
          }}
        />
      )
    }
    return <ActivityIndicator accessibilityLabel="Loading plan" />
  }
  /**
   * The catalog's label for a key.
   * @param key - A limit's or feature's key.
   * @returns The label, or the key.
   */
  const labelOf = (key: string) => catalog?.find((entry) => entry.key === key)?.label ?? key
  const stateLine = planStateLine(data)
  return (
    <View className="gap-3 rounded-lg border border-border p-4">
      <Text className="text-lg font-semibold text-foreground">{data.plan.name}</Text>
      {stateLine === undefined ? null : (
        <Text className="text-base text-muted-foreground">{stateLine}</Text>
      )}
      {inCatalogOrder(data.limits, catalog).map(([key, usage]) => (
        <Text key={key} className="text-base text-foreground">
          {usageLine(labelOf(key), usage)}
        </Text>
      ))}
      {inCatalogOrder(data.features, catalog).map(([key, included]) => (
        <Text key={key} className="text-base text-foreground">
          {featureLine(labelOf(key), included)}
        </Text>
      ))}
    </View>
  )
}

/**
 * The screen's content: the platform workspace's line, or the plan.
 * @param props - The workspace.
 * @param props.slug - The workspace's web address.
 * @returns The content.
 */
function PlanContent({ slug }: { slug: string }) {
  const tenant = useTenant(slug)
  const isPlatform = slug === PLATFORM_TENANT_SLUG || tenant.data?.isPlatform === true
  return (
    <Screen title="Plan" topInset={false}>
      <PlatformAccessBanner slug={slug} />
      {isPlatform ? (
        <Text className="text-base text-muted-foreground">{PLATFORM_NO_PLAN}</Text>
      ) : (
        <PlanBody slug={slug} />
      )}
    </Screen>
  )
}

/**
 * Settings, Workspace, Plan: the workspace's plan and its limits, read-only.
 * It shows no price and offers no way to change the plan or buy. It reads the
 * entitlements and the catalog's labels, never the billing route.
 * `StackWorkspaceGate` holds the reads until the workspace has loaded and
 * shows a 404 as `MissingWorkspace`.
 * @returns The screen.
 */
export default function WorkspacePlan() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return (
    <StackWorkspaceGate slug={slug} title="Plan">
      <PlanContent slug={slug} />
    </StackWorkspaceGate>
  )
}

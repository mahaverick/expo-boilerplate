import { Text, View } from 'react-native'
import { SettingsRow } from '@/components/settings/settings-row'
import { GettingStarted } from '@/components/workspaces/getting-started'
import { PlatformAccessBanner } from '@/components/workspaces/platform-access-banner'
import { useTrialExplainer } from '@/components/workspaces/trial-explainer'
import { WorkspaceGate } from '@/components/workspaces/workspace-gate'
import { ROLE_LABELS } from '@/constants/roles'
import { formatDate } from '@/lib/format'
import { useFlagValues } from '@/observability/flags/flag-hooks'
import type { TenantDetail } from '@/queries/tenant.queries'

/** Props of `WorkspaceOverview`. */
interface WorkspaceOverviewProps {
  /** The workspace's web address. */
  slug: string
  /** True where the switcher changes the workspace without leaving the screen. */
  inPlace?: boolean
  /** False under a header that takes the top inset. Defaults to true. */
  topInset?: boolean
  /** False above a tab bar that takes the bottom inset. Defaults to true. */
  bottomInset?: boolean
}

/**
 * One read-only row of Details.
 * @param props - The label and the value.
 * @param props.label - What the row is.
 * @param props.value - Its value, or `null` for a dash.
 * @returns The row.
 */
function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <View className="gap-1">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-base text-foreground">{value ?? '—'}</Text>
    </View>
  )
}

/**
 * The rows that open a workspace's extra screens: Insights for every member,
 * and Beta while the workspace's `example_beta_page` flag is on.
 * @param props - The workspace.
 * @param props.slug - The workspace's web address.
 * @returns The rows.
 */
function EntryRows({ slug }: { slug: string }) {
  const flags = useFlagValues(slug)
  return (
    <View>
      <SettingsRow
        title="Insights"
        description="Members joined and invitations sent, last 30 days."
        href={`/tenants/${slug}/insights`}
      />
      {flags.example_beta_page ? (
        <SettingsRow
          title="Beta"
          description="Features this workspace sees before everyone else."
          href={`/tenants/${slug}/beta`}
        />
      ) : null}
    </View>
  )
}

/**
 * The open workspace: the platform-access banner for staff, the role and web address under the title, the trial
 * explainer (an alert, once), Getting started, then Details.
 * @param props - The workspace as the API returns it.
 * @param props.tenant - The workspace.
 * @returns The content.
 */
function Content({ tenant }: { tenant: TenantDetail }) {
  const { slug } = tenant
  useTrialExplainer(slug, tenant)
  return (
    <>
      <PlatformAccessBanner slug={slug} />
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-base font-medium text-foreground">{ROLE_LABELS[tenant.role]}</Text>
        <Text className="text-base text-muted-foreground">{`/${slug}`}</Text>
      </View>
      <GettingStarted slug={slug} role={tenant.role} access={tenant.access} />
      <EntryRows slug={slug} />
      <View className="gap-3">
        <Text className="text-lg font-semibold text-foreground">Details</Text>
        <DetailRow label="Name" value={tenant.name} />
        <DetailRow label="Web address" value={`/${slug}`} />
        <DetailRow label="Description" value={tenant.description} />
        <DetailRow label="Website" value={tenant.website} />
        <DetailRow label="Logo" value={tenant.logo} />
        <DetailRow label="Created" value={formatDate(tenant.createdAt, 'long') ?? 'Unknown'} />
      </View>
    </>
  )
}

/**
 * A workspace's overview, the screen a person spends the most time on. The
 * Workspace tab shows it in place; the `/tenants/{slug}` route shows it for
 * deep links, the list and Welcome. The workspace name is the screen title.
 * @param props - The web address and the frame options.
 * @param props.slug - The workspace's web address.
 * @param props.inPlace - True where the switcher stays on the screen.
 * @param props.topInset - False under a header that takes the top inset.
 * @param props.bottomInset - False above a tab bar that takes the bottom inset.
 * @returns The screen.
 */
export function WorkspaceOverview({
  slug,
  inPlace,
  topInset,
  bottomInset,
}: WorkspaceOverviewProps) {
  return (
    <WorkspaceGate slug={slug} inPlace={inPlace} topInset={topInset} bottomInset={bottomInset}>
      {(tenant) => <Content key={tenant.id} tenant={tenant} />}
    </WorkspaceGate>
  )
}

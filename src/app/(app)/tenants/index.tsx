import { router } from 'expo-router'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadError } from '@/components/shared/load-error'
import { Screen } from '@/components/ui/screen'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { CreateWorkspaceForm } from '@/components/workspaces/create-workspace-form'
import { cn } from '@/lib/cn'
import { toast } from '@/lib/toast'
import { useTenants, type Tenant, type TenantWithRole } from '@/queries/tenant.queries'

/** What the list says when it did not load: a claim about the request, not the account. */
const TENANTS_ERROR =
  'We couldn’t load your workspaces, so none are listed. Select Try again to load them.'

/**
 * Opens a workspace.
 * @param slug - The workspace's web address.
 */
function openWorkspace(slug: string): void {
  // Typed routes do not list /tenants/[slug] yet, so the path is cast.
  router.push(`/tenants/${slug}`)
}

/**
 * One membership: the name and /{slug}. A suspended workspace carries a
 * Suspended tag and cannot be pressed.
 * @param props - The membership.
 * @param props.entry - The membership row.
 * @returns The row.
 */
function WorkspaceRow({ entry }: { entry: TenantWithRole }) {
  const { name, slug, lifecycleState } = entry.tenant
  const suspended = lifecycleState === 'suspended'
  const content = (
    <>
      <View className="flex-1">
        <Text className="text-base font-medium text-foreground">{name}</Text>
        <Text className="text-sm text-muted-foreground">{`/${slug}`}</Text>
      </View>
      {suspended ? <Text className="text-sm text-muted-foreground">Suspended</Text> : null}
    </>
  )
  if (suspended) {
    return <View className={cn(TOUCH_TARGET, 'flex-row items-center gap-2 py-2')}>{content}</View>
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, /${slug}`}
      onPress={() => {
        openWorkspace(slug)
      }}
      className={cn(TOUCH_TARGET, 'flex-row items-center gap-2 py-2')}
    >
      {content}
    </Pressable>
  )
}

/**
 * The caller's workspaces and the form to create another. A failed load shows
 * the error with Try again and never the empty state, since the two read alike
 * and the empty state invites a duplicate.
 * @returns The screen.
 */
export default function Workspaces() {
  const tenants = useTenants()

  /**
   * Announces the new workspace and opens it.
   * @param tenant - The workspace just created.
   */
  const onCreated = (tenant: Tenant): void => {
    toast.success(`${tenant.name} created.`)
    openWorkspace(tenant.slug)
  }

  const entries = tenants.data?.filter((entry) => !entry.isPlatform)
  let list
  if (tenants.isError) {
    list = (
      <LoadError
        message={TENANTS_ERROR}
        onRetry={() => {
          void tenants.refetch()
        }}
      />
    )
  } else if (entries === undefined) {
    list = <ActivityIndicator accessibilityLabel="Loading your workspaces" />
  } else if (entries.length === 0) {
    list = (
      <EmptyState
        title="This account isn’t a member of any workspace."
        description="Create one below."
      />
    )
  } else {
    list = (
      <View>
        {entries.map((entry) => (
          <WorkspaceRow key={entry.tenant.id} entry={entry} />
        ))}
      </View>
    )
  }

  return (
    <Screen title="Workspaces">
      <Text className="text-base text-muted-foreground">
        Every workspace this account belongs to.
      </Text>
      {list}
      <Text className="text-lg font-semibold text-foreground">Create a workspace</Text>
      <Text className="text-base text-muted-foreground">
        You become its owner. You can’t change the web address after you create the workspace.
      </Text>
      <CreateWorkspaceForm onCreated={onCreated} />
    </Screen>
  )
}

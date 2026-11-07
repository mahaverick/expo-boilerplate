import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import { ReadOnlyNote } from '@/components/settings/read-only-note'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { MemberRow } from '@/components/workspace-settings/member-row'
import { canManageTenant, type MembershipRole } from '@/constants/roles'
import { PLATFORM_TENANT_SLUG } from '@/constants/routes'
import { useListPages } from '@/hooks/use-list-pages'
import { ROLE_ERROR } from '@/lib/role-error'
import {
  membersListOptions,
  ownersBesides,
  ownersQueryOptions,
  useMyRole,
  useTenant,
} from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'

/** What a failed member list says. */
const MEMBERS_ERROR =
  'We couldn’t load this workspace’s members, so none are listed. Select Try again to load them.'

/** What a failed later page says. */
const MORE_ERROR = 'We couldn’t load more members. Select Try again to load them.'

/** What the screen says to staff owners and admins, who reach a customer workspace through platform access. */
const STAFF_VIEW = 'You’re viewing this workspace as staff. Make changes from the staff console.'

/** The list request: the default sort, so nothing is sent. */
const REQUEST = {}

/** Props of `MembersList`. */
interface MembersListProps {
  slug: string
  tenantName: string | undefined
  myRole: MembershipRole
  readOnly: boolean
}

/**
 * The member list: a spinner while the first page loads, `LoadError` when it
 * failed, the empty state only for a list that answered with no rows, and
 * "Load more" while another page follows. A failed owners read, which the
 * last-owner rule needs, shows its own `LoadError` and keeps the owner's
 * controls locked.
 * @param props - The workspace and the viewer.
 * @param props.slug - The workspace's web address.
 * @param props.tenantName - The workspace's name, for the leave toasts.
 * @param props.myRole - The viewer's role.
 * @param props.readOnly - True for staff through platform access.
 * @returns The list.
 */
function MembersList({ slug, tenantName, myRole, readOnly }: MembersListProps) {
  const members = useListPages((request) => membersListOptions(slug, request), REQUEST)
  const myUserId = useAuthStore((state) => state.user?.id)
  // Only an owner can act on an owner row, so only an owner needs the count.
  const owners = useQuery({
    ...ownersQueryOptions(slug),
    enabled: myRole === 'owner' && !readOnly,
  })
  const otherOwners = ownersBesides(owners.data, myUserId, slug === PLATFORM_TENANT_SLUG)

  let body
  if (members.isError) {
    body = <LoadError message={MEMBERS_ERROR} onRetry={members.retry} />
  } else if (members.isPending) {
    body = <ActivityIndicator accessibilityLabel="Loading members" />
  } else if (members.items.length === 0) {
    body = (
      <View className="gap-1">
        <Text className="text-base font-medium text-foreground">
          No one has access to this workspace yet.
        </Text>
        {canManageTenant(myRole) && !readOnly ? (
          <Text className="text-base text-muted-foreground">Invite someone below.</Text>
        ) : null}
      </View>
    )
  } else {
    body = (
      <View>
        {members.items.map((member) => (
          <MemberRow
            key={member.membership.id}
            slug={slug}
            tenantName={tenantName}
            member={member}
            myRole={myRole}
            myUserId={myUserId}
            otherOwners={otherOwners}
            ownersKnown={owners.isSuccess}
            readOnly={readOnly}
          />
        ))}
        {members.loadMoreFailed ? <LoadError message={MORE_ERROR} onRetry={members.retry} /> : null}
        {members.hasNext && !members.loadMoreFailed ? (
          <Button
            variant="secondary"
            label="Load more"
            loading={members.isLoadingMore}
            onPress={members.loadMore}
          />
        ) : null}
      </View>
    )
  }
  return (
    <View className="gap-3">
      {owners.isError ? (
        <LoadError
          message="Owners didn’t load, so owner changes are locked."
          onRetry={() => {
            void owners.refetch()
          }}
        />
      ) : null}
      {body}
    </View>
  )
}

/**
 * Settings, Workspace, Members: who has access, with role changes, removal
 * and leaving. Staff with platform access get a read-only list. A role still
 * loading shows a spinner; a failed role read with nothing loaded shows
 * `ROLE_ERROR`. The invitation sections sit below the list card.
 * @returns The screen.
 */
export default function WorkspaceMembers() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const tenant = useTenant(slug)
  const { role, access, isPending, isError, retry } = useMyRole(slug)
  let body
  if (tenant.data == null && (isError || !isPending)) {
    body = <LoadError message={ROLE_ERROR} onRetry={retry} />
  } else if (isPending || role === undefined || tenant.data == null) {
    body = <ActivityIndicator accessibilityLabel="Loading workspace" />
  } else {
    const readOnly = access === 'platform'
    body = (
      <View className="gap-3 rounded-lg border border-border p-4">
        <Text className="text-base text-muted-foreground">
          Everyone with access to this workspace.
        </Text>
        {readOnly && canManageTenant(role) ? <ReadOnlyNote text={STAFF_VIEW} /> : null}
        <MembersList slug={slug} tenantName={tenant.data.name} myRole={role} readOnly={readOnly} />
      </View>
    )
  }
  return (
    <Screen title="Members" topInset={false}>
      {body}
    </Screen>
  )
}

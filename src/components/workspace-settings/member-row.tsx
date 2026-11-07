import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { ChoiceSheet } from '@/components/ui/choice-sheet'
import { RowButton } from '@/components/workspace-settings/row-button'
import {
  canActorGrantRole,
  canActorModifyTarget,
  canChangeRoles,
  canManageTenant,
  isLastOwnerBlocked,
  MEMBERSHIP_ROLES,
  ROLE_LABELS,
  type MembershipRole,
} from '@/constants/roles'
import { PLATFORM_TENANT_SLUG } from '@/constants/routes'
import { STEP_UP_WAITING_LABEL, useStepUp, useStepUpWaiting } from '@/hooks/use-step-up'
import { statusFrom } from '@/lib/api-error'
import { fullName } from '@/lib/format'
import { toast } from '@/lib/toast'
import { writeFailureMessage } from '@/lib/write-failure'
import {
  dropTenantCache,
  isMemberNotFound,
  memberName,
  useLeaveTenant,
  useRemoveMember,
  useUpdateMemberRole,
  type TenantMember,
} from '@/queries/tenant.queries'
import { useCurrentTenantStore } from '@/states/current-tenant.store'

/** The reason the last owner's own controls are switched off. */
const LAST_OWNER_REASON = 'A workspace must always have an owner. Add another owner first.'

/** What a role change or removal says when its target is no longer a member. */
const MEMBER_GONE = 'That member is no longer in this workspace. We refreshed the list.'

/** What the Leave dialog says, for every role. */
const LEAVE_WARNING =
  'You will lose access to this workspace immediately. An owner or admin will have to invite you back.'

/** What the Leave dialog says on the platform workspace. */
const LEAVE_PLATFORM =
  'You lose staff access immediately. An owner or admin will have to invite you back, unless your address is on an auto-join domain: then you rejoin as a viewer at your next sign-in.'

/** Added for an owner or admin: leaving revokes the invitations they sent. */
const INVITATIONS_REVOKED_ON_LEAVE = 'Pending invitations you sent are revoked.'

/** The same on the platform workspace, where leaving also revokes elsewhere. */
const PLATFORM_INVITATIONS_REVOKED_ON_LEAVE =
  'Pending invitations you sent here are revoked, and so are any you sent in other workspaces for a role you can no longer grant there.'

/** What removing a member says about the invitations they sent. */
const INVITATIONS_REVOKED_ON_REMOVE = 'Pending invitations they sent are revoked.'

/** The same on the platform workspace. */
const PLATFORM_INVITATIONS_REVOKED_ON_REMOVE =
  'Pending invitations they sent here are revoked, and so are any they sent in other workspaces for a role they can no longer grant there. If their address is on an auto-join domain, they rejoin as a viewer at their next sign-in.'

/**
 * The toast for a failed role change or removal: the gone message for a
 * target already gone, otherwise the write's own message.
 * @param error - The failed request's error.
 * @returns The message.
 */
function memberWriteFailureMessage(error: unknown): string {
  return isMemberNotFound(error) ? MEMBER_GONE : writeFailureMessage(error)
}

/**
 * What the Leave dialog says.
 * @param isPlatform - True on the platform workspace.
 * @param manages - True for an owner or admin, whose sent invitations are revoked.
 * @returns The message.
 */
function leaveMessage(isPlatform: boolean, manages: boolean): string {
  const base = isPlatform ? LEAVE_PLATFORM : LEAVE_WARNING
  if (!manages) return base
  return `${base} ${isPlatform ? PLATFORM_INVITATIONS_REVOKED_ON_LEAVE : INVITATIONS_REVOKED_ON_LEAVE}`
}

/**
 * What the Remove dialog says.
 * @param name - The member's name.
 * @param isPlatform - True on the platform workspace.
 * @returns The message.
 */
function removeMessage(name: string, isPlatform: boolean): string {
  const loses = isPlatform
    ? 'loses staff access immediately.'
    : 'will lose access to this workspace immediately.'
  const revoked = isPlatform
    ? PLATFORM_INVITATIONS_REVOKED_ON_REMOVE
    : INVITATIONS_REVOKED_ON_REMOVE
  return `${name} ${loses} ${revoked}`
}

/** Props of `MemberRow`. */
interface MemberRowProps {
  slug: string
  /** The workspace's name, when the cache holds it, for the leave toasts. */
  tenantName: string | undefined
  member: TenantMember
  myRole: MembershipRole
  myUserId: string | undefined
  /** The other owners the API counts toward the last-owner rule. */
  otherOwners: number
  /** True once the owners read has landed. */
  ownersKnown: boolean
  /** True for staff through platform access: no controls. */
  readOnly: boolean
}

/**
 * One member: name, email, role, and the controls the viewer may use. Role
 * change is a `ChoiceSheet` of the roles the viewer may grant; Remove and
 * Leave confirm through `Alert`. Every write runs through step-up, and a ref
 * per action stops a second press while one runs. Leaving forgets the
 * workspace, drops its cache and lands on the workspace list.
 * @param props - The member and the viewer.
 * @returns The row.
 */
export function MemberRow({
  slug,
  tenantName,
  member,
  myRole,
  myUserId,
  otherOwners,
  ownersKnown,
  readOnly,
}: MemberRowProps) {
  const updateRole = useUpdateMemberRole(slug)
  const removeMember = useRemoveMember(slug)
  const leaveTenant = useLeaveTenant(slug)
  const stepUp = useStepUp()
  const waiting = useStepUpWaiting()
  const queryClient = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState<'role' | 'remove' | null>(null)
  const roleInFlight = useRef(false)
  const removeInFlight = useRef(false)

  const targetRole = member.membership.role
  const isSelf = member.user.id === myUserId
  const name = memberName(member)
  const shownName = fullName(member.user)
  const isPlatform = slug === PLATFORM_TENANT_SLUG
  const manages = canManageTenant(myRole)
  // Only an owner acting on their own owner row depends on the owner count.
  const countMatters = isSelf && targetRole === 'owner'
  const isLastOwner = ownersKnown && isLastOwnerBlocked({ targetRole, isSelf, otherOwners })
  const ownersPending = countMatters && !ownersKnown
  const locked = isLastOwner || ownersPending
  const canRole =
    !readOnly && canChangeRoles(myRole) && canActorModifyTarget(myRole, targetRole, isSelf)
  const canRemove =
    !readOnly && (isSelf || (manages && canActorModifyTarget(myRole, targetRole, isSelf)))
  const grantable = MEMBERSHIP_ROLES.filter((role) => canActorGrantRole(myRole, role))

  /**
   * Changes the role through step-up. A second press while one runs is ignored.
   * @param role - The chosen role.
   */
  const changeRole = (role: MembershipRole) => {
    if (role === targetRole || roleInFlight.current) return
    roleInFlight.current = true
    setBusy('role')
    stepUp
      .run(() => updateRole.mutateAsync({ userId: member.user.id, role }))
      .then(
        () => {
          toast.success(`${name} is now ${ROLE_LABELS[role]}.`)
        },
        (error: unknown) => {
          toast.error(memberWriteFailureMessage(error))
        }
      )
      .finally(() => {
        roleInFlight.current = false
        setBusy(null)
      })
  }

  /** Removes the member through step-up. */
  const remove = () => {
    if (removeInFlight.current) return
    removeInFlight.current = true
    setBusy('remove')
    stepUp
      .run(() => removeMember.mutateAsync(member.user.id))
      .then(
        () => {
          toast.success(`${name} removed.`)
        },
        (error: unknown) => {
          toast.error(memberWriteFailureMessage(error))
        }
      )
      .finally(() => {
        removeInFlight.current = false
        setBusy(null)
      })
  }

  /**
   * Leaves through step-up. A 404 means the membership was already gone. On
   * success or a 404 it forgets the workspace when it was the remembered one,
   * drops its cache and lands on the list; any other failure stays here.
   */
  const leave = () => {
    if (removeInFlight.current) return
    removeInFlight.current = true
    setBusy('remove')
    void stepUp
      .run(() => leaveTenant.mutateAsync())
      .then(
        () => {
          toast.success(`You left ${tenantName ?? 'this workspace'}.`)
          return true
        },
        (error: unknown) => {
          if (statusFrom(error) !== 404) {
            toast.error(writeFailureMessage(error))
            return false
          }
          toast.success(`You’re no longer a member of ${tenantName ?? 'this workspace'}.`)
          return true
        }
      )
      .then((gone) => {
        if (!gone) return
        const tenants = useCurrentTenantStore.getState()
        if (myUserId !== undefined && tenants.recall(myUserId) === slug) tenants.forget(myUserId)
        dropTenantCache(queryClient, slug)
        router.replace('/tenants')
      })
      .finally(() => {
        removeInFlight.current = false
        setBusy(null)
      })
  }

  /** Asks before removing or leaving. */
  const confirm = () => {
    Alert.alert(
      isSelf ? 'Leave this workspace?' : `Remove ${name}?`,
      isSelf ? leaveMessage(isPlatform, manages) : removeMessage(name, isPlatform),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isSelf ? 'Leave' : 'Remove',
          style: 'destructive',
          onPress: isSelf ? leave : remove,
        },
      ]
    )
  }

  const roleBusy = busy === 'role'
  const removeBusy = busy === 'remove'
  return (
    <View testID={`member-${member.membership.id}`} className="gap-2 border-b border-border py-3">
      <View className="flex-row flex-wrap items-center gap-2">
        {shownName === null ? (
          <Text className="text-base font-medium text-muted-foreground">—</Text>
        ) : (
          <Text className="text-base font-medium text-foreground">{shownName}</Text>
        )}
        {isSelf ? <Text className="text-sm text-muted-foreground">(you)</Text> : null}
      </View>
      <Text className="text-sm text-muted-foreground">{member.user.email}</Text>
      <Text className="text-sm text-foreground">{ROLE_LABELS[targetRole]}</Text>
      {canRole || canRemove ? (
        <View className="flex-row flex-wrap gap-2">
          {canRole ? (
            <RowButton
              label={`Change role for ${name}`}
              text={roleBusy && waiting ? STEP_UP_WAITING_LABEL : 'Change role'}
              disabled={locked || busy !== null}
              onPress={() => {
                setSheetOpen(true)
              }}
            />
          ) : null}
          {canRemove ? (
            <RowButton
              label={isSelf ? 'Leave' : `Remove ${name}`}
              text={removeBusy && waiting ? STEP_UP_WAITING_LABEL : isSelf ? 'Leave' : 'Remove'}
              destructive
              disabled={locked || busy !== null}
              onPress={confirm}
            />
          ) : null}
        </View>
      ) : null}
      {isLastOwner ? (
        <Text className="text-sm text-muted-foreground">{LAST_OWNER_REASON}</Text>
      ) : null}
      {canRole ? (
        <ChoiceSheet
          visible={sheetOpen}
          title={`Role for ${name}`}
          value={targetRole}
          options={grantable.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
          onChoose={changeRole}
          onClose={() => {
            setSheetOpen(false)
          }}
        />
      ) : null}
    </View>
  )
}

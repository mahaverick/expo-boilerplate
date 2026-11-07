import { useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import { ReadOnlyNote } from '@/components/settings/read-only-note'
import { LoadError } from '@/components/shared/load-error'
import { Screen } from '@/components/ui/screen'
import { DetailsForm, DetailsRows } from '@/components/workspace-settings/details-form'
import { SettingsForm, SettingsRows } from '@/components/workspace-settings/settings-form'
import { PlatformAccessBanner } from '@/components/workspaces/platform-access-banner'
import { canManageTenant } from '@/constants/roles'
import { formatDate } from '@/lib/format'
import { ROLE_ERROR } from '@/lib/role-error'
import { useTenantSettings } from '@/queries/tenant-forms.queries'
import { useMyRole, useTenant } from '@/queries/tenant.queries'

/** What a failed settings read says. */
const SETTINGS_ERROR =
  'We couldn’t load this workspace’s settings, so none are shown. Select Try again to load them.'

/**
 * One card: a title, a line that says who may edit, and the body.
 * @param props - The title, the line and the body.
 * @param props.title - The card's title, plain text so the screen keeps one header.
 * @param props.description - Who may edit; a quiet note for people who may not.
 * @param props.readOnly - True when the person may not edit.
 * @param props.children - The body.
 * @returns The card.
 */
function Card({
  title,
  description,
  readOnly,
  children,
}: {
  title: string
  description: string
  readOnly: boolean
  children: React.ReactNode
}) {
  return (
    <View className="gap-3 rounded-lg border border-border p-4">
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {readOnly ? (
        <ReadOnlyNote text={description} />
      ) : (
        <Text className="text-base text-muted-foreground">{description}</Text>
      )}
      {children}
    </View>
  )
}

/**
 * The settings card's body: the form for managers, rows for everyone else, a
 * spinner while loading and Try again when the read failed.
 * @param props - The workspace and whether the person manages it.
 * @param props.slug - The workspace's web address.
 * @param props.manages - True for an owner or admin member.
 * @returns The body.
 */
function SettingsBody({ slug, manages }: { slug: string; manages: boolean }) {
  const settings = useTenantSettings(slug)
  if (settings.data !== undefined) {
    return manages ? (
      <SettingsForm key={slug} slug={slug} settings={settings.data} />
    ) : (
      <SettingsRows settings={settings.data} />
    )
  }
  if (settings.isError) {
    return (
      <LoadError
        message={SETTINGS_ERROR}
        onRetry={() => {
          void settings.refetch()
        }}
      />
    )
  }
  return <ActivityIndicator accessibilityLabel="Loading settings" />
}

/**
 * Settings, Workspace, General: the workspace's details and settings. Owner
 * and admin members get the forms. Everyone else, staff with platform access
 * included, gets read-only rows. A role still loading shows a spinner, never
 * the read-only view. A failed role read with nothing loaded shows `ROLE_ERROR`;
 * a failed background refetch keeps the loaded cards and their edits.
 * @returns The screen.
 */
export default function WorkspaceGeneral() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const tenant = useTenant(slug)
  const { role, access, isPending, isError, retry } = useMyRole(slug)
  let body
  if (tenant.data == null && (isError || !isPending)) {
    body = <LoadError message={ROLE_ERROR} onRetry={retry} />
  } else if (isPending || role === undefined || tenant.data == null) {
    body = <ActivityIndicator accessibilityLabel="Loading workspace" />
  } else {
    const manages = canManageTenant(role) && access === 'member'
    body = (
      <>
        <Card
          title="Overview"
          readOnly={!manages}
          description={
            manages
              ? 'Update this workspace. Its web address is fixed and can’t be changed.'
              : 'Only this workspace’s owners and admins can change these details.'
          }
        >
          {manages ? (
            <DetailsForm key={tenant.data.id} tenant={tenant.data} />
          ) : (
            <DetailsRows
              tenant={tenant.data}
              created={formatDate(tenant.data.createdAt, 'long') ?? 'Unknown'}
            />
          )}
        </Card>
        <Card
          title="Settings"
          readOnly={!manages}
          description={
            manages
              ? 'This workspace’s time zone, language and region, and custom data for developers.'
              : 'Only this workspace’s owners and admins can change these settings.'
          }
        >
          <SettingsBody slug={slug} manages={manages} />
        </Card>
      </>
    )
  }
  return (
    <Screen title="General" topInset={false}>
      <PlatformAccessBanner slug={slug} />
      {body}
    </Screen>
  )
}

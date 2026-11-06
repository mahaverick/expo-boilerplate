import { router } from 'expo-router'
import { useEffect, type ReactNode } from 'react'
import { ActivityIndicator, Text } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { WorkspaceSwitcher } from '@/components/workspaces/workspace-switcher'
import { useClientSettings } from '@/queries/client-settings.queries'
import { useTenant, useTenants, type TenantDetail } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'

/** What a failed read says. It claims the request failed, not that the workspace is gone. */
const WORKSPACE_LOAD_ERROR =
  'We couldn’t load this workspace because the request failed. Select Try again.'

/** Props of `WorkspaceGate`. */
interface WorkspaceGateProps {
  /** The workspace's web address. */
  slug: string
  /** True where the switcher changes the workspace without leaving the screen. */
  inPlace?: boolean
  /** False under a header that takes the top inset. Defaults to true. */
  topInset?: boolean
  /** False above a tab bar that takes the bottom inset. Defaults to true. */
  bottomInset?: boolean
  /** Renders the open workspace's content. */
  children: (tenant: TenantDetail) => ReactNode
}

/** Props of the screen frame the gate draws around every state. */
interface FrameProps extends Omit<WorkspaceGateProps, 'children'> {
  title: string
  children: ReactNode
}

/**
 * The screen every gate state shares: the title as the one header, then the
 * workspace switcher, then the state.
 * @param props - The title, the frame options and the content.
 * @returns The screen.
 */
function Frame({ title, slug, inPlace, topInset, bottomInset, children }: FrameProps) {
  return (
    <Screen title={title} topInset={topInset} bottomInset={bottomInset}>
      <WorkspaceSwitcher currentSlug={slug} inPlace={inPlace} />
      {children}
    </Screen>
  )
}

/**
 * The screen for a workspace the API answered 404 for. The list tells a
 * suspended workspace from a missing one, so it waits for the list to
 * refetch. A failed list claims neither, because the workspace may be fine.
 * @param props - The frame options.
 * @returns The suspended panel, the not-available panel, or the load error.
 */
function MissingWorkspace(props: Omit<FrameProps, 'title' | 'children'>) {
  const tenants = useTenants()
  const supportEmail = useClientSettings()?.supportEmail
  const { slug } = props
  const entries = tenants.data
  if (entries === undefined && tenants.isError) {
    return (
      <Frame title="Workspace" {...props}>
        <LoadError
          message={WORKSPACE_LOAD_ERROR}
          onRetry={() => {
            void tenants.refetch()
          }}
        />
      </Frame>
    )
  }
  if (entries === undefined || (tenants.isFetching && !tenants.isError)) {
    return (
      <Frame title="Workspace" {...props}>
        <ActivityIndicator accessibilityLabel="Loading workspace" />
      </Frame>
    )
  }
  const listed = entries.find((entry) => entry.tenant.slug === slug)
  const back = (
    <Button
      variant="secondary"
      label="Back to your workspaces"
      onPress={() => {
        router.push('/tenants')
      }}
    />
  )
  if (listed?.tenant.lifecycleState === 'suspended') {
    return (
      <Frame title="Workspace suspended" {...props}>
        <Text className="text-base text-foreground">
          {`${listed.tenant.name} is suspended, so its pages are closed.`}
        </Text>
        <Text className="text-base text-muted-foreground">
          {supportEmail === undefined
            ? 'Contact support to restore access.'
            : `Contact support at ${supportEmail} to restore access.`}
        </Text>
        {back}
      </Frame>
    )
  }
  return (
    <Frame title="Workspace not available" {...props}>
      <Text className="text-base text-foreground">
        {`We couldn’t open /${slug}. It doesn’t exist, or you aren’t a member.`}
      </Text>
      {back}
    </Frame>
  )
}

/**
 * What every workspace screen renders around its content: a spinner while the
 * workspace loads; the load error when the read fails; for a 404 the
 * suspended or not-available panel; otherwise the content, with the
 * workspace's name as the screen title. A workspace the person works in
 * becomes their remembered one. Platform access and the platform workspace do
 * not, so a staff visit never replaces it.
 * @param props - The web address, the frame options and the content.
 * @returns The screen.
 */
export function WorkspaceGate({ children, ...frame }: WorkspaceGateProps) {
  const { slug } = frame
  const tenant = useTenant(slug)
  const userId = useAuthStore((state) => state.user?.id)
  const detail = tenant.data
  const remembers = detail != null && detail.access !== 'platform' && !detail.isPlatform

  useEffect(() => {
    if (userId !== undefined && remembers) useCurrentTenantStore.getState().remember(userId, slug)
  }, [userId, remembers, slug])

  if (detail === null) return <MissingWorkspace {...frame} />
  if (detail !== undefined) {
    // A failed refetch with the workspace on screen is the sections' to show, not a second alert.
    return (
      <Frame title={detail.name} {...frame}>
        {children(detail)}
      </Frame>
    )
  }
  return (
    <Frame title="Workspace" {...frame}>
      {tenant.isError ? (
        <LoadError
          message={WORKSPACE_LOAD_ERROR}
          onRetry={() => {
            void tenant.refetch()
          }}
        />
      ) : (
        <ActivityIndicator accessibilityLabel="Loading workspace" />
      )}
    </Frame>
  )
}

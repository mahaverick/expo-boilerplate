import { useEffect, type ReactNode } from 'react'
import { ActivityIndicator } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Screen } from '@/components/ui/screen'
import { MissingWorkspace, WORKSPACE_LOAD_ERROR } from '@/components/workspaces/missing-workspace'
import { WorkspaceSwitcher } from '@/components/workspaces/workspace-switcher'
import { useTenant, type TenantDetail } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'

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

  if (detail === null) {
    return (
      <MissingWorkspace
        slug={slug}
        topInset={frame.topInset}
        bottomInset={frame.bottomInset}
        switcher={<WorkspaceSwitcher currentSlug={slug} inPlace={frame.inPlace} />}
      />
    )
  }
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

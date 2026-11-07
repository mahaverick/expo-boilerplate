import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { ActivityIndicator, Text } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { useClientSettings } from '@/queries/client-settings.queries'
import { useTenant, useTenants } from '@/queries/tenant.queries'

/** What a failed read says. It claims the request failed, not that the workspace is gone. */
export const WORKSPACE_LOAD_ERROR =
  'We couldn’t load this workspace because the request failed. Select Try again.'

/** Props of `MissingWorkspace`. */
interface MissingWorkspaceProps {
  /** The workspace's web address. */
  slug: string
  /** False under a header that takes the top inset. Defaults to true. */
  topInset?: boolean
  /** False above a tab bar that takes the bottom inset. Defaults to true. */
  bottomInset?: boolean
  /** What sits under the title, such as the workspace switcher. None by default. */
  switcher?: ReactNode
}

/**
 * The screen for a workspace the API answered 404 for: suspended, removed, or
 * one the person is not a member of. `WorkspaceGate` draws it with the
 * switcher; the stack screens draw it through `StackWorkspaceGate`, with none.
 * The list tells a suspended workspace from a missing one, so it waits for
 * the list to refetch. A failed list claims neither, because the workspace
 * may be fine.
 * @param props - The web address, the insets and the switcher.
 * @returns The suspended panel, the not-available panel, or the load error.
 */
export function MissingWorkspace({ slug, topInset, bottomInset, switcher }: MissingWorkspaceProps) {
  const tenants = useTenants()
  const supportEmail = useClientSettings()?.supportEmail
  const entries = tenants.data

  /**
   * The screen around one state.
   * @param title - The screen's one header.
   * @param children - The state.
   * @returns The screen.
   */
  const frame = (title: string, children: ReactNode) => (
    <Screen title={title} topInset={topInset} bottomInset={bottomInset}>
      {switcher}
      {children}
    </Screen>
  )

  if (entries === undefined && tenants.isError) {
    return frame(
      'Workspace',
      <LoadError
        message={WORKSPACE_LOAD_ERROR}
        onRetry={() => {
          void tenants.refetch()
        }}
      />
    )
  }
  if (entries === undefined || (tenants.isFetching && !tenants.isError)) {
    return frame('Workspace', <ActivityIndicator accessibilityLabel="Loading workspace" />)
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
    return frame(
      'Workspace suspended',
      <>
        <Text className="text-base text-foreground">
          {`${listed.tenant.name} is suspended, so its pages are closed.`}
        </Text>
        <Text className="text-base text-muted-foreground">
          {supportEmail === undefined
            ? 'Contact support to restore access.'
            : `Contact support at ${supportEmail} to restore access.`}
        </Text>
        {back}
      </>
    )
  }
  return frame(
    'Workspace not available',
    <>
      <Text className="text-base text-foreground">
        {`We couldn’t open /${slug}. It doesn’t exist, or you aren’t a member.`}
      </Text>
      {back}
    </>
  )
}

/** Props of `StackWorkspaceGate`. */
interface StackWorkspaceGateProps {
  /** The workspace's web address. */
  slug: string
  /** The screen's title while the workspace loads or fails to load. */
  title: string
  /** The screen, mounted only once the workspace has loaded. */
  children: ReactNode
}

/**
 * The gate for a workspace screen in the `(app)` stack, under its header with
 * Back. It mounts the screen only once `GET /tenants/:slug` has answered with
 * the workspace, so the screen's own reads never run against a 404. A 404
 * shows `MissingWorkspace` with no switcher; a failed read shows the load
 * error; otherwise a spinner.
 * @param props - The web address, the title and the screen.
 * @returns The screen, or the state that stands in for it.
 */
export function StackWorkspaceGate({ slug, title, children }: StackWorkspaceGateProps) {
  const tenant = useTenant(slug)
  if (tenant.data === null) return <MissingWorkspace slug={slug} topInset={false} />
  if (tenant.data !== undefined) return children
  return (
    <Screen title={title} topInset={false}>
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
    </Screen>
  )
}

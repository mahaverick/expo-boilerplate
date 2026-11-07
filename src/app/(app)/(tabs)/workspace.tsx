import { router } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Screen } from '@/components/ui/screen'
import { WorkspaceOverview } from '@/components/workspaces/workspace-overview'
import { WorkspaceSwitcher } from '@/components/workspaces/workspace-switcher'
import { useCurrentTenant } from '@/hooks/use-current-tenant'
import { TENANTS_ERROR } from '@/lib/tenants-error'
import { useAuthStore } from '@/states/auth.store'

/**
 * The workspace tab. It has no web address of its own, so it resolves the
 * current workspace (the last one used, else the first eligible) and shows its
 * overview in place, with no navigation out of the tabs. Choosing another in
 * the switcher remembers it, and the tab shows that one. With none it pushes
 * /welcome over the tabs, only while a person is signed in: a forced sign-out
 * under maintenance `full` must not navigate. A failed list shows the error with Try again, never the empty
 * state.
 * @returns The screen.
 */
export default function Workspace() {
  const current = useCurrentTenant()
  const { status, slug } = current
  const isSignedIn = useAuthStore((state) => state.user !== null)
  useEffect(() => {
    if (status === 'none' && isSignedIn) router.push('/welcome')
  }, [status, isSignedIn])
  if (status === 'ready' && slug !== null) {
    return <WorkspaceOverview slug={slug} inPlace bottomInset={false} />
  }
  return (
    <Screen title="Workspace" bottomInset={false}>
      <WorkspaceSwitcher inPlace />
      {status === 'error' ? (
        <LoadError message={TENANTS_ERROR} onRetry={current.retry} />
      ) : (
        <ActivityIndicator accessibilityLabel="Loading your workspaces" />
      )}
    </Screen>
  )
}

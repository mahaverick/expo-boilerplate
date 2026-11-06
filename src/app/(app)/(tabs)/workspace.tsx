import { router, type Href } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Screen } from '@/components/ui/screen'
import { WorkspaceSwitcher } from '@/components/workspaces/workspace-switcher'
import { useCurrentTenant } from '@/hooks/use-current-tenant'

/** What a failed list says: a claim about the request, not the account. */
const TENANTS_ERROR =
  'We couldn’t load your workspaces, so none are listed. Select Try again to load them.'

/**
 * The workspace tab. It has no web address of its own, so it resolves the
 * current workspace (the last one used, else the first eligible) and replaces
 * itself with that workspace's screen. With none it goes to /welcome. A failed
 * list shows the error with Try again, never the empty state.
 * @returns The screen.
 */
export default function Workspace() {
  const current = useCurrentTenant()
  const { status, slug } = current
  useEffect(() => {
    // Typed routes do not list /tenants/[slug] yet, so the path is cast.
    if (status === 'ready') router.replace(`/tenants/${slug}` as Href)
    else if (status === 'none') router.replace('/welcome')
  }, [status, slug])
  return (
    <Screen title="Workspace" bottomInset={false}>
      <WorkspaceSwitcher currentSlug={slug ?? undefined} />
      {status === 'error' ? (
        <LoadError message={TENANTS_ERROR} onRetry={current.retry} />
      ) : (
        <ActivityIndicator accessibilityLabel="Loading your workspaces" />
      )}
    </Screen>
  )
}

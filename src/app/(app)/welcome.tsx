import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Text } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { CreateWorkspaceForm } from '@/components/workspaces/create-workspace-form'
import { useSignOut } from '@/hooks/use-sign-out'
import { TENANTS_ERROR } from '@/lib/tenants-error'
import { toast } from '@/lib/toast'
import { isEligibleTenant, useTenants, type Tenant } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'

/**
 * The first-workspace step, where a new account lands. A person who already
 * has a workspace goes Home. The check takes the first list this screen reads
 * and never a later one: creating refetches the list, which then holds the new
 * workspace, and a bounce Home would race the landing. A failed first read
 * shows the error with Try again and never the form: an invited account whose
 * read failed would create a duplicate. Until a read succeeds the screen shows
 * a spinner or the error, so no create starts before the decision.
 * @returns The screen.
 */
export default function Welcome() {
  const tenants = useTenants()
  const email = useAuthStore((state) => state.user?.email)
  const userId = useAuthStore((state) => state.user?.id)
  const { signOut, isPending } = useSignOut()
  const [firstList, setFirstList] = useState(tenants.data)
  if (firstList === undefined && tenants.data !== undefined) setFirstList(tenants.data)
  const hasWorkspace = firstList?.some(isEligibleTenant) ?? false
  useEffect(() => {
    if (hasWorkspace) router.dismissTo('/')
  }, [hasWorkspace])

  if (firstList === undefined && tenants.isError) {
    return (
      <Screen title="Create your workspace" topInset={false}>
        <LoadError
          message={TENANTS_ERROR}
          onRetry={() => {
            void tenants.refetch()
          }}
        />
      </Screen>
    )
  }

  if (firstList === undefined || hasWorkspace) {
    return (
      <Screen title="Create your workspace" topInset={false}>
        <ActivityIndicator accessibilityLabel="Loading your workspaces" />
      </Screen>
    )
  }

  /**
   * Announces the new workspace, remembers it, and opens the Workspace tab in
   * place of this step, so the tab bar shows and the tab opens on it.
   * @param tenant - The workspace just created.
   */
  const onCreated = (tenant: Tenant): void => {
    toast.success(`${tenant.name} created.`)
    if (userId) useCurrentTenantStore.getState().remember(userId, tenant.slug)
    router.dismissTo('/workspace')
  }

  return (
    <Screen title="Create your workspace" topInset={false}>
      <Text className="text-base text-foreground">
        Name your workspace. You can invite your team next.
      </Text>
      <CreateWorkspaceForm onCreated={onCreated} />
      {email ? (
        <Text className="text-base text-muted-foreground">{`You’re signed in as ${email}.`}</Text>
      ) : null}
      <Button variant="secondary" label="Go to Home" onPress={() => router.dismissTo('/')} />
      <Button variant="ghost" label="Sign out" loading={isPending} onPress={() => void signOut()} />
    </Screen>
  )
}

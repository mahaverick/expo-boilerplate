import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Text } from 'react-native'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { CreateWorkspaceForm } from '@/components/workspaces/create-workspace-form'
import { useSignOut } from '@/hooks/use-sign-out'
import { toast } from '@/lib/toast'
import { isEligibleTenant, useTenants, type Tenant } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'

/**
 * The first-workspace step, where a new account lands. A person who already
 * has a workspace goes Home. The check takes the first list this screen reads
 * and never a later one: creating refetches the list, which then holds the new
 * workspace, and a bounce Home would race the landing. A failed first read
 * counts as no workspaces and shows the form. Until the first read settles the
 * screen shows a spinner, so no create starts before the decision.
 * @returns The screen.
 */
export default function Welcome() {
  const tenants = useTenants()
  const email = useAuthStore((state) => state.user?.email)
  const { signOut, isPending } = useSignOut()
  const [firstList, setFirstList] = useState(tenants.data)
  if (firstList === undefined && (tenants.data !== undefined || tenants.isError)) {
    setFirstList(tenants.data ?? [])
  }
  const hasWorkspace = firstList?.some(isEligibleTenant) ?? false
  useEffect(() => {
    if (hasWorkspace) router.replace('/')
  }, [hasWorkspace])

  if (firstList === undefined || hasWorkspace) {
    return (
      <Screen title="Create your workspace">
        <ActivityIndicator accessibilityLabel="Loading your workspaces" />
      </Screen>
    )
  }

  /**
   * Announces the new workspace and opens it in place of this step.
   * @param tenant - The workspace just created.
   */
  const onCreated = (tenant: Tenant): void => {
    toast.success(`${tenant.name} created.`)
    router.replace(`/tenants/${tenant.slug}`)
  }

  return (
    <Screen title="Create your workspace">
      <Text className="text-base text-foreground">
        Name your workspace. You can invite your team next.
      </Text>
      <CreateWorkspaceForm onCreated={onCreated} />
      {email ? (
        <Text className="text-base text-muted-foreground">{`You’re signed in as ${email}.`}</Text>
      ) : null}
      <Button variant="secondary" label="Go to Home" onPress={() => router.replace('/')} />
      <Button variant="ghost" label="Sign out" loading={isPending} onPress={() => void signOut()} />
    </Screen>
  )
}

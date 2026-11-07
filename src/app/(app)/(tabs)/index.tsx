import { router } from 'expo-router'
import { ActivityIndicator, Text } from 'react-native'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { TENANTS_ERROR } from '@/lib/tenants-error'
import { isEligibleTenant, useTenants } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'

/**
 * Home: a greeting and a line for derived projects to replace. It never
 * redirects. The empty state shows only when the list read succeeded and holds
 * no eligible workspace (suspended ones and the platform one do not count, as
 * in Welcome); a pending read shows a spinner and a failed one shows the error.
 * @returns The screen.
 */
export default function Home() {
  const user = useAuthStore((state) => state.user)
  const tenants = useTenants()
  // `||`, not `??`: an empty first name falls back to the email.
  const name = user?.firstName || user?.email || ''
  let body
  if (tenants.data === undefined && tenants.isError) {
    body = (
      <LoadError
        message={TENANTS_ERROR}
        onRetry={() => {
          void tenants.refetch()
        }}
      />
    )
  } else if (tenants.data === undefined) {
    body = <ActivityIndicator accessibilityLabel="Loading your workspaces" />
  } else if (!tenants.data.some(isEligibleTenant)) {
    body = (
      <EmptyState
        title="Create your workspace"
        description="You don’t belong to a workspace yet."
        action={
          <Button
            variant="primary"
            label="Create your workspace"
            onPress={() => {
              router.push('/welcome')
            }}
          />
        }
      />
    )
  } else {
    body = (
      <Text className="text-base text-muted-foreground">
        This screen is intentionally empty. Derived projects fill it.
      </Text>
    )
  }
  return (
    <Screen title={`Welcome back, ${name}`} bottomInset={false}>
      {body}
    </Screen>
  )
}

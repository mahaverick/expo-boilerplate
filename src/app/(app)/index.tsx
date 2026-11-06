import { useQuery } from '@tanstack/react-query'
import { Text } from 'react-native'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { useSignOut } from '@/hooks/use-sign-out'
import { tenantsQueryOptions } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'

/** Home: who is signed in, a line for an account with no workspaces, and Sign out. */
export default function Home() {
  const email = useAuthStore((state) => state.user?.email)
  const tenants = useQuery(tenantsQueryOptions())
  const { signOut, isPending } = useSignOut()
  return (
    <Screen title="Home">
      {email ? <Text className="text-base text-foreground">{`Signed in as ${email}`}</Text> : null}
      {tenants.data?.length === 0 ? (
        <Text className="text-base text-muted-foreground">You have no workspaces yet.</Text>
      ) : null}
      <Button
        variant="secondary"
        label="Sign out"
        loading={isPending}
        onPress={() => void signOut()}
      />
    </Screen>
  )
}

import { useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, Text } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { StackWorkspaceGate } from '@/components/workspaces/missing-workspace'
import { PlatformAccessBanner } from '@/components/workspaces/platform-access-banner'
import { statusFrom } from '@/lib/api-error'
import { flagsKey } from '@/observability/flags/flag-query'
import { useTenantBeta } from '@/queries/beta.queries'

/** What a failed read says. */
const BETA_ERROR = 'We couldn’t load this workspace’s beta features. Select Try again to load them.'

/**
 * The reference screen behind the `example_beta_page` flag. The API answers
 * 404 when the flag closed after the screen opened. The screen then draws
 * Page not found in place and refetches the flags, so the overview drops its
 * Beta row. `StackWorkspaceGate` mounts it only once the workspace has loaded,
 * so a missing workspace's 404 never reads as a closed flag.
 * @returns The screen.
 */
export default function WorkspaceBeta() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return (
    <StackWorkspaceGate slug={slug} title="Beta">
      <BetaContent slug={slug} />
    </StackWorkspaceGate>
  )
}

/**
 * Beta's content for a workspace that loaded: the confirmation, Page not
 * found for a closed flag, the load error, or a spinner.
 * @param props - The workspace.
 * @param props.slug - The workspace's web address.
 * @returns The screen.
 */
function BetaContent({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const beta = useTenantBeta(slug)
  const closed = beta.isError && statusFrom(beta.error) === 404
  const { errorUpdatedAt } = beta

  // Once per 404: read the flags again, even where nothing observes them now.
  useEffect(() => {
    if (!closed) return
    void queryClient.invalidateQueries({
      queryKey: flagsKey({ kind: 'tenant', slug }),
      refetchType: 'all',
    })
  }, [closed, errorUpdatedAt, queryClient, slug])

  if (closed) {
    return (
      <Screen title="Page not found" topInset={false}>
        <PlatformAccessBanner slug={slug} />
        <Button
          variant="primary"
          label="Go to Home"
          onPress={() => {
            router.replace('/')
          }}
        />
      </Screen>
    )
  }
  let body
  if (beta.data !== undefined) {
    body = (
      <>
        <Text className="text-base text-muted-foreground">
          Features this workspace sees before everyone else.
        </Text>
        <Text className="text-base text-foreground">{`Beta features are on for /${beta.data.slug}.`}</Text>
      </>
    )
  } else if (beta.isError) {
    body = (
      <LoadError
        message={BETA_ERROR}
        onRetry={() => {
          void beta.refetch()
        }}
      />
    )
  } else {
    body = <ActivityIndicator accessibilityLabel="Loading beta features" />
  }
  return (
    <Screen title="Beta" topInset={false}>
      <PlatformAccessBanner slug={slug} />
      {body}
    </Screen>
  )
}

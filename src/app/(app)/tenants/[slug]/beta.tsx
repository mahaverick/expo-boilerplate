import { useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, Text } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { statusFrom } from '@/lib/api-error'
import { useTenantBeta } from '@/queries/beta.queries'
import { tenantFlagsKey } from '@/queries/flags.queries'

/** What a failed read says. */
const BETA_ERROR = 'We couldn’t load this workspace’s beta features. Select Try again to load them.'

/**
 * The reference screen behind the `example_beta_page` flag. The API answers
 * 404 when the flag closed after the screen opened. The screen then draws
 * Page not found in place and refetches the flags, so the overview drops its
 * Beta row.
 * @returns The screen.
 */
export default function WorkspaceBeta() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const queryClient = useQueryClient()
  const beta = useTenantBeta(slug)
  const closed = beta.isError && statusFrom(beta.error) === 404
  const { errorUpdatedAt } = beta

  // Once per 404: read the flags again, even where nothing observes them now.
  useEffect(() => {
    if (!closed) return
    void queryClient.invalidateQueries({ queryKey: tenantFlagsKey(slug), refetchType: 'all' })
  }, [closed, errorUpdatedAt, queryClient, slug])

  if (closed) {
    return (
      <Screen title="Page not found" topInset={false}>
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
      {body}
    </Screen>
  )
}

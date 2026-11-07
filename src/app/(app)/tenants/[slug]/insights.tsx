import { useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Screen } from '@/components/ui/screen'
import { useFeature } from '@/queries/billing.queries'
import { INSIGHTS_LOCKED, useTenantInsights } from '@/queries/insights.queries'

/** The feature's catalog key. */
const FEATURE = 'advanced_example'

/** The card's title. */
const TITLE = 'Workspace insights'

/** What the feature gives. */
const VALUE_LINE = 'See who joined and how many invitations went out in the last 30 days.'

/** What a failed read says. */
const INSIGHTS_ERROR =
  'We couldn’t load the insights, so none are shown. Select Try again to load them.'

/**
 * One card: a title and a body.
 * @param props - The title, an optional line under it and the body.
 * @param props.title - The card's title, plain text so the screen keeps one header.
 * @param props.description - A line under the title.
 * @param props.children - The body.
 * @returns The card.
 */
function Card({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <View className="gap-3 rounded-lg border border-border p-4">
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {description === undefined ? null : (
        <Text className="text-base text-muted-foreground">{description}</Text>
      )}
      {children}
    </View>
  )
}

/**
 * The card a plan without the feature sees. It offers no action: billing
 * actions wait for the billing plan.
 * @returns The card.
 */
function LockedCard() {
  return (
    <Card title={TITLE} description={VALUE_LINE}>
      <Text className="text-base text-foreground">Included in Paid.</Text>
    </Card>
  )
}

/**
 * One count and what it counts.
 * @param props - The label and the count.
 * @param props.label - What the count is.
 * @param props.value - The count.
 * @returns The stat.
 */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View className="gap-1 rounded-lg border border-border p-4">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-3xl font-semibold text-foreground">{String(value)}</Text>
    </View>
  )
}

/**
 * The body: the locked card when the plan lacks the feature or the API
 * refused it, the two counts otherwise. Insights are asked for only when the
 * entitlements include the feature.
 * @param props - The workspace.
 * @param props.slug - The workspace's web address.
 * @returns The body.
 */
function InsightsBody({ slug }: { slug: string }) {
  const { enabled } = useFeature(slug, FEATURE)
  const insights = useTenantInsights(slug, { enabled: enabled === true })
  if (enabled === false || insights.data === INSIGHTS_LOCKED) return <LockedCard />
  if (insights.data !== undefined) {
    return (
      <Card title={TITLE}>
        <Stat label="Members joined, last 30 days" value={insights.data.membersJoinedLast30Days} />
        <Stat
          label="Invitations sent, last 30 days"
          value={insights.data.invitationsSentLast30Days}
        />
      </Card>
    )
  }
  if (insights.isError) {
    return (
      <LoadError
        message={INSIGHTS_ERROR}
        onRetry={() => {
          void insights.refetch()
        }}
      />
    )
  }
  return <ActivityIndicator accessibilityLabel="Loading insights" />
}

/**
 * A workspace's Insights, open to every member. The plan decides whether the
 * screen shows the counts or the locked card.
 * @returns The screen.
 */
export default function WorkspaceInsights() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return (
    <Screen title="Insights" topInset={false}>
      <InsightsBody slug={slug} />
    </Screen>
  )
}

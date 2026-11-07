import { router } from 'expo-router'
import { Alert, ActivityIndicator, Text, View } from 'react-native'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { canManageTenant, type MembershipRole } from '@/constants/roles'
import { WORKSPACE_SECTIONS } from '@/constants/settings'
import { useNow } from '@/hooks/use-now'
import { messageFrom, statusFrom } from '@/lib/api-error'
import { toast } from '@/lib/toast'
import { useVariant } from '@/observability/flags/flag-hooks'
import { analyticsKey, track, type AnalyticsKey } from '@/observability/telemetry'
import {
  useCompleteOnboardingStep,
  useDismissOnboarding,
  useTenantOnboarding,
  useUndismissOnboarding,
} from '@/queries/onboarding.queries'
import type { OnboardingStepView, TenantAccess, TenantOnboarding } from '@/types/api.types'

/** How long "You’re all set" stays after the last required step. */
const ALL_SET_WINDOW_MS = 24 * 60 * 60 * 1000

/** Said to a member who cannot do a step that an owner or admin can. */
const OWNER_OR_ADMIN = 'An owner or admin can do this'

/** What a failed read says: a claim about the request. */
const LOAD_ERROR = 'We couldn’t load getting started because the request failed. Select Try again.'

/** What the viewer may do. Staff through platform access read and act on nothing. */
interface Viewer {
  /** A real membership, not platform access. */
  isMember: boolean
  /** Owner or admin by membership. */
  canManage: boolean
  /** Owner by membership: dismiss and show. */
  isOwner: boolean
}

/** The auto steps that link to a settings screen: the label, the section and the analytics key a press sends. */
const STEP_LINKS: ReadonlyMap<
  string,
  { label: string; section: 'general' | 'members'; cta: AnalyticsKey }
> = new Map([
  [
    'configure_settings',
    { label: 'Open settings', section: 'general', cta: analyticsKey('onboarding_open_settings') },
  ],
  [
    'invite_teammate',
    { label: 'Open members', section: 'members', cta: analyticsKey('onboarding_open_members') },
  ],
])

/**
 * Derives what a viewer may do from their role and how they reached the workspace.
 * @param role - The viewer's role.
 * @param access - How they reached the workspace.
 * @returns The viewer's powers.
 */
function viewerFor(role: MembershipRole, access: TenantAccess): Viewer {
  const isMember = access === 'member'
  return {
    isMember,
    canManage: isMember && canManageTenant(role),
    isOwner: isMember && role === 'owner',
  }
}

/**
 * Whether a complete checklist finished recently enough to say so.
 * @param onboarding - The checklist.
 * @param now - The current time in milliseconds.
 * @returns True within 24 hours of `completedAt`.
 */
function isRecentlyComplete(onboarding: TenantOnboarding, now: number): boolean {
  if (onboarding.completedAt === null) return false
  const completedAt = Date.parse(onboarding.completedAt)
  return !Number.isNaN(completedAt) && now - completedAt < ALL_SET_WINDOW_MS
}

/**
 * Mark done for a manual step.
 * @param props - The workspace and the step.
 * @param props.slug - The workspace's web address.
 * @param props.step - The step.
 * @returns The button.
 */
function MarkDone({ slug, step }: { slug: string; step: OnboardingStepView }) {
  const complete = useCompleteOnboardingStep(slug)
  return (
    <Button
      variant="secondary"
      label="Mark done"
      loading={complete.isPending}
      onPress={() => {
        complete.mutateAsync(step.key).then(
          () => {
            toast.success(`“${step.title}” marked done.`)
          },
          (error: unknown) => {
            toast.error(messageFrom(error))
          }
        )
      }}
    />
  )
}

/** A step link's entry in `STEP_LINKS`. */
type StepLinkTarget = NonNullable<ReturnType<(typeof STEP_LINKS)['get']>>

/**
 * A step's button to its settings screen, styled by the `example_cta_experiment`
 * variant: secondary for `control`, primary for `bold`. Reading the variant
 * here reports the exposure only for a viewer who sees a button. A press
 * sends `feature_cta_clicked`, the experiment's metric.
 * @param props - The workspace, the link and what opens its screen.
 * @param props.slug - The workspace's web address, whose flags it reads.
 * @param props.link - The step's link.
 * @param props.onOpen - Opens the settings screen.
 * @returns The button.
 */
function StepLinkButton({
  slug,
  link,
  onOpen,
}: {
  slug: string
  link: StepLinkTarget
  onOpen: () => void
}) {
  const variant = useVariant('example_cta_experiment', slug)
  return (
    <Button
      variant={variant === 'bold' ? 'primary' : 'secondary'}
      label={link.label}
      onPress={() => {
        track('feature_cta_clicked', { cta: link.cta })
        onOpen()
      }}
    />
  )
}

/**
 * The one thing a pending step offers this viewer: Mark done for a manual
 * step, or a link to workspace settings for the steps that need them.
 * @param props - The workspace, the step and the viewer.
 * @param props.slug - The workspace's web address.
 * @param props.step - The step.
 * @param props.viewer - What the viewer may do.
 * @returns The action, or nothing.
 */
function StepAction({
  slug,
  step,
  viewer,
}: {
  slug: string
  step: OnboardingStepView
  viewer: Viewer
}) {
  if (step.completedAt !== null || !viewer.isMember) return null
  if (step.kind !== 'manual') {
    const link = STEP_LINKS.get(step.key)
    if (link === undefined) return null
    if (!viewer.canManage)
      return <Text className="text-sm text-muted-foreground">{OWNER_OR_ADMIN}</Text>
    const target = WORKSPACE_SECTIONS.find((s) => s.key === link.section)
    return (
      <StepLinkButton
        slug={slug}
        link={link}
        onOpen={() => {
          if (target !== undefined) router.push(target.path(slug))
        }}
      />
    )
  }
  // A workspace-scoped manual step changes the workspace for everyone, so the API wants an owner or admin.
  if (step.scope === 'tenant' && !viewer.canManage) {
    return <Text className="text-sm text-muted-foreground">{OWNER_OR_ADMIN}</Text>
  }
  return <MarkDone slug={slug} step={step} />
}

/**
 * One checklist row: title, an Optional badge, description, state and action.
 * @param props - The workspace, the step and the viewer.
 * @param props.slug - The workspace's web address.
 * @param props.step - The step.
 * @param props.viewer - What the viewer may do.
 * @returns The row.
 */
function StepItem({
  slug,
  step,
  viewer,
}: {
  slug: string
  step: OnboardingStepView
  viewer: Viewer
}) {
  return (
    <View className="gap-1 rounded-lg border border-border p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-base font-medium text-foreground">{step.title}</Text>
        {step.required ? null : <Text className="text-sm text-muted-foreground">Optional</Text>}
      </View>
      <Text className="text-sm text-muted-foreground">{step.description}</Text>
      <Text className="text-sm font-medium text-foreground">
        {step.completedAt === null ? 'Not done' : 'Done'}
      </Text>
      <StepAction slug={slug} step={step} viewer={viewer} />
    </View>
  )
}

/**
 * Dismiss, behind an alert, since it hides the checklist for every member.
 * @param props - The workspace.
 * @param props.slug - The workspace's web address.
 * @returns The button.
 */
function DismissButton({ slug }: { slug: string }) {
  const dismiss = useDismissOnboarding(slug)
  return (
    <Button
      variant="ghost"
      label="Dismiss"
      loading={dismiss.isPending}
      onPress={() => {
        Alert.alert(
          'Dismiss getting started?',
          'The checklist is hidden for everyone in this workspace. An owner can show it again from this page.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Dismiss',
              style: 'destructive',
              onPress: () => {
                dismiss.mutateAsync().then(
                  () => {
                    toast.success('Getting started dismissed.')
                  },
                  (error: unknown) => {
                    toast.error(messageFrom(error))
                  }
                )
              },
            },
          ]
        )
      }}
    />
  )
}

/**
 * The owner's way back from a dismissal.
 * @param props - The workspace.
 * @param props.slug - The workspace's web address.
 * @returns The note and the button.
 */
function ShowGettingStarted({ slug }: { slug: string }) {
  const undismiss = useUndismissOnboarding(slug)
  return (
    <View className="gap-2">
      <Text className="text-base text-muted-foreground">
        Getting started is hidden for this workspace.
      </Text>
      <Button
        variant="secondary"
        label="Show getting started"
        loading={undismiss.isPending}
        onPress={() => {
          undismiss.mutateAsync().then(
            () => {
              toast.success('Getting started shown.')
            },
            (error: unknown) => {
              toast.error(messageFrom(error))
            }
          )
        }}
      />
    </View>
  )
}

/**
 * The workspace's Getting started checklist, in the server's order. In
 * progress: the checklist. Complete: "You’re all set" for 24 hours after the
 * last required step, then nothing. Dismissed: the owner's way back, nothing
 * for anyone else. Not tracked, or an API without the route (404): nothing.
 * A failed load says so with Try again, never as an empty card.
 * @param props - The workspace and the viewer.
 * @param props.slug - The workspace's web address.
 * @param props.role - The viewer's role there.
 * @param props.access - How the viewer reached it.
 * @returns The card, or nothing.
 */
export function GettingStarted({
  slug,
  role,
  access,
}: {
  slug: string
  role: MembershipRole
  access: TenantAccess
}) {
  const onboarding = useTenantOnboarding(slug)
  const now = useNow()
  const data = onboarding.data
  if (data === undefined) {
    if (!onboarding.isError)
      return <ActivityIndicator accessibilityLabel="Loading getting started" />
    // An API older than the checklist answers 404: the workspace simply has none.
    if (statusFrom(onboarding.error) === 404) return null
    return (
      <LoadError
        message={LOAD_ERROR}
        onRetry={() => {
          void onboarding.refetch()
        }}
      />
    )
  }
  const viewer = viewerFor(role, access)
  switch (data.state) {
    case 'in_progress':
      return (
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-lg font-semibold text-foreground">Getting started</Text>
              <Text className="text-sm text-muted-foreground">
                {`${String(data.requiredDone)} of ${String(data.requiredTotal)} required`}
              </Text>
            </View>
            {viewer.isOwner ? <DismissButton slug={slug} /> : null}
          </View>
          {data.steps.map((step) => (
            <StepItem key={step.key} slug={slug} step={step} viewer={viewer} />
          ))}
        </View>
      )
    case 'complete':
      return isRecentlyComplete(data, now) ? (
        <View className="gap-1">
          <Text className="text-lg font-semibold text-foreground">You’re all set</Text>
          <Text className="text-base text-muted-foreground">
            Every required getting started step is done.
          </Text>
        </View>
      ) : null
    case 'dismissed':
      return viewer.isOwner ? <ShowGettingStarted slug={slug} /> : null
    case 'not_tracked':
      return null
  }
}

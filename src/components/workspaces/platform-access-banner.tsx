import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { ROLE_LABELS } from '@/constants/roles'
import { cn } from '@/lib/cn'
import { useTenant } from '@/queries/tenant.queries'

/**
 * Says whose workspace this is when platform staff reached it without being
 * a member. It shows on the overview and on every workspace settings screen,
 * and it cannot be dismissed, because it stays true while the screen is open.
 * It renders nothing for a member, and while the workspace loads.
 * @param props - The workspace.
 * @param props.slug - The workspace's web address.
 * @returns The banner, or nothing.
 */
export function PlatformAccessBanner({ slug }: { slug: string }) {
  const tenant = useTenant(slug).data
  if (tenant == null || tenant.access !== 'platform') return null
  return (
    <View className="gap-1 rounded-lg border border-info bg-muted p-3">
      <Text className="text-base text-foreground">
        {'You’re viewing '}
        <Text className="font-semibold">{tenant.name}</Text>
        {` as platform staff (${ROLE_LABELS[tenant.role]}).`}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Back to your workspaces"
        onPress={() => {
          router.push('/tenants')
        }}
        className={cn(TOUCH_TARGET, 'justify-center')}
      >
        <Text className="text-base font-medium text-info underline">Back to your workspaces</Text>
      </Pressable>
    </View>
  )
}

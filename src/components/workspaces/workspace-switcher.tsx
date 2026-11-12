import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LoadError } from '@/components/shared/load-error'
import { Button } from '@/components/ui/button'
import { TOUCH_TARGET } from '@/components/ui/touch-target'
import { cn } from '@/lib/cn'
import { TENANTS_ERROR } from '@/lib/tenants-error'
import { useTenants, type TenantWithRole } from '@/queries/tenant.queries'
import { useAuthStore } from '@/states/auth.store'
import { useCurrentTenantStore } from '@/states/current-tenant.store'

/** Props of `WorkspaceSwitcher`. */
interface WorkspaceSwitcherProps {
  /** The web address of the open workspace, when the route has one. */
  currentSlug?: string
  /**
   * True where the screen shows the remembered workspace itself, as the tab
   * does: choosing one remembers it and stays. Otherwise it opens the
   * workspace's screen.
   */
  inPlace?: boolean
}

/**
 * One row of the sheet. A suspended workspace is listed, tagged and disabled.
 * @param props - The membership and the choose handler.
 * @param props.entry - The membership row.
 * @param props.onChoose - Called with the web address of an active workspace.
 * @returns The row.
 */
function SwitcherRow({
  entry,
  onChoose,
}: {
  entry: TenantWithRole
  onChoose: (slug: string) => void
}) {
  const { name, slug, lifecycleState } = entry.tenant
  const suspended = lifecycleState === 'suspended'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, /${slug}`}
      accessibilityState={{ disabled: suspended }}
      disabled={suspended}
      onPress={() => {
        onChoose(slug)
      }}
      className={cn(TOUCH_TARGET, 'flex-row items-center gap-2 py-2', suspended && 'opacity-60')}
    >
      <View className="flex-1">
        <Text className="text-base font-medium text-foreground">{name}</Text>
        <Text className="text-sm text-muted-foreground">{`/${slug}`}</Text>
      </View>
      {suspended ? <Text className="text-sm text-muted-foreground">Suspended</Text> : null}
    </Pressable>
  )
}

/**
 * The workspace switcher: a trigger that names the open workspace and a modal
 * sheet (React Native `Modal`) that lists the person's workspaces. Choosing
 * one remembers it and opens it. The platform workspace is not listed, and a
 * failed list shows Try again, never "No workspaces yet".
 * @param props - The open workspace's web address, when known.
 * @param props.currentSlug - The open workspace's web address.
 * @param props.inPlace - True to stay on the screen after choosing.
 * @returns The trigger and its sheet.
 */
export function WorkspaceSwitcher({ currentSlug, inPlace = false }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const tenants = useTenants()
  const userId = useAuthStore((state) => state.user?.id)
  const insets = useSafeAreaInsets()
  const entries = tenants.data?.filter((entry) => !entry.isPlatform)
  const currentName = entries?.find((entry) => entry.tenant.slug === currentSlug)?.tenant.name

  let label = 'Loading workspaces…'
  if (currentName !== undefined) label = currentName
  else if (tenants.data !== undefined) label = 'Choose a workspace'
  else if (tenants.isError) label = 'Workspaces didn’t load'

  /**
   * Remembers the workspace and opens it.
   * @param slug - The chosen workspace's web address.
   */
  const choose = (slug: string): void => {
    if (userId !== undefined) useCurrentTenantStore.getState().remember(userId, slug)
    setOpen(false)
    if (!inPlace) router.push(`/tenants/${slug}`)
  }

  let list
  if (entries === undefined && tenants.isError) {
    list = (
      <LoadError
        message={TENANTS_ERROR}
        onRetry={() => {
          void tenants.refetch()
        }}
      />
    )
  } else if (entries === undefined) {
    list = <ActivityIndicator accessibilityLabel="Loading your workspaces" />
  } else if (entries.length === 0) {
    list = <Text className="text-base text-muted-foreground">No workspaces yet</Text>
  } else {
    list = (
      <View>
        {entries.map((entry) => (
          <SwitcherRow key={entry.tenant.id} entry={entry} onChoose={choose} />
        ))}
      </View>
    )
  }

  return (
    <>
      <Pressable
        testID="workspace-switcher"
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          setOpen(true)
        }}
        className={cn(TOUCH_TARGET, 'justify-center')}
      >
        <Text className="text-base font-medium text-foreground">{label}</Text>
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setOpen(false)
        }}
      >
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="gap-4 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: insets.bottom }}
        >
          <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
            Your workspaces
          </Text>
          {list}
          <Button
            variant="secondary"
            label="Create a workspace"
            onPress={() => {
              setOpen(false)
              router.push('/tenants')
            }}
          />
          <Button
            variant="ghost"
            label="Close"
            onPress={() => {
              setOpen(false)
            }}
          />
        </ScrollView>
      </Modal>
    </>
  )
}

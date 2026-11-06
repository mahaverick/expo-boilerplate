import { useEffect, type ReactNode } from 'react'
import { BackHandler, Linking, Platform, Text, View } from 'react-native'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { storeUrl, useUpdateRequired } from '@/lib/minimum-version'

/**
 * The screen that asks for an update. It ignores the Android back button.
 * With a store URL it offers a button that opens the store; a store that
 * cannot open leaves the screen as it is.
 * @param props - The store link.
 * @param props.url - The store page, or `null` when the build has none.
 * @returns The screen.
 */
export function UpdateScreen({ url }: { url: string | null }) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => {
      subscription.remove()
    }
  }, [])
  return (
    <Screen title="Update the app">
      <Text className="text-base text-foreground">
        This version of the app is no longer supported. Update it to keep going.
      </Text>
      {url && (
        <Button
          label="Open the store"
          variant="primary"
          onPress={() => {
            Linking.openURL(url).catch(() => undefined)
          }}
        />
      )}
    </Screen>
  )
}

/**
 * Wraps the app. When the build is below the server's minimum it draws the
 * update screen over `children` and hides them from screen readers. The
 * children stay mounted, so nothing underneath loses its place.
 * @param props - The app underneath.
 * @param props.children - The app.
 * @returns The app, with the screen over it when an update is required.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const isRequired = useUpdateRequired()
  const url = Platform.OS === 'ios' || Platform.OS === 'android' ? storeUrl(Platform.OS) : null
  return (
    <View className="flex-1">
      <View
        className="flex-1"
        accessibilityElementsHidden={isRequired}
        importantForAccessibility={isRequired ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {isRequired && (
        <View accessibilityViewIsModal className="absolute inset-0 bg-background">
          <UpdateScreen url={url} />
        </View>
      )}
    </View>
  )
}

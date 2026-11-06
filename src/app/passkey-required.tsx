import Constants from 'expo-constants'
import { Stack } from 'expo-router'
import { useEffect } from 'react'
import { BackHandler, Linking, Text } from 'react-native'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { useSignOut } from '@/hooks/use-sign-out'

/**
 * The blocking screen for an account the API refuses until it has a passkey.
 * The app cannot add one yet, so it points to the website and offers Sign out.
 * It ignores the back gesture and the Android back button. "Open the website"
 * shows only when the build knows the web address.
 */
export default function PasskeyRequired() {
  const { signOut, isPending } = useSignOut()
  const webUrl = Constants.expoConfig?.extra?.webUrl as string | undefined

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => {
      subscription.remove()
    }
  }, [])

  return (
    <Screen title="Add a passkey to continue">
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Text className="text-base text-foreground">
        Your account needs a passkey. This app can’t add one yet. Add one on the website under
        Settings, then Security, then come back.
      </Text>
      {webUrl ? (
        <Button
          variant="primary"
          label="Open the website"
          onPress={() => {
            Linking.openURL(`${webUrl}/settings/account/security`).catch(() => {})
          }}
        />
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

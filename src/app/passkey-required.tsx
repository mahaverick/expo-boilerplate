import Constants from 'expo-constants'
import { router, Stack } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useEffect } from 'react'
import { BackHandler, Text } from 'react-native'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'
import { useSignOut } from '@/hooks/use-sign-out'
import { useClientSettings } from '@/queries/client-settings.queries'
import { useAuthStore } from '@/states/auth.store'
import { usePasskeySetupStore } from '@/states/passkey-setup.store'

/**
 * The blocking screen for an account the API refuses until it has a passkey.
 * The app cannot add one yet, so it points to the website and offers Sign out.
 * It ignores the back gesture and the Android back button. "Open the website"
 * shows only when the build knows the web address, and opens the page in an
 * in-app browser: the system's link handler could hand a verified app link
 * back to this app. When the flag clears while
 * the person is signed in, the screen goes Home, where the next refused request
 * sends it back.
 */
export default function PasskeyRequired() {
  const { signOut, isPending } = useSignOut()
  const webUrl = Constants.expoConfig?.extra?.webUrl as string | undefined

  const supportEmail = useClientSettings()?.supportEmail

  const required = usePasskeySetupStore((state) => state.required)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    if (!required && isAuthenticated) router.replace('/')
  }, [required, isAuthenticated])

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
      <Text className="text-base text-foreground">
        {`To ask us to delete your account instead, write to ${supportEmail ?? 'the support address on our website'}.`}
      </Text>
      {webUrl ? (
        <Button
          variant="primary"
          label="Open the website"
          onPress={() => {
            WebBrowser.openBrowserAsync(`${webUrl}/settings/account/security`).catch(() => {})
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

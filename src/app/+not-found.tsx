import { router } from 'expo-router'
import { Button } from '@/components/ui/button'
import { Screen } from '@/components/ui/screen'

/** The screen for a route that matches nothing. */
export default function NotFound() {
  return (
    <Screen title="Page not found">
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

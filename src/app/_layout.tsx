import { Stack } from 'expo-router'

/** The root layout: one stack, with no header on the placeholder screen. */
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}

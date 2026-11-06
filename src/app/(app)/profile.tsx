import { Redirect, type Href } from 'expo-router'

/**
 * The `/profile` path. It sends the person to Profile under account settings.
 * @returns The redirect.
 */
export default function ProfileRedirect() {
  // Typed routes list this screen once its file exists.
  return <Redirect href={'/settings/account/profile' as Href} />
}

import { Redirect } from 'expo-router'

/**
 * The `/profile` path. It sends the person to Profile under account settings.
 * @returns The redirect.
 */
export default function ProfileRedirect() {
  return <Redirect href={'/settings/account/profile'} />
}

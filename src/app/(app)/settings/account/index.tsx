import { Redirect, type Href } from 'expo-router'

/**
 * The account settings root. It sends the person to Profile.
 * @returns The redirect.
 */
export default function AccountIndex() {
  // Typed routes list this screen once its file exists.
  return <Redirect href={'/settings/account/profile' as Href} />
}

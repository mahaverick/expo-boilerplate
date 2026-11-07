import { Redirect } from 'expo-router'

/**
 * The account settings root. It sends the person to Profile.
 * @returns The redirect.
 */
export default function AccountIndex() {
  return <Redirect href={'/settings/account/profile'} />
}

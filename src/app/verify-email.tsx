import { Redirect } from 'expo-router'

/**
 * A retired password page. The app signs in with an emailed link, so a saved
 * or old link to `/verify-email` goes to sign-in with a notice. It keeps no other
 * query, so nothing a retired link carried reaches the next screen.
 * @returns A redirect to `/login?notice=sign-in-link`.
 */
export default function VerifyEmail() {
  return <Redirect href="/login?notice=sign-in-link" />
}

/**
 * @file The navigation port: leaving the app's current screen. Each app
 * writes its own copy; shared files never read `window.location`.
 */
import { openURL } from 'expo-linking'
import { router, type Href } from 'expo-router'

/**
 * Goes to `url`, as the web's full-page load does. A path (`/login`, the
 * sign-out default) replaces the current route, so back does not return to
 * the signed-in screen. An absolute URL opens in the app that handles it; a
 * URL nothing handles is dropped, never left as an unhandled rejection.
 * @param url - The app path, or the absolute URL, to go to.
 */
export function assignLocation(url: string): void {
  if (url.startsWith('/')) {
    // The port takes any app path shared code passes, so typed routes cannot list it.
    router.replace(url as Href)
    return
  }
  openURL(url).catch(() => {})
}

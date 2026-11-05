/**
 * @file The navigation port: leaving the app's current screen for a URL.
 * Each app writes its own copy; shared files never read `window.location`.
 */
import { openURL } from 'expo-linking'

/**
 * Opens `url`: an app link routes inside the app, any other URL opens in the
 * app that handles it.
 * @param url - The URL to open.
 */
export function assignLocation(url: string): void {
  void openURL(url)
}

import type { ConfigContext, ExpoConfig } from 'expo/config'
import packageJson from './package.json'

/** The paths the web app's association files claim, from react's `docker/15-app-links.sh`. `/tenants/*` is the prefix `/tenants/`. */
const APP_LINK_PATH_PREFIXES = [
  '/auth/link',
  '/auth/confirm',
  '/invitations/accept',
  '/invitations/confirm',
  '/settings/account/security',
  '/tenants/',
]

/** A bare hostname: dot-separated labels, no scheme, port or path. */
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

/**
 * The web app's host from `APP_LINK_HOST`, or undefined when unset or empty.
 * @returns A bare hostname.
 * @throws When the value is not a bare hostname.
 */
function appLinkHost(): string | undefined {
  const host = process.env.APP_LINK_HOST?.trim()
  if (!host) return undefined
  if (!HOSTNAME.test(host)) {
    throw new Error(
      `APP_LINK_HOST must be a bare hostname such as app.example.com, with no scheme, port or path. Got "${host}".`
    )
  }
  return host
}

/** The app's Expo config. The version comes from package.json, which release tooling bumps. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const host = appLinkHost()
  return {
    ...config,
    name: 'expo-boilerplate',
    slug: 'expo-boilerplate',
    version: packageJson.version,
    scheme: 'expo-boilerplate',
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: 'com.mahaverick.expoboilerplate',
      supportsTablet: false,
      ...(host && { associatedDomains: [`applinks:${host}`, `webcredentials:${host}`] }),
      infoPlist: {
        // Plain HTTP reaches only local hosts, such as a simulator's localhost API.
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true },
      },
    },
    android: {
      package: 'com.mahaverick.expoboilerplate',
      predictiveBackGestureEnabled: true,
      ...(host && {
        intentFilters: [
          {
            action: 'VIEW',
            autoVerify: true,
            data: APP_LINK_PATH_PREFIXES.map((pathPrefix) => ({
              scheme: 'https',
              host,
              pathPrefix,
            })),
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
      }),
      // The template's optional permissions; nothing in the app uses them. INTERNET stays.
      blockedPermissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.VIBRATE',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
    },
    plugins: ['expo-router', './plugins/with-backup-rules'],
    ...(host && { extra: { webUrl: `https://${host}` } }),
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  }
}

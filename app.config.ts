import type { ConfigContext, ExpoConfig } from 'expo/config'
import packageJson from './package.json'

/**
 * The paths the Android intent filter claims: only those this app has a
 * screen for. A verified app link to any other path opens the app on Page not
 * found, so each later plan adds its paths with its screens. iOS claims the
 * paths in react's apple-app-site-association file (`docker/15-app-links.sh`).
 */
const ANDROID_APP_LINK_PATH_PREFIXES = [
  '/auth/link',
  '/tenants/',
  '/auth/confirm',
  '/settings/account/security',
  '/invitations/accept',
  '/invitations/confirm',
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

/**
 * The App Store ID from `IOS_APP_STORE_ID`, or undefined when unset or empty.
 * @returns The digits of the ID.
 * @throws When the value is not all digits.
 */
function iosAppStoreId(): string | undefined {
  const id = process.env.IOS_APP_STORE_ID?.trim()
  if (!id) return undefined
  if (!/^\d+$/.test(id)) {
    throw new Error(`IOS_APP_STORE_ID must be all digits, such as 1234567890. Got "${id}".`)
  }
  return id
}

/**
 * The privacy policy address from `PRIVACY_POLICY_URL`, or undefined when
 * unset or empty.
 * @returns An https URL.
 * @throws When the value is not an https URL.
 */
function privacyPolicyUrl(): string | undefined {
  const url = process.env.PRIVACY_POLICY_URL?.trim()
  if (!url) return undefined
  let valid: boolean
  try {
    const parsed = new URL(url)
    valid = parsed.protocol === 'https:' && parsed.hostname !== ''
  } catch {
    valid = false
  }
  if (!valid) {
    throw new Error(
      `PRIVACY_POLICY_URL must be an https URL such as https://example.com/privacy. Got "${url}".`
    )
  }
  return url
}

/** The app's Expo config. The version comes from package.json, which release tooling bumps. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const host = appLinkHost()
  const storeId = iosAppStoreId()
  const policyUrl = privacyPolicyUrl()
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
      ...(host && {
        associatedDomains: [`applinks:${host}`, `webcredentials:${host}`],
      }),
      infoPlist: {
        // Plain HTTP reaches only local hosts, such as a simulator's localhost API.
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: true,
        },
        // The app uses only the operating system's exempt encryption (HTTPS).
        ITSAppUsesNonExemptEncryption: false,
      },
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
            NSPrivacyAccessedAPITypeReasons: ['C617.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
            NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
          },
        ],
        NSPrivacyCollectedDataTypes: [
          {
            NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeProductInteraction',
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'],
          },
          {
            NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeUserID',
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'],
          },
          {
            NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
            NSPrivacyCollectedDataTypeLinked: false,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            ],
          },
        ],
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
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
            data: ANDROID_APP_LINK_PATH_PREFIXES.map((pathPrefix) => ({
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
    plugins: ['expo-router', 'expo-web-browser', './plugins/with-backup-rules'],
    ...((host || storeId || policyUrl) && {
      extra: {
        ...(host && { webUrl: `https://${host}` }),
        ...(storeId && { iosAppStoreId: storeId }),
        ...(policyUrl && { privacyPolicyUrl: policyUrl }),
      },
    }),
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  }
}

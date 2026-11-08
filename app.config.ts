import { existsSync } from 'node:fs'
import { join } from 'node:path'
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

/** The four builds of the app: one per place it runs. */
export type AppVariant = 'development' | 'e2e' | 'preview' | 'production'

/**
 * What differs between variants. Development and e2e reach a local API over
 * plain HTTP and take no updates; preview and production are HTTPS only and
 * take updates from the channel of the same name.
 */
export const VARIANTS: Record<
  AppVariant,
  {
    idSuffix: string
    nameSuffix: string
    channel: 'preview' | 'production' | null
    localNetwork: boolean
  }
> = {
  development: { idSuffix: '.dev', nameSuffix: ' Dev', channel: null, localNetwork: true },
  e2e: { idSuffix: '.e2e', nameSuffix: ' E2E', channel: null, localNetwork: true },
  preview: {
    idSuffix: '.preview',
    nameSuffix: ' Preview',
    channel: 'preview',
    localNetwork: false,
  },
  production: { idSuffix: '', nameSuffix: '', channel: 'production', localNetwork: false },
}

/**
 * The build variant from `APP_VARIANT`, or production when unset or empty.
 * @returns The variant.
 * @throws When the value is not one of the four variants.
 */
export function appVariant(): AppVariant {
  const value = process.env.APP_VARIANT?.trim() || 'production'
  if (!Object.hasOwn(VARIANTS, value)) {
    throw new Error(
      `APP_VARIANT must be one of development, e2e, preview or production. Got "${value}".`
    )
  }
  return value as AppVariant
}

/**
 * The EAS project ID from `EAS_PROJECT_ID`, or undefined when unset or empty.
 * @returns A lowercase UUID.
 * @throws When the value is not a lowercase UUID.
 */
function easProjectId(): string | undefined {
  const id = process.env.EAS_PROJECT_ID?.trim()
  if (!id) return undefined
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw new Error(
      `EAS_PROJECT_ID must be a UUID such as 0f8b4a52-3c1e-4d6f-9a7b-2e5c8d1f4a90. Got "${id}".`
    )
  }
  return id
}

/**
 * The over-the-air update settings of one variant. Updates are on only when
 * the variant has a channel, an EAS project ID is set and the variant's
 * certificate exists, so a build never carries updates it cannot verify.
 * The runtime version is a fingerprint in every variant.
 * @param variant - The build variant.
 * @param projectId - The EAS project ID, or undefined when unset.
 * @param certExists - Whether a file exists at a project-relative path.
 * @returns The `updates` and `runtimeVersion` fields.
 */
export function updatesConfig(
  variant: AppVariant,
  projectId: string | undefined,
  certExists: (path: string) => boolean
): Pick<ExpoConfig, 'updates' | 'runtimeVersion'> {
  const runtimeVersion = { policy: 'fingerprint' } as const
  const certificate = `certs/${variant}/certificate.pem`
  if (VARIANTS[variant].channel === null || !projectId || !certExists(certificate)) {
    return { updates: { enabled: false }, runtimeVersion }
  }
  return {
    updates: {
      enabled: true,
      url: `https://u.expo.dev/${projectId}`,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      codeSigningCertificate: `./${certificate}`,
      codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
    },
    runtimeVersion,
  }
}

/** The app's Expo config. The version comes from package.json, which release tooling bumps. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const host = appLinkHost()
  const storeId = iosAppStoreId()
  const policyUrl = privacyPolicyUrl()
  const projectId = easProjectId()
  const variant = appVariant()
  const uploadsSourceMaps = Boolean(process.env.POSTHOG_CLI_API_KEY?.trim())
  const { idSuffix, nameSuffix, localNetwork } = VARIANTS[variant]
  const appId = `com.mahaverick.expoboilerplate${idSuffix}`
  return {
    ...config,
    name: `expo-boilerplate${nameSuffix}`,
    slug: 'expo-boilerplate',
    version: packageJson.version,
    scheme: 'expo-boilerplate',
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: appId,
      supportsTablet: false,
      ...(host && {
        associatedDomains: [`applinks:${host}`, `webcredentials:${host}`],
      }),
      infoPlist: {
        // Development and e2e builds reach a local API over plain HTTP; preview and production allow HTTPS only.
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          ...(localNetwork && { NSAllowsLocalNetworking: true }),
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
            NSPrivacyCollectedDataTypeLinked: true,
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
      package: appId,
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
    plugins: [
      'expo-router',
      'expo-web-browser',
      './plugins/with-backup-rules',
      // Cleartext HTTP is for the local API of development and e2e builds only.
      ['expo-build-properties', { android: { usesCleartextTraffic: localNetwork } }],
      // Its Gradle and Xcode steps upload the Hermes source maps through posthog-cli, which needs the key.
      ...(uploadsSourceMaps ? ['posthog-react-native/expo'] : []),
    ],
    ...updatesConfig(variant, projectId, (path) => existsSync(join(__dirname, path))),
    ...((host || storeId || policyUrl || projectId) && {
      extra: {
        ...(host && { webUrl: `https://${host}` }),
        ...(storeId && { iosAppStoreId: storeId }),
        ...(policyUrl && { privacyPolicyUrl: policyUrl }),
        ...(projectId && { eas: { projectId } }),
      },
    }),
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  }
}

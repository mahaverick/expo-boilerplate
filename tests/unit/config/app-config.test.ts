import { createHash } from 'node:crypto'
import { jest } from '@jest/globals'
import type { ExpoConfig } from 'expo/config'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'
import { releaseLine, updatesConfig } from '../../../app.config'
import packageJson from '../../../package.json'

const ENV_KEYS = [
  'APP_VARIANT',
  'APP_LINK_HOST',
  'IOS_APP_STORE_ID',
  'PRIVACY_POLICY_URL',
  'EAS_PROJECT_ID',
  'POSTHOG_CLI_API_KEY',
] as const
/** A variable the config reads. */
type EnvKey = (typeof ENV_KEYS)[number]

/**
 * The config as Expo builds it, with exactly these variables set: every other
 * variable the config reads is unset. Modules reset first.
 */
function configFor(env: Partial<Record<EnvKey, string>>): ExpoConfig {
  for (const key of ENV_KEYS) {
    const value = env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  let result: ExpoConfig | undefined
  jest.isolateModules(() => {
    // oxlint-disable-next-line typescript/no-require-imports
    const mod = require('../../../app.config') as {
      default: (ctx: { config: Partial<ExpoConfig> }) => ExpoConfig
    }
    result = mod.default({ config: {} })
  })
  return result as ExpoConfig
}

/** The options of the `expo-build-properties` plugin entry, or undefined when absent. */
function buildProperties(
  config: ExpoConfig
): { android?: { usesCleartextTraffic?: boolean } } | undefined {
  const entry = config.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
  )
  return Array.isArray(entry) ? (entry[1] as ReturnType<typeof buildProperties>) : undefined
}

const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('app.config', () => {
  it.each([
    ['development', 'com.mahaverick.expoboilerplate.dev', 'expo-boilerplate Dev'],
    ['e2e', 'com.mahaverick.expoboilerplate.e2e', 'expo-boilerplate E2E'],
    ['preview', 'com.mahaverick.expoboilerplate.preview', 'expo-boilerplate Preview'],
    ['production', 'com.mahaverick.expoboilerplate', 'expo-boilerplate'],
  ])('gives the %s variant its app ID and name', (variant, id, name) => {
    const config = configFor({ APP_VARIANT: variant })
    expect(config.ios?.bundleIdentifier).toBe(id)
    expect(config.android?.package).toBe(id)
    expect(config.name).toBe(name)
  })

  it.each(['development', 'e2e', 'preview', 'production'])(
    'puts the %s variant in extra.appVariant',
    (variant) => {
      expect(configFor({ APP_VARIANT: variant }).extra?.appVariant).toBe(variant)
    }
  )

  it('sets extra.appVariant to production with no variant', () => {
    expect(configFor({}).extra?.appVariant).toBe('production')
  })

  it('builds production with every variable unset: no local networking and no cleartext', () => {
    const config = configFor({})
    expect(config.ios?.bundleIdentifier).toBe('com.mahaverick.expoboilerplate')
    expect(config.ios?.infoPlist?.NSAppTransportSecurity).toEqual({ NSAllowsArbitraryLoads: false })
    expect(buildProperties(config)?.android?.usesCleartextTraffic).toBe(false)
  })

  it.each(['development', 'e2e'])('lets %s reach a local API over plain HTTP', (variant) => {
    const config = configFor({ APP_VARIANT: variant })
    expect(config.ios?.infoPlist?.NSAppTransportSecurity).toEqual({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
    })
    expect(buildProperties(config)?.android?.usesCleartextTraffic).toBe(true)
  })

  it('keeps preview on HTTPS only', () => {
    const config = configFor({ APP_VARIANT: 'preview' })
    expect(config.ios?.infoPlist?.NSAppTransportSecurity).toEqual({ NSAllowsArbitraryLoads: false })
    expect(buildProperties(config)?.android?.usesCleartextTraffic).toBe(false)
  })

  it('trims APP_VARIANT and treats an empty value as production', () => {
    expect(configFor({ APP_VARIANT: ' preview ' }).name).toBe('expo-boilerplate Preview')
    expect(configFor({ APP_VARIANT: '' }).name).toBe('expo-boilerplate')
  })

  it('fails on an unknown variant, naming the four', () => {
    expect(() => configFor({ APP_VARIANT: 'staging' })).toThrow(
      /APP_VARIANT must be one of development, e2e, preview or production/
    )
  })

  it('registers the backup-rules plugin', () => {
    const config = configFor({})
    expect(config.plugins).toContain('./plugins/with-backup-rules')
  })

  it('registers the expo-web-browser plugin', () => {
    const config = configFor({})
    expect(config.plugins).toContain('expo-web-browser')
  })

  // The build and an update must agree on the fingerprint, and only the build sees a secret key.
  it.each([[undefined], [''], ['  '], ['phx_test_not_real']])(
    'adds no PostHog plugin whatever POSTHOG_CLI_API_KEY is (%p)',
    (key) => {
      const config = configFor(key === undefined ? {} : { POSTHOG_CLI_API_KEY: key })
      const names = (config.plugins ?? []).map((plugin) =>
        Array.isArray(plugin) ? String(plugin[0]) : plugin
      )
      expect(names.filter((name) => name.startsWith('posthog-react-native/expo'))).toEqual([])
    }
  )

  it('wires app links to APP_LINK_HOST, claiming /auth/link, /tenants/, /auth/confirm, /settings/account/security, /invitations/accept and /invitations/confirm', () => {
    const config = configFor({ APP_LINK_HOST: 'app.example.com' })
    expect(config.ios?.associatedDomains).toEqual([
      'applinks:app.example.com',
      'webcredentials:app.example.com',
    ])
    expect(config.android?.intentFilters).toEqual([
      {
        action: 'VIEW',
        autoVerify: true,
        // Only the paths with a screen: a verified link to any other path would loop back into the app.
        data: [
          { scheme: 'https', host: 'app.example.com', pathPrefix: '/auth/link' },
          { scheme: 'https', host: 'app.example.com', pathPrefix: '/tenants/' },
          { scheme: 'https', host: 'app.example.com', pathPrefix: '/auth/confirm' },
          { scheme: 'https', host: 'app.example.com', pathPrefix: '/settings/account/security' },
          { scheme: 'https', host: 'app.example.com', pathPrefix: '/invitations/accept' },
          { scheme: 'https', host: 'app.example.com', pathPrefix: '/invitations/confirm' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ])
    expect(config.extra?.webUrl).toBe('https://app.example.com')
  })

  it('has no app links with the host unset or empty', () => {
    for (const host of [undefined, '']) {
      const config = configFor({ APP_LINK_HOST: host })
      expect(config.ios?.associatedDomains).toBeUndefined()
      expect(config.android?.intentFilters).toBeUndefined()
      expect(config.extra?.webUrl).toBeUndefined()
    }
  })

  it.each(['https://app.example.com', 'app.example.com/path', 'app example.com', 'localhost:8080'])(
    'rejects %s as a host',
    (host) => {
      expect(() => configFor({ APP_LINK_HOST: host })).toThrow(/APP_LINK_HOST/)
    }
  )
})

describe('app.config iosAppStoreId', () => {
  it('puts IOS_APP_STORE_ID in extra', () => {
    expect(configFor({ IOS_APP_STORE_ID: '1234567890' }).extra?.iosAppStoreId).toBe('1234567890')
  })

  it('leaves it out when unset or empty', () => {
    for (const id of [undefined, '']) {
      expect(configFor({ IOS_APP_STORE_ID: id }).extra?.iosAppStoreId).toBeUndefined()
    }
  })

  it('keeps webUrl beside it', () => {
    const extra = configFor({ IOS_APP_STORE_ID: '42', APP_LINK_HOST: 'app.example.com' }).extra
    expect(extra?.iosAppStoreId).toBe('42')
    expect(extra?.webUrl).toBe('https://app.example.com')
  })

  it.each(['id123', '12 3', '12.3', '-1'])('rejects %s as a store ID', (id) => {
    expect(() => configFor({ IOS_APP_STORE_ID: id })).toThrow(/IOS_APP_STORE_ID/)
  })
})

describe('app.config privacyPolicyUrl', () => {
  it('puts PRIVACY_POLICY_URL in extra', () => {
    expect(
      configFor({ PRIVACY_POLICY_URL: 'https://example.com/privacy' }).extra?.privacyPolicyUrl
    ).toBe('https://example.com/privacy')
  })

  it('leaves it out when unset or empty', () => {
    for (const url of [undefined, '']) {
      expect(configFor({ PRIVACY_POLICY_URL: url }).extra?.privacyPolicyUrl).toBeUndefined()
    }
  })

  it.each(['http://example.com/privacy', 'example.com/privacy', 'ftp://example.com', 'https://'])(
    'rejects %s',
    (url) => {
      expect(() => configFor({ PRIVACY_POLICY_URL: url })).toThrow(/PRIVACY_POLICY_URL/)
    }
  )
})

describe('app.config store declarations', () => {
  it('declares no non-exempt encryption and keeps the transport-security settings', () => {
    const plist = configFor({}).ios?.infoPlist
    expect(plist?.ITSAppUsesNonExemptEncryption).toBe(false)
    expect(plist?.NSAppTransportSecurity).toEqual({ NSAllowsArbitraryLoads: false })
  })

  it('declares the required-reason APIs', () => {
    const types = configFor({}).ios?.privacyManifests?.NSPrivacyAccessedAPITypes
    expect(types).toEqual([
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
    ])
  })

  it('declares product interaction, user ID and crash data, and no tracking', () => {
    const manifest = configFor({}).ios?.privacyManifests
    expect(manifest?.NSPrivacyCollectedDataTypes).toEqual([
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
        NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
      },
    ])
    expect(manifest?.NSPrivacyTracking).toBe(false)
    expect(manifest?.NSPrivacyTrackingDomains).toEqual([])
  })
})

describe('app.config updates', () => {
  const ID = '0f8b4a52-3c1e-4d6f-9a7b-2e5c8d1f4a90'
  /** A fixture certificate's bytes. */
  const CERT = Buffer.from('-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n')
  /** A certificate reader that finds exactly these files, each holding `CERT`. */
  const has = (paths: string[]) => (p: string) => (paths.includes(p) ? CERT : undefined)

  it('turns updates off without a project ID', () => {
    const result = updatesConfig('preview', undefined, has(['certs/preview/certificate.pem']))
    expect(result.updates).toEqual({ enabled: false })
    expect(result.certificateSha256).toBeUndefined()
  })

  it('turns updates off for a variant whose certificate is missing', () => {
    const result = updatesConfig('preview', ID, has([]))
    expect(result.updates).toEqual({ enabled: false })
    expect(result.certificateSha256).toBeUndefined()
  })

  it.each(['development', 'e2e'] as const)('never turns updates on for %s', (variant) => {
    const result = updatesConfig(variant, ID, () => CERT)
    expect(result.updates).toEqual({ enabled: false })
    expect(result.certificateSha256).toBeUndefined()
  })

  it.each(['preview', 'production'] as const)(
    'signs %s updates with its own certificate',
    (variant) => {
      const { updates, runtimeVersion } = updatesConfig(
        variant,
        ID,
        has([`certs/${variant}/certificate.pem`])
      )
      expect(updates).toEqual({
        enabled: true,
        url: `https://u.expo.dev/${ID}`,
        checkAutomatically: 'ON_LOAD',
        fallbackToCacheTimeout: 0,
        codeSigningCertificate: `./certs/${variant}/certificate.pem`,
        codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
      })
      expect(runtimeVersion).toEqual({ policy: 'fingerprint' })
    }
  )

  it.each(['preview', 'production'] as const)(
    "gives %s the lowercase hex SHA-256 of the certificate's bytes",
    (variant) => {
      const { certificateSha256 } = updatesConfig(
        variant,
        ID,
        has([`certs/${variant}/certificate.pem`])
      )
      expect(certificateSha256).toBe(createHash('sha256').update(CERT).digest('hex'))
      expect(certificateSha256).toMatch(/^[0-9a-f]{64}$/)
    }
  )

  it('gives a new certificate a new hash', () => {
    const first = updatesConfig('production', ID, () => Buffer.from('first')).certificateSha256
    const second = updatesConfig('production', ID, () => Buffer.from('second')).certificateSha256
    expect(first).not.toBe(second)
  })

  it('sets a fingerprint runtime version even when updates are off', () => {
    expect(updatesConfig('development', undefined, () => undefined).runtimeVersion).toEqual({
      policy: 'fingerprint',
    })
  })

  it('puts the project ID under extra.eas', () => {
    expect(configFor({ EAS_PROJECT_ID: ID }).extra?.eas).toEqual({ projectId: ID })
  })

  it('omits extra.eas without a project ID', () => {
    expect(configFor({}).extra?.eas).toBeUndefined()
  })

  it('fails on a project ID that is not a UUID', () => {
    expect(() => configFor({ EAS_PROJECT_ID: 'my-project' })).toThrow(
      /EAS_PROJECT_ID must be a UUID/
    )
  })

  it('keeps updates off in the exported config without a project ID', () => {
    const config = configFor({ APP_VARIANT: 'preview' })
    expect(config.updates).toEqual({ enabled: false })
    expect(config.extra?.updatesCertificate).toBeUndefined()
  })
})

describe('app.config releaseLine', () => {
  it('is the major and minor version', () => {
    expect(releaseLine('1.4.2')).toBe('1.4')
  })

  it('stays the same across a patch bump', () => {
    expect(releaseLine('1.0.1')).toBe(releaseLine('1.0.0'))
  })

  it.each([
    ['1.0.1', '1.1.0'],
    ['1.9.3', '2.0.0'],
  ])('changes from %s to %s', (before, after) => {
    expect(releaseLine(after)).not.toBe(releaseLine(before))
  })

  it.each(['1.4', 'v1.4.2', '1.4.2-beta.1', ''])('rejects %p', (version) => {
    expect(() => releaseLine(version)).toThrow(/app version must be x\.y\.z/)
  })

  it("puts package.json's release line in the production config", () => {
    const [major, minor] = packageJson.version.split('.')
    expect(configFor({}).extra?.releaseLine).toBe(`${major}.${minor}`)
    expect(configFor({ APP_VARIANT: 'production' }).extra?.releaseLine).toBe(`${major}.${minor}`)
  })

  it.each(['development', 'e2e', 'preview'])('gives %s no release line', (variant) => {
    expect(configFor({ APP_VARIANT: variant }).extra?.releaseLine).toBeUndefined()
  })
})

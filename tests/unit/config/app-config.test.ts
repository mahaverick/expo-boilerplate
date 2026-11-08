import { jest } from '@jest/globals'
import type { ExpoConfig } from 'expo/config'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

const ENV_KEYS = ['APP_VARIANT', 'APP_LINK_HOST', 'IOS_APP_STORE_ID', 'PRIVACY_POLICY_URL'] as const
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

import { jest } from '@jest/globals'
import type { ExpoConfig } from 'expo/config'
import { afterEach, beforeEach, describe, expect, it } from '@/tests/support/runner'

/** The config as Expo builds it, with this `APP_LINK_HOST` (unset when undefined). Modules reset first. */
function configFor(host: string | undefined): ExpoConfig {
  if (host === undefined) delete process.env.APP_LINK_HOST
  else process.env.APP_LINK_HOST = host
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

const saved = process.env.APP_LINK_HOST
const savedStoreId = process.env.IOS_APP_STORE_ID

beforeEach(() => {
  delete process.env.APP_LINK_HOST
  delete process.env.IOS_APP_STORE_ID
})
afterEach(() => {
  if (saved === undefined) delete process.env.APP_LINK_HOST
  else process.env.APP_LINK_HOST = saved
  if (savedStoreId === undefined) delete process.env.IOS_APP_STORE_ID
  else process.env.IOS_APP_STORE_ID = savedStoreId
})

describe('app.config', () => {
  it('names the app on both platforms', () => {
    const config = configFor(undefined)
    expect(config.ios?.bundleIdentifier).toBe('com.mahaverick.expoboilerplate')
    expect(config.android?.package).toBe('com.mahaverick.expoboilerplate')
  })

  it('registers the backup-rules plugin', () => {
    const config = configFor(undefined)
    expect(config.plugins).toContain('./plugins/with-backup-rules')
  })

  it('registers the expo-web-browser plugin', () => {
    const config = configFor(undefined)
    expect(config.plugins).toContain('expo-web-browser')
  })

  it('wires app links to APP_LINK_HOST, claiming /auth/link, /tenants/, /auth/confirm, /settings/account/security and /invitations/accept', () => {
    const config = configFor('app.example.com')
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
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ])
    expect(config.extra?.webUrl).toBe('https://app.example.com')
  })

  it('has no app links with the host unset or empty', () => {
    for (const host of [undefined, '']) {
      const config = configFor(host)
      expect(config.ios?.associatedDomains).toBeUndefined()
      expect(config.android?.intentFilters).toBeUndefined()
      expect(config.extra?.webUrl).toBeUndefined()
    }
  })

  it.each(['https://app.example.com', 'app.example.com/path', 'app example.com', 'localhost:8080'])(
    'rejects %s as a host',
    (host) => {
      expect(() => configFor(host)).toThrow(/APP_LINK_HOST/)
    }
  )
})

describe('app.config iosAppStoreId', () => {
  it('puts IOS_APP_STORE_ID in extra', () => {
    process.env.IOS_APP_STORE_ID = '1234567890'
    expect(configFor(undefined).extra?.iosAppStoreId).toBe('1234567890')
  })

  it('leaves it out when unset or empty', () => {
    for (const id of [undefined, '']) {
      if (id === undefined) delete process.env.IOS_APP_STORE_ID
      else process.env.IOS_APP_STORE_ID = id
      expect(configFor(undefined).extra?.iosAppStoreId).toBeUndefined()
    }
  })

  it('keeps webUrl beside it', () => {
    process.env.IOS_APP_STORE_ID = '42'
    const extra = configFor('app.example.com').extra
    expect(extra?.iosAppStoreId).toBe('42')
    expect(extra?.webUrl).toBe('https://app.example.com')
  })

  it.each(['id123', '12 3', '12.3', '-1'])('rejects %s as a store ID', (id) => {
    process.env.IOS_APP_STORE_ID = id
    expect(() => configFor(undefined)).toThrow(/IOS_APP_STORE_ID/)
  })
})

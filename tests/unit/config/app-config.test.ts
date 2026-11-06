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

beforeEach(() => {
  delete process.env.APP_LINK_HOST
})
afterEach(() => {
  if (saved === undefined) delete process.env.APP_LINK_HOST
  else process.env.APP_LINK_HOST = saved
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

  it('wires app links to APP_LINK_HOST', () => {
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
        data: [{ scheme: 'https', host: 'app.example.com', pathPrefix: '/auth/link' }],
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

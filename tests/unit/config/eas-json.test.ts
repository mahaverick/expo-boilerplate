import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@/tests/support/runner'

/** The parts of an EAS build profile the tests check. */
type Profile = {
  env?: Record<string, string>
  environment?: string
  channel?: string
  distribution?: string
  developmentClient?: boolean
  autoIncrement?: boolean
  android?: { buildType?: string }
  ios?: { simulator?: boolean }
}

const eas = JSON.parse(readFileSync(join(__dirname, '../../../eas.json'), 'utf8')) as {
  cli: { version: string; appVersionSource: string }
  build: Record<string, Profile>
  submit: { production: { android: { track: string } } }
}

const VARIANTS = ['development', 'e2e', 'preview', 'production'] as const

describe('eas.json', () => {
  it('reads the version from EAS and requires a recent CLI', () => {
    expect(eas.cli.appVersionSource).toBe('remote')
    expect(eas.cli.version).toBe('>= 27.5.0')
  })

  it.each(VARIANTS)('sets APP_VARIANT to %s in its own profile', (variant) => {
    expect(eas.build[variant]?.env?.APP_VARIANT).toBe(variant)
  })

  it('maps each profile to its EAS environment', () => {
    expect(eas.build.development?.environment).toBe('development')
    expect(eas.build.e2e?.environment).toBe('development')
    expect(eas.build.preview?.environment).toBe('preview')
    expect(eas.build.production?.environment).toBe('production')
  })

  it('gives only preview and production an update channel', () => {
    expect(eas.build.development).not.toHaveProperty('channel')
    expect(eas.build.e2e).not.toHaveProperty('channel')
    expect(eas.build.preview?.channel).toBe('preview')
    expect(eas.build.production?.channel).toBe('production')
  })

  it('builds development as an internal development client', () => {
    expect(eas.build.development?.developmentClient).toBe(true)
    expect(eas.build.development?.distribution).toBe('internal')
  })

  it('builds e2e as an internal APK and an iOS simulator build', () => {
    expect(eas.build.e2e?.distribution).toBe('internal')
    expect(eas.build.e2e?.android?.buildType).toBe('apk')
    expect(eas.build.e2e?.ios?.simulator).toBe(true)
  })

  it('auto-increments preview and production, and distributes only preview internally', () => {
    expect(eas.build.preview?.distribution).toBe('internal')
    expect(eas.build.preview?.autoIncrement).toBe(true)
    expect(eas.build.production?.autoIncrement).toBe(true)
    expect(eas.build.production).not.toHaveProperty('distribution')
  })

  it('writes the iOS source map of preview and production to a fixed path, and of no other profile', () => {
    expect(eas.build.preview?.env?.SOURCEMAP_FILE).toBe('/tmp/main.jsbundle.map')
    expect(eas.build.production?.env?.SOURCEMAP_FILE).toBe('/tmp/main.jsbundle.map')
    expect(eas.build.development?.env).not.toHaveProperty('SOURCEMAP_FILE')
    expect(eas.build.e2e?.env).not.toHaveProperty('SOURCEMAP_FILE')
  })

  it('submits production to the internal Play track', () => {
    expect(eas.submit.production.android.track).toBe('internal')
  })

  it('holds no secret in any profile env', () => {
    for (const profile of Object.values(eas.build)) {
      for (const key of Object.keys(profile.env ?? {})) {
        expect(key).not.toMatch(/KEY|TOKEN|SECRET|PASSWORD/)
      }
    }
  })
})

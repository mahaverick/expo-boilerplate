import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, repoRoot } from '@/tests/support/runner'

/** The script under test. */
const SCRIPT = path.join(repoRoot, 'scripts/upload-native-sourcemaps.sh')

/** The installed react-native's Xcode bundling script, which `prepare` rewrites. */
const XCODE = path.join(repoRoot, 'node_modules/react-native/scripts/react-native-xcode.sh')

/** The variables the script reads, cleared before each run. */
const KEYS = [
  'POSTHOG_CLI_API_KEY',
  'POSTHOG_CLI_PROJECT_ID',
  'SOURCEMAP_FILE',
  'EAS_BUILD_PLATFORM',
  'REACT_NATIVE_XCODE',
]

/** Temporary directories made by a test, removed after it. */
const made: string[] = []

/**
 * Runs the script with exactly these of its variables set.
 * @param args - The script's arguments.
 * @param env - The variables to set.
 * @returns The child process's result.
 */
function run(args: string[], env: Record<string, string>) {
  const base = { ...process.env }
  for (const key of KEYS) delete base[key]
  return spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env: { ...base, ...env } })
}

/**
 * A copy of a file in a new temporary directory.
 * @param source - The file to copy.
 * @returns The copy's path.
 */
function copyOf(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-maps-'))
  made.push(dir)
  const copy = path.join(dir, path.basename(source))
  fs.copyFileSync(source, copy)
  return copy
}

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('upload-native-sourcemaps', () => {
  it.each([[[]], [['prepare']]])(
    'exits 0 and uploads nothing when POSTHOG_CLI_API_KEY is unset (%p)',
    (args) => {
      const result = run(args, {
        SOURCEMAP_FILE: '/tmp/main.jsbundle.map',
        EAS_BUILD_PLATFORM: 'ios',
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/POSTHOG_CLI_API_KEY is not set/)
    }
  )

  it('exits 0 when the key is blank', () => {
    const result = run([], { POSTHOG_CLI_API_KEY: '  ', SOURCEMAP_FILE: '/tmp/main.jsbundle.map' })
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/POSTHOG_CLI_API_KEY is not set/)
  })

  it('exits 0 for a profile that sets no SOURCEMAP_FILE', () => {
    const result = run([], {
      POSTHOG_CLI_API_KEY: 'phx_test_not_real',
      EAS_BUILD_PLATFORM: 'android',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/SOURCEMAP_FILE is not set/)
  })

  it.each([[[]], [['prepare']]])(
    'fails naming POSTHOG_CLI_PROJECT_ID when the key is set and the ID is empty (%p)',
    (args) => {
      for (const id of [undefined, '', '  ']) {
        const result = run(args, {
          POSTHOG_CLI_API_KEY: 'phx_test_not_real',
          SOURCEMAP_FILE: '/tmp/main.jsbundle.map',
          EAS_BUILD_PLATFORM: 'android',
          REACT_NATIVE_XCODE: '/nonexistent',
          ...(id === undefined ? {} : { POSTHOG_CLI_PROJECT_ID: id }),
        })
        expect(result.status).toBe(1)
        expect(result.stderr).toMatch(
          /POSTHOG_CLI_PROJECT_ID is not set, and POSTHOG_CLI_API_KEY is/
        )
      }
    }
  )

  it('exits 1 on an unknown platform', () => {
    const result = run([], {
      POSTHOG_CLI_API_KEY: 'phx_test_not_real',
      POSTHOG_CLI_PROJECT_ID: '12345',
      SOURCEMAP_FILE: '/tmp/main.jsbundle.map',
      EAS_BUILD_PLATFORM: 'web',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/EAS_BUILD_PLATFORM must be ios or android/)
  })

  it('makes the installed react-native-xcode.sh keep the packager map', () => {
    const xcode = copyOf(XCODE)
    const result = run(['prepare'], {
      POSTHOG_CLI_API_KEY: 'phx_test_not_real',
      POSTHOG_CLI_PROJECT_ID: '12345',
      SOURCEMAP_FILE: '/tmp/main.jsbundle.map',
      EAS_BUILD_PLATFORM: 'ios',
      REACT_NATIVE_XCODE: xcode,
    })
    expect(result.status).toBe(0)
    const text = fs.readFileSync(xcode, 'utf8')
    expect(text).not.toMatch(/^\s*rm "\$PACKAGER_SOURCEMAP_FILE"$/m)
    expect(text).toMatch(/^\s*mv "\$PACKAGER_SOURCEMAP_FILE" "\$SOURCEMAP_FILE\.packager"$/m)
    expect(fs.existsSync(`${xcode}.orig`)).toBe(false)
  })

  it('fails prepare loudly when react-native-xcode.sh has no line to rewrite', () => {
    const xcode = copyOf(XCODE)
    fs.writeFileSync(xcode, '#!/bin/bash\necho bundle\n')
    const result = run(['prepare'], {
      POSTHOG_CLI_API_KEY: 'phx_test_not_real',
      POSTHOG_CLI_PROJECT_ID: '12345',
      SOURCEMAP_FILE: '/tmp/main.jsbundle.map',
      EAS_BUILD_PLATFORM: 'ios',
      REACT_NATIVE_XCODE: xcode,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/PACKAGER_SOURCEMAP_FILE/)
  })

  it('leaves Android alone in prepare', () => {
    const result = run(['prepare'], {
      POSTHOG_CLI_API_KEY: 'phx_test_not_real',
      POSTHOG_CLI_PROJECT_ID: '12345',
      SOURCEMAP_FILE: '/tmp/main.jsbundle.map',
      EAS_BUILD_PLATFORM: 'android',
      REACT_NATIVE_XCODE: '/nonexistent',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })
})

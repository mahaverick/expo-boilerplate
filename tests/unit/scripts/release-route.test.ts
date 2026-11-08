import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it, repoRoot } from '@/tests/support/runner'

/** The script under test. */
const SCRIPT = path.join(repoRoot, 'scripts/release-route.mjs')

/** The input `releaseRoute` takes. */
interface RouteInput {
  previousVersion: string
  version: string
  fingerprintChanged: boolean
}

/**
 * Runs `releaseRoute` in Node. Babel-based Jest cannot import the script,
 * which uses `import.meta`, so the call runs in a child process.
 * @param input - The versions and whether the fingerprint changed.
 * @returns The route, or the error message when the call throws.
 */
function route(input: RouteInput): { route?: string; error?: string } {
  const code = `
    import { releaseRoute } from ${JSON.stringify(SCRIPT)}
    try {
      console.log(JSON.stringify({ route: releaseRoute(${JSON.stringify(input)}) }))
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }))
    }
  `
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  return JSON.parse(run.stdout) as { route?: string; error?: string }
}

/**
 * Runs the command-line entry with the given environment.
 * @param env - `PREVIOUS_VERSION`, `VERSION` and `FINGERPRINT_CHANGED`.
 * @returns The child process's result.
 */
function command(env: Record<string, string>) {
  const base = { ...process.env }
  delete base.PREVIOUS_VERSION
  delete base.VERSION
  delete base.FINGERPRINT_CHANGED
  return spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...base, ...env } })
}

describe('releaseRoute', () => {
  it('updates a patch bump with an unchanged fingerprint', () => {
    expect(
      route({ previousVersion: '1.0.0', version: '1.0.1', fingerprintChanged: false }).route
    ).toBe('update')
  })

  it('builds a patch bump with a changed fingerprint', () => {
    expect(
      route({ previousVersion: '1.0.0', version: '1.0.1', fingerprintChanged: true }).route
    ).toBe('build')
  })

  it('builds a minor bump (a feat:) with an unchanged fingerprint', () => {
    expect(
      route({ previousVersion: '1.0.1', version: '1.1.0', fingerprintChanged: false }).route
    ).toBe('build')
  })

  it('builds a major bump', () => {
    expect(
      route({ previousVersion: '1.4.2', version: '2.0.0', fingerprintChanged: false }).route
    ).toBe('build')
  })

  it('builds a patch bump past a higher patch of an earlier minor', () => {
    expect(
      route({ previousVersion: '1.9.9', version: '2.0.1', fingerprintChanged: false }).route
    ).toBe('build')
  })

  it.each([
    ['1.0.1', '1.0.1'],
    ['1.0.1', '1.0.0'],
    ['1.2.0', '1.1.9'],
    ['2.0.0', '1.9.9'],
  ])('throws when %s is followed by %s, which is not greater', (previousVersion, version) => {
    expect(route({ previousVersion, version, fingerprintChanged: false }).error).toMatch(
      new RegExp(`${version}.*not greater.*${previousVersion}`)
    )
  })

  it.each(['1.0', 'v1.0.1', '1.0.1-beta.1', '01.0.1', '', '1.0.1 '])(
    'throws on the version "%s", which is not x.y.z',
    (version) => {
      expect(route({ previousVersion: '1.0.0', version, fingerprintChanged: false }).error).toMatch(
        /x\.y\.z/
      )
    }
  )

  it('throws on a previous version that is not x.y.z', () => {
    expect(
      route({ previousVersion: 'next', version: '1.0.1', fingerprintChanged: false }).error
    ).toMatch(/x\.y\.z/)
  })
})

describe('release-route command', () => {
  it('prints route=update for a patch bump with an unchanged fingerprint', () => {
    const run = command({
      PREVIOUS_VERSION: '1.0.0',
      VERSION: '1.0.1',
      FINGERPRINT_CHANGED: 'false',
    })
    expect(run.status).toBe(0)
    expect(run.stdout).toBe('route=update\n')
  })

  it('prints route=build when the fingerprint changed', () => {
    const run = command({
      PREVIOUS_VERSION: '1.0.0',
      VERSION: '1.0.1',
      FINGERPRINT_CHANGED: 'true',
    })
    expect(run.status).toBe(0)
    expect(run.stdout).toBe('route=build\n')
  })

  it('exits 1 and names the variable when FINGERPRINT_CHANGED is neither true nor false', () => {
    const run = command({
      PREVIOUS_VERSION: '1.0.0',
      VERSION: '1.0.1',
      FINGERPRINT_CHANGED: 'maybe',
    })
    expect(run.status).toBe(1)
    expect(run.stdout).toBe('')
    expect(run.stderr).toMatch(/FINGERPRINT_CHANGED.*maybe/)
  })

  it('exits 1 when VERSION is not greater than PREVIOUS_VERSION', () => {
    const run = command({
      PREVIOUS_VERSION: '1.0.1',
      VERSION: '1.0.1',
      FINGERPRINT_CHANGED: 'false',
    })
    expect(run.status).toBe(1)
    expect(run.stdout).toBe('')
    expect(run.stderr).toMatch(/not greater/)
  })

  it('exits 1 when PREVIOUS_VERSION is unset', () => {
    const run = command({ VERSION: '1.0.1', FINGERPRINT_CHANGED: 'false' })
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/x\.y\.z/)
  })
})

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, repoRoot } from '@/tests/support/runner'

/** The scripts under test: the sync check and the check-shared script it calls. */
const SCRIPTS = ['sync-check.mjs', 'check-shared.mjs']

/** The copied check-shared script, an expo row in the fixture manifest. */
const CHECK_SHARED = fs.readFileSync(path.join(repoRoot, 'scripts/check-shared.mjs'), 'utf8')

/** Temporary directories made by a test, removed after it. */
const made: string[] = []

/**
 * A fresh temporary directory.
 * @returns Its absolute path.
 */
function tempDir(): string {
  // realpath: the script runs only when argv[1] matches its resolved URL, and macOS tmp is a symlink.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sync-check-')))
  made.push(dir)
  return dir
}

/**
 * Writes files under a root, making their directories.
 * @param root - The root.
 * @param files - Repo-relative paths and their contents.
 */
function writeTree(root: string, files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
}

/**
 * Runs the CLI as a copy inside `root`, so `root` is the repository it checks,
 * with no inherited `CI` or `REACT_BOILERPLATE_DIR`. Babel-based Jest cannot
 * import the script, which uses `import.meta`, so every case spawns it.
 * @param root - The expo tree the copy of the script lives in.
 * @param args - Its arguments.
 * @param env - Variables to set.
 * @returns Its exit status and output.
 */
function runCli(root: string, args: string[], env: Record<string, string> = {}) {
  for (const script of SCRIPTS) {
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
    fs.copyFileSync(path.join(repoRoot, 'scripts', script), path.join(root, 'scripts', script))
  }
  // check-shared imports typescript, which the copy resolves through this link.
  const modules = path.join(root, 'node_modules')
  if (!fs.existsSync(modules)) fs.symlinkSync(path.join(repoRoot, 'node_modules'), modules)
  const inherited = { ...process.env }
  delete inherited.CI
  delete inherited.REACT_BOILERPLATE_DIR
  return spawnSync(process.execPath, [path.join(root, 'scripts/sync-check.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...inherited, ...env },
  })
}

/** A manifest with an expo-and-apex file, an expo-only test and an apex-only file. */
const MANIFEST = JSON.stringify({
  files: {
    'scripts/check-shared.mjs': ['expo', 'apex'],
    'src/lib/plural.ts': ['expo', 'apex'],
    'src/lib/apex-only.ts': ['apex'],
  },
  tests: { 'tests/unit/plural.test.ts': ['expo'] },
  ports: {},
  testPorts: {},
  exemptions: {},
})

/** The shared rows, as react holds them. */
const SHARED = {
  'scripts/check-shared.mjs': CHECK_SHARED,
  'src/lib/plural.ts': 'export const plural = (n: number) => (n === 1 ? "" : "s")\n',
  'tests/unit/plural.test.ts': "it('pluralises', () => {})\n",
}

/**
 * A react tree with the manifest and every row, and an expo tree with the expo rows.
 * @param expoFiles - Expo files to write over the shared ones (null removes one).
 * @returns The two roots.
 */
function trees(expoFiles: Record<string, string | null> = {}): { react: string; expo: string } {
  const react = tempDir()
  const expo = tempDir()
  writeTree(react, {
    'shared-core.json': MANIFEST,
    ...SHARED,
    'src/lib/apex-only.ts': 'export const onlyApex = 1\n',
  })
  const expoTree: Record<string, string> = { ...SHARED }
  for (const [file, text] of Object.entries(expoFiles)) {
    if (text === null) delete expoTree[file]
    else expoTree[file] = text
  }
  writeTree(expo, expoTree)
  return { react, expo }
}

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('sync-check', () => {
  it('passes when every expo row matches', () => {
    const { react, expo } = trees()
    const result = runCli(expo, ['--react', react])
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('names a file that differs', () => {
    const { react, expo } = trees({ 'src/lib/plural.ts': 'export const plural = () => "s"\n' })
    const result = runCli(expo, ['--react', react])
    expect(result.status).toBe(1)
    expect(result.stderr.trim()).toBe('src/lib/plural.ts: differs from react-boilerplate')
  })

  it('names a file that is missing', () => {
    const { react, expo } = trees({ 'tests/unit/plural.test.ts': null })
    const result = runCli(expo, ['--react', react])
    expect(result.status).toBe(1)
    expect(result.stderr.trim()).toBe('tests/unit/plural.test.ts: missing')
  })

  it('ignores rows that do not name expo', () => {
    // src/lib/apex-only.ts is absent from expo, and check-shared would report it.
    const { react, expo } = trees()
    writeTree(react, { 'src/lib/apex-only.ts': 'export const changed = 2\n' })
    expect(runCli(expo, ['--react', react]).status).toBe(0)
  })

  it('names a file that react lacks', () => {
    const { react, expo } = trees()
    fs.rmSync(path.join(react, 'src/lib/plural.ts'))
    const result = runCli(expo, ['--react', react])
    expect(result.status).toBe(1)
    expect(result.stderr.trim()).toBe('src/lib/plural.ts: missing in react-boilerplate')
  })

  it('reports a check-shared finding on an expo row', () => {
    const browserOnly = 'export const title = () => document.title\n'
    const { react, expo } = trees({ 'src/lib/plural.ts': browserOnly })
    writeTree(react, { 'src/lib/plural.ts': browserOnly })
    const result = runCli(expo, ['--react', react])
    expect(result.status).toBe(1)
    expect(result.stderr.trim()).toBe('src/lib/plural.ts:1: uses the browser global document')
  })

  it.each([
    ['is not JSON', '{ "files": '],
    ['lists apps as a string', JSON.stringify({ files: { 'src/lib/plural.ts': 'expo' } })],
  ])('reports one finding when the manifest %s', (_case, manifest) => {
    const { react, expo } = trees()
    writeTree(react, { 'shared-core.json': manifest })
    const result = runCli(expo, ['--react', react])
    expect(result.status).toBe(1)
    expect(result.stderr.trim().split('\n')).toHaveLength(1)
    expect(result.stderr).toContain('shared-core.json')
  })

  it('prints one line and exits 1, with no stack trace, on a malformed manifest', () => {
    const { react, expo } = trees()
    writeTree(react, { 'shared-core.json': '{ "files": ' })
    const result = runCli(expo, ['--react', react])
    expect(result.status).toBe(1)
    expect(result.stderr.trim().split('\n')).toHaveLength(1)
    expect(result.stderr).toContain('shared-core.json')
    expect(result.stderr).not.toMatch(/\n\s+at /)
  })

  it('reads --react before REACT_BOILERPLATE_DIR', () => {
    const base = tempDir()
    const result = runCli(base, ['--react', path.join(base, 'from-flag')], {
      CI: 'true',
      REACT_BOILERPLATE_DIR: path.join(base, 'from-env'),
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('from-flag')
    expect(result.stderr).not.toContain('from-env')
  })

  it('reads REACT_BOILERPLATE_DIR before the default', () => {
    const base = tempDir()
    const expo = path.join(base, 'expo')
    const { react } = trees()
    writeTree(expo, SHARED)
    // The default ../react-boilerplate holds a differing copy, so reading it would report a finding.
    writeTree(path.join(base, 'react-boilerplate'), {
      'shared-core.json': MANIFEST,
      ...SHARED,
      'src/lib/plural.ts': 'export const plural = () => "s"\n',
    })
    const result = runCli(expo, [], { REACT_BOILERPLATE_DIR: react })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('falls back to ../react-boilerplate beside the root', () => {
    const base = tempDir()
    const expo = path.join(base, 'expo')
    writeTree(expo, SHARED)
    writeTree(path.join(base, 'react-boilerplate'), {
      'shared-core.json': MANIFEST,
      ...SHARED,
      'src/lib/plural.ts': 'export const plural = () => "s"\n',
    })
    const result = runCli(expo, [])
    expect(result.status).toBe(1)
    expect(result.stderr.trim()).toBe('src/lib/plural.ts: differs from react-boilerplate')
  })

  it('warns and passes with no react directory', () => {
    const { expo } = trees()
    const result = runCli(expo, ['--react', path.join(expo, 'no-such-react')])
    expect(result.status).toBe(0)
    expect(result.stderr.trim().split('\n')).toHaveLength(1)
    expect(result.stderr).toContain('no-such-react')
  })

  it('fails with no react directory when CI is true', () => {
    const { expo } = trees()
    const result = runCli(expo, ['--react', path.join(expo, 'no-such-react')], { CI: 'true' })
    expect(result.status).toBe(1)
    expect(result.stderr.trim().split('\n')).toHaveLength(1)
    expect(result.stderr).toContain('no-such-react')
  })
})

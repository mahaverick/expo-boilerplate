import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, repoRoot } from '@/tests/support/runner'

/** The script under test. */
const SCRIPT = path.join(repoRoot, 'scripts/check-bundle-size.mjs')

/** Temporary directories made by a test, removed after it. */
const made: string[] = []

/**
 * A temporary export directory holding the given `.hbc` files.
 * @param files - Paths relative to the directory, and each file's size in bytes.
 * @returns The directory's absolute path.
 */
function exportDir(files: Record<string, number>): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-size-')))
  made.push(dir)
  for (const [file, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), Buffer.alloc(bytes))
  }
  return dir
}

/**
 * Runs `checkBundleSize` in Node. Babel-based Jest cannot import the script,
 * which uses `import.meta`, so the call runs in a child process.
 * @param dir - The export directory.
 * @param budgets - The budget per platform.
 * @returns The results, or the error message when the check throws.
 */
function check(dir: string, budgets: { ios: number; android: number }) {
  const code = `
    import { checkBundleSize } from ${JSON.stringify(SCRIPT)}
    try {
      console.log(JSON.stringify({ results: checkBundleSize(${JSON.stringify(dir)}, ${JSON.stringify(budgets)}) }))
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }))
    }
  `
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  return JSON.parse(run.stdout) as {
    results?: { platform: string; bytes: number; budget: number; ok: boolean }[]
    error?: string
  }
}

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('checkBundleSize', () => {
  it('passes a bundle at its budget', () => {
    const dir = exportDir({ 'ios/index-a.hbc': 100, 'android/index-b.hbc': 200 })
    expect(check(dir, { ios: 100, android: 200 }).results).toEqual([
      { platform: 'ios', bytes: 100, budget: 100, ok: true },
      { platform: 'android', bytes: 200, budget: 200, ok: true },
    ])
  })

  it('fails a bundle one byte over its budget', () => {
    const dir = exportDir({ 'ios/index-a.hbc': 101, 'android/index-b.hbc': 200 })
    const { results } = check(dir, { ios: 100, android: 200 })
    expect(results?.map((r) => r.ok)).toEqual([false, true])
  })

  it('names a platform with no bundle', () => {
    const dir = exportDir({ 'ios/index-a.hbc': 100 })
    expect(check(dir, { ios: 100, android: 200 }).error).toMatch(/android/)
  })

  it('names both bundles when a platform has two', () => {
    const dir = exportDir({
      'ios/index-a.hbc': 100,
      'android/index-b.hbc': 100,
      'android/index-c.hbc': 100,
    })
    const { error } = check(dir, { ios: 100, android: 200 })
    expect(error).toMatch(/android/)
    expect(error).toMatch(/index-b\.hbc/)
    expect(error).toMatch(/index-c\.hbc/)
  })
})

describe('check-bundle-size command', () => {
  it('prints one line per platform and exits 0 within budget', () => {
    const dir = exportDir({ 'ios/index-a.hbc': 10, 'android/index-b.hbc': 10 })
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
    expect(run.status).toBe(0)
    expect(run.stdout.trim().split('\n')).toHaveLength(2)
    expect(run.stdout).toMatch(/ios.*ok/)
  })

  it('exits 1 and names the platform when a bundle is missing', () => {
    const dir = exportDir({ 'ios/index-a.hbc': 10 })
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/android/)
  })

  it('exits 1 when a bundle is over its budget', () => {
    const dir = exportDir({ 'ios/index-a.hbc': 10, 'android/index-b.hbc': 7_500_001 })
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stdout).toMatch(/android.*over/)
  })
})

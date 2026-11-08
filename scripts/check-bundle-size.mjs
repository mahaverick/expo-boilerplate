import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The size budget of each Hermes bundle, in bytes. Measured on 2026-11-08 with
 * `pnpm export`: iOS 6,756,845 bytes and Android 6,741,698 bytes. Each budget
 * is the measured size plus 10%, rounded up to the next 100,000 bytes.
 */
const BUDGETS = { ios: 7_500_000, android: 7_500_000 }

/** Where `pnpm export` writes the bundles, relative to the repository root. */
const DEFAULT_DIR = path.resolve(import.meta.dirname, '..', 'dist/_expo/static/js')

/**
 * Compare each platform's Hermes bundle with its budget.
 * @param dir - The directory holding one folder of `.hbc` files per platform.
 * @param budgets - The budget per platform, in bytes.
 * @returns One result per platform.
 * @throws When a platform has no `.hbc` file, or more than one.
 */
export function checkBundleSize(dir, budgets) {
  return ['ios', 'android'].map((platform) => {
    const folder = path.join(dir, platform)
    const files = fs.existsSync(folder)
      ? fs.readdirSync(folder).filter((f) => f.endsWith('.hbc'))
      : []
    if (files.length === 0) throw new Error(`${platform}: no .hbc bundle in ${folder}`)
    if (files.length > 1)
      throw new Error(
        `${platform}: expected one .hbc bundle in ${folder}, found ${files.join(' and ')}`
      )
    const bytes = fs.statSync(path.join(folder, files[0])).size
    return { platform, bytes, budget: budgets[platform], ok: bytes <= budgets[platform] }
  })
}

/** Print one line per platform and set the exit code to 1 on any failure. */
function main() {
  let results
  try {
    results = checkBundleSize(path.resolve(process.argv[2] ?? DEFAULT_DIR), BUDGETS)
  } catch (error) {
    console.error(`check-bundle-size: ${error.message}`)
    process.exitCode = 1
    return
  }
  for (const { platform, bytes, budget, ok } of results) {
    console.log(`${platform}: ${bytes} of ${budget} bytes, ${ok ? 'ok' : 'over budget'}`)
    if (!ok) process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

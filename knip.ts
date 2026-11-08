import { readFileSync } from 'node:fs'
import type { KnipConfig } from 'knip'

/** The manifest's shape, as far as this file reads it. */
interface SharedCore {
  files?: Record<string, readonly string[]>
  tests?: Record<string, readonly string[]>
  testPorts?: Record<string, readonly string[]>
}

const manifest = JSON.parse(readFileSync('shared-core.json', 'utf8')) as SharedCore

/**
 * The paths react's shared-core.json gives expo, less the test files knip's
 * jest plugin already enters. They are react's copies, used across react's own
 * app, so a file or export this app does not reach yet is not dead code here.
 * Each is an entry, which knip neither reports as unused nor checks for unused
 * exports.
 * @returns Repo-relative paths whose app list includes expo.
 */
function sharedExpoRows(): string[] {
  return [manifest.files, manifest.tests].flatMap((rows) =>
    Object.entries(rows ?? {})
      .filter(([file, apps]) => apps.includes('expo') && !file.endsWith('.test.ts'))
      .map(([file]) => file)
  )
}

/**
 * Entries, project files and plugins (expo, eslint, jest, vite) are knip's
 * defaults, plus the shared rows and the runner port, whose export list is the
 * manifest's `testPorts` row, whether or not a shared test uses each name yet.
 *
 * Ignored files: `scripts/sync-check.d.mts` and `scripts/styleseed.d.mts`
 * type those scripts for a caller that imports them. The tests spawn the
 * scripts, because Jest's Babel cannot import a file that uses `import.meta`,
 * so nothing imports the types yet.
 *
 * Ignored dependencies, none of them dead code:
 * - `@tanstack/react-form` is a stack library, installed with the toolchain so
 *   that expo-doctor and `expo install --check` see it from the start. No file
 *   imports it yet; drop it once one does.
 * - `@posthog/cli` is never imported: `scripts/install-posthog-cli.sh` runs its
 *   installer, and `scripts/upload-native-sourcemaps.sh` and the release
 *   workflows run the binary to upload source maps.
 */
const config: KnipConfig = {
  // The config plugin: Expo loads it by the path in app.config.ts, which knip cannot follow.
  entry: [
    ...sharedExpoRows(),
    ...Object.keys(manifest.testPorts ?? {}),
    'plugins/with-backup-rules.js',
  ],
  ignore: ['scripts/sync-check.d.mts', 'scripts/styleseed.d.mts'],
  ignoreDependencies: ['@tanstack/react-form', '@posthog/cli'],
}

export default config

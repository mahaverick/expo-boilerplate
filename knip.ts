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
 * The e2e helpers (`e2e/helpers/*.mjs`) are entries: each also runs as a
 * command, `node e2e/helpers/<file>.mjs`, a call knip cannot see. The Maestro
 * runner (`scripts/e2e-run.mjs`) is an entry for the same reason: the e2e
 * workflows run it with `node`.
 *
 * Ignored files: `scripts/sync-check.d.mts` and `scripts/styleseed.d.mts`
 * type those scripts for a caller that imports them. The tests spawn the
 * scripts, because Jest's Babel cannot import a file that uses `import.meta`,
 * so nothing imports the types yet.
 *
 * Ignored binaries: `maestro`, which the runner spawns. It is the Maestro
 * command-line tool, installed on the e2e runner machine, not an npm package.
 *
 * Ignored dependencies, none of them dead code:
 * - `@tanstack/react-form` is a stack library, installed with the toolchain so
 *   that expo-doctor and `expo install --check` see it from the start. No file
 *   imports it yet; drop it once one does.
 * - `@posthog/cli` is never imported: `scripts/install-posthog-cli.sh` runs its
 *   installer, and `scripts/upload-native-sourcemaps.sh` and the release
 *   workflows run the binary to upload source maps.
 * - `@babel/plugin-transform-react-jsx` is never imported: Babel loads it by
 *   name from react-native-css-interop's preset, which `nativewind/babel`
 *   re-exports and which does not list it. Babel resolves the name from the
 *   app's `node_modules`, so a native build's bundle step, which runs node
 *   without pnpm's `NODE_PATH`, needs it listed here.
 */
const config: KnipConfig = {
  // The config plugin: Expo loads it by the path in app.config.ts, which knip cannot follow.
  entry: [
    ...sharedExpoRows(),
    ...Object.keys(manifest.testPorts ?? {}),
    'plugins/with-backup-rules.js',
    'e2e/helpers/*.mjs',
    'scripts/e2e-run.mjs',
  ],
  ignore: ['scripts/sync-check.d.mts', 'scripts/styleseed.d.mts'],
  ignoreBinaries: ['maestro'],
  ignoreDependencies: ['@tanstack/react-form', '@posthog/cli', '@babel/plugin-transform-react-jsx'],
}

export default config

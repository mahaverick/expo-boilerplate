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
 * Ignored dependencies, none of them dead code:
 * - `@tanstack/react-form`, `expo-secure-store`, `react-native-mmkv` and
 *   `react-native-nitro-modules` are the stack's libraries, installed with the
 *   toolchain so that expo-doctor and `expo install --check` see them from the
 *   start. No file imports them yet; drop each once one does.
 * - `expo-updates`: knip's expo plugin lists it unless the config sets
 *   `updates.enabled: false`. The app does not ship over-the-air updates.
 */
const config: KnipConfig = {
  entry: [...sharedExpoRows(), ...Object.keys(manifest.testPorts ?? {})],
  ignoreDependencies: [
    '@tanstack/react-form',
    'expo-secure-store',
    'react-native-mmkv',
    'react-native-nitro-modules',
    'expo-updates',
  ],
}

export default config

/**
 * @file The runner port: the only module a shared test takes its test
 * functions from. React and apex run the shared tests under Vitest; expo runs
 * them under Jest, through this copy.
 */
import path from 'node:path'

export { afterEach, beforeEach, describe, expect, it, test } from '@jest/globals'

/** The repo's absolute path. */
export const repoRoot = path.resolve(__dirname, '../..')

/**
 * The directories `copy-style.test.ts` scans, relative to `repoRoot`. Expo adds
 * `src/components/ui`, which it writes itself.
 */
export const copyStyleRoots: readonly string[] = ['src', 'src/components/ui']

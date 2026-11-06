/**
 * @file The polyfills load in the order each needs: random values, then
 * `URL`, then the `Intl` polyfills in formatjs's dependency order.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, repoRoot } from '@/tests/support/runner'

/**
 * The modules `src/polyfills.ts` loads, imports and requires alike, in source
 * order, less the `should-polyfill` checks.
 * @returns Each specifier.
 */
function loadedModules(): string[] {
  const source = readFileSync(path.join(repoRoot, 'src/polyfills.ts'), 'utf8')
  return Array.from(
    source.matchAll(/^\s*(?:import\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/gm),
    (match) => String(match[1] ?? match[2])
  )
}

describe('src/polyfills.ts', () => {
  it('loads each polyfill after the ones it needs', () => {
    expect(loadedModules()).toEqual([
      'react-native-get-random-values',
      'react-native-url-polyfill/auto',
      '@formatjs/intl-getcanonicallocales/polyfill-force.js',
      '@formatjs/intl-locale/polyfill-force.js',
      '@formatjs/intl-pluralrules/polyfill-force.js',
      '@formatjs/intl-pluralrules/locale-data/en.js',
      '@formatjs/intl-relativetimeformat/polyfill-force.js',
      '@formatjs/intl-relativetimeformat/locale-data/en.js',
    ])
  })
})

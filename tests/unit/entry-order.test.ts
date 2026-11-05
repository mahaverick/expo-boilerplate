/**
 * @file The entry loads the Hermes polyfills before anything else: the shared
 * core calls `crypto.getRandomValues`, `URL` and `Intl.RelativeTimeFormat` as
 * its modules load and as the first request goes out.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, repoRoot } from '@/tests/support/runner'

/**
 * The module specifiers `index.ts` imports, in source order.
 * @returns Each specifier.
 */
function entryImports(): string[] {
  const source = readFileSync(path.join(repoRoot, 'index.ts'), 'utf8')
  return Array.from(source.matchAll(/^import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/gm), (match) =>
    String(match[1])
  )
}

describe('index.ts', () => {
  it('imports the polyfills first', () => {
    expect(entryImports()[0]).toBe('./src/polyfills')
  })

  it('imports expo-router/entry after the polyfills', () => {
    const imports = entryImports()
    expect(imports.indexOf('expo-router/entry')).toBeGreaterThan(imports.indexOf('./src/polyfills'))
  })

  it('is the package entry', () => {
    const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      main?: string
    }
    expect(manifest.main).toBe('index.ts')
  })
})

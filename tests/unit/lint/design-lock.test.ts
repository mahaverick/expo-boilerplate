import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it, repoRoot } from '@/tests/support/runner'

/** One ESLint message, as `--format json` prints it. */
interface LintMessage {
  ruleId: string | null
  line: number
}

/** Strings the design lock rejects in a file expo owns. */
const BANNED = [
  'bg-[#ff0000]',
  'text-[#fff]',
  'bg-[oklch(0.5 0.1 20)]',
  'bg-[oklch(0.5_0.1_20)]',
  'border-[rgb(0_0_0)]',
  'text-[color:#fff]',
  'hover:bg-[hsl(0_100%_50%)]',
  '[color:#fff]',
  'bg-red-500',
  'dark:text-white',
  '#fff',
  'rgba(0, 0, 0, 0.5)',
]

/** Strings the design lock lets through: token classes and non-colour arbitrary values. */
const ALLOWED = [
  'bg-primary',
  'bg-background text-primary-foreground border-border',
  'w-[120px]',
  'grid-cols-[1fr_2fr]',
]

/**
 * The lines on which ESLint's design-lock rule fires, for a file of one
 * exported string per line.
 * @param filename - The repo-relative path ESLint lints the text as.
 * @param values - The strings, one per line, starting at line 1.
 * @returns The 1-based lines `no-restricted-syntax` reports, sorted and unique.
 */
function flaggedLines(filename: string, values: readonly string[]): number[] {
  const source = values.map((value, index) => `export const s${index} = ${JSON.stringify(value)}\n`)
  const result = spawnSync(
    path.join(repoRoot, 'node_modules/.bin/eslint'),
    ['--stdin', '--stdin-filename', filename, '--format', 'json'],
    { cwd: repoRoot, encoding: 'utf8', input: source.join('') }
  )
  expect(result.stderr).toBe('')
  const [report] = JSON.parse(result.stdout) as { messages: LintMessage[] }[]
  const lines = report!.messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.line)
  return [...new Set(lines)].sort((a, b) => a - b)
}

describe('the design lock (eslint.config.js)', () => {
  it('rejects palette classes, colour literals and arbitrary-value colours in a file expo owns', () => {
    expect(flaggedLines('src/app/probe.tsx', BANNED)).toEqual(BANNED.map((_, index) => index + 1))
  })

  it('lets token classes and non-colour arbitrary values through', () => {
    expect(flaggedLines('src/app/probe.tsx', ALLOWED)).toEqual([])
  })

  it("skips a shared row, which is react's copy", () => {
    expect(flaggedLines('src/lib/api-error.ts', BANNED)).toEqual([])
  })
})

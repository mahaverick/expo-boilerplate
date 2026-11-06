import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { jest } from '@jest/globals'
import { afterEach, describe, expect, it, repoRoot } from '@/tests/support/runner'
import config, { tokens } from '../../tailwind.config'

/** One row of the token table: a token and its sRGB hex value in each theme. */
interface Row {
  token: string
  light: string
  dark: string
}

/** Temporary directories made by a test, removed after it. */
const made: string[] = []

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

/**
 * The token table's rows in a markdown text, in order. Cells are read one by
 * one, so the formatter's column padding does not change the result.
 * @param markdown - A text holding the table.
 * @returns Each row's token and its light and dark hex values.
 */
function parseTable(markdown: string): Row[] {
  const rows: Row[] = []
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*`([a-z0-9-]+)`\s*\|\s*`(#[0-9a-f]+)`\s*\|\s*`(#[0-9a-f]+)`\s*\|/.exec(line)
    if (match) rows.push({ token: match[1]!, light: match[2]!, dark: match[3]! })
  }
  return rows
}

/**
 * The table's token rows, every cell included, with each run of whitespace
 * collapsed to one space, so the formatter's column padding does not count.
 * @param markdown - A text holding the table.
 * @returns One string per token row, in order.
 */
function tokenRows(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.replaceAll(/\s+/g, ' ').trim())
}

/**
 * Runs the generator. Babel-based Jest cannot import the script, which uses
 * `import.meta`, so every case spawns it.
 * @param args - Its arguments.
 * @param env - Variables to set over the inherited environment.
 * @returns Its exit status and output.
 */
function runGenerator(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts/styleseed.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

/**
 * A react checkout holding only `src/styles/globals.css`.
 * @param css - The stylesheet's text.
 * @returns The checkout's absolute path.
 */
function fakeReact(css: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'styleseed-'))
  made.push(dir)
  fs.mkdirSync(path.join(dir, 'src/styles'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/styles/globals.css'), css)
  return dir
}

/** STYLESEED.md's rows. */
const committed = parseTable(fs.readFileSync(path.join(repoRoot, 'STYLESEED.md'), 'utf8'))

describe('scripts/styleseed.mjs', () => {
  it('converts OKLCH to sRGB hex: alpha kept, out-of-gamut channels clipped, non-colours skipped', () => {
    const react = fakeReact(`:root {
  --white: oklch(1 0 0);
  --grey: oklch(0.5 0 0);
  --red: oklch(0.628 0.2577 29.23);
  --radius: 0.45rem;
}

.dark {
  --white: oklch(0 0 0);
  --grey: oklch(1 0 0 / 10%);
  --red: oklch(0.7 0.4 140);
}
`)
    const result = runGenerator(['--react', react])
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(parseTable(result.stdout)).toEqual([
      { token: 'white', light: '#ffffff', dark: '#000000' },
      { token: 'grey', light: '#636363', dark: '#ffffff1a' },
      { token: 'red', light: '#ff0000', dark: '#00cd00' },
    ])
  })

  it('fails on a token one theme lacks', () => {
    const react = fakeReact(':root {\n  --a: oklch(1 0 0);\n}\n\n.dark {\n}\n')
    const result = runGenerator(['--react', react])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('--a')
  })

  it('exits 2, naming the directory, when no react checkout is found', () => {
    const missing = path.join(os.tmpdir(), 'styleseed-no-react-here')
    const result = runGenerator(['--react', missing])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain(`no react-boilerplate checkout at ${missing}`)
  })
})

describe('STYLESEED.md', () => {
  it("holds the table the generator makes from react's globals.css", () => {
    const result = runGenerator([])
    // No checkout at the default path: only the config checks below run. A set REACT_BOILERPLATE_DIR must resolve.
    if (result.status === 2 && !process.env.REACT_BOILERPLATE_DIR) return
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(tokenRows(fs.readFileSync(path.join(repoRoot, 'STYLESEED.md'), 'utf8'))).toEqual(
      tokenRows(result.stdout)
    )
  })

  it('has rows to check', () => {
    expect(committed.length).toBeGreaterThan(30)
  })
})

describe('tailwind.config.ts', () => {
  it("holds STYLESEED.md's values, token for token", () => {
    expect(
      Object.entries(tokens).map(([token, value]) => ({
        token,
        light: value.light,
        dark: value.dark,
      }))
    ).toEqual(committed)
  })

  it('maps every Tailwind colour to its token variable, and has no other colour', () => {
    expect(config.theme?.colors).toEqual(
      Object.fromEntries(committed.map(({ token }) => [token, `var(--${token})`]))
    )
  })

  it("sets each variable to the table's value, light on :root and dark on .dark:root", () => {
    const addBase = jest.fn()
    const [themePlugin] = config.plugins as unknown as {
      handler: (api: { addBase: typeof addBase }) => void
    }[]
    themePlugin!.handler({ addBase })
    const light = Object.fromEntries(committed.map((row) => [`--${row.token}`, row.light]))
    const dark = Object.fromEntries(committed.map((row) => [`--${row.token}`, row.dark]))
    expect(addBase.mock.calls).toEqual([[{ ':root': light, '.dark:root': dark }]])
  })
})

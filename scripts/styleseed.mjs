#!/usr/bin/env node
/**
 * @file The STYLESEED generator: reads react-boilerplate's
 * `src/styles/globals.css` and prints the token table that `STYLESEED.md`
 * holds, each OKLCH colour converted to sRGB hex as `STYLESEED.md` describes.
 *
 * Usage: node scripts/styleseed.mjs [--react <dir>] [--write]. The react
 * directory is `--react`, then `REACT_BOILERPLATE_DIR`, then
 * `../react-boilerplate` beside this repository's root. `--write` replaces the
 * table in `STYLESEED.md` instead of printing it.
 *
 * Exit status: 0 on success, 1 on a stylesheet it cannot read, 2 when no react
 * checkout is found.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** This repository's root. */
const REPO_ROOT = path.resolve(import.meta.dirname, '..')

/** The table's header and divider rows. */
const HEADER = [
  '| Token | Light | Dark | Light in react | Dark in react |',
  '| ----- | ----- | ---- | -------------- | ------------- |',
]

/** A failure the CLI reports with its own exit status. */
class StyleseedError extends Error {
  /**
   * A failure with an exit status.
   * @param message - The line printed to stderr.
   * @param status - The exit status.
   */
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

/**
 * One sRGB channel, gamma-encoded from linear light and clipped to 0..1.
 * @param linear - The linear channel, possibly outside 0..1.
 * @returns The encoded channel as a two-digit hex byte.
 */
function encodeChannel(linear) {
  const clipped = Math.min(1, Math.max(0, linear))
  const encoded = clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055
  return byte(encoded)
}

/**
 * A 0..1 value as a two-digit hex byte, rounded to the nearest step.
 * @param unit - The value.
 * @returns Two lower-case hex digits.
 */
function byte(unit) {
  return Math.round(unit * 255)
    .toString(16)
    .padStart(2, '0')
}

/**
 * Converts the arguments of a CSS `oklch()` colour to sRGB hex: OKLCH to
 * OKLab, OKLab to linear sRGB through Björn Ottosson's matrices (CSS Color 4),
 * each channel clipped to 0..1, then the sRGB transfer function.
 * @param args - The text inside `oklch( )`, such as `0.5 0.1 200 / 10%`.
 * @returns `#rrggbb`, or `#rrggbbaa` when the colour has an alpha.
 */
export function oklchToHex(args) {
  const [channels, alpha] = args.split('/').map((part) => part.trim())
  const [lightness, chroma, hue] = channels.split(/\s+/).map(Number)
  if ([lightness, chroma, hue].some((n) => !Number.isFinite(n))) {
    throw new StyleseedError(`styleseed: cannot read oklch(${args})`, 1)
  }
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const hex = `#${encodeChannel(red)}${encodeChannel(green)}${encodeChannel(blue)}`
  if (alpha === undefined) return hex
  const opacity = alpha.endsWith('%') ? Number(alpha.slice(0, -1)) / 100 : Number(alpha)
  return `${hex}${byte(opacity)}`
}

/**
 * The `--name: oklch(...)` declarations of one top-level rule.
 * @param css - The stylesheet.
 * @param selector - The rule's selector, such as `:root`.
 * @returns Token names, without `--`, and their `oklch()` arguments, in order.
 */
function declarations(css, selector) {
  const start = css.search(new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{`, 'm'))
  if (start === -1) throw new StyleseedError(`styleseed: globals.css has no ${selector} rule`, 1)
  const body = css.slice(start, css.indexOf('}', start))
  return new Map([...body.matchAll(/--([a-z0-9-]+):\s*oklch\(([^)]*)\)/g)].map((m) => [m[1], m[2]]))
}

/**
 * The token table for a stylesheet: every colour token of `:root` with its
 * `.dark` value.
 * @param css - React's `globals.css`.
 * @returns The table as markdown lines, header first.
 */
export function tokenTable(css) {
  const light = declarations(css, ':root')
  const dark = declarations(css, '.dark')
  for (const name of new Set([...light.keys(), ...dark.keys()])) {
    if (!light.has(name) || !dark.has(name)) {
      throw new StyleseedError(`styleseed: --${name} is not in both :root and .dark`, 1)
    }
  }
  const rows = [...light].map(([name, value]) => {
    const darkValue = dark.get(name)
    return `| \`${name}\` | \`${oklchToHex(value)}\` | \`${oklchToHex(darkValue)}\` | \`oklch(${value})\` | \`oklch(${darkValue})\` |`
  })
  return [...HEADER, ...rows]
}

/**
 * React's `globals.css`.
 * @param react - React's root.
 * @returns The stylesheet's text.
 */
function readGlobals(react) {
  const file = path.join(react, 'src/styles/globals.css')
  if (!fs.existsSync(file)) {
    throw new StyleseedError(
      `styleseed: no react-boilerplate checkout at ${react} (set REACT_BOILERPLATE_DIR or --react)`,
      2
    )
  }
  return fs.readFileSync(file, 'utf8')
}

/**
 * Replaces the token table in a markdown text: the run of `|` lines that
 * starts at the table's header.
 * @param markdown - The text.
 * @param table - The new table's lines.
 * @returns The text with the new table.
 */
function replaceTable(markdown, table) {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => /^\|\s*Token\s*\|/.test(line))
  if (start === -1) throw new StyleseedError('styleseed: STYLESEED.md has no token table', 1)
  let end = start
  while (end < lines.length && lines[end].startsWith('|')) end += 1
  lines.splice(start, end - start, ...table)
  return lines.join('\n')
}

/**
 * The CLI's options from its arguments.
 * @param argv - The arguments after the script.
 * @returns The react directory, when given, and whether to write.
 */
function parseArguments(argv) {
  const options = { react: undefined, write: false }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--write') options.write = true
    else if (argv[index] === '--react' && argv[index + 1]) {
      options.react = path.resolve(argv[index + 1])
      index += 1
    } else throw new StyleseedError(`styleseed: unknown or incomplete argument ${argv[index]}`, 1)
  }
  return options
}

/** Print or write the table; a failure is one line on stderr and its exit status. */
function main() {
  try {
    const options = parseArguments(process.argv.slice(2))
    const react =
      options.react ??
      (process.env.REACT_BOILERPLATE_DIR || path.resolve(REPO_ROOT, '../react-boilerplate'))
    const table = tokenTable(readGlobals(react))
    if (options.write) {
      const doc = path.join(REPO_ROOT, 'STYLESEED.md')
      fs.writeFileSync(doc, replaceTable(fs.readFileSync(doc, 'utf8'), table))
    } else {
      process.stdout.write(`${table.join('\n')}\n`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    // exitCode, not exit(): exit() drops stderr still queued for a pipe.
    process.exitCode = error instanceof StyleseedError ? error.status : 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

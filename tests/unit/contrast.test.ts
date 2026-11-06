import { describe, expect, it } from '@/tests/support/runner'
import { tokens } from '../../tailwind.config'

/** A theme the tokens hold a value for. */
type Theme = 'light' | 'dark'

/** The WCAG AA floor for normal text. */
const AA = 4.5

/**
 * Pairs that measure under 4.5:1 with react's colours, converted as
 * STYLESEED.md describes. The colours are react's, so the fix belongs in
 * react's globals.css; this case fails once a pair clears the floor, and the
 * entry is then removed.
 */
const BELOW_AA: readonly { theme: Theme; text: string; surface: string }[] = [
  { theme: 'dark', text: 'destructive-foreground', surface: 'destructive' },
]

/** Token names, in the table's order. */
const NAMES = Object.keys(tokens) as (keyof typeof tokens)[]

/**
 * A token's value in one theme.
 * @param name - The token.
 * @param theme - The theme.
 * @returns Its `#rrggbb` value.
 */
function value(name: string, theme: Theme): string {
  const token = tokens[name as keyof typeof tokens]
  return token[theme]
}

/**
 * WCAG 2.2 relative luminance.
 * @param hex - An opaque `#rrggbb` colour.
 * @returns Its luminance, 0 to 1.
 */
function luminance(hex: string): number {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * The WCAG contrast ratio of two colours.
 * @param a - One `#rrggbb` colour.
 * @param b - The other.
 * @returns The ratio, 1 to 21.
 */
function ratio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Every `X-foreground` on `X`, then `foreground` and `muted-foreground` on `background`. */
const PAIRS: readonly { text: string; surface: string }[] = [
  ...NAMES.filter((name) => NAMES.includes(`${name}-foreground` as keyof typeof tokens)).map(
    (surface) => ({ text: `${surface}-foreground`, surface })
  ),
  { text: 'foreground', surface: 'background' },
  { text: 'muted-foreground', surface: 'background' },
]

/**
 * Whether a pair is a known react shortfall.
 * @param theme - The theme.
 * @param pair - The text and surface tokens.
 * @returns True when BELOW_AA lists it.
 */
function isKnownShortfall(theme: Theme, pair: { text: string; surface: string }): boolean {
  return BELOW_AA.some(
    (entry) => entry.theme === theme && entry.text === pair.text && entry.surface === pair.surface
  )
}

const CASES = (['light', 'dark'] as const).flatMap((theme) =>
  PAIRS.map((pair) => ({ theme, ...pair }))
)

describe('token contrast', () => {
  it('measures black on white at 21:1', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('checks every foreground pair', () => {
    expect(PAIRS.map((pair) => pair.surface)).toEqual([
      'card',
      'primary',
      'secondary',
      'muted',
      'destructive',
      'warning',
      'info',
      'sidebar',
      'popover',
      'accent',
      'sidebar-primary',
      'sidebar-accent',
      'background',
      'background',
    ])
  })

  it.each(CASES.filter((pair) => !isKnownShortfall(pair.theme, pair)))(
    '$theme: $text on $surface is at least 4.5:1',
    ({ theme, text, surface }) => {
      expect(ratio(value(text, theme), value(surface, theme))).toBeGreaterThanOrEqual(AA)
    }
  )

  it.each(BELOW_AA)(
    '$theme: $text on $surface is a known react shortfall, under 4.5:1',
    ({ theme, text, surface }) => {
      expect(ratio(value(text, theme), value(surface, theme))).toBeLessThan(AA)
    }
  )
})

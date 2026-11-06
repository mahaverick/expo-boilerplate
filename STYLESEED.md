# STYLESEED

The app's colours are react-boilerplate's design tokens. This file holds them
as a table that `scripts/styleseed.mjs` generates from react's
`src/styles/globals.css`, and `tailwind.config.ts` holds the same values.
`tests/unit/styleseed.test.ts` fails when either one differs from the table.

## Where the values come from

- **Source:** react-boilerplate's `src/styles/globals.css`, the `:root` rule
  for the light theme and the `.dark` rule for the dark theme. The table was
  generated from react at commit `1f528fa` on 6 November 2026.
- **Tokens:** every custom property in `:root` whose value is an `oklch()`
  colour. A token's name is react's variable without the `--`. `--radius` is
  not a colour, so it is not a token.
- **Regenerate:** `node scripts/styleseed.mjs --write` rewrites the table
  below. Copy the changed values into `tokens` in `tailwind.config.ts`. The
  script finds react through `--react <dir>`, then `REACT_BOILERPLATE_DIR`,
  then `../react-boilerplate` beside this repository.
- **Without react:** the script exits 2. The styleseed test then skips the
  comparison with react and checks `tailwind.config.ts` against this table
  alone. When `REACT_BOILERPLATE_DIR` is set and holds no checkout, the test
  fails. CI's `sync` job sets it and runs the styleseed test, so a pull
  request is checked against react's `main`.

## The conversion

NativeWind 4 cannot read `oklch()` on iOS or Android, so each value is
converted to sRGB hex. The method is deterministic, so the script, the table
and the config agree byte for byte:

1. **OKLCH to OKLab:** `a = C·cos(h)` and `b = C·sin(h)`, with the hue `h` in
   degrees.
2. **OKLab to linear sRGB:** Björn Ottosson's matrices, as CSS Color Module
   Level 4 prints them: OKLab to cube-root LMS, cubed, then LMS to linear sRGB.
3. **Gamut:** each linear channel is clipped to the range 0 to 1. A browser
   can map an out-of-gamut colour by reducing its chroma, so a clipped token
   can differ from react's rendering by a few steps per channel. Six values
   fall outside sRGB: `destructive`, `warning-strong`, `info` and
   `info-foreground` in light, and `destructive` and `warning-foreground` in
   dark.
4. **Transfer function:** the sRGB curve, `12.92·c` up to 0.0031308 and
   `1.055·c^(1/2.4) − 0.055` above it.
5. **Bytes:** each channel times 255, rounded to the nearest integer, as two
   lower-case hex digits. An alpha, such as `/ 10%`, becomes a fourth byte the
   same way, so `oklch(1 0 0 / 10%)` is `#ffffff1a`.

## How the app uses the tokens

- **Classes:** `tailwind.config.ts` replaces Tailwind's palette with the
  tokens, so `bg-background` and `text-primary-foreground` exist and
  `bg-red-500` does not. Each colour is `var(--token)`, so an opacity modifier
  such as `bg-primary/50` generates no class.
- **Themes:** a plugin in `tailwind.config.ts` sets each variable on `:root`
  to its light value and on `.dark:root` to its dark value. With
  `darkMode: 'class'`, NativeWind picks the dark values when its colour scheme
  is `dark`.
- **The stored theme:** `src/states/theme.store.ts` keeps `light`, `dark` or
  `system` in MMKV under the key `theme`. `src/app/_layout.tsx` passes it to
  NativeWind's `colorScheme.set` and hides the splash screen once NativeWind
  reports that scheme, or after 2 seconds when no report arrives.
- **Lint:** in the files expo owns under `src/`, ESLint rejects a Tailwind
  palette class such as `bg-red-500`, an arbitrary-value colour such as
  `bg-[#ff0000]` or `text-[color:#fff]`, and a colour literal such as `'#fff'`
  or `'rgb(0 0 0)'`. `tests/unit/lint/design-lock.test.ts` holds the rule. The shared rows from `shared-core.json` are react's copies,
  so the rule skips them.

## Contrast

`tests/unit/contrast.test.ts` measures every `X-foreground` on `X`, plus
`foreground` and `muted-foreground` on `background`, in both themes, against
the WCAG AA floor of 4.5:1. One of react's pairs is under it:

| Theme | Text                     | Surface       | Ratio  |
| ----- | ------------------------ | ------------- | ------ |
| Dark  | `destructive-foreground` | `destructive` | 2.53:1 |

React tuned dark `--destructive` (`oklch(0.75 0.191 22.216)`) as text on a
`destructive/20` fill, and `--destructive-foreground` is
`oklch(0.985 0 0)`. A colour at lightness 0.75 cannot reach 4.5:1 against
one at 0.985 under any gamut mapping, so the fix belongs in react's
`globals.css`. The test lists the pair as a known shortfall and fails once it
clears 4.5:1, so the entry is removed when react's colour changes.

## The table

| Token                        | Light     | Dark        | Light in react             | Dark in react                |
| ---------------------------- | --------- | ----------- | -------------------------- | ---------------------------- |
| `background`                 | `#ffffff` | `#090b0c`   | `oklch(1 0 0)`             | `oklch(0.148 0.004 228.8)`   |
| `foreground`                 | `#090b0c` | `#f9fbfb`   | `oklch(0.148 0.004 228.8)` | `oklch(0.987 0.002 197.1)`   |
| `card`                       | `#ffffff` | `#161b1d`   | `oklch(1 0 0)`             | `oklch(0.218 0.008 223.9)`   |
| `card-foreground`            | `#090b0c` | `#f9fbfb`   | `oklch(0.148 0.004 228.8)` | `oklch(0.987 0.002 197.1)`   |
| `primary`                    | `#161b1d` | `#e3e7e8`   | `oklch(0.218 0.008 223.9)` | `oklch(0.925 0.005 214.3)`   |
| `primary-foreground`         | `#f9fbfb` | `#161b1d`   | `oklch(0.987 0.002 197.1)` | `oklch(0.218 0.008 223.9)`   |
| `secondary`                  | `#f1f3f3` | `#22292b`   | `oklch(0.963 0.002 197.1)` | `oklch(0.275 0.011 216.9)`   |
| `secondary-foreground`       | `#161b1d` | `#f9fbfb`   | `oklch(0.218 0.008 223.9)` | `oklch(0.987 0.002 197.1)`   |
| `muted`                      | `#f1f3f3` | `#22292b`   | `oklch(0.963 0.002 197.1)` | `oklch(0.275 0.011 216.9)`   |
| `muted-foreground`           | `#5c6c70` | `#9ca8ab`   | `oklch(0.52 0.021 213.5)`  | `oklch(0.723 0.014 214.4)`   |
| `destructive`                | `#c30000` | `#ff7375`   | `oklch(0.48 0.245 27.325)` | `oklch(0.75 0.191 22.216)`   |
| `destructive-foreground`     | `#fafafa` | `#fafafa`   | `oklch(0.985 0 0)`         | `oklch(0.985 0 0)`           |
| `success`                    | `#137738` | `#5fd37f`   | `oklch(0.5 0.13 150)`      | `oklch(0.78 0.16 150)`       |
| `warning-strong`             | `#a16100` | `#fabb41`   | `oklch(0.55 0.13 70)`      | `oklch(0.83 0.15 80)`        |
| `warning`                    | `#efa831` | `#f2af48`   | `oklch(0.78 0.15 75)`      | `oklch(0.8 0.14 75)`         |
| `warning-foreground`         | `#2f1e02` | `#281600`   | `oklch(0.25 0.05 75)`      | `oklch(0.22 0.05 75)`        |
| `info`                       | `#006eb8` | `#56acf0`   | `oklch(0.52 0.15 245)`     | `oklch(0.72 0.13 245)`       |
| `info-foreground`            | `#f5fbff` | `#06131e`   | `oklch(0.985 0.01 245)`    | `oklch(0.18 0.03 245)`       |
| `border`                     | `#e3e7e8` | `#ffffff1a` | `oklch(0.925 0.005 214.3)` | `oklch(1 0 0 / 10%)`         |
| `input`                      | `#e3e7e8` | `#ffffff26` | `oklch(0.925 0.005 214.3)` | `oklch(1 0 0 / 15%)`         |
| `ring`                       | `#9ca8ab` | `#67787c`   | `oklch(0.723 0.014 214.4)` | `oklch(0.56 0.021 213.5)`    |
| `sidebar`                    | `#f9fbfb` | `#161b1d`   | `oklch(0.987 0.002 197.1)` | `oklch(0.218 0.008 223.9)`   |
| `sidebar-foreground`         | `#090b0c` | `#f9fbfb`   | `oklch(0.148 0.004 228.8)` | `oklch(0.987 0.002 197.1)`   |
| `sidebar-border`             | `#e3e7e8` | `#ffffff1a` | `oklch(0.925 0.005 214.3)` | `oklch(1 0 0 / 10%)`         |
| `popover`                    | `#ffffff` | `#161b1d`   | `oklch(1 0 0)`             | `oklch(0.218 0.008 223.9)`   |
| `popover-foreground`         | `#090b0c` | `#f9fbfb`   | `oklch(0.148 0.004 228.8)` | `oklch(0.987 0.002 197.1)`   |
| `accent`                     | `#f1f3f3` | `#22292b`   | `oklch(0.963 0.002 197.1)` | `oklch(0.275 0.011 216.9)`   |
| `accent-foreground`          | `#161b1d` | `#f9fbfb`   | `oklch(0.218 0.008 223.9)` | `oklch(0.987 0.002 197.1)`   |
| `chart-1`                    | `#d0d6d8` | `#d0d6d8`   | `oklch(0.872 0.007 219.6)` | `oklch(0.872 0.007 219.6)`   |
| `chart-2`                    | `#67787c` | `#67787c`   | `oklch(0.56 0.021 213.5)`  | `oklch(0.56 0.021 213.5)`    |
| `chart-3`                    | `#4b585b` | `#4b585b`   | `oklch(0.45 0.017 213.2)`  | `oklch(0.45 0.017 213.2)`    |
| `chart-4`                    | `#394447` | `#394447`   | `oklch(0.378 0.015 216)`   | `oklch(0.378 0.015 216)`     |
| `chart-5`                    | `#22292b` | `#22292b`   | `oklch(0.275 0.011 216.9)` | `oklch(0.275 0.011 216.9)`   |
| `sidebar-primary`            | `#161b1d` | `#1447e6`   | `oklch(0.218 0.008 223.9)` | `oklch(0.488 0.243 264.376)` |
| `sidebar-primary-foreground` | `#f9fbfb` | `#f9fbfb`   | `oklch(0.987 0.002 197.1)` | `oklch(0.987 0.002 197.1)`   |
| `sidebar-accent`             | `#f1f3f3` | `#22292b`   | `oklch(0.963 0.002 197.1)` | `oklch(0.275 0.011 216.9)`   |
| `sidebar-accent-foreground`  | `#161b1d` | `#f9fbfb`   | `oklch(0.218 0.008 223.9)` | `oklch(0.987 0.002 197.1)`   |
| `sidebar-ring`               | `#9ca8ab` | `#67787c`   | `oklch(0.723 0.014 214.4)` | `oklch(0.56 0.021 213.5)`    |

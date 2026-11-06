import nativewindPreset from 'nativewind/preset'
import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

/**
 * React's STYLESEED colours in sRGB hex, per theme, in STYLESEED.md's order.
 * STYLESEED.md is generated from react's globals.css and says how each value
 * is converted; tests/unit/styleseed.test.ts holds the two equal.
 */
export const tokens = {
  background: { light: '#ffffff', dark: '#090b0c' },
  foreground: { light: '#090b0c', dark: '#f9fbfb' },
  card: { light: '#ffffff', dark: '#161b1d' },
  'card-foreground': { light: '#090b0c', dark: '#f9fbfb' },
  primary: { light: '#161b1d', dark: '#e3e7e8' },
  'primary-foreground': { light: '#f9fbfb', dark: '#161b1d' },
  secondary: { light: '#f1f3f3', dark: '#22292b' },
  'secondary-foreground': { light: '#161b1d', dark: '#f9fbfb' },
  muted: { light: '#f1f3f3', dark: '#22292b' },
  'muted-foreground': { light: '#5c6c70', dark: '#9ca8ab' },
  destructive: { light: '#c30000', dark: '#ff7375' },
  'destructive-foreground': { light: '#fafafa', dark: '#fafafa' },
  success: { light: '#137738', dark: '#5fd37f' },
  'warning-strong': { light: '#a16100', dark: '#fabb41' },
  warning: { light: '#efa831', dark: '#f2af48' },
  'warning-foreground': { light: '#2f1e02', dark: '#281600' },
  info: { light: '#006eb8', dark: '#56acf0' },
  'info-foreground': { light: '#f5fbff', dark: '#06131e' },
  border: { light: '#e3e7e8', dark: '#ffffff1a' },
  input: { light: '#e3e7e8', dark: '#ffffff26' },
  ring: { light: '#9ca8ab', dark: '#67787c' },
  sidebar: { light: '#f9fbfb', dark: '#161b1d' },
  'sidebar-foreground': { light: '#090b0c', dark: '#f9fbfb' },
  'sidebar-border': { light: '#e3e7e8', dark: '#ffffff1a' },
  popover: { light: '#ffffff', dark: '#161b1d' },
  'popover-foreground': { light: '#090b0c', dark: '#f9fbfb' },
  accent: { light: '#f1f3f3', dark: '#22292b' },
  'accent-foreground': { light: '#161b1d', dark: '#f9fbfb' },
  'chart-1': { light: '#d0d6d8', dark: '#d0d6d8' },
  'chart-2': { light: '#67787c', dark: '#67787c' },
  'chart-3': { light: '#4b585b', dark: '#4b585b' },
  'chart-4': { light: '#394447', dark: '#394447' },
  'chart-5': { light: '#22292b', dark: '#22292b' },
  'sidebar-primary': { light: '#161b1d', dark: '#1447e6' },
  'sidebar-primary-foreground': { light: '#f9fbfb', dark: '#f9fbfb' },
  'sidebar-accent': { light: '#f1f3f3', dark: '#22292b' },
  'sidebar-accent-foreground': { light: '#161b1d', dark: '#f9fbfb' },
  'sidebar-ring': { light: '#9ca8ab', dark: '#67787c' },
} as const satisfies Record<string, { light: string; dark: string }>

/** A token's name. */
type Token = keyof typeof tokens

/** Token names, in STYLESEED.md's order. */
const names = Object.keys(tokens) as Token[]

/**
 * Each token's CSS variable set to its value in one theme.
 * @param theme - The theme whose values to use.
 * @returns `--token` to its hex value.
 */
function variables(theme: 'light' | 'dark'): Record<string, string> {
  return Object.fromEntries(names.map((name) => [`--${name}`, tokens[name][theme]]))
}

/**
 * Tailwind for NativeWind. The tokens replace Tailwind's palette, so no raw
 * palette class exists; each colour reads its variable, which `:root` sets to
 * the light value and `.dark:root` to the dark one.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [nativewindPreset],
  darkMode: 'class',
  theme: {
    colors: Object.fromEntries(names.map((name) => [name, `var(--${name})`])),
  },
  plugins: [
    plugin((api) => {
      api.addBase({ ':root': variables('light'), '.dark:root': variables('dark') })
    }),
  ],
} satisfies Config

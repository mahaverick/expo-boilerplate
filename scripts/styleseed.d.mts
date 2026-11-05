/**
 * Converts the arguments of a CSS `oklch()` colour to sRGB hex, as
 * `STYLESEED.md` describes.
 * @returns `#rrggbb`, or `#rrggbbaa` when the colour has an alpha.
 */
export declare function oklchToHex(args: string): string

/**
 * The token table for react's `globals.css`: every colour token of `:root`
 * with its `.dark` value.
 * @returns The table as markdown lines, header first.
 */
export declare function tokenTable(css: string): string[]

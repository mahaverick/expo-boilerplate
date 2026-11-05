/**
 * Check expo's copies of react-boilerplate's shared rows: each expo row byte
 * for byte, then the `check-shared` rules on the expo rows.
 * @returns One line per finding, empty when expo matches.
 */
export declare function syncCheck(options?: {
  root?: string
  react?: string
  env?: Record<string, string | undefined>
  warn?: (message: string) => void
}): string[]

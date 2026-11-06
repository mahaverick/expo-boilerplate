/**
 * Paths whose query string carries a one-time token. They arrive only through
 * an https app link, which the operating system verifies against the web
 * address's association files.
 */
export const TOKEN_PATHS = [
  '/auth/link',
  '/auth/confirm',
  '/invitations/accept',
  '/invitations/confirm',
] as const

/**
 * Whether a path, with or without a query or fragment, is one of `TOKEN_PATHS`.
 * @param path - A path starting with `/`.
 * @returns True for a token-bearing path.
 */
export function isTokenBearingPath(path: string): boolean {
  const bare = path.split(/[?#]/, 1)[0] ?? ''
  return (TOKEN_PATHS as readonly string[]).includes(bare)
}

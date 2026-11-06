import { TOKEN_PATHS } from '@/lib/app-links'
import { isEligibleTenant, type TenantWithRole } from '@/queries/tenant.queries'

/** The longest redirect path the API accepts, so a longer one would answer 400 and block signing in. */
export const MAX_REDIRECT_LENGTH = 2048

/** A host no real address uses. Resolving against it shows whether a value stays on the app. */
const BASE = 'https://app.invalid'

/**
 * Whether a value holds a backslash, a C0 control character or DEL. The API
 * refuses all of them anywhere in a redirect, and a URL parser keeps a
 * backslash in a query.
 * @param value - The text to scan.
 * @returns True when one is present.
 */
function hasUnsafeCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (character === '\\' || code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * Checks a path the app may land on after sign-in. A redirect arrives from a
 * link or a route parameter, so it is attacker-controlled. The rules are the
 * web app's: one leading `/`, at most `MAX_REDIRECT_LENGTH` characters, no
 * backslash or control character, and nothing that resolves off the app or to
 * a one-time-token page. The token check runs after decoding, collapsing
 * repeated slashes, dropping a trailing slash and folding case. The string
 * returned is the one that was checked, so dot segments are already resolved.
 * @param raw - The value to check.
 * @returns The resolved path and query, as the URL parser writes them, with the fragment dropped, or `null` when it is unsafe.
 */
export function safePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '' || raw.length > MAX_REDIRECT_LENGTH) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || hasUnsafeCharacter(raw)) return null
  let resolved: URL
  try {
    resolved = new URL(raw, BASE)
  } catch {
    return null
  }
  if (resolved.origin !== BASE) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(resolved.pathname)
  } catch {
    return null
  }
  if (decoded.startsWith('//') || hasUnsafeCharacter(decoded) || /[?#]/.test(decoded)) return null
  const normalized = decoded
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '')
    .toLowerCase()
  if ((TOKEN_PATHS as readonly string[]).includes(normalized)) return null
  return `${resolved.pathname}${resolved.search}`
}

/**
 * Where a person lands once signed in. A new account goes to `/welcome`. Else
 * the verify answer's redirect wins, then the one the link's own URL carried,
 * each only if `safePath` accepts it. Else an account with no eligible
 * workspace (none, or only suspended ones and the platform one) goes to
 * `/welcome`, as Home and Welcome count them. Anything else, including a failed
 * read of the list, goes Home.
 * @param link - What the verify answered.
 * @param link.isNewUser - True when the click created the account.
 * @param link.redirect - The redirect the server stored with the link.
 * @param requested - The `redirect` parameter on the link's URL, if any.
 * @param tenants - Reads the person's workspaces. Called only when no path applies.
 * @returns The path to replace the route with. Never rejects.
 */
export async function landingFor(
  link: { isNewUser: boolean; redirect: string | null },
  requested: string | undefined,
  tenants: () => Promise<TenantWithRole[]>
): Promise<string> {
  if (link.isNewUser) return '/welcome'
  const path = safePath(link.redirect) ?? safePath(requested)
  if (path) return path
  try {
    return (await tenants()).some(isEligibleTenant) ? '/' : '/welcome'
  } catch {
    return '/'
  }
}

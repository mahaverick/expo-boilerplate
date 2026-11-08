import Constants from 'expo-constants'
import { isTokenBearingPath } from '@/lib/app-links'

/** A URL with a scheme, then any number of slashes, then the rest: `scheme://host/path`, `scheme:///path` and `scheme:/path`. */
const SCHEME_URL = /^([a-z][a-z0-9+.-]*):\/*(.*)$/is

/**
 * Whether a path, after decoding, collapsing repeated slashes, dropping a
 * trailing slash and folding case, is a token path. A path that does not
 * decode counts as one.
 * @param path - A path with no query or fragment.
 * @returns True when the router could serve a token screen for the path.
 */
function reachesTokenScreen(path: string): boolean {
  try {
    const normalized = decodeURIComponent(path)
      .replace(/\/{2,}/g, '/')
      .replace(/\/$/, '')
    return isTokenBearingPath(normalized.toLowerCase())
  } catch {
    return true
  }
}

/**
 * Expo Router calls this with the raw URL that opened the app. A token travels
 * only in the query, and any app on the device can claim a custom scheme and
 * read it, so a custom-scheme URL loses its query and fragment, and a token
 * path under it becomes `/`. An https link is verified by the operating system
 * and passes through. The `e2e` build is the one exception: a custom-scheme URL
 * keeps its query, with the fragment dropped, so Maestro flows can open sign-in
 * and invitation links. That is safe because the e2e build has its own bundle
 * ID, CI builds it alone, and it never ships to a store or a person.
 * @param args - The incoming URL and whether it launched the app.
 * @param args.path - The raw incoming URL or path.
 * @param args.initial - True when the URL launched the app.
 * @returns In the e2e build, `/<path>?<query>` for a custom-scheme URL. Otherwise `/` for a custom-scheme token path, the bare path for any other custom-scheme URL, else `path` unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const match = SCHEME_URL.exec(path)
  if (!match || match[1]?.toLowerCase() === 'https') return path
  const rest = (match[2] ?? '').split('#', 1)[0] ?? ''
  if (Constants.expoConfig?.extra?.appVariant === 'e2e') return `/${rest}`
  const bare = `/${(match[2] ?? '').split(/[?#]/, 1)[0] ?? ''}`
  return reachesTokenScreen(bare) ? '/' : bare
}

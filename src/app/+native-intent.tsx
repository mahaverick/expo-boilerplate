import { isTokenBearingPath } from '@/lib/app-links'

/** The URL's scheme and the path after its authority: `scheme://host/path` gives `/path`, `scheme://path` gives `/path`. */
const CUSTOM_SCHEME_URL = /^([a-z][a-z0-9+.-]*):\/\/\/?(.*)$/i

/**
 * Expo Router calls this with the raw URL that opened the app. A URL with a
 * custom scheme and a token path is dropped, because any app on the device can
 * claim a custom scheme and read the token. An https link is verified by the
 * operating system and passes through.
 * @param args - The incoming URL and whether it launched the app.
 * @param args.path - The raw incoming URL or path.
 * @param args.initial - True when the URL launched the app.
 * @returns `/` for a custom-scheme token path, else `path` unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const match = CUSTOM_SCHEME_URL.exec(path)
  if (!match || match[1]?.toLowerCase() === 'https') return path
  const rest = match[2] ?? ''
  // The host position holds the first segment: `scheme://auth/link` is `/auth/link`.
  return isTokenBearingPath(`/${rest.replace(/^\/+/, '')}`) ? '/' : path
}

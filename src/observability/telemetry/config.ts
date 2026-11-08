/**
 * @file The analytics configuration, from the build's public variables. With
 * no `EXPO_PUBLIC_POSTHOG_KEY`, analytics is inert and makes no request.
 */

/** Sent as the `app` super property on every event. */
export const ANALYTICS_APP = 'expo'

/** The environment an event names when the build sets no `EXPO_PUBLIC_APP_ENV`. */
const DEFAULT_ENVIRONMENT = 'development'

/**
 * The query keys a captured URL may keep: `tab`, and the campaign keys
 * express puts on the links it mails. React's list. Every other key, and the
 * fragment, is dropped before an event leaves the device: the `?token=` and
 * `?email=` of a sign-in or invitation link would otherwise reach PostHog.
 */
export const ANALYTICS_URL_QUERY_ALLOWLIST: readonly string[] = [
  'tab',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
]

/**
 * Property names never sent, at any depth: react's
 * `CUSTOM_PERSONAL_DATA_PROPERTIES`. They carry credentials, addresses,
 * redirect targets or search text.
 */
export const PERSONAL_DATA_PROPERTIES: readonly string[] = [
  'token',
  'email',
  'redirect',
  'invitation',
  'q',
  'search',
  'invitationsSearch',
  'historySearch',
  'unregisteredSearch',
  'ph_did',
  'ph_sid',
]

/** The resolved configuration. */
export interface AnalyticsConfig {
  /** The PostHog project key, or null when analytics is inert. */
  key: string | null
  /** Sent as the `environment` super property. */
  environment: string
}

/**
 * This build's configuration. The variables are read through the literal
 * `process.env.EXPO_PUBLIC_*` form, the only one babel-preset-expo inlines, at
 * call time, so a test can set them before `initAnalytics`. An empty value
 * counts as unset.
 * @returns The key, or null, and the environment.
 */
export function analyticsConfig(): AnalyticsConfig {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY
  const environment = process.env.EXPO_PUBLIC_APP_ENV
  return {
    key: key ? key : null,
    environment: environment ? environment : DEFAULT_ENVIRONMENT,
  }
}

/**
 * Whether analytics can run at all.
 * @returns True when the build sets a key.
 */
export function isAnalyticsAvailable(): boolean {
  return analyticsConfig().key !== null
}

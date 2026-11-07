/**
 * @file The typed registry of the events this app sends. An event not listed
 * here, or a property outside its listed shape, fails to compile, and a
 * property type that admits a free string fails `REGISTRY_HAS_NO_FREE_STRINGS`:
 * a free string is how a name, an address or a search term ends up in an
 * event. React's registry, cut to the events expo sends.
 */

declare const analyticsKeyBrand: unique symbol

/** A fixed, code-defined key (`onboarding_open_settings`), never user input. */
export type AnalyticsKey = string & { readonly [analyticsKeyBrand]: 'AnalyticsKey' }

/** Characters no fixed key needs, which an address, a sentence or a URL carries. */
type ForbiddenKeyCharacter = ' ' | '@' | '.' | '/' | ':' | '?' | '=' | '&' | '#'

/** `K` when it is a lowercase string literal free of forbidden characters, otherwise `never`. */
type KeyShape<K extends string> = string extends K
  ? never
  : K extends Lowercase<K>
    ? K extends `${string}${ForbiddenKeyCharacter}${string}`
      ? never
      : K
    : never

/**
 * Brands a string literal as an `AnalyticsKey`. A `string` variable, an
 * uppercase letter, a space, `@`, `.` or a URL character fails to compile.
 * @param key - A literal such as `'onboarding_open_settings'`.
 * @returns The same string, branded.
 */
export function analyticsKey<const K extends string>(key: K & KeyShape<K>): AnalyticsKey {
  return key as string as AnalyticsKey
}

/** Every event this app sends with `track`, and its properties. */
export interface AppEventProps {
  /** A sign-in link was requested for an address (the API answered 202); the address is never sent. */
  sign_in_link_requested: Record<never, never>
  /** A sign-in finished: by an emailed link (also an invitation link) or by a passkey. */
  sign_in_completed: { method: 'link' | 'passkey' }
  /** A banner was dismissed. */
  banner_dismissed: { banner: 'trial_ended' }
  /** The active workspace changed from one workspace to another. */
  tenant_switched: Record<never, never>
  /** A call to action that leads into a feature was followed. */
  feature_cta_clicked: { cta: AnalyticsKey }
  /** The maintenance screen (`full`) or the read-only banner was shown, once per maintenance period. */
  maintenance_page_viewed: { mode: 'full' | 'read_only' }
  /** The Plan screen was shown. */
  billing_page_viewed: Record<never, never>
  /** The trial explainer was shown. */
  trial_explainer_viewed: Record<never, never>
}

/** A registered event name. */
export type AppEvent = keyof AppEventProps

/**
 * The property keys, across the registry, whose type admits any string. The
 * `-?` reads an optional property by its declared type, so a free string
 * behind `?` is still caught.
 */
type FreeStringProperties<R> = {
  [E in keyof R]: {
    [P in keyof R[E]]-?: string extends R[E][P] ? `${E & string}.${P & string}` : never
  }[keyof R[E]]
}[keyof R]

/** Compiles only while no registered property admits a free string. */
export const REGISTRY_HAS_NO_FREE_STRINGS: [FreeStringProperties<AppEventProps>] extends [never]
  ? true
  : FreeStringProperties<AppEventProps> = true

/** `track`'s arguments after the name: none for an event with no properties. */
export type TrackArgs<E extends AppEvent> = keyof AppEventProps[E] extends never
  ? []
  : [props: AppEventProps[E]]

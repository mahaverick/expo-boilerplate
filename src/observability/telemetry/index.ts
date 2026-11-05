/**
 * @file The analytics port. This plan sends no events: `track` does nothing
 * and no request carries an analytics session.
 */

declare const analyticsKeyBrand: unique symbol

/** A fixed, code-defined key (`onboarding_open_settings`), never user input. */
export type AnalyticsKey = string & { readonly [analyticsKeyBrand]: 'AnalyticsKey' }

/**
 * Brands a string literal as an `AnalyticsKey`.
 * @param key - A literal such as `'onboarding_open_settings'`.
 * @returns The same string, branded.
 */
export function analyticsKey<const K extends string>(key: K): AnalyticsKey {
  return key as string as AnalyticsKey
}

/** Records an event: its name and properties. Does nothing until analytics arrives. */
export const track: (
  event: string,
  properties?: Readonly<Record<string, unknown>>
) => void = () => {}

/** The analytics session to link the given user's request to. There is none, so it is null. */
export const getAnalyticsSessionIdFor: (userId: string | null) => string | null = () => null

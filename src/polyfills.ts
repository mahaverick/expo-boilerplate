/**
 * @file The Web APIs the shared core calls that Hermes may lack, installed
 * before any other module loads (`index.ts` imports this file first):
 *
 * - `crypto.getRandomValues`, for each request's `traceparent`;
 * - full `URL` parsing, for the analytics URL sanitizer and the workspace
 *   web-address checks;
 * - `Intl.getCanonicalLocales`, `Intl.Locale` and `Intl.PluralRules`, which
 *   `tenant.schemas.ts` and the `Intl.RelativeTimeFormat` polyfill call;
 * - `Intl.RelativeTimeFormat`, for `relative-time.ts`.
 *
 * Each `Intl` polyfill loads only where the engine lacks the API, in the
 * order formatjs documents: each one needs the ones before it.
 */
import 'react-native-get-random-values'
import 'react-native-url-polyfill/auto'
import { shouldPolyfill as shouldPolyfillCanonicalLocales } from '@formatjs/intl-getcanonicallocales/should-polyfill.js'
import { shouldPolyfill as shouldPolyfillLocale } from '@formatjs/intl-locale/should-polyfill.js'
import { shouldPolyfill as shouldPolyfillPluralRules } from '@formatjs/intl-pluralrules/should-polyfill.js'
import { shouldPolyfill as shouldPolyfillRelativeTimeFormat } from '@formatjs/intl-relativetimeformat/should-polyfill.js'

// require(), not import: a static import is hoisted and always loads, and import() is async and races the first render.
if (shouldPolyfillCanonicalLocales()) {
  require('@formatjs/intl-getcanonicallocales/polyfill-force.js')
}
if (shouldPolyfillLocale()) {
  require('@formatjs/intl-locale/polyfill-force.js')
}
if (shouldPolyfillPluralRules('en')) {
  require('@formatjs/intl-pluralrules/polyfill-force.js')
  require('@formatjs/intl-pluralrules/locale-data/en.js')
}
if (shouldPolyfillRelativeTimeFormat('en')) {
  require('@formatjs/intl-relativetimeformat/polyfill-force.js')
  require('@formatjs/intl-relativetimeformat/locale-data/en.js')
}

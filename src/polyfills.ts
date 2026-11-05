/**
 * @file The Web APIs the shared core calls that Hermes may lack, installed
 * before any other module loads (`index.ts` imports this file first):
 *
 * - `crypto.getRandomValues`, for each request's `traceparent`;
 * - full `URL` parsing, for the analytics URL sanitizer and the workspace
 *   web-address checks;
 * - `Intl.RelativeTimeFormat`, for `relative-time.ts`, loaded only where the
 *   engine lacks it, with its English data.
 */
import 'react-native-get-random-values'
import 'react-native-url-polyfill/auto'
import { shouldPolyfill } from '@formatjs/intl-relativetimeformat/should-polyfill.js'

// require(), not import: a static import is hoisted and would always load, and import() is async and would race the first render.
if (shouldPolyfill('en')) {
  require('@formatjs/intl-relativetimeformat/polyfill-force.js')
  require('@formatjs/intl-relativetimeformat/locale-data/en.js')
}

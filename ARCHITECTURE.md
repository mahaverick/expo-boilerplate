# Architecture

This file says how the expo app is put together and why. It is for a
developer who changes the code. The rules for changing it are in
[CLAUDE.md](CLAUDE.md), and the threats it defends against are in
[SECURITY.md](SECURITY.md).

The app is the iOS and Android client for the same account, workspaces and API
as react-boilerplate. As of 6 November 2026 it ships the foundation only: a
placeholder screen, the shared core, the theme, and the ports that connect the
two. The design for the screens that follow is in
[the spec](docs/superpowers/specs/2026-11-03-expo-boilerplate-design.md).

| Concern | Choice                                                                       |
| ------- | ---------------------------------------------------------------------------- |
| Runtime | Expo SDK 58, React Native 0.88.1 on Hermes, React 19.3, the New Architecture |
| Routing | Expo Router, file-based from `src/app/`, typed routes                        |
| Data    | TanStack Query, axios (react's versions, through the shared core)            |
| Forms   | TanStack Form with Zod 4 schemas (shared core)                               |
| State   | Zustand (`src/states/`); MMKV for the theme                                  |
| Styling | NativeWind 4.2.7 on Tailwind 3, with react's STYLESEED tokens                |
| Tests   | Jest 30 through `jest-expo`, React Native Testing Library                    |

## Layout of `src/`

```
src/
  app/              Expo Router routes: _layout.tsx (theme, splash), index.tsx
  components/ui/    the UI kit; empty until a plan writes it
  constants/        shared: routes, roles, audit actions; frontend-app.ts is a port
  hooks/            shared hooks
  http/             shared: interceptors, refresh core; client.ts and session.ts are ports
  lib/              shared pure logic; toast.ts is a port
  observability/    flags/ and telemetry/: both are ports
  polyfills.ts      the Web APIs Hermes may lack, loaded first
  ports/            navigation.ts, runtime.ts, webauthn.ts
  queries/          shared TanStack Query hooks
  schemas/          shared Zod schemas
  states/           auth, maintenance-mode (ports), theme, toast-queue (expo's own)
  types/            shared types
```

`index.ts` at the repository root is the package entry. `app.config.ts` reads
the version from `package.json`, sets `scheme: 'expo-boilerplate'`, portrait
orientation and iPhone only, and turns on typed routes and the React Compiler
(`experiments.reactCompiler`, which comes from the Expo template and matches
react's own use of the compiler).

Files that `shared-core.json` gives `expo` are react's, byte for byte. Every
other file under `src/` is expo's own, and the ports are the only expo files
a shared file imports.

## Boot

1. `index.ts` imports `./src/polyfills`, then `expo-router/entry`. The order
   matters because shared modules call `crypto.getRandomValues` and
   `Intl.RelativeTimeFormat` while they load.
   `tests/unit/entry-order.test.ts` holds it.
2. Expo Router builds the route tree from `src/app/`. `src/app/_layout.tsx` is
   the root layout: one `Stack` with no header.
3. The layout imports `global.css` first, calls
   `SplashScreen.preventAutoHideAsync()` at module scope, and applies the stored
   theme ([The theme and the splash screen](#the-theme-and-the-splash-screen)).
4. `src/app/index.tsx` is the placeholder screen: the app's name on the theme's
   background, with the `header` role.

## Polyfills

`src/polyfills.ts` installs the APIs the shared core calls and Hermes may lack.
The order is fixed, and each `Intl` polyfill needs the ones before it:

1. `react-native-get-random-values`: `crypto.getRandomValues`, which builds
   each request's `traceparent`.
2. `react-native-url-polyfill/auto`: full `URL` parsing, for the analytics URL
   sanitizer and the workspace web-address checks.
3. `@formatjs/intl-getcanonicallocales`, loaded only where its
   `should-polyfill` check says the engine lacks `Intl.getCanonicalLocales`.
4. `@formatjs/intl-locale`, behind its own guard.
5. `@formatjs/intl-pluralrules` with `en` data, behind its own guard.
6. `@formatjs/intl-relativetimeformat` with `en` data, behind its own guard.
   It calls the first and third.

The guarded polyfills load with `require()`, inside the `if`. A static
`import` is hoisted and always loads, and `import()` is asynchronous and races
the first render. The formatjs paths end in `.js`, the only subpaths their
`exports` maps list.

`tests/unit/polyfills.test.ts` holds the order in Jest. **None of this has run
on a device.** A device that lacks one of these APIs fails when the first
shared module calls it. [SECURITY.md](SECURITY.md#known-gaps) lists the gap
and the [README](README.md#device-checklist) checks it.

## The ports

A port is a file that every app holds under the same path and with the same
exports, and each app writes its own body. A shared file may import a port and
nothing else that is platform-specific. The manifest's `ports` key lists the
exports a shared file may use; `testPorts` lists the test port's. This table is
expo's version of each port. `check-shared` does not compare it with the
manifest, so a new port or export is a change to both.

| Port                                   | Exports                                                                                         | What expo's version does                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/constants/frontend-app.ts`        | `FRONTEND_APP`                                                                                  | `'web'`. Mailed links point at `WEB_URL` and reach the app through universal links, so express builds links and policy for the web app.                                                                                                                                                                                                                                                                                                                                                 |
| `src/http/client.ts`                   | `apiClient`, `unwrap`                                                                           | Builds `apiClient` with `createApiClient` (`baseURL` is `EXPO_PUBLIC_API_URL` plus `API_PREFIX`, `withCredentials: false`) and installs the shared interceptor chain. A request counts as an API request when it goes to that origin under `API_PREFIX`; only those carry `X-Client: native` and `X-Device-Name` (the `expo-device` model name, when known). An unset URL leaves a relative base, so no request counts and importing the file never throws. `unwrap` is the shared one. |
| `src/http/session.ts`                  | `broadcastAuthMessage`, `broadcastLogout`, `ensureSession`, `redirectToLogin`, `switchIdentity` | `ensureSession` rejects with `NoRefreshTokenError`, an auth verdict, because the app stores no refresh token yet, so the app counts as signed out. The broadcast functions do nothing, since there is one process. `redirectToLogin` calls `router.replace('/')`. `switchIdentity` clears the query cache and the auth store when a different user signs in.                                                                                                                            |
| `src/lib/toast.ts`                     | `toast`                                                                                         | `toast.success`, `toast.error`, `toast.warning` and `toast.dismiss` over the Zustand queue in `src/states/toast-queue.store.ts`. A toast raised with the `id` of a queued one replaces it. Nothing renders the queue yet.                                                                                                                                                                                                                                                               |
| `src/observability/flags/flag-keys.ts` | `CLIENT_FLAGS`                                                                                  | This app's slice of express's flag registry: the entries with `client: true` and an app list that names it, copied by hand. It holds react's two example flags.                                                                                                                                                                                                                                                                                                                         |
| `src/observability/telemetry/index.ts` | `AnalyticsKey`, `analyticsKey`, `getAnalyticsSessionIdFor`, `track`                             | `track` does nothing. `analyticsKey` brands its argument and returns it. `getAnalyticsSessionIdFor` returns `null`. No event leaves the app.                                                                                                                                                                                                                                                                                                                                            |
| `src/ports/navigation.ts`              | `assignLocation`                                                                                | A `url` that begins with `/` goes to `router.replace`, so back does not return to the signed-in screen. Any other `url` goes to `Linking.openURL`, and its rejection is caught, so a URL nothing handles is dropped, never an unhandled rejection.                                                                                                                                                                                                                                      |
| `src/ports/runtime.ts`                 | `isDev`                                                                                         | `isDev`, read from `__DEV__`.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/ports/webauthn.ts`                | `webauthn`                                                                                      | No passkeys. `isSupported` resolves `{ create: false, autofill: false }`, `get` and `create` reject with a not-supported `Error`, `cancelGeneration` returns 0, and the three `signal*` methods do nothing.                                                                                                                                                                                                                                                                             |
| `src/states/auth.store.ts`             | `useAuthStore`                                                                                  | A Zustand store of the access token and user, in memory only, with no `persist` middleware. The same shape as react's.                                                                                                                                                                                                                                                                                                                                                                  |
| `src/states/maintenance-mode.store.ts` | `useMaintenanceModeStore`                                                                       | A Zustand store of the maintenance mode, the owner's notice and the start time, set from the `Maintenance-Mode` header, the status endpoint or a 503 body. Memory only, and the same shape as react's.                                                                                                                                                                                                                                                                                  |
| `tests/support/runner.ts`              | `describe`, `it`, `test`, `expect`, `beforeEach`, `afterEach`, `repoRoot`, `copyStyleRoots`     | Re-exports `describe`, `it`, `test`, `expect`, `beforeEach` and `afterEach` from `@jest/globals`. `repoRoot` is the repository root, and `copyStyleRoots` is `['src', 'src/components/ui']`.                                                                                                                                                                                                                                                                                            |

Later plans replace three ports. The session port gets the body transport and
`expo-secure-store`, the toast port gets a toaster, and the telemetry port gets
PostHog. Update this table in the same pull request.

## The theme and the splash screen

- **Tokens.** `tailwind.config.ts` holds react's STYLESEED colours in sRGB hex
  and sets each as a CSS variable: light on `:root`, dark on `.dark:root`.
  `theme.colors` replaces Tailwind's palette with `var(--token)` entries, so
  `bg-red-500` does not exist. [STYLESEED.md](STYLESEED.md) holds the table.
- **Limits.** Each colour is `var(--token)`, so an opacity modifier such as
  `bg-primary/50` generates no class. `transparent` and `current` are not in
  the palette, because the config replaces Tailwind's.
- **The stored preference.** `src/states/theme.store.ts` keeps `light`,
  `dark` or `system` in MMKV under the key `theme`. A missing or unknown
  value reads as `system`. `resolvedScheme(preference, systemScheme)` gives
  the scheme to paint.
- **Applying it.** The root layout passes the preference to NativeWind's
  `colorScheme.set`, `system` included, so the OS keeps control.
- **The splash screen hides once**, when NativeWind reports the stored scheme
  or after 2 seconds (`SPLASH_FALLBACK_MS`), whichever comes first. The scheme
  reaches NativeWind through a native appearance event after `set` returns, so
  hiding right after `set` could show one light frame. NativeWind drops that
  event while the app is not active, so the 2-second bound stops a lost event
  from holding the splash screen until a force-quit. The cost is one possible
  light frame on a slow device that takes longer than 2 seconds.
  `tests/unit/app/root-layout.test.tsx` covers both paths with fake timers. No
  device has run it.

## The shared core

react-boilerplate is the source. `shared-core.json` is the manifest, and
react's [Shared core](https://github.com/mahaverick/react-boilerplate/blob/main/ARCHITECTURE.md#shared-core)
section holds the table of rows. Expo holds 75 `files` rows and 31 `tests`
rows, and the manifest itself is a 107th file. Each is react's, byte for byte,
and `pnpm sync:check` compares them with a react checkout.

Expo's answers to what the shared files assume are in
[CLAUDE.md](CLAUDE.md#the-shared-core): the TypeScript libs, the polyfills,
`assignLocation`, knip's entries, the Jest timer setup.

## Tests

- `tests/unit/` holds the shared tests, which run unchanged through the runner
  port, and expo's own: the entry order, the polyfills, the ports, the theme,
  the root layout, the STYLESEED table, the contrast of the tokens, the lint
  design lock and the sync check.
- `tests/setup.ts` unrefs TanStack Query's timers so a shared test needs no
  teardown.
- `jest.config.ts` maps `@/` to `src/`, `@/tests/` to `tests/`, and `.css`
  files to an empty module.

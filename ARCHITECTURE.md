# Architecture

This file says how the expo app is put together and why. It is for a
developer who changes the code. The rules for changing it are in
[CLAUDE.md](CLAUDE.md), and the threats it defends against are in
[SECURITY.md](SECURITY.md).

The app is the iOS and Android client for the same account, workspaces and API
as react-boilerplate. As of 6 November 2026 it signs a person in with an emailed
link and keeps the session on the device. It has four tabs (Home, Workspace,
Notifications and Settings), a workspace's overview, the list and creation of
workspaces, the screens that block the app for an update or maintenance, the
shared core, the theme, and the ports that connect the two. The design for the
screens that follow is in
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
  app/              Expo Router routes (see "The route tree"), +native-intent
  components/       auth/ (the sign-in form), shared/ (banners, update and maintenance screens, load error, empty state), ui/ (the UI kit: Screen, Button, TextField, InlineError, Toaster, TOUCH_TARGET), workspaces/ (switcher, gate, overview, getting started, create form)
  constants/        shared: routes, roles, audit actions; frontend-app.ts is a port
  hooks/            shared hooks; use-sign-out, use-current-tenant, use-is-online and use-top-banner are expo's own
  http/             shared: interceptors, refresh core; client.ts and session.ts are ports; token-store, revoke, body-token, session-lifecycle and maintenance are expo's
  lib/              shared pure logic; toast.ts is a port; app-links, minimum-version, query-managers and safe-path are expo's
  observability/    flags/ and telemetry/: both are ports
  polyfills.ts      the Web APIs Hermes may lack, loaded first
  ports/            navigation.ts, runtime.ts, webauthn.ts
  queries/          shared TanStack Query hooks
  schemas/          shared Zod schemas
  states/           auth, maintenance-mode (ports), theme, toast-queue and current-tenant (expo's own)
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
   the root layout: one `Stack` with no header, inside a `QueryClientProvider`
   for the app's one query client (`src/lib/query-client.ts`). Each screen
   draws its own title through `Screen`.
3. The layout imports `global.css` first, calls
   `SplashScreen.preventAutoHideAsync()` at module scope, and applies the stored
   theme ([The theme and the splash screen](#the-theme-and-the-splash-screen)).
4. The layout calls `restoreSession()` and `installForegroundRefresh()`
   ([Sessions](#sessions)). Routes under `src/app/(app)/` render only for a
   signed-in person: its layout shows "Signing you in" with a spinner while the
   restore runs, sends a signed-out person to `/login` with the path they asked
   for as `redirect`, and sends an account that must add a passkey to
   `/passkey-required`. Home is `src/app/(app)/(tabs)/index.tsx`.
5. The same layout also installs `installQueryManagers()` and
   `installMaintenanceRecovery()` ([Workspaces and the shell](#workspaces-and-the-shell)).

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

| Port                                   | Exports                                                                                         | What expo's version does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/constants/frontend-app.ts`        | `FRONTEND_APP`                                                                                  | `'web'`. Mailed links point at `WEB_URL` and reach the app through universal links, so express builds links and policy for the web app.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/http/client.ts`                   | `apiClient`, `unwrap`                                                                           | Builds `apiClient` with `createApiClient` (`baseURL` is `EXPO_PUBLIC_API_URL` plus `API_PREFIX`, `withCredentials: false`) and installs the shared interceptor chain. A request counts as an API request when it goes to that origin under `API_PREFIX`; only those carry `X-Client: native` and `X-Device-Name` (the `expo-device` model name, when known), and a guard removes the bearer token from every other request. An unset URL leaves a relative base, so no request counts and importing the file never throws. `unwrap` is the shared one. |
| `src/http/session.ts`                  | `broadcastAuthMessage`, `broadcastLogout`, `ensureSession`, `redirectToLogin`, `switchIdentity` | `ensureSession` builds the shared refresh core with the `body` transport over `refreshTokenStore` (SecureStore), so a restore posts the stored token in the body and keeps the rotated one. The broadcast functions do nothing, since there is one process. `redirectToLogin` calls `router.replace('/login')`. `switchIdentity` clears the query cache and the auth store when a different user signs in.                                                                                                                                             |
| `src/lib/toast.ts`                     | `toast`                                                                                         | `toast.success`, `toast.error`, `toast.warning` and `toast.dismiss` over the Zustand queue in `src/states/toast-queue.store.ts`. A toast raised with the `id` of a queued one replaces it. `src/components/ui/toaster.tsx` renders the newest 3.                                                                                                                                                                                                                                                                                                       |
| `src/observability/flags/flag-keys.ts` | `CLIENT_FLAGS`                                                                                  | This app's slice of express's flag registry: the entries with `client: true` and an app list that names it, copied by hand. It holds react's two example flags.                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/observability/telemetry/index.ts` | `AnalyticsKey`, `analyticsKey`, `getAnalyticsSessionIdFor`, `track`                             | `track` does nothing. `analyticsKey` brands its argument and returns it. `getAnalyticsSessionIdFor` returns `null`. No event leaves the app.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/ports/navigation.ts`              | `assignLocation`                                                                                | A `url` that begins with `/` goes to `router.replace`, so back does not return to the signed-in screen. Any other `url` goes to `Linking.openURL`, and its rejection is caught, so a URL nothing handles is dropped, never an unhandled rejection.                                                                                                                                                                                                                                                                                                     |
| `src/ports/runtime.ts`                 | `isDev`                                                                                         | `isDev`, read from `__DEV__`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/ports/webauthn.ts`                | `webauthn`                                                                                      | No passkeys. `isSupported` resolves `{ create: false, autofill: false }`, `get` and `create` reject with a not-supported `Error`, `cancelGeneration` returns 0, and the three `signal*` methods do nothing.                                                                                                                                                                                                                                                                                                                                            |
| `src/states/auth.store.ts`             | `useAuthStore`                                                                                  | A Zustand store of the access token and user, in memory only, with no `persist` middleware. The same shape as react's.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/states/maintenance-mode.store.ts` | `useMaintenanceModeStore`                                                                       | A Zustand store of the maintenance mode, the owner's notice and the start time, set from the `Maintenance-Mode` header, the status endpoint or a 503 body. Memory only, and the same shape as react's.                                                                                                                                                                                                                                                                                                                                                 |
| `tests/support/runner.ts`              | `describe`, `it`, `test`, `expect`, `beforeEach`, `afterEach`, `repoRoot`, `copyStyleRoots`     | Re-exports `describe`, `it`, `test`, `expect`, `beforeEach` and `afterEach` from `@jest/globals`. `repoRoot` is the repository root, and `copyStyleRoots` is `['src', 'src/components/ui']`.                                                                                                                                                                                                                                                                                                                                                           |

Later plans replace two ports. The telemetry port gets PostHog, and the
webauthn port gets a passkey library once a spike on a device picks one.
Update this table in the same pull request.

## Sessions

The refresh token never lives in memory longer than one request. It never
enters a Zustand store, a query cache, a mutation result, a log or an analytics
event. These expo-owned modules hold the session:

- `src/http/token-store.ts`: `refreshTokenStore` (SecureStore key
  `refresh_token`) and `pendingRevokeStore` (key `pending_revoke`, a capped
  list of tokens whose logout has not reached the API). Every call passes
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. A read deletes a value only when it fails
  to decrypt (`ERR_DECRYPT`); any other read failure, such as a locked
  Keychain, rejects with a plain `Error` and keeps the item. It also counts
  session changes (`markSessionChange`).
- `src/http/session.ts`: the session port. It hands the shared refresh core a
  store that notes when a refresh read the token. After a sign-out or a
  sign-in, that refresh keeps nothing: its write throws a plain `Error`, its
  rotated token is revoked, and a sign-in it already made is undone. The
  core's `onSignedOut` and `onIdentityChanged` empty the query cache and the
  passkey-setup flag.
- `src/lib/query-client.ts`: the app's one `QueryClient`, at module scope so
  a forced sign-out outside React can empty it.
- `src/http/revoke.ts`: `revokeToken` saves a token to `pending_revoke`, then
  posts `/auth/logout`; `retryPendingRevoke` posts every pending token.
- `src/http/body-token.ts`: the interceptors that add the stored token to the
  body of the routes express reads it from, keep the token a sign-in returns
  (a session change, and a clear of the passkey-setup flag), remove
  `refreshToken` from a failed request's `error.config.data`, and set the
  passkey-setup flag.
- `src/http/session-lifecycle.ts`: `restoreSession` (reinstall check, then
  the refresh, with the pending revokes beside it), `useSessionStatus` and `installForegroundRefresh`.
- `src/hooks/use-sign-out.ts`: expo's sign-out, which replaces the shared
  `useLogout`.
- `src/lib/app-links.ts`: `TOKEN_PATHS`, the paths whose query holds a one-time
  token.
- `src/app/+native-intent.tsx`: Expo Router's hook for an incoming URL. It
  strips the query and fragment from every non-https link.
- `plugins/with-backup-rules.js`: the config plugin that writes Android's two
  backup rule files and points the manifest at them.

The launch restore runs in this order:

1. If MMKV has no `installed` key, this is the first launch of an install. A
   reinstalled iPhone keeps the previous install's Keychain items, so the
   restore adds any token it finds to `pending_revoke`, clears
   `refresh_token`, then writes `installed`. These steps are local. When the
   token cannot join the list, it is still cleared and its revoke posts
   directly.
2. `retryPendingRevoke()` starts posting each token in `pending_revoke`. The
   restore does not wait for it: each revoke can take the client's 30-second
   timeout, and the list keeps each token until its revoke settles.
3. `ensureSession()` posts the stored token to `/auth/refresh`. A verdict (the
   API refuses the token, or no token exists) signs the store out. Any other
   failure leaves the token for the next foreground.

`installForegroundRefresh()` repeats step 3 each time the app returns from the
background, after the launch restore settles. It also clears the
passkey-setup flag, so a person who added a passkey on the website is let
through, and the next refused request sets the flag again.

Sign-out runs on the device first: it marks a session change, the token joins
`pending_revoke`, leaves `refresh_token`, the query cache, the auth store and
the passkey-setup flag clear, the app goes to `/login`, and only then does the
API hear of it. A request that never answers cannot leave the person signed
in. A forced sign-out (`signOut` in `client.ts`, after a 401 that is not an
expiry) clears the same state.

App links: the Android intent filter claims only `/auth/link` and `/tenants/`,
the paths with a screen. Each later plan adds its paths with its screens. iOS claims the
paths in react's apple-app-site-association file. The passkey screen opens the
website through `expo-web-browser`, since `Linking.openURL` would hand a
verified app link back to the app.

The body transport sends `refreshToken` in the body of these routes:
`/auth/logout`, `/auth/sessions/revoke-others`, `/auth/link/verify`,
`/auth/passkeys/sign-in/verify`, `/invitations/confirm`,
`/auth/step-up/link/verify` and `/auth/passkeys/step-up/verify`. It keeps the
token from the answers of `/auth/link/verify`, `/auth/passkeys/sign-in/verify`
and `/invitations/confirm`. `/auth/refresh` is in neither list: the shared
refresh core posts the token itself and keeps the rotated one.

## Workspaces and the shell

### The route tree

```
src/app/
  _layout.tsx                  query client, update gate, maintenance gate, top banners, stack, toaster
  login.tsx                    sign-in; reads redirect and notice
  forgot-password.tsx          retired password paths (also register, reset-password, verify-email):
                               redirect to /login?notice=sign-in-link
  auth/link.tsx                the mailed link's landing
  passkey-required.tsx         the blocking screen for an account that must add a passkey
  +native-intent.tsx, +not-found.tsx
  (app)/                       the session guard
    _layout.tsx                restore, sign-in redirect, passkey redirect
    welcome.tsx                create a first workspace
    (tabs)/
      _layout.tsx              four tabs, no navigator header
      index.tsx                Home
      workspace.tsx            the current workspace's overview, in place
      notifications.tsx        placeholder
      settings.tsx             placeholder groups and Sign out
    tenants/
      index.tsx                all workspaces, and Create
      [slug]/index.tsx         one workspace's overview
```

### The modules

- **The query managers.** `src/lib/query-managers.ts` ties TanStack Query's
  focus to `AppState` and its online state to NetInfo. `src/hooks/use-is-online.ts`
  reads the online state for the offline banner.
- **Maintenance.** `src/http/maintenance.ts` holds the response interceptor
  (installed on `apiClient` in `src/http/client.ts`), the recovery after
  `full`, and `useMaintenanceMode`. `src/components/shared/` draws the
  maintenance screen, the offline banner, the read-only banner and
  `TopBanners`, which holds both banners under one top inset.
- **The update screen.** `src/lib/minimum-version.ts` parses
  `minimumAppVersion` from the client settings, compares versions and builds
  the store link. `src/components/shared/update-screen.tsx` draws the screen.
- **The blocking order.** `src/app/_layout.tsx` nests `UpdateGate`, then
  `MaintenanceGate`, then the stack. The update screen covers the maintenance
  screen, which covers the app. The toaster sits inside the maintenance gate,
  so both overlays cover it.
- **Redirects.** `src/lib/safe-path.ts` holds `safePath`, which checks a
  redirect, and `landingFor`, which picks where a sign-in lands: `/welcome` for
  a new account, a safe redirect, `/welcome` for an account with no workspace,
  else Home.
- **The current workspace.** `src/states/current-tenant.store.ts` remembers a
  person's last workspace in MMKV, and `src/hooks/use-current-tenant.ts`
  resolves it against the list of workspaces the API returns.
- **The workspace screens.** `src/components/workspaces/` holds the switcher
  (`workspace-switcher.tsx`), the gate for loading, missing and suspended
  states (`workspace-gate.tsx`), the overview shared by the Workspace tab and
  `/tenants/[slug]` (`workspace-overview.tsx`), Getting started, the trial
  explainer (`trial-explainer.ts`) and the create form.
- **The frame.** `Screen` draws the one header-role title and owns the top
  safe-area inset, unless a navigator header or a top banner takes it
  (`useTopBanner`).

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
  and the session restore has settled, or after 2 seconds
  (`SPLASH_FALLBACK_MS`), whichever comes first. The scheme
  reaches NativeWind through a native appearance event after `set` returns, so
  hiding right after `set` could show one light frame. NativeWind drops that
  event while the app is not active, so the 2-second bound stops a lost event
  from holding the splash screen until a force-quit. The same bound covers a
  restore that waits on a slow network. The cost is one possible light frame on
  a slow device that takes longer than 2 seconds. A restore still pending then
  leaves the `(app)` layout rendering nothing until it settles.
  `tests/unit/app/root-layout.test.tsx` covers both paths with fake timers. No
  device has run it.

## The shared core

react-boilerplate is the source. `shared-core.json` is the manifest, and
react's [Shared core](https://github.com/mahaverick/react-boilerplate/blob/main/ARCHITECTURE.md#shared-core)
section holds the table of rows. Expo holds 75 `files` rows and 31 `tests`
rows, and the manifest itself is a 107th file. Each is react's, byte for byte,
and `pnpm sync:check` compares all 107 with a react checkout.

Expo's answers to what the shared files assume are in
[CLAUDE.md](CLAUDE.md#the-shared-core): the TypeScript libs, the polyfills,
`assignLocation`, knip's entries, the Jest timer setup.

## Tests

- `tests/unit/` holds the shared tests, which run unchanged through the runner
  port, and expo's own: the entry order, the polyfills, the ports, the theme,
  the root layout, the session modules, the query managers, the maintenance
  and update behaviour, `safePath`, the current-workspace store and hook, the
  screens, the UI kit, the accessibility harness (`tests/unit/a11y/`), the app
  config and backup plugin, the STYLESEED table, the contrast of the tokens,
  the lint design lock and the sync check.
- `tests/setup.ts` unrefs TanStack Query's timers so a shared test needs no
  teardown.
- `jest.config.ts` maps `@/` to `src/`, `@/tests/` to `tests/`, and `.css`
  files to an empty module.

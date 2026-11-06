# CLAUDE.md

Rules and gotchas for anyone, human or agent, changing code in this
repository. Each decision here looks wrong until you know its reason, so
changing one is a deliberate act, not a tidy-up.

- How the app fits together: [ARCHITECTURE.md](ARCHITECTURE.md).
- What it defends against: [SECURITY.md](SECURITY.md).
- How to run and test it: [README.md](README.md).
- The design tokens: [STYLESEED.md](STYLESEED.md).

## The shared core

react-boilerplate is the source of the shared core. `shared-core.json` lists
each shared path and the apps that hold it, and react's
[ARCHITECTURE.md](https://github.com/mahaverick/react-boilerplate/blob/main/ARCHITECTURE.md#shared-core)
holds the table of rows, the ports and the rules. This repository's own port
table is in [ARCHITECTURE.md](ARCHITECTURE.md#the-ports).

- **Change a shared path in react first**, then copy it here byte for byte.
  Say in the pull request (PR) description what happened in each app the row
  names ("ported in apex#N", or "not applicable because ...").
- **Never edit a file that `shared-core.json` gives `expo`.** `pnpm sync:check`
  compares each one with react and fails the gate on any difference. The
  manifest is one of them: `sync:check` compares `shared-core.json` itself
  too, because the lint and knip exemptions read expo's copy.
- **The purity rules bind expo rows.** A row uses no browser global or banned
  package and imports only shared files and ports. `scripts/check-shared.mjs`,
  react's copy, enforces them.
- **A new shared file, a new port or a new export is an edit to react's
  manifest**, then a copy here, then a row in the port table in
  [ARCHITECTURE.md](ARCHITECTURE.md#the-ports).
- **Expo answers a need on its own side.** When a shared file needs something
  expo lacks, expo adds a port, a polyfill or a Jest setup file. It never
  patches the shared file.

Each place a shared file needed something from expo is answered on expo's
side:

- **TypeScript has no DOM lib.** `tsconfig.json` sets `lib: ["ESNext"]` over
  Expo's `["DOM", "ESNext"]`. React Native's own globals declare `Blob` and
  `URL`. `crypto` type-checks through `@types/node`, which the tests need, so
  `tsc` does not prove Hermes has it: `src/polyfills.ts` installs it.
- **`src/polyfills.ts` loads first.** `index.ts`, the package entry, imports it
  before `expo-router/entry`. It loads random values, then `URL`, then the
  `Intl` polyfills in formatjs's dependency order: `getCanonicalLocales`,
  `Locale`, `PluralRules` (with `en` data), then `RelativeTimeFormat` (with
  `en` data), which calls the first and third. Each loads only where its
  `should-polyfill` check says the engine lacks it. The formatjs paths end in
  `.js`, the only subpaths their `exports` maps list. `vite.config.ts` allows
  `require()` in that one file. `tests/unit/polyfills.test.ts` holds the order.
- **`assignLocation` takes a path or a URL**, as react's contract says. A path
  such as `/login`, the default the shared `useLogout` passes, goes through
  `router.replace`; `Linking.openURL` rejects a path with no scheme. An
  absolute URL goes through `openURL`, and a refusal is caught. The path is
  cast to `Href`: typed routes list only this app's screens, and the port
  takes any app path that shared code passes.
- **`apiClient` keeps the bearer token on the API.** The shared token
  interceptor sets `Authorization` on every request. `src/http/client.ts`
  registers a guard before the shared interceptors, and axios runs request
  interceptors in reverse order of registration, so the guard runs last and
  removes `Authorization` from any request that `isApiRequest` rejects.
- **knip reads the manifest.** `knip.ts` enters every expo row, and the runner
  port, whose names are the manifest's `testPorts` row. A shared file or export
  this app does not reach yet is react's code, not dead code here.
- **`src/components/ui/` is the runner port's second root.**
  `copy-style.test.ts` scans it, and the scan fails on a missing directory.
- **`tests/setup.ts` unrefs TanStack Query's timers.** A shared test that
  leaves a `QueryClient` behind keeps its 5-minute garbage-collection timer,
  which held a Jest worker open after the run. `timeoutManager` gets a
  provider whose timers are unref'd, so no shared test needs a teardown.
- **Formatting rewrites no shared row.** `vp check` passes over them as copied,
  so they are not excluded from `vp fmt`. The pre-commit hook formats and fixes
  staged files, so after each copy commit, `cmp` every row against
  `git show HEAD:<path>`.

## The gate

`pnpm gate` runs every step in order and stops at the first failure.
`pnpm push` runs it, then `git push --no-verify`, so the gate runs before the
SSH connection opens.

1. `pnpm check`: `pnpm typegen`, then `vp check` (Oxfmt, then Oxlint with
   type-aware rules), then `eslint . --max-warnings 0` for the rules Oxlint
   lacks.
2. `pnpm typecheck`: `pnpm typegen`, then `tsc --noEmit`.
3. `pnpm lint:docs`: history phrasing and broken links in markdown and in the
   `#` comments of config and shell files.
4. `pnpm sync:check`: `shared-core.json` and every expo row in it are
   react's copies. With no react checkout it warns and passes; under `CI=true`
   it fails. Point it at react with `REACT_BOILERPLATE_DIR=<path>`.
5. `pnpm knip`: unused files, exports, types and dependencies.
6. `pnpm expo:doctor`: `expo-doctor`'s 20 checks, among them the SDK's pinned
   versions.
7. `pnpm test:coverage`: Jest with the coverage thresholds. `pnpm test` runs
   the same tests with no thresholds.
8. `pnpm export`: a Hermes bundle for iOS and one for Android.

`pnpm typegen` runs `expo customize tsconfig.json`, which writes the typed
routes (`.expo/types/router.d.ts` and `expo-env.d.ts`) without starting Metro,
and fails if `router.d.ts` is missing. Both type-aware steps need it. Without
the file, `Href` is `string`: `tsc` misses route mistakes, and Oxlint reports
the `Href` casts as unnecessary. A fresh clone or CI has no `.expo/`, so
`check` and `typecheck` each run it first.

**Jest runs the tests, not `vp test`.** `vp test` is Vitest. `react-native`
ships Flow-typed source and needs mocks for its native modules, and `jest-expo`
provides both and is the runner Expo documents. React and apex run the shared
tests under Vitest; expo runs the same files under Jest through the runner
port, `tests/support/runner.ts`.

**What CI runs** (`.github/workflows/ci.yml`):

- `lint`: `pnpm check`, `pnpm lint:docs`, `pnpm knip`, `pnpm typecheck`,
  `pnpm expo:doctor`, `pnpm export` and `pnpm audit --prod --audit-level
  moderate`.
- `sync`, on pull requests only: `pnpm sync:check` and the STYLESEED test
  against react's `main`.
- Four `unit` jobs, each one shard of `pnpm test:coverage`, then `test`, which
  merges the shards' coverage and enforces the thresholds. The thresholds
  appear in `jest.config.ts` and in `ci.yml`; change both together.

## Git hooks

- **The hooks live in `.vite-hooks/` and stay committed.** `prepare` generates
  only the `_/` dispatcher.
- **`pre-commit` is fast on purpose.** It checks the lockfile, then runs
  `vp staged`. The full sweep is `pnpm gate`.
- **Hooks call `pnpm exec`, never `npx`.** `npx` can download a version other
  than the one this repository tested against.
- **Commits are GPG-signed.** Never bypass signing.

## Toolchain

Each tool below was checked on 6 November 2026 against Expo SDK 58
(`expo` 58.0.23, React Native 0.88.1), pnpm 12.16.1 and Node 26.13.0.

- **`vp check` runs as the siblings run it.** `pnpm check` is `vp check`
  (Oxfmt, then Oxlint with type-aware rules), then `eslint . --max-warnings 0`.
  `vp check` formats and lints only and never starts a test runner. It
  formats and lints the Jest tests under `tests/` too, and passes. The
  fallback, the `oxlint` and `oxfmt` command-line tools at vite-plus 1.3.0's
  versions (Oxlint 1.88.0, Oxfmt 0.73.0), is not needed.
- **Metro bundles from pnpm's isolated `node_modules`.** `pnpm export` writes
  a Hermes bundle for iOS and one for Android with no `.npmrc`. The fallback,
  `node-linker=hoisted`, is not needed, so the repo has no `.npmrc`.
- **Git hooks come from `.vite-hooks/` through `vp config --hooks`**, which
  `pnpm install` runs as `prepare`. It sets `core.hooksPath` to
  `.vite-hooks/_` in the repo's shared `.git/config`. The path is relative, so
  each worktree runs the hooks in its own checkout. `pre-commit` checks the
  lockfile, then runs `vp staged` (`staged` in `vite.config.ts`). The
  fallback, the same script run from `check`, is not needed.
- **TypeScript is `~6.0.3`, react's pin.** `npx expo install --check` accepts
  it for SDK 58.
- **`eslint.config.js`, `babel.config.js` and `metro.config.js` are
  CommonJS.** Metro loads the last two with `require()`. `package.json` sets no
  `type`, and Node warns on every ESLint run when a typeless `.js` file holds
  `import` syntax.
- **`eslint-plugin-react-native` 5.0.0 runs through `@eslint/compat`.** The
  plugin peers ESLint 9 at most and calls `context.getSourceCode()`, which
  ESLint 10 removed. `fixupPluginRules` restores it. `pnpm-workspace.yaml`
  allows ESLint 10 as its peer.
- **The expo-only lint rules skip the shared core.** `no-console` and the
  `react-native/*` rules cover `src/`, except the paths that `shared-core.json`
  gives `expo`. Those files are react's copies and are never edited here.
  Production bundles drop every `console` call
  (`babel-plugin-transform-remove-console` in `babel.config.js`).
- **`pnpm knip` runs knip's own binary; `package.json` has no `knip`
  script.** `expo-doctor` fails a script whose name matches a binary in
  `node_modules/.bin`, and it has no setting to skip that check.
- **`scripts/lint-docs.mjs` is react's file, byte for byte.** It checks every
  tracked or untracked file that git does not ignore. Plans under
  `docs/superpowers/plans/` are git-ignored, because their step names read as
  history phrasing; specs are tracked. `CHANGELOG.md` exists because the
  script's header cites it, and release-please fills it.
- **Jest runs through `jest-expo` 58.0.14, Jest 30.** `jest.config.ts` loads
  through Node 26's own type stripping, with no `ts-node`. It sets
  `EXPO_PUBLIC_API_URL` before any worker starts, so the value babel inlines
  and the one read at run time agree. Thresholds hold only under
  `--coverage`, so the gate runs `pnpm test:coverage`.
- **`pnpm-workspace.yaml` denies `@parcel/watcher` its build script.**
  jest-expo pulls it in, and it ships prebuilt binaries for every platform
  here.
- **`reactCompiler: true` in `app.config.ts` is intended.** It comes from the
  Expo template, and react, the source of the shared core, compiles with the
  React Compiler too (`react/rules-of-hooks` is an error for `src/` and
  `tests/` in Oxlint). `pnpm export` bundles both platforms with it on, and no
  gate step found a reason to turn it off. It has not run on a device yet; the
  README checklist covers that.

## Versions

- **TypeScript is `~6.0.3`, react's pin.** `tsc` 6 and typescript-eslint's
  parser peer `typescript <6.1.0`, and `renovate.json` holds the range. Expo's
  own check (`npx expo install --check`) accepts it for SDK 58.
- **Expo SDK, `react-native` and their companions move together**, with
  `npx expo install --fix`, never one at a time. `pnpm expo:doctor` fails a
  version that SDK 58 does not list.
- **The pnpm version lives only in `packageManager`**, and the lockfile records
  it. Change both in one commit.
- **Renovate holds every Node pin below 27** (`.node-version`, CI). A Node
  major also moves `engines.node` and `devEngines.runtime` by hand.

## Theme and splash screen

- **Colours are react's STYLESEED tokens**, converted to sRGB hex in
  `tailwind.config.ts`. [STYLESEED.md](STYLESEED.md) holds the table and how
  to regenerate it.
- **Opacity modifiers do not work.** Each colour is `var(--token)`, so
  `bg-primary/50` generates no class. `transparent` and `current` are not in the
  palette either, because the config replaces Tailwind's palette. Use a token
  as is, or add a token in react first.
- **Lint bans palette classes, arbitrary-value colours and colour literals**
  in the files expo owns under `src/` (`tests/unit/lint/design-lock.test.ts`).
- **The splash screen hides once.** `src/app/_layout.tsx` hides it when
  NativeWind reports the stored scheme and the session restore has settled,
  or after 2 seconds (`SPLASH_FALLBACK_MS`), whichever comes first.
  NativeWind drops the native appearance event while the app is not active,
  so without the bound a lost event would hold the splash screen until a
  force-quit. The cost: on a slow device, the fallback can show one light
  frame before a stored dark theme paints. That is the chosen trade against
  hanging on the splash screen.
- **No device has run the splash or the theme.** The tests model NativeWind's
  event.

## Sessions

The session code is expo's own. Each rule below looks like a tidy-up
candidate, and each has a reason. The files are listed in
[ARCHITECTURE.md](ARCHITECTURE.md#sessions).

- **The shared `useLogout` is not used.** It posts `/auth/logout` first and
  sends no token, so a request that never answers leaves the person signed in,
  and the API never learns which session ended. `src/hooks/use-sign-out.ts`
  signs the device out first, then revokes.
- **The body-token lists are exact, and `/auth/refresh` is in neither.**
  `INJECT` in `src/http/body-token.ts` names the routes whose POST body gets
  the stored token, and `CAPTURE` names the routes whose answer holds a new
  one. The shared refresh core posts the token to `/auth/refresh` and keeps the
  rotated one itself. Listing the route would send the token twice, and keep
  it twice.
- **`_bodyToken` marks a request the interceptor filled in.** Axios
  serializes a body to a string before it sends, and a replay after a refresh
  carries that string. The flag lets the interceptor parse the body and read
  the store again, because the refresh has rotated the token and the old one
  would end the session.
- **A read deletes a stored value only when it fails to decrypt.**
  expo-secure-store's Android `DecryptException` arrives as `ERR_DECRYPT`.
  Any other read failure, such as a locked Keychain (`ERR_KEY_CHAIN`),
  rejects with a plain `Error`, which is no verdict, so the shared core keeps
  the session. The pending list never deletes on a read; a value that fails to
  decrypt reads as empty, and the next save replaces it.
- **A refresh in flight keeps nothing after a session change.** Sign-out,
  the sign-in capture and the forced sign-out call `markSessionChange()`.
  `src/http/session.ts` hands the shared core a store that refuses the write,
  and undoes the core's sign-in, when a change came after the refresh read
  the token. The refusal is a plain `Error`, so the core neither signs out
  nor clears the store.
- **The restore never waits for a revoke.** The reinstall check's steps are
  local: the old token joins `pending_revoke`, `refresh_token` is cleared,
  and the marker is written, all before the refresh. `retryPendingRevoke()`
  runs without being awaited, because each revoke can take the client's
  30-second timeout. The `(app)` guard shows "Signing you in" meanwhile.
- **The passkey-setup flag lives only as long as its session.** Every
  sign-out, forced or not, every sign-in capture and every return to the
  foreground clears it. The forced sign-outs also empty the query cache,
  which is why `src/lib/query-client.ts` holds the one client at module
  scope.
- **A failed request's error keeps no refresh token.** The body-token error
  handler removes `refreshToken` from `error.config.data`, which holds the
  serialized body.
- **`pending_revoke` is a list capped at 5.** A single slot would drop an
  earlier token that the API has not revoked when a second sign-out happens
  offline. A sixth token drops the oldest.
- **A token-store write that fails 3 times is a verdict.** After a refresh, the
  throw is `NoRefreshTokenError`, and the shared core signs out. The
  alternative is a session that dies 10 seconds later. After a sign-in, the
  sign-in fails and the new token is revoked.
- **The Android intent filter claims only the paths with a screen.** Those are
  `/auth/link` and `/tenants/` (`ANDROID_APP_LINK_PATH_PREFIXES` in
  `app.config.ts`), the second for a workspace's overview. A verified link to
  a path with no screen loops back into the app and lands on Page not found.
  Each later plan adds its paths with its screens. iOS's paths come from
  react's apple-app-site-association file (`docker/15-app-links.sh`), which
  this app does not control.
- **"Open the website" uses `expo-web-browser`, not `Linking.openURL`.** The
  system's link handler hands a verified app link back to the app.
- **`+native-intent.tsx` strips the query and fragment from every non-https
  link.** Any app can claim a custom scheme and read its query, and a token
  travels in the query. A token path under the scheme becomes `/`. An https
  link passes through, since the operating system verifies it.
- **Touch targets are `TOUCH_TARGET` (`min-h-12`, 48 points) on both
  platforms.** Apple asks for 44 and Android for 48, so one value serves both.
  A control that sets its own height loses the guarantee.
- **`Screen` always scrolls.** At 200% font size a fixed layout pushes a
  control off the screen, and `keyboardShouldPersistTaps` keeps taps working
  while the keyboard is up.
- **A nested worktree needs the main checkout's `node_modules` installed.**
  knip's config loader walks up to the parent `tsconfig.json`, which resolves
  its `extends` from the parent's `node_modules`. Without them knip fails to
  load the config.

## Workspaces and the API

The rules below cover the screens and the API behaviour that plan 3c1 added.
The files are listed in [ARCHITECTURE.md](ARCHITECTURE.md#workspaces-and-the-shell).

- **TanStack Query learns focus and connectivity from the device.**
  `installQueryManagers()` in `src/lib/query-managers.ts` ties
  `focusManager` to `AppState` and `onlineManager` to NetInfo. Without it,
  React Native never reports focus, so queries never refetch when the app
  returns, and a query keeps retrying offline. An unknown NetInfo state
  counts as online, so a slow first report does not pause every query.
- **One interceptor reads maintenance from every API answer.**
  `installMaintenanceInterceptor` in `src/http/maintenance.ts` reads the
  `Maintenance-Mode` header on successes and failures and the body of a 503,
  and it never changes the outcome. A 503 body names the mode even when no
  header does. When `full` ends, `recoverFromMaintenance()` checks
  the session with `ensureSession` and then refetches every query.
- **`minimumAppVersion` is parsed in expo, from the shared query's data.**
  The shared `ClientSettings` type and its guard do not list the field, but
  the body carries it. `src/lib/minimum-version.ts` reads it with Zod, and
  editing the shared file is not allowed. `useUpdateRequired` overrides the
  query's 1-hour `staleTime` with 5 minutes and refetches every 5 minutes
  (`refetchInterval`) while the app is in the foreground. That matches the
  server's `max-age=300`, so a raised minimum reaches a running app within 5
  minutes.
  A missing or unreadable version never blocks the app.
- **The blocking screens stack in a fixed order.** The update screen covers
  the maintenance screen, and the maintenance screen covers the app
  (`UpdateGate`, then `MaintenanceGate`, in `src/app/_layout.tsx`). The
  passkey screen is a route that the `(app)` guard redirects to, so both
  overlays cover it too. All three register a `BackHandler` that
  returns `true`, which stops Android's back button. Only the passkey route
  sets `gestureEnabled: false`, because the update and maintenance screens are
  overlays, not stack screens.
  In `full` the `(app)` guard and the sign-in screens redirect nowhere, so a
  person keeps their place until the mode ends. The toaster renders under
  the overlays, so a toast never shows over a blocking screen.
- **`safePath` is expo's own check** (`src/lib/safe-path.ts`). React's
  `safe-redirect.ts` and `landing.ts` read `window.location`, and neither is
  an expo row. A redirect arrives from a link or a route parameter, so an
  unchecked one is an open redirect. The rules are react's: at most 2048
  characters, one leading `/`, no backslash, control character or `//`, and no
  token page (`TOKEN_PATHS`), checked after decoding and folding case.
  `safePath` returns the path the URL parser resolved, because the check ran
  on that string and the app must navigate to what it checked.
  The `(app)` guard drops dynamic path segments and `token` from the
  `redirect` it builds.
- **The remembered workspace lives in MMKV under `last-tenant:{userId}`.**
  `src/states/current-tenant.store.ts` keys it by person, so a second person on
  the device never reads the first one's choice. Sign-out leaves the key, and
  the same person returns to their workspace. Only an eligible workspace is
  remembered: never the platform workspace, never a suspended one.
  `useCurrentTenant` falls back to the first eligible workspace.
- **Screens that route to a workspace pass the route's web address as
  `requested`.** The store is only the fallback.
- **One component draws a workspace's overview, in two places.**
  `WorkspaceOverview` serves the Workspace tab, in place, and the
  `/tenants/[slug]` route, for deep links and the list. The tab never
  navigates out: leaving `(tabs)` drops the tab bar and leaves Back with
  nowhere sensible to go. Choosing a workspace in the tab's switcher
  remembers it, and the tab re-renders. The route remembers its slug, so
  returning to the tab shows it.
- **Tabs have no navigator header; the stack screens above them show an
  empty-titled header with Back.** A navigator title plus `Screen`'s title
  gives two header-role elements, which the accessibility harness rejects, so
  `Screen` draws the one title everywhere. Welcome, `/tenants` and
  `/tenants/{slug}` need Back to reach the tabs, so their header has an empty
  title and the back arrow alone (`headerBackButtonDisplayMode: 'minimal'`),
  which keeps the group name `(tabs)` off the iOS back label. They pass
  `topInset={false}`, since the header takes the inset. The switcher is the
  top row of the Workspace screens, not a header control.
- **The `(app)` stack is anchored on `(tabs)`.** `unstable_settings` sets
  `anchor: '(tabs)'` (SDK 58's name for `initialRouteName`, which it
  deprecates). Without it a cold deep link, or a replace into the group, leaves
  the route alone in the stack, with no tab bar and no way back. A replace from
  outside the group, such as the link screen's landing, passes
  `{ withAnchor: true }`, because the anchor applies on a replace only then.
  Welcome leaves with `router.dismissTo`, since a replace to a tab stacks a
  second `(tabs)`, and the Workspace tab pushes `/welcome`, since a replace
  from a tab removes `(tabs)`.
- **A new workspace opens on the Workspace tab.** Welcome remembers the new
  workspace's web address, then dismisses to `/workspace`. Landing on
  `/tenants/{slug}` would leave the person outside the tabs.
- **A sign-out of the person's own carries no `redirect`.** `useSignOut` sets
  the mark in `src/states/own-sign-out.store.ts` before the auth store signs
  out, and the `(app)` guard then sends the person to plain `/login`. The guard
  can redirect before `useSignOut` navigates, and the next person on the
  device would land on the previous person's path. `/login` clears the mark
  once it shows, the link screen clears it when a sign-in starts, and the
  guard clears it once a session is signed in. An
  expired session never sets it, so its redirect survives.
- **Toasts sit above the tab bar.** The toaster renders at the root, so it
  would cover the tab bar, and error toasts stay until dismissed. Each tab
  screen publishes `useBottomTabBarHeight()` while focused
  (`TabBarHeight`, the tabs layout's `screenLayout`), and the toaster adds it
  to its bottom offset. The height clears when no tab screen is focused.
- **Mutations never pause offline; queries do.** The query client sets
  `mutations: { networkMode: 'always' }`, and the link screen's workspace read
  passes `networkMode: 'always'`. A paused mutation hangs on a spinner and can
  fire later from another screen, and the forms' inline errors are the
  designed offline answer for a write. The cost: an offline write fails at
  once instead of waiting.
- **The blocking overlays take the top inset themselves.** The update and
  maintenance screens cover the top banners, so they pass `coversBanners` to
  `Screen`. Without it the banner-skip rule leaves the overlay's title under
  the status bar.
- **Welcome shows the load error when its first list read fails.** It never
  shows the form on a failed read: an invited account whose read failed would
  create a duplicate workspace. The cost is one more Try again for a person
  with no workspaces.
- **Home, Welcome and `landingFor` count only eligible workspaces**
  (`isEligibleTenant`: never the platform workspace, never a suspended one).
  An account whose workspaces are all suspended would otherwise land Home,
  see no empty state, and have no way to create one. The Workspace tab goes
  to `/welcome` only while a person is signed in, so a forced sign-out under
  maintenance `full` never navigates.
- **Deeper `/tenants/{slug}/…` paths redirect to the overview.**
  `src/app/(app)/tenants/[slug]/[...rest].tsx` exists because the Android
  intent filter claims the whole `/tenants/` prefix, and a link to a screen
  this version lacks would otherwise land on Page not found.
- **The top safe-area inset has one owner.** `Screen` pads it, unless a
  navigator header takes it (`topInset={false}`) or a top banner does
  (`useTopBanner()`); an overlay over the banners takes it whatever they show
  (`coversBanners`). A tab bar takes the bottom inset, so tab screens pass
  `bottomInset={false}`. `TopBanners` holds the offline and read-only banners
  in one container so two banners pad the inset once.
- **Confirmations use `Alert`**, the platform dialog, with a Cancel button and
  a destructive confirm. No custom dialog component exists. Non-blocking
  results use `@/lib/toast`; an error that blocks a form renders inline.
- **The trial explainer records "seen" when it shows.**
  `trial-explainer:{userId}:{tenantId}` in MMKV holds `1` once the alert
  has been raised. It waits while the update or maintenance screen covers the
  app, so a person does not lose it to an overlay. It reads the record
  during render, and the effect checks the record again before it shows.
- **The store link comes from two build-time values.** `IOS_APP_STORE_ID`
  (digits only) gives `itms-apps://apps.apple.com/app/id{id}`, and Android uses
  `market://details?id={package}`. With no iOS ID the iOS update screen has no
  button. A value that is not all digits fails the build.
- **Retired password paths redirect with a notice.** `/forgot-password`,
  `/register`, `/reset-password` and `/verify-email` go to
  `/login?notice=sign-in-link` and keep no other query, so nothing a retired
  link carried reaches the next screen.

## Copy

- **Customers read "workspace", never "tenant", and "web address", never
  "slug".** Routes, identifiers, API fields and query keys keep "tenant"; only
  rendered text changes.
- **`tests/unit/copy-style.test.ts` checks the copy.** It is react's file. It
  scans `src/` and `src/components/ui/` (`copyStyleRoots` in the runner port)
  and fails on a banned phrase or a sentence over 30 words.

## Conventions the linter enforces

- **kebab-case** file and folder names under `src/`, with the routes under
  `src/app/` following Expo Router's file names.
- **Suffixed files live in their directory:** `*.store.ts` in `src/states/`,
  `*.queries.ts` in `src/queries/`, `*.schemas.ts` in `src/schemas/`,
  `*.types.ts` in `src/types/`.
- **No test file lives under `src/`.** Unit suites go in `tests/unit/`,
  mirroring their subject's path. Tests are `.test.ts(x)`.
- **Comments.** Each comment is a JSDoc block, a directive or a single `//`
  line, and none narrates history. Every named function, interface, type
  alias and exported const carries a JSDoc description.
- **No `console` call in `src/`** outside the shared rows. Production bundles
  drop them anyway.
- **Documents follow the Amazon writing style** (`amazon-writing-style.md`):
  absolute dates, defined acronyms, numbers and sources instead of adjectives.

## Never install

`react-hook-form`, `@hookform/resolvers`, `next-themes`, `sonner`,
`@tanstack/zod-form-adapter`, `clsx`, `tailwind-merge`, any `@radix-ui/*`.
These are react's bans. The shared core is written against the replacements:

- TanStack Form with a Zod validator, which needs no adapter package;
- `theme.store` with NativeWind's `colorScheme`, in place of `next-themes`;
- `@/lib/toast`, a queue in a Zustand store, in place of `sonner`.

Class names join through `cn` in `src/lib/cn.ts`, written without `clsx` or
`tailwind-merge`. It keeps the truthy parts in order and does no conflict
merging: `cn('p-2', 'p-4')` is `'p-2 p-4'`, so a caller never passes two
classes for one property.

Do not add shadcn, Base UI or any other web-only UI package either. They
render DOM, and the app renders React Native views.

Adding a banned package gives the project two ways to do the same thing.

## Follow-ups

Each item is a change for react or for a later plan, with the reason it waits.

- **Coverage thresholds sit below react's.** React's are statements 88,
  branches 82, functions 86 and lines 89. The shared tests alone (31 manifest
  rows, 29 of them test files) cover statements 43.78%, branches 46.00%,
  functions 31.47% and lines 42.51% of `src/`, because they exercise only part
  of the 75 shared files. The full suite measures statements 73.49%, branches
  73.32%, functions 64.30% and lines 72.74% on 6 November 2026.
  `jest.config.ts` and `ci.yml` hold 73, 73, 63 and 72. React should mark more
  of its tests for expo; then expo raises each threshold toward react's.
- **One copy-style case is skipped by name.** `test` and `test:coverage` pass
  `--testNamePattern` with a negative lookahead that skips only "finds the copy
  it guards" in `tests/unit/copy-style.test.ts`. That case expects more than
  500 pieces of copy and the anchor "Check your inbox", which react's screens
  hold and expo's shared rows do not. Every other copy-style case runs. A
  react PR moves the 500 floor and the anchors into the runner port beside
  `copyStyleRoots`; once expo copies it, drop the pattern from both scripts.
- **React's dark `destructive-foreground` on `destructive` measures 2.53:1**,
  against WCAG's 4.5:1 floor. These are react's colours, so the fix belongs in
  react's `globals.css`. `tests/unit/contrast.test.ts` lists the pair as a
  known shortfall and fails once it clears 4.5:1; remove the entry then.
- **`scripts/sync-check.mjs` is apex's script with `APP` set to `expo`**, plus
  the comparison of `shared-core.json` itself. A react PR should make it one
  shared row, so the copies cannot drift.
- **Apex's `sync-check.mjs` never compares `shared-core.json`.** It loops over
  the manifest's rows, and the manifest is no row of itself. Apex adds the
  same comparison, or takes it from the shared row above.
- **The shared token interceptor should ask `ports.isApiRequest`.** It sets
  `Authorization` on every request through the client, so a request to
  another origin would carry the bearer token. Expo's guard in
  `src/http/client.ts` removes it. A react PR guards the interceptor in
  `src/http/interceptors.ts`; once expo copies it, remove the guard.
- **Passkeys wait for a device.** The library spike needs a dev client on a
  device, and the machine that wrote plan 3b has no simulator or emulator
  (checked 6 November 2026). The webauthn port stays a stub. The plan that
  writes account security runs the spike.
- **Step-up and `/auth/confirm` wait for the first step-up write.** Nothing in
  the app calls a route behind `requireRecentAuth`. The body-token interceptor
  already lists both step-up verify routes, so that plan does not touch it.
- **`minimumAppVersion` is untyped in the shared core.** React's
  `ClientSettings` and `isClientSettings` omit the field, so expo parses it
  itself. A react PR types it; once expo copies that, replace
  `src/lib/minimum-version.ts`'s schema with the shared type.
- **Notifications and Settings are placeholder tabs.** The Notifications tab
  says the feature is not in this version. The Settings tab lists its two
  groups as text and holds Sign out. Plans 3c4 and 3c2 fill them.
- **The onboarding steps that point at Settings or Members show no link.**
  Plans 3c2 and 3c3 add those screens and the links with them.
- **The iOS App Store ID is unset.** Plan 3e sets `IOS_APP_STORE_ID` for each
  build profile; until then the iOS update screen has no store button.
- **Every "Mark done" button has the same accessible label.** The web app
  reads "Mark done: {title}". `Button` takes no `accessibilityLabel` yet; add
  the prop, then label each button with its step.
- **Jest prints "A worker process has failed to exit gracefully."** It showed
  in plans 3b and 3c1 and on 6 November 2026. Run `pnpm test --detectOpenHandles`
  to find the handle; `tests/setup.ts` already unrefs TanStack Query's timers.
- **Two items from react PR #183 wait for the account-deletion plan.**
  `/delete-account` can create an account, and passkey-required mode blocks
  deletion. That plan owns the screen.
- **Plans are not tracked.** `docs/superpowers/plans/` is git-ignored, and the
  specs under `docs/superpowers/specs/` are tracked. A plan lives on the
  machine of whoever wrote it.
- **The Hermes polyfills, the splash screen, the React Compiler and the
  workspace screens are unchecked on a device.**
  [SECURITY.md](SECURITY.md#known-gaps) and the README checklist carry them.

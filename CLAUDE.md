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
  `/auth/link`, `/tenants/`, `/auth/confirm`, `/settings/account/security`,
  `/invitations/accept` and `/invitations/confirm`
  (`ANDROID_APP_LINK_PATH_PREFIXES` in `app.config.ts`):
  - `/auth/link`: the sign-in link;
  - `/tenants/`: a workspace's overview, Insights and Beta (the prefix);
  - `/auth/confirm`: the "Confirm it’s you" link;
  - `/settings/account/security`: the Security screen;
  - `/invitations/accept`: the invitation link in the invitation email;
  - `/invitations/confirm`: the confirmation link that `accept` mails to the
    invited address.

  A verified link to a path with no screen loops back into the app and lands
  on Page not found. `/settings/workspace/…` is not claimed, because react's
  apple-app-site-association file does not list it, and the same screens
  would then open from one platform's link and not the other's. Each later
  plan adds its paths with its screens. iOS's paths come from react's
  apple-app-site-association file (`docker/15-app-links.sh`), which this app
  does not control.

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
  a destructive confirm. The one custom dialog is the step-up dialog, a
  full-screen `Modal` (see "Account settings and step-up"). Non-blocking
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

## Account settings and step-up

The rules below cover the Settings tab, the account screens and the "Confirm
it’s you" flow. The files are listed in
[ARCHITECTURE.md](ARCHITECTURE.md#account-settings-and-step-up).

- **The Settings tab lists rows; the screens sit in the `(app)` stack.**
  Account holds Profile, Security, Notifications and Delete account
  (`ACCOUNT_SECTIONS` in `src/constants/settings.ts`), and each row opens
  `/settings/account/{name}` under the stack's empty-titled header with Back.
  The Workspace group lists General, Members, Activity and Plan
  (`WORKSPACE_SECTIONS`) for the current workspace, and says "Choose a
  workspace first." when the person has none. While the list loads it shows a
  spinner, and a failed read shows the load error with Try again. `/profile`
  and `/settings/account` redirect to Profile. Section headings inside a
  screen are plain text, not headings, because a screen has one header role
  and the accessibility harness rejects a second.
- **The step-up provider sits in the root layout, not in `(app)`.**
  `StepUpProvider` wraps the stack inside the update and maintenance gates.
  `/auth/confirm` is a root route, so a provider under `(app)` would unmount
  with the dialog it holds when the link opens. Inside the gates, a blocking
  screen still covers the dialog's owner.
- **The dialog hides while an overlay covers the app, and keeps its place.**
  A React Native `Modal` draws over everything, including the update and
  maintenance screens. The dialog sets `visible` to false while an update is
  required or maintenance is `full`, and it stays mounted, so the view, the
  resend wait and the baseline survive. It returns when the overlay ends.
- **Android back reaches the dialog through the `Modal`'s `onRequestClose`.**
  A `BackHandler` does not fire under a `Modal`. Back cancels from the start
  and the resume-failed views, as react's dialog dismisses. While the dialog
  waits on an emailed link or resumes, only Cancel leaves, so a stray press
  does not drop the action. The rule that blocking screens ignore back
  protects a wait in progress; on the start and resume-failed views nothing
  is in progress, and trapping the person there helps no one.
- **The dialog shows its own messages inline.** A toast draws under a native
  `Modal`, so the person would never see it. A failed link request or resend
  renders as an inline notice in the dialog.
- **The dialog listens for a confirmation on the start view too.** A person
  who cancels and retries can open the first email's live link while the new
  dialog is on its start view. A signal whose token is not newer returns the
  dialog to the view it came from.
- **A failed verify reaches the dialog, not the screen.** `/auth/confirm`
  opens beneath the `Modal`, so its failure states are out of sight. While a
  dialog is open, the screen sends its copy for a 400, a 401 or another
  failure through `broadcastStepUpLinkFailed` and goes back. The dialog shows
  it inline on its current view and keeps Resend. That channel is expo's own,
  beside `broadcastAuthMessage`, whose signature is react's port. Without a
  dialog the screen shows the failure itself.
- **A sign-out closes the dialog.** The provider sits in the root layout, so
  it stays mounted across a sign-out. It closes an open dialog when the auth
  store signs out, and every waiter rejects with its original refusal;
  otherwise the dialog would sit over the sign-in screen.
- **`run` retries once, and only for a refusal that held the current
  token.** `useStepUp().run(action)` runs the action. On `REAUTH_REQUIRED`
  sent with an older token than the store holds, another confirmation has
  landed, so it retries at once. Otherwise it opens the dialog, and after a
  confirmation retries once. A second refusal rejects and never reopens the
  dialog. Cancel rejects with the original refusal. Two refused actions share
  one dialog and one confirmation.
- **The confirmation signal is in-process.** The shared
  `useConfirmStepUpLink` calls `broadcastAuthMessage('step_up_confirmed')`.
  The session port emits it to `subscribeAuthMessage` handlers in this
  process, with no other tab to tell. `broadcastLogout` stays a no-op. The
  dialog never trusts the signal alone: it compares the `auth_time` of the
  stored token with the one it held when it opened, refreshes once with
  `ensureSession()` when that is not newer, and keeps waiting if the refreshed
  token is not newer either.
- **`/auth/confirm` works unseen beneath the dialog.** The `Modal` covers
  every route, so the link opens the screen under the dialog. The screen posts
  the token on mount, the dialog resumes and closes, and the screen then goes
  back (`router.replace('/')` when there is nowhere to go back to). The person
  sees "Confirmed. Continuing…" in the dialog, not the screen.
- **`/auth/confirm` awaits `refreshSettled()` before it posts.** Opening the
  emailed link brings the app to the foreground, which starts a refresh. If
  that refresh landed after the confirmation, it would overwrite the new token
  with one that has the old `auth_time`, and the retried action would be
  refused again. `refreshSettled()` resolves at once when no refresh is in
  flight and never rejects.
- **The link works only for the session that asked for it.** Signed out,
  `/auth/confirm` posts nothing and offers Sign in. A race can still cost one
  extra prompt: when a verify presents a refresh token that a concurrent
  refresh has rotated, express marks every refresh row of the session
  (`markSessionReauthenticated` in `src/services/session.service.ts`), so the
  next refresh carries the new `auth_time`, and the session is not revoked.
- **`useChangedFields` freezes its baseline on the first change, blur or
  submit.** Until then the baseline follows the stored profile and the form
  follows it too (`form.reset`), so a name changed elsewhere shows, and Save
  without editing says "Change a name before saving." After the freeze, a
  refetch cannot make an edit look unchanged or send a stale value. A save
  sends only the changed fields and rebases the baseline to what it stored.
- **Security lists devices from `GET /auth/sessions`.** React has no such
  list. A row shows the device name, "Web browser" for a web session or
  "Unknown device", tags the current one "This device", and shows "Last
  active" and "Signed in". "Sign out other devices" runs through step-up.
- **Profile and Notifications write on the screen that shows them.** Both
  read the cached query and write with a mutation. A failed write reports
  inline (Profile) or as a toast (Notifications, whose rows stay as they were).

## Workspace settings and invitations

The rules below cover the Settings tab's Workspace group, the invitation
screens, Insights and Beta. They are plan 3c3's. The files are listed in
[ARCHITECTURE.md](ARCHITECTURE.md#workspace-settings-and-invitations).

- **Staff with platform access see a read-only view, with no reason UI.** On a
  customer workspace, express asks staff for a recent sign-in and a typed
  `reason` (`requireRecentAuthAndReasonOnPlatformAccess`). React never sends
  one: it shows staff a read-only view and points them to the staff console.
  Expo does the same, so no write button shows for `access === 'platform'`.
  Building a reason prompt here would only add a second path to a decision that
  belongs to the staff console.
- **Every member write runs through `useStepUp().run`.** A role change, a
  removal, leaving, an invite, a resend and a revoke each go through it, and
  the button shows `STEP_UP_WAITING_LABEL` while `useStepUpWaiting()` is true.
  On the platform workspace, express asks for a recent sign-in on each of them
  except a revoke (`requireRecentAuthOnPlatformTenant`). Staff acting through
  platform access on a customer workspace must give a recent sign-in and a
  reason for each write except leaving
  (`requireRecentAuthAndReasonOnPlatformAccess`), revokes included; expo shows
  them no write control. A customer workspace asks its members for none. One
  path for every write means a write that can be refused gets the dialog,
  never a bare `REAUTH_REQUIRED`, and a write that cannot be refused costs
  nothing extra.
- **A refused invite shows inline in the invite form.** The invite form is a
  form, and an error that blocks a form renders inline. A refused step-up
  there is a form-level error, as in react. The Security screen keeps its
  toast, since it has no form.
- **The members and invitations rows share one `RowButton`.**
  `src/components/workspace-settings/row-button.tsx` is a compact outlined
  button that takes an `accessibilityLabel`. A list holds one button per row,
  so every label names its row ("Resend invitation to a@b.test"). The kit's
  `Button` has no such prop, and a copy of `RowButton` in a second file drifts.
- **The `ChoiceSheet` has no scrim.** The theme's colours are `var(--token)`
  strings, so Tailwind emits no class for `bg-foreground/40`, and the backdrop
  would draw transparent on a device anyway. The backdrop stays transparent and
  closes the sheet when pressed, and the sheet takes a whole-token edge
  (`border-t border-border`, `bg-card`). A dimming scrim needs a new react
  token. The `OPACITY_CLASS` rule in `eslint.config.js` fails an opacity
  modifier on a colour class (`bg-*/NN`, `text-*/NN`, `border-*/NN`) in
  expo's own files. It does not see an arbitrary modifier such as
  `bg-primary/[0.4]`.
- **Role pickers are a `ChoiceSheet`**, a React Native `Modal` list, because
  the kit has no select. A step-up dialog can try to open while the sheet is
  still closing; the README's device checklist covers that on iOS.
- **Lists page with "Load more", through `useListPages`.** The shared
  `listQueryOptions` serves one page per request, so `useListPages` makes
  each page its own query, keyed by its cursor, and joins the rows, each key
  once (`keyOf`). It never uses `useInfiniteQuery`, and phones have no table.
  A request that changes by value starts again at page 1. So does a page 1
  whose boundary row changes after page 2 was asked for, through a write's
  invalidation or a refocus. Express's cursors seek after page 1's last row
  (`list-page.utilities.ts`), so later pages fetched with the old cursors
  would drop or repeat rows once that row changes. The signal is the key of
  page 1's last row. While it holds, the pages stay, even when an optimistic
  edit, a refetch or a changed total replaces page 1's data object, because
  the cursors still seek after the same row. `dataUpdatedAt` is no signal: it
  moves on every refetch and is shared by two fetches in one millisecond. The
  cost: a list keeps a page whose rows shifted until the next fold, such as an
  insert or a removal on page 1 that leaves its last row in place. Load more is
  hidden while page 1 shows placeholder data, because the previous request's
  cursor does not belong to the new one. A failed later page keeps the loaded
  rows and offers Try again beside them.
- **Legacy workspace paths redirect to the new screens.**
  `/tenants/{slug}/settings`, `/members` and `/activity` go to General,
  Members and Activity under `/settings/workspace/{slug}/`, and
  `/settings/workspace/{slug}` goes to General. Each keeps the query except
  `token`, `slug` and `rest`, so a one-time token never travels on, and the
  route's own segments do not repeat as parameters.
- **A join lands on the Workspace tab.** `landJoined`
  (`src/lib/land-joined.ts`) serves both invitation screens, so the two
  landings cannot drift. It reads the workspace list once, remembers the joined
  workspace only when the list shows it as eligible (never the platform
  workspace, never a suspended one), invalidates the list, toasts, and calls
  `router.replace('/workspace', { withAnchor: true })` so the tabs stay
  beneath. A failed read remembers nothing, and the Workspace tab resolves the
  first eligible workspace. The join's answer names neither the platform flag
  nor the lifecycle state, so remembering from a fallback could keep a
  suspended workspace.
- **An invitation link is read once and spends nothing until the person
  chooses.** `/invitations/accept` and `/invitations/confirm` read `token`
  (and `email`) once, clear them from the route, and wait for the session
  restore. A token that is not 43 base64url characters is dead and never
  posted. Signed in as someone else, the screen asks first and posts nothing;
  Continue signs out, then posts. The preview runs once, so Continue does not
  re-run it after the sign-out clears the query cache.
- **`/settings/workspace/…` is not an app link.** React's
  apple-app-site-association file does not list it, so Android does not claim
  it either.
- **The platform-access banner shows on every workspace screen reached with
  platform access:** the overview, General, Members, Activity, Insights and
  Beta (its Page not found state too). React shows it "on every page of a
  tenant the viewer reached as platform staff", and staff would otherwise
  not know why the controls are missing. It renders nothing for a member.
- **Flags are read by scope, and a read in error returns the fallbacks.**
  `useFlagValues()` and `useVariant(key)` (`src/observability/flags/`) read the
  focused route's scope: a `slug` param reads `GET /tenants/:slug/flags`, any
  other route `GET /flags`. When the latest read is in error they return the
  fallbacks, not the last good values: a stale `true` keeps a Beta row on
  screen that answers 404. The workspace key sits under the workspace's detail
  key, so `dropTenantCache` removes it. `useFeaturePropertiesSync()` runs once
  in the `(app)` layout and registers `$feature/<key>`. An experiment's
  exposure posts to `<flags path>/exposures` once per scope, key and value per
  launch, whatever the analytics choice. A change of person clears the dedupe.
- **`example_cta_experiment` styles the Getting started step button:**
  `control` keeps the secondary button and `bold` takes the primary one. A
  press sends `feature_cta_clicked`.
- **Beta shows Page not found in place when the API answers 404.** The flag
  can close after the screen opened. The screen draws the not-found copy
  itself, not through a route change, and refetches the flags once so the
  overview drops its Beta row.
- **Insights shows a failed entitlements read as a `LoadError`**, never as the
  locked card. A locked state reads "Included in Paid." with no action,
  because the app never sells or steers to a purchase (spec section 6).
- **The members-limit note shows its counts only.** It has no Upgrade or
  Request action, for the same reason. Its words are in
  `src/copy/members-limit.ts`.

## Notifications, plan and deletion

The rules below cover the live notification stream, the Notifications tab, the
read-only Plan screen and account deletion. They are plan 3c4's. The files are
listed in [ARCHITECTURE.md](ARCHITECTURE.md#notifications-plan-and-deletion).

- **`expo/fetch` reads the stream; `react-native-sse` is not used.** The spec
  names the library and says to replace one that fails its check. Version 1.2.1
  (March 2024) fails on three counts. It gives no signal when the server ends
  the stream, which express does when the access token expires. It reconnects
  every 3 seconds on its own, because the server's `retry:` line overrides
  `pollingInterval: 0`, and sends the expired token. It exposes no response
  headers, so `Retry-After` is unreadable. `expo/fetch` streams
  `response.body`, exposes the status and headers, aborts through an
  `AbortController`, and ships in `expo`. `src/http/sse.ts` holds the parser
  and `openEventStream`; reconnecting is the caller's job.
- **One component owns the stream.** `NotificationStream` renders once, in the
  `(app)` layout beside the stack, after the redirects, so it never mounts
  signed out. Two mounts would open two streams. Screens only read the query
  cache that its frames invalidate.
- **The stream is open only in the foreground.** It opens while the app is
  `active`, a person is signed in, maintenance is not `full` and the passkey
  flag is down. `background` aborts it. `inactive` (the iOS app switcher, a
  system sheet) keeps the last answer, so a sheet does not close it. The token
  travels in the `Authorization` header, never the URL.
- **Express ends every stream at access-token expiry, so an end is not a
  failure.** An end, or a 401, waits up to 1 second of jitter
  (`reopenJitter` in `src/lib/stream-backoff.ts`), then refreshes the session
  with `ensureSession` and reopens with `Last-Event-ID`, so no missed
  notification is lost. A deploy ends every stream at once, and without the
  jitter every client would call `/auth/refresh` in the same moment. The wait
  runs through the stream's one timer, so background and sign-out clear it.
  Two quick ends in a row (under 1 second, with no frame) fall back to the
  backoff, so a server that ends streams at once cannot cause a tight loop.
  Each connect also refetches the notification list and every cached
  workspace's billing reads, because `entitlements_changed` frames carry no
  `id:` line and are never replayed.
- **A 429 `too_many_streams` stops the stream until the next foreground.** The
  spec says so. React retries it with backoff, but its message names
  browser tabs, so the app never shows it. Other refusals wait the backoff or
  `Retry-After`, whichever is longer, capped at 5 minutes, plus up to 20%
  jitter.
- **A 403 `PASSKEY_SETUP_REQUIRED` on the stream raises the passkey flag and
  stops.** The `(app)` guard then sends the person to `/passkey-required`.
- **Sign-out and a different person restart the stream.** The effect keys on
  the user id, so an in-place sign-in as another person drops the last event
  id, the backoff and the 429 stop. The new person never receives the old
  person's cursor.
- **Billing notifications show the app's text, never the server's.**
  `isNeutralKind` in `src/copy/notifications.ts` marks every type that starts
  with `billing_`, known or not, and `workspace_full`. For those the row's
  title is the type's label and its body is the app's line; a neutral kind
  with no line of its own reads "There’s an update about the plan for
  {workspace}. Open Plan for details." Express's bodies carry prices ("Your
  payment of ₹999 failed") and "upgrade from Billing", and the app sells
  nothing and shows no prices (spec section 6). A billing kind express adds
  later is neutral without a change here. Other kinds show the server's text.
  The owner chose this on 7 November 2026.
- **Labels come from `notificationTypeLabel`, never the shared humanizer
  alone.** The shared `humanizeNotificationType` labels
  `billing_upgrade_requested` "Upgrade request", and the app shows no upgrade
  wording. `notificationTypeLabel` gives "Plan request" for it and the shared
  label for every other type. The inbox row (its title, its kind line and its
  button labels) and the notification preferences screen (each row and its
  switch label) both call it, so the two screens agree.
- **The Plan screen reads the entitlements and the catalog's labels only.**
  `GET /tenants/:slug/entitlements` and the `/plans` catalog supply the plan,
  its state, its limits and its features. The screen never reads
  `/tenants/:slug/billing`, which carries prices and the payer. Its route is
  `/settings/workspace/{slug}/billing`, the web's path, so the shared
  `notificationLink` target maps one to one. The path is not an app link, so
  an emailed billing link opens the website. A `402` shows the app's copy,
  never the server's message.
- **A `402` on an invitation screen shows the app's copy.** Express refuses a
  join into a full workspace with a `402` whose message asks an owner to
  upgrade, and that answer carries no `details`, so the shared
  `planRefusalFrom` does not match it. `joinFailureMessage` in
  `src/copy/invitations.ts` maps any `402` on `/invitations/accept` and
  `/invitations/confirm` to "This workspace is at its members limit, so you
  can’t join it yet. Ask an owner of the workspace." The invite form and
  Resend map any `402` to "Not sent. You’re at the members limit." for the
  same reason, with or without counts.
- **A write that removes its row reports failure through the mutation cache.**
  A notification write removes its row at once, so the row's observer is gone
  before the answer, and TanStack skips an observer's `onError` when it has no
  listeners. `useNotificationWriteToasts` subscribes to the mutation cache
  instead and toasts each failed write keyed `['notifications', 'write']`.
- **A leave lands on `/tenants` and drops the cache from there.** The member
  row records the slug (`src/lib/left-workspaces.ts`), then calls
  `router.dismissAll()` and pushes `/tenants`; with nothing beneath it, it
  replaces the screen. `dismissTo` cannot do this: it pops only to a list
  already in the stack. The list drops each recorded workspace's cache when it
  gains focus, once no screen of the left workspace is mounted, so nothing
  refetches a workspace that now answers 404. Back from the list reaches the
  first screen, never an overview of the left workspace.
- **Delete account is reachable only from Settings, signed in.** React PR #183
  found that its signed-out `/delete-account` page only sends a sign-in link,
  and the first link a new address opens creates an account. Expo has no such
  screen and claims no such path.
- **Account deletion runs through `useStepUp().run`.** The request button shows
  `STEP_UP_WAITING_LABEL` while `useStepUpWaiting()` is true. Express has no
  cancel route, so the screen points to the support address to withdraw a
  request.
- **Passkey-required mode blocks deletion, and that is a known gap.** Express
  answers the deletion routes with `403 PASSKEY_SETUP_REQUIRED` in that mode,
  and the app cannot add a passkey yet. `/passkey-required` carries one line
  on asking for deletion by email. [SECURITY.md](SECURITY.md#known-gaps) and
  the README's review notes record the gap; the passkeys plan closes it. The
  owner chose this on 7 November 2026.

## Analytics, errors, flags and privacy

The rules below cover usage analytics, exception reports, the flags client and
the Privacy settings. They are plan 3d's. The files are listed in
[ARCHITECTURE.md](ARCHITECTURE.md#analytics-errors-flags-and-privacy), and the
data the app sends is in [SECURITY.md](SECURITY.md).

Analytics and exception reporting need `EXPO_PUBLIC_POSTHOG_KEY`. With no key,
both are inert and make no request. The events go to PostHog through express's
collect proxy at `apiUrl('/collect')`, and the app never holds a PostHog host.

**Analytics**

- **The facade is the only importer.** Only `src/observability/` imports
  `posthog-react-native` or `@posthog/core`, and the rest of the app calls
  `src/observability/telemetry/telemetry.ts`. One file means one place that
  guards, queues and swallows errors, and a screen cannot send an event around
  it. The port, `src/observability/telemetry/index.ts`, exports only the four
  names the manifest lists.
- **Every event passes `guardEvent`.** It runs in the SDK's `before_send` hook,
  drops the personal keys (`PERSONAL_DATA_PROPERTIES`) at every depth, and
  sanitises every URL-like string with the shared `sanitizeUrl`, keeping only
  the query keys in `ANALYTICS_URL_QUERY_ALLOWLIST`. A guard that throws drops
  the event. The SDK's own events (the app lifecycle events included) pass it
  too. Without a guard, a link's `?token=` or `?email=` would reach PostHog.
- **The SDK's lifecycle events keep only a URL's scheme and host.** The SDK
  sends `Application Opened` with `url` set to the link that opened the app.
  `sanitizeUrl` keeps an https link's path, and `/tenants/acme-corp` names a
  workspace. So for `Application Installed`, `Updated`, `Opened`, `Became
  Active` and `Backgrounded`, the guard cuts every https URL to its scheme and
  host and drops an app path.
- **Every event and every exception carries `$geoip_disable: true`.** Express's
  collect proxy sets `x-forwarded-for` to the client's IP address, and PostHog
  would resolve it to a city and a country that the privacy manifest and the
  store answers never declare. The guard sets it last, so no caller can turn
  it off, and `buildEvent` sets it on every exception, saved crashes included.
  The PostHog project should also have "Discard client IP data" on, an owner
  setting.
- **`track` takes a registered event.** `event-registry.ts` lists the events
  expo sends and fails to compile on a property that admits a free string. A
  free string is how a name, an address or a search term ends up in an event.
  A shared call site may pass a wider type than the registry lists, so the
  registry widens to accept it: shared rows cannot change, and the typecheck
  must pass.
- **The opt-out is applied before `identify`, and it fails closed.**
  `installAnalyticsIdentity` applies `analyticsOptOut` first and identifies
  only when the profile says `false`. A profile that lacks the field counts as
  opted out, so a sign-in answer without it never identifies an opted-out
  person. A stored opt-out stands from the SDK's first moment.
- **Turning analytics off clears the SDK's stored queue.** The SDK checks the
  opt-out only when an event joins its queue, and its flush sends whatever the
  queue holds, so a backlog of up to 1,000 offline events would otherwise leave
  after the choice. The cost is up to 10 seconds of already consented events.
  A flush already in flight can still send its one batch.
- **Before the session restore applies the stored choice, a cold start can
  capture under the last opt-in.** React has the same window. The facade queues
  calls made before `initAnalytics` (100 at most; past that the oldest queued
  capture is dropped, and identity, reset, group, flag and opt-out calls are
  kept) and replays them in order, so identity reaches the SDK before any
  event.
- **`forgetStaleIdentity` runs after a failed restore.** The SDK stores its
  person in MMKV. When the restore leaves nobody signed in, that person is
  stale, and `forgetStaleIdentityWithoutUser` resets it, keeping the opt-out
  and an anonymous install's id. A sign-out, forced or chosen, and a change of
  person run `resetAnalytics`, which also forgets the workspace group and the
  `$feature/*` properties.
- **Screen views come from the root layout, as route patterns.**
  `useScreenViews` runs in `src/app/_layout.tsx`, so the root routes (login,
  `auth/*`, `invitations/*`, passkey-required) send views too. The screen is
  the pattern (`/settings/workspace/[slug]/members`), never the filled-in
  path, so a slug or a token never leaves the device. The SDK's screen
  autocapture needs `PostHogProvider`, which the app never mounts.
- **The workspace group is the workspace on screen, and waits for sign-in.**
  `useTenantGroup` takes the route's `slug` first, as
  `useFeaturePropertiesSync` does, so an event never carries one workspace's
  `$feature/*` values under another's group, and staff on a customer
  workspace send `tenant_access: 'platform'`. The Workspace tab has no route
  slug and groups the current workspace. Every other screen (Home,
  Notifications, Settings, the account screens, `/tenants`) clears the group,
  as react's `installRouteAnalytics` clears it off a page outside a tenant
  route. The group is cleared while that workspace's detail loads. It reads
  nothing while restoring or signed out, because the workspace list needs a
  token. A member of the platform workspace is never grouped there. The group
  carries the workspace id and `tenant_access` and no group properties.

**Exceptions**

- **Exceptions follow react's pipeline, not the SDK's `captureException`.**
  `src/observability/errors/report.ts` builds the `$exception` with
  `@posthog/core`, scrubs it, throttles it and posts it to
  `/collect/batch/`. One builder gives one scrub, one throttle and an anonymous
  path. `scrub.ts` and its vectors test are react's text, copied as expo's
  own files.
- **An axios error is never reported, nested ones included.** Its
  `config.data` can hold the refresh token. `isIgnoredError` looks through
  `cause` chains, an `AggregateError`'s members and a plain object's
  Error-valued properties. It also drops aborts, cancels and a `fetch` that
  never reached the network.
- **Only named fields are sent, scrubbed.** `prepareExceptionList` copies the
  type, value and frames field by field through `scrubText`, so a field a
  later `@posthog/core` adds never leaves unscrubbed. A frame carries its
  scrubbed filename and function and its position, and no source line or
  variable. An app frame's filename is its base name, because an Android
  install lives under random directories. An error with no frame of the app's
  own is dropped.
- **The throttle is 5 events per fingerprint and 30 per launch.** A request
  carries at most 10 events and at most 60 KiB. A second error with the same
  name, message and stack within a second counts as a re-throw of the first.
- **An exception is anonymous unless identified.** It names the person only
  when capture is on and the facade identified that distinct id
  (`AnalyticsSettled.identified`). Otherwise it carries a fresh id and
  `$process_person_profile: false`, because the SDK's anonymous id would
  create a person profile for a signed-out crash. An exception waits at most
  10 seconds for analytics to settle. One handed over more than 10 seconds
  after it was noted is anonymous and has no route. Exceptions send whatever
  the analytics choice, as react's do.
- **A fatal crash is saved, anonymous, for the next launch.** React Native
  ends a release process right after a fatal error, before a promise or a
  timer runs. The handler builds and scrubs the event synchronously and
  writes it to the MMKV list `error-report:pending` (5 events at most, the
  oldest dropped). The next launch's `installErrorListeners` sends the list.
  The event is stored with a fresh distinct id, `$process_person_profile:
  false` and no `$session_id`, because it can be sent after the person has
  opted out or signed out. A stored entry that is not an object with a string
  `uuid` is dropped on read, so a corrupt list cannot block sending.
- **With no key, nothing is installed.** `installErrorListeners` wraps
  `ErrorUtils`' global handler, calls the handler it replaced with the same
  arguments, and enables Hermes's rejection tracker in a release build only.
  A development build already enables the tracker with React Native's options,
  and a second call would replace them, so a development build reports no
  unhandled rejection.
- **The error boundary's copy is "The app hit a problem".** The title is not
  "Something went wrong", which the shared copy-style test bans, and the body
  ("Try again, and if it keeps happening, restart the app.") does not repeat
  it. `root-error-boundary.tsx` is expo's file in `src/components/shared/`,
  inside the scan, so the guard still reads it. It renders outside the query
  client and the gates and uses no hook that needs them.
- **A render error outside the root boundary goes unreported.** An error above
  the root layout, inside the boundary itself or in a nested boundary reaches
  React Native's `ExceptionsManager`, never `ErrorUtils`. The follow-ups list
  the fix.
- **A report names the release as `version+build`** from `expo-application`
  and the route as a pattern. It has no page URL.

**Flags**

- **The scope comes from the route or from a slug a screen passes.**
  `useFlagValues` and `useVariant` take an optional `slug`. The Workspace tab
  renders the overview with a `slug` prop and has no route param, so the
  overview and Getting started pass theirs, and the tab reads the workspace's
  flags, not the account's. A read that ends in error returns the fallbacks.
- **`$feature/*` properties follow the person.** `useFeaturePropertiesSync`
  registers them as super properties in a layout effect, so a screen's first
  event carries them. A change of person forgets the registered names and
  re-syncs, because the reset drops them from the SDK while an equal read keeps
  its data reference.
- **Exposures are independent of consent, deduped per launch and dropped with
  the person.** The app posts keys, never values, and express evaluates the
  key again and records the exposure. `clearExposureDedupe` runs on a change
  of person and drops the batch still gathering, so one person's report never
  posts under the next person's token. A failed post is dropped.

**Privacy**

- **The Privacy row shows when analytics are available or a policy URL is
  set.** `hasPrivacyContent` hides it with neither, because the screen would
  be empty. The switch shows only with a key, and reads as off when the profile
  lacks the value. The link shows only with a policy URL.
- **`PRIVACY_POLICY_URL` is a build-time value.** `app.config.ts` reads it into
  `extra.privacyPolicyUrl` and fails the build on a value that is not an https
  URL. Each store build must set it, because a store listing needs a policy
  address.
- **The privacy manifest matches what the app sends.** Product interaction
  and user ID (both linked, for analytics) and crash data (linked, for app
  functionality), with no tracking. The user ID is declared because an
  identified event carries the user's id, and crash data is declared linked
  because an exception carries that id when the person is identified and
  sharing. The README holds the store answers.
- **The remote-config request is not opt-out aware.** The SDK reads
  `/collect/array/<key>/config` on every launch with a key, opted out or not,
  and no option turns it off.
- **Consent follows react's default.** Analytics are on for a signed-in person
  until they turn "Share usage analytics" off. The choice is stored through
  `PATCH /profile` (`analyticsOptOut`). There is no prompt.

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

- **Coverage thresholds sit above react's, though the shared tests alone fall
  short.** React's are statements 88, branches 82, functions 86 and lines 89.
  The shared tests alone (31 manifest rows, 29 of them test files) cover
  statements 43.78%, branches 46.00%, functions 31.47% and lines 42.51% of
  `src/`, because they exercise only part of the 75 shared files. The full
  suite measures statements 92.66%, branches 87.57%, functions 89.38% and lines
  93.51% on 8 November 2026, and `jest.config.ts` and `ci.yml` hold 92, 87, 89
  and 93. Each margin is under 0.7 of a point, so a change that adds untested
  branches fails the gate. The margin comes from expo's own screens and hooks.
  React should mark more of its tests for expo, so the shared rows carry their
  own share.
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
  (checked 6 November 2026). The webauthn port stays a stub. Security shows no
  passkey section, and step-up offers only the emailed link. A later plan runs
  the spike.
- **`run`'s plain retry can fail without a dialog.** A refusal sent with an
  older token than the store holds retries at once, with no dialog, because
  another confirmation has landed. If that retry is refused too, the action
  reports the refusal and no dialog opens. Expo mirrors react's provider
  here; react changes it first, then expo copies the change.
- **A late foreground refresh can overwrite the confirmed token.** A refresh
  that starts after `refreshSettled()` resolved can still replace the new token
  with one that has an older `auth_time`. At worst the retried action is refused
  once, or the next step-up action prompts again. The fix is for the session
  port's `keepUnlessChanged` to keep a token whose `auth_time` is newer.
- **`minimumAppVersion` is untyped in the shared core.** React's
  `ClientSettings` and `isClientSettings` omit the field, so expo parses it
  itself. A react PR types it; once expo copies that, replace
  `src/lib/minimum-version.ts`'s schema with the shared type.
- **The stream's first reconnect after a long background can send an expired
  token.** The connect reads the token from the store, and the foreground
  refresh may not have landed. The server answers 401, and the stream
  refreshes and reopens once. Awaiting `refreshSettled()` before the connect
  would remove the 401.
- **A `503 MAINTENANCE_MODE` on the stream is an ordinary 503.** The stream
  uses `expo/fetch`, not `apiClient`, so the maintenance interceptor does not
  see it. The stream backs off, and the next API read sets the mode.
- **The Plan screen shows the server's `plan.name` unfiltered.** The name is
  staff-editable server text. The screen assumes staff keep prices and
  purchase prompts out of it. The app's own copy never carries either.
- **Request deletion uses the `secondary` variant.** `Button` has no
  destructive variant, and the confirmation `Alert` carries the destructive
  confirm. A `destructive` variant needs a kit change.
- **The Notifications badge keeps the tab bar's default colours.**
  `tabBarBadgeStyle` takes colour values, not token classes, and the theme's
  colours are `var(--token)` strings.
- **Activity filters by search and by access only.** The Access filter offers
  Staff, Member and System. The Action and Actor filters wait for a later
  plan.
- **The shared schema's `Intl` checks are unchecked on Hermes.** The time
  zone check in `src/schemas/tenant.schemas.ts` builds an
  `Intl.DateTimeFormat` and treats any throw as a bad name. The locale check
  calls `Intl.getCanonicalLocales`. Jest runs both on Node, and no device has
  run them on Hermes. The README's device checklist covers the General form
  with values that pass each pattern and fail only in `Intl`.
- **`Button` takes no `accessibilityLabel`.** `RowButton` covers list rows.
  Add the prop to `Button`, then fold `RowButton` into it.
- **A `SignInNotKeptError` on `/invitations/confirm` while signed in as the
  same email leaves a revoked session.** The device could not store the new
  token, so the join's token was revoked, and the old session stays open until
  it fails. It fails safe: the person sees "Go to Home" and signs in again.
  The fix signs out and shows the prefilled form.
- **Continue on both invitation screens waits for the whole sign-out.**
  `retryPendingRevoke` can take up to the client timeout of 30 seconds before
  the screen posts. The post could start once the local sign-out is done.
- **Session replay, `<Pii>` and the PII probe wait for a device.** Replay needs
  PostHog's native plugin and a device. Wireframe-only mode cannot be forced
  from JavaScript, and express has no replay flag. `PostHogMaskView` also
  replaces a child's accessibility label and hides it from TalkBack, so it
  lands with replay, once a device can check it. The app sets
  `enableSessionReplay: false`. The same plan adds react's `<Pii>` wrapper and
  its probe, which checks that no personally identifiable information (PII)
  reaches a replay.
- **Source maps, `expo-updates` and the per-profile network settings belong to
  plan 3e.** Release stack frames carry bundle positions until a build
  uploads source maps, and the PostHog CLI keys a release by app version and
  build, not by update ID, so plan 3e decides the keying with `eas.json`.
  `isAppFrame` matches only `index.android.bundle` and `main.jsbundle`
  (`RELEASE_BUNDLES` in `report.ts`). An update that `expo-updates` downloads
  runs from a bundle with another name, so every exception after an update
  would have no app frame and be dropped. Plan 3e adds those names. That
  plan also sets cleartext traffic and App Transport Security (ATS) for each
  build profile. When it adds `expo-updates`, remove it from `knip.ts`'s
  `ignoreDependencies`: knip reports the entry as unneeded once the package is
  a dependency.
- **Express is asked for three things.** A replay flag in its flag registry,
  so replay can follow a server switch. A `FlagApp` of `'expo'`, so a flag
  can name this app in `apps` and exposures record the origin `expo`, not
  `react`; `CLIENT_FLAGS` mirrors the entries that name `react` until then.
  And the collect proxy's limit of
  3,000 requests a minute per IP address: a mobile carrier puts many phones
  behind one address through network address translation (NAT), so a busy
  carrier can exhaust it.
- **Render errors outside the root boundary are unreported.** An error above
  the root layout, inside `RootErrorBoundary` or in a nested boundary reaches
  React Native's `ExceptionsManager`, not `ErrorUtils`. Reporting it means
  patching `ExceptionsManager.handleException`, which depends on React Native's
  internals, so it waits for a device to confirm the hook.
- **A development build reports no unhandled rejection.** React Native
  enables Hermes's rejection tracker with its own options in development, and
  a second call would replace them. Chaining to those options needs an untyped
  import of React Native's internals.
- **`privacy-policy.ts` casts `extra.privacyPolicyUrl` without a check.**
  `app.config.ts` accepts only an https URL, so a built app holds a string
  or nothing. A runtime check would cover a config edited by hand.
- **The iOS App Store ID is unset.** Plan 3e sets `IOS_APP_STORE_ID` for each
  build profile; until then the iOS update screen has no store button.
- **Every "Mark done" button has the same accessible label.** The web app
  reads "Mark done: {title}". `Button` takes no `accessibilityLabel` yet; add
  the prop, then label each button with its step.
- **Jest prints "A worker process has failed to exit gracefully."** It showed
  in plans 3b and 3c1 and on 6 November 2026. Run `pnpm test --detectOpenHandles`
  to find the handle; `tests/setup.ts` already unrefs TanStack Query's timers.
- **Plans are not tracked.** `docs/superpowers/plans/` is git-ignored, and the
  specs under `docs/superpowers/specs/` are tracked. A plan lives on the
  machine of whoever wrote it.
- **The Hermes polyfills, the splash screen, the React Compiler, the
  workspace screens and the invitation screens are unchecked on a device.**
  [SECURITY.md](SECURITY.md#known-gaps) and the README checklist carry them.

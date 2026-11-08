# Architecture

This file says how the expo app is put together and why. It is for a
developer who changes the code. The rules for changing it are in
[CLAUDE.md](CLAUDE.md), and the threats it defends against are in
[SECURITY.md](SECURITY.md).

The app is the iOS and Android client for the same account, workspaces and API
as react-boilerplate. As of 7 November 2026 it signs a person in with an
emailed link and keeps the session on the device. It has four tabs (Home,
Workspace, Notifications and Settings), a live notification stream, the account
screens under Settings (Profile, Security, notification preferences and Delete
account), the "Confirm it’s you" dialog for an action that needs a recent
sign-in, a workspace's overview, the list and creation of workspaces, the
workspace settings (General, Members, Activity and a read-only Plan), the two
invitation screens, Insights and Beta, the screens that
block the app for an update or maintenance, the shared core, the theme, and
the ports that connect the two. The design for the screens that follow is in
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
  components/       auth/ (the sign-in form), invitations/ (the signed-in
                    person's inbox), account/ (what deletion removes),
                    notifications/ (the stream and the row), settings/ (rows,
                    the read-only note, the legacy redirect), shared/ (banners,
                    update and maintenance screens, load error, empty state,
                    tab-bar height), ui/ (the
                    UI kit: Screen, Button, TextField, InlineError, Toaster,
                    ChoiceSheet, TOUCH_TARGET), workspace-settings/ (the
                    General, Members and invite pieces), workspaces/ (switcher,
                    gate, overview, platform-access banner, getting started,
                    create form)
  constants/        shared: routes, roles, audit actions; frontend-app.ts is a port
  copy/             expo's own words for billing, the members limit and
                    notifications (no prices, no purchase prompts)
  hooks/            shared hooks; use-sign-out, use-current-tenant,
                    use-is-online, use-list-pages, use-notification-write-toasts
                    and use-top-banner are expo's own
  http/             shared: interceptors, refresh core; client.ts and session.ts are ports; token-store, revoke, body-token, session-lifecycle, maintenance and sse are expo's
  lib/              shared pure logic; toast.ts is a port; app-links, left-workspaces, minimum-version, notification-href, privacy-policy, query-managers, safe-path and stream-backoff are expo's
  observability/    errors/ (exception reports), flags/ (the flags client) and telemetry/ (the analytics facade)
  polyfills.ts      the Web APIs Hermes may lack, loaded first
  ports/            navigation.ts, runtime.ts, webauthn.ts
  queries/          shared TanStack Query hooks
  schemas/          shared Zod schemas
  states/           auth, maintenance-mode (ports), theme, toast-queue, current-tenant, own-sign-out and tab-bar (expo's own)
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
   draws its own title through `Screen`. The file also exports
   `RootErrorBoundary` as Expo Router's `ErrorBoundary`.
3. The layout imports `global.css` first and calls
   `SplashScreen.preventAutoHideAsync()`, `initAnalytics()` and
   `installErrorListeners()` at module scope, before the first render. It
   applies the stored theme
   ([The theme and the splash screen](#the-theme-and-the-splash-screen)).
4. The layout installs the analytics identity
   (`installAnalyticsIdentity()`), then calls `restoreSession()` and, once the
   restore settles, `forgetStaleIdentityWithoutUser()`. It also calls
   `installForegroundRefresh()` ([Sessions](#sessions)) and `useScreenViews()`
   ([Analytics, errors, flags and
   privacy](#analytics-errors-flags-and-privacy)). Routes under
   `src/app/(app)/` render only for a signed-in person: its layout shows
   "Signing you in" with a spinner while the restore runs, sends a signed-out
   person to `/login` with the path they asked for as `redirect`, and sends an
   account that must add a passkey to `/passkey-required`. Home is
   `src/app/(app)/(tabs)/index.tsx`.
5. The same layout also installs `installQueryManagers()` and
   `installMaintenanceRecovery()`
   ([Workspaces and the shell](#workspaces-and-the-shell)).

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

| Port                                   | Exports                                                                                         | What expo's version does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/constants/frontend-app.ts`        | `FRONTEND_APP`                                                                                  | `'web'`. Mailed links point at `WEB_URL` and reach the app through universal links, so express builds links and policy for the web app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/http/client.ts`                   | `apiClient`, `unwrap`                                                                           | Builds `apiClient` with `createApiClient` (`baseURL` is `EXPO_PUBLIC_API_URL` plus `API_PREFIX`, `withCredentials: false`) and installs the shared interceptor chain. A request counts as an API request when it goes to that origin under `API_PREFIX`; only those carry `X-Client: native` and `X-Device-Name` (the `expo-device` model name, when known), and a guard removes the bearer token from every other request. An unset URL leaves a relative base, so no request counts and importing the file never throws. `unwrap` is the shared one.                                                                                                                                                                                                        |
| `src/http/session.ts`                  | `broadcastAuthMessage`, `broadcastLogout`, `ensureSession`, `redirectToLogin`, `switchIdentity` | `ensureSession` builds the shared refresh core with the `body` transport over `refreshTokenStore` (SecureStore), so a restore posts the stored token in the body and keeps the rotated one. `broadcastAuthMessage` emits to the handlers that `subscribeAuthMessage` registered in this process, since there is no other tab; `broadcastLogout` does nothing. `broadcastStepUpLinkFailed` and `subscribeStepUpLinkFailed`, which are expo's own and no port, carry a failed verify's copy to a waiting dialog. `refreshSettled()` resolves once the refresh in flight, if any, has settled, and never rejects. `redirectToLogin` calls `router.replace('/login')`. `switchIdentity` clears the query cache and the auth store when a different user signs in. |
| `src/lib/toast.ts`                     | `toast`                                                                                         | `toast.success`, `toast.error`, `toast.warning` and `toast.dismiss` over the Zustand queue in `src/states/toast-queue.store.ts`. A toast raised with the `id` of a queued one replaces it. `src/components/ui/toaster.tsx` renders the newest 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/observability/flags/flag-keys.ts` | `CLIENT_FLAGS`                                                                                  | This app's slice of express's flag registry: the entries with `client: true` and an app list that names it, copied by hand. It holds react's two example flags.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/observability/telemetry/index.ts` | `AnalyticsKey`, `analyticsKey`, `getAnalyticsSessionIdFor`, `track`                             | The analytics facade over PostHog. `track` sends a registered event through the collect proxy, `analyticsKey` brands a literal, and `getAnalyticsSessionIdFor` returns the SDK's session id while capture is on and the SDK's person is the given user. With no `EXPO_PUBLIC_POSTHOG_KEY` all three are inert: `track` sends nothing and the session id is `null`.                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/ports/navigation.ts`              | `assignLocation`                                                                                | A `url` that begins with `/` goes to `router.replace`, so back does not return to the signed-in screen. Any other `url` goes to `Linking.openURL`, and its rejection is caught, so a URL nothing handles is dropped, never an unhandled rejection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/ports/runtime.ts`                 | `isDev`                                                                                         | `isDev`, read from `__DEV__`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/ports/webauthn.ts`                | `webauthn`                                                                                      | No passkeys. `isSupported` resolves `{ create: false, autofill: false }`, `get` and `create` reject with a not-supported `Error`, `cancelGeneration` returns 0, and the three `signal*` methods do nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/states/auth.store.ts`             | `useAuthStore`                                                                                  | A Zustand store of the access token and user, in memory only, with no `persist` middleware. The same shape as react's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/states/maintenance-mode.store.ts` | `useMaintenanceModeStore`                                                                       | A Zustand store of the maintenance mode, the owner's notice and the start time, set from the `Maintenance-Mode` header, the status endpoint or a 503 body. Memory only, and the same shape as react's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tests/support/runner.ts`              | `describe`, `it`, `test`, `expect`, `beforeEach`, `afterEach`, `repoRoot`, `copyStyleRoots`     | Re-exports `describe`, `it`, `test`, `expect`, `beforeEach` and `afterEach` from `@jest/globals`. `repoRoot` is the repository root, and `copyStyleRoots` is `['src', 'src/components/ui']`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

A later plan replaces the webauthn port with a passkey library, once a spike
on a device picks one. Update this table in the same pull request.

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
  the refresh, with the pending revokes beside it), `useSessionStatus` and
  `installForegroundRefresh`.
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

App links: the Android intent filter claims only `/auth/link`, `/tenants/`,
`/auth/confirm`, `/settings/account/security`, `/invitations/accept` and
`/invitations/confirm`, the paths with a screen. `/settings/workspace/…` is
not claimed, because react's apple-app-site-association file does not list it.
Each later plan adds its paths with its screens. iOS claims the paths in
react's apple-app-site-association file. The passkey screen opens the website
through `expo-web-browser`, since `Linking.openURL` would hand a verified app
link back to the app.

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
  _layout.tsx                  analytics and error listeners, screen views, identity, query client, update gate, maintenance gate, top banners, step-up provider, stack, toaster; exports the error boundary
  login.tsx                    sign-in; reads redirect and notice
  forgot-password.tsx          retired password paths (also register, reset-password, verify-email):
                               redirect to /login?notice=sign-in-link
  auth/link.tsx                the mailed link's landing
  auth/confirm.tsx             the mailed "Confirm it’s you" link; posts the token, then goes back
  invitations/accept.tsx       the invitation link: previews, then mails a link or joins
  invitations/confirm.tsx      the confirmation link mailed to the invited address: signs in and joins
  passkey-required.tsx         the blocking screen for an account that must add a passkey
  +native-intent.tsx, +not-found.tsx
  (app)/                       the session guard
    _layout.tsx                restore, sign-in redirect, passkey redirect, NotificationStream,
                               analytics workspace group and feature properties;
                               anchored on (tabs), so the tabs sit beneath every screen above them
    welcome.tsx                create a first workspace (header with Back)
    (tabs)/
      _layout.tsx              four tabs, no navigator header; publishes the tab bar height
      index.tsx                Home
      workspace.tsx            the current workspace's overview, in place
      notifications.tsx        the notification list: status chips, Load more, mark and delete
      settings.tsx             the Account rows, the Workspace rows, and Sign out
    profile.tsx                redirects to /settings/account/profile
    settings/account/
      index.tsx                redirects to Profile
      profile.tsx              edit the name (header with Back)
      security.tsx             sign-in methods, signed-in devices, Sign out other devices
      notifications.tsx        how each kind of notification reaches you
      privacy.tsx              analytics switch and privacy policy link
      delete.tsx               ask for the account to be deleted, through step-up
    settings/workspace/[slug]/
      index.tsx                redirects to General
      general.tsx              details, time zone, language and region
      members.tsx              members and roles, the invite form, pending invitations
      activity.tsx             the audit log, newest first, with search and an access filter
      billing.tsx              Plan: the plan's name, state, limits and features, read-only
    tenants/
      index.tsx                all workspaces, and Create (header with Back)
      [slug]/index.tsx         one workspace's overview (header with Back)
      [slug]/insights.tsx      the advanced-example feature, or its locked card
      [slug]/beta.tsx          the reference screen behind the beta flag
      [slug]/settings.tsx      legacy: redirects to General
      [slug]/members.tsx       legacy: redirects to Members
      [slug]/activity.tsx      legacy: redirects to Activity
      [slug]/[...rest].tsx     any other deeper path: redirects to the overview
```

### The modules

- **The query managers.** `src/lib/query-managers.ts` ties TanStack Query's
  focus to `AppState` and its online state to NetInfo.
  `src/hooks/use-is-online.ts` reads the online state for the offline banner.
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
- **The toaster's offset.** The toaster renders at the root, 8 points above
  the bottom inset. While a tab screen is focused, `TabBarHeight`
  (`src/components/shared/tab-bar-height.tsx`, the tabs layout's
  `screenLayout`) publishes the tab bar's height to
  `src/states/tab-bar.store.ts`, and the toaster sits 8 points above the bar
  instead. The height clears when no tab screen is focused.
- **The (app) stack.** `unstable_settings.anchor` is `(tabs)`, so a cold deep
  link, a sign-in landing (`router.replace` with `withAnchor`) and Welcome all
  leave the tabs beneath the screen. The stack screens above the tabs show a
  navigator header with an empty title and a Back button; the tabs show none.
- **A sign-out of the person's own.** `src/states/own-sign-out.store.ts` holds
  the mark that `useSignOut` sets, which keeps `redirect` off the guard's
  `/login`.
- **Redirects.** `src/lib/safe-path.ts` holds `safePath`, which checks a
  redirect, and `landingFor`, which picks where a sign-in lands: `/welcome` for
  a new account, a safe redirect, `/welcome` for an account with no eligible
  workspace, else Home.
- **The current workspace.** `src/states/current-tenant.store.ts` remembers a
  person's last workspace in MMKV, and `src/hooks/use-current-tenant.ts`
  resolves it against the list of workspaces the API returns.
- **The workspace screens.** `src/components/workspaces/` holds the switcher
  (`workspace-switcher.tsx`), the gate for loading, missing and suspended
  states (`workspace-gate.tsx`), the missing and suspended panel it shares
  with the stack screens (`missing-workspace.tsx`, which also holds
  `StackWorkspaceGate` for Insights and Beta), the overview shared by the Workspace tab and
  `/tenants/[slug]` (`workspace-overview.tsx`), Getting started, the trial
  explainer (`trial-explainer.ts`), the create form and the platform-access
  banner (`platform-access-banner.tsx`), which every workspace screen draws
  for staff.
- **The frame.** `Screen` draws the one header-role title and owns the top
  safe-area inset, unless a navigator header or a top banner takes it
  (`useTopBanner`). The update and maintenance screens cover the banners, so
  they pass `coversBanners` and take the inset whatever the banners show.

## Account settings and step-up

- **The Settings tab.** `src/constants/settings.ts` lists the groups and the
  Account rows, and `src/components/settings/settings-row.tsx` draws a row.
  The Workspace group lists General, Members and Activity for the current
  workspace (`WORKSPACE_SECTIONS`), and asks for a workspace first when none
  resolves. The Privacy row shows only when `hasPrivacyContent()` is true.
- **Profile.** `src/hooks/use-changed-fields.ts` tracks what the form started
  from, so a save sends only the changed fields.
- **Notifications preferences.** `src/components/ui/switch.tsx` is the kit's
  switch.
- **Security.** `src/queries/sessions.queries.ts` reads `GET /auth/sessions`
  for the signed-in devices. "Sign out other devices" runs through step-up.
- **Step-up.** `src/components/step-up/step-up-provider.tsx` owns the one
  dialog and `src/components/step-up/step-up-dialog.tsx` draws it as a
  full-screen `Modal`. `src/hooks/use-step-up.ts` holds `useStepUp().run`,
  `useStepUpWaiting` and `STEP_UP_WAITING_LABEL`, and
  `src/hooks/use-seconds-left.ts` drives the resend and expiry clocks. The
  root layout mounts the provider once, inside the update and maintenance
  gates.
- **The emailed link.** `src/app/auth/confirm.tsx` waits for the session
  restore and for `refreshSettled()`, posts the token once, and goes back when
  a dialog waited. The dialog hears the confirmation through
  `subscribeAuthMessage` in the session port, and a failed verify through
  `subscribeStepUpLinkFailed`, expo's own channel beside it.

## Workspace settings and invitations

- **The Workspace rows.** `WORKSPACE_SECTIONS` in `src/constants/settings.ts`
  lists General, Members, Activity and Plan, each with a typed path for a slug.
  The legacy `/tenants/{slug}/settings`, `/members` and `/activity` routes
  and `/settings/workspace/{slug}` render `WorkspaceSettingsRedirect`
  (`src/components/settings/workspace-settings-redirect.tsx`), which keeps the
  query and drops `token`.
- **General.** `src/components/workspace-settings/` holds `DetailsForm` (the
  workspace's details, for owners and admins), `SettingsForm` (time zone,
  language and region, and the custom data), `DetailRow`, and
  `form-errors.ts`, which sorts a failed save's messages into field errors and
  one form line. A staff view shows `ReadOnlyNote`
  (`src/components/settings/read-only-note.tsx`) and no controls.
- **Members.** `member-row.tsx` draws a member with the role sheet, Remove and
  Leave. `invite-form.tsx` posts an invite, and `pending-invitations.tsx` lists
  invitations with Resend and Revoke. `members-limit-note.tsx` shows the
  counts. `row-button.tsx` is the one row button. Every write runs through
  `useStepUp().run`.
- **Activity.** `src/app/(app)/settings/workspace/[slug]/activity.tsx` lists
  the audit log with a search box and an access filter (Staff, Member,
  System). `src/lib/audit-targets.ts` names what an entry acted on.
- **Paging.** `src/hooks/use-list-pages.ts` pages a list with "Load more": one
  query per page, keyed by its cursor, from the shared `listQueryOptions`.
  It shows each row key once, starts again at page 1 when page 1's last row
  changes after page 2 was asked for, and hides Load more while page 1 is
  placeholder data.
- **The kit's additions.** `src/components/ui/choice-sheet.tsx` is a bottom
  sheet in a `Modal` with no scrim. `TextField` takes `multiline`.
  `src/lib/link-lifetime.ts` writes a link's lifetime and expiry the way the
  mail does, in minutes for a sign-in link and days for an invitation.
- **The invitation screens.** `src/app/invitations/accept.tsx` previews the
  invitation, then verifies (signed out: express mails a confirmation link to
  the invited address) or accepts (signed in as the invitee).
  `src/app/invitations/confirm.tsx` posts the mailed token and `email`; express
  signs the invitee in and joins them. `InvitationInbox`
  (`src/components/invitations/invitation-inbox.tsx`) draws the "Check your
  inbox" state, and
  `src/lib/invitation-token.ts` holds the token's shape. Both screens end in
  `landJoined` (`src/lib/land-joined.ts`), which remembers an eligible
  workspace and replaces to the Workspace tab.
- **Insights and Beta.** `src/app/(app)/tenants/[slug]/insights.tsx` reads the
  entitlements and the insights through the shared billing and insights
  queries. `beta.tsx` reads the beta page behind `example_beta_page`. The
  overview reads the workspace's flags through `useFlagValues` to show the
  Insights and Beta rows ([Analytics, errors, flags and
  privacy](#analytics-errors-flags-and-privacy)).

## Notifications, plan and deletion

- **The stream transport.** `src/http/sse.ts` holds `createSseParser`, a pure
  parser for server-sent events (SSE), and `openEventStream`, which opens
  `GET /notifications/stream` over `expo/fetch` and resolves with how it ended:
  closed by the server, refused with a status, a code and `Retry-After`, or
  aborted. It never reconnects. `apiUrl` in `src/http/client.ts` builds the URL,
  so that file stays the only reader of `EXPO_PUBLIC_API_URL`.
- **The library choice.** The spec's library table names `react-native-sse`.
  Version 1.2.1 fails the check the spec sets: it gives no signal when the
  server ends the stream, it reconnects every 3 seconds with the expired
  token, and it hides the response headers, so `Retry-After` is unreadable.
  `expo/fetch` streams the body, exposes the status and headers, aborts through
  an `AbortController`, and ships in `expo`, so the app uses it. The spec stays
  as written; [CLAUDE.md](CLAUDE.md#notifications-plan-and-deletion) holds the
  reasons.
- **`NotificationStream`.**
  `src/components/notifications/notification-stream.tsx` renders once in the `(app)` layout's signed-in branch and returns `null`. It
  owns the stream's lifetime, its reconnects (`src/lib/stream-backoff.ts` holds
  the backoff, the `Retry-After` cap and the jitter) and what each frame does to
  the query cache: a `notification` frame invalidates the list, and an
  `entitlements_changed` frame refetches that workspace's billing reads.
- **The Notifications tab.** `src/app/(app)/(tabs)/notifications.tsx` lists with
  `useListPages`, filters by All, Unread and Read, and marks and deletes through
  the shared hooks. `notification-row.tsx` draws a row;
  `src/lib/notification-href.ts` maps a notification's target to a typed route.
  `src/hooks/use-notification-write-toasts.ts` toasts a failed write from the
  mutation cache. The tab's badge reads the unread count in
  `(tabs)/_layout.tsx`.
- **`src/copy/`.** `billing.ts` words the Plan screen, `members-limit.ts` the
  members-limit note, `invitations.ts` the invitation screens' answer to a
  `402`, and `notifications.ts` the neutral kinds (`isNeutralKind`), their
  lines, the type labels both notification screens use
  (`notificationTypeLabel`) and the tab's badge. No file there holds a price
  or a purchase prompt.
- **Plan.** `billing.tsx` reads `useEntitlements` and the `/plans` catalog's
  labels. It never reads `/tenants/:slug/billing`.
- **Delete account.** `delete.tsx` reads the open request, posts a new one
  through `useStepUp().run` (`src/queries/account-deletion.queries.ts`), and
  `src/components/account/what-we-delete.tsx` lists what deletion removes.
  `/passkey-required` carries one line on asking by email.
- **Leaving a workspace.** `src/lib/left-workspaces.ts` records the slugs of
  workspaces the person left. `/tenants` drops each one's cache when it gains
  focus. Both `useListPages` and the Members screen are described in
  [Workspace settings and invitations](#workspace-settings-and-invitations).

## Analytics, errors, flags and privacy

`src/observability/` holds three folders, and only it imports
`posthog-react-native` or `@posthog/core`. Express's collect proxy carries
every request, so the app never holds a PostHog host. With no
`EXPO_PUBLIC_POSTHOG_KEY`, analytics and exception reporting are inert and make
no request. [CLAUDE.md](CLAUDE.md#analytics-errors-flags-and-privacy) holds the
rules and their reasons.

- **`telemetry/`.** `telemetry.ts` is the facade over the PostHog SDK: it
  queues calls made before `initAnalytics`, runs every event through
  `guardEvent`, stores the SDK's state in MMKV and applies the opt-out. Its
  identity calls are `identifyUser`, `resetAnalytics`, `forgetStaleIdentity`,
  `setAnalyticsOptOut` and `setTenantGroup`. `config.ts` reads the public
  variables and lists the URL query keys an event may keep and the personal
  property names it never carries. `event-registry.ts` is the typed list of
  events. `install-identity.ts` follows the auth store's user.
  `use-screen-views.ts` sends a screen view for each route pattern, and
  `use-tenant-group.ts` puts events in the group of the workspace on screen
  (the route's, or the Workspace tab's current one).
  `install-identity.ts` also forgets the flags module's per-person state.
  `url-sanitizer.ts` is react's, byte for byte, and `index.ts` is the port.
- **`errors/`.** `report.ts` filters, builds, scrubs and throttles an
  `$exception`, names the person only when analytics identified them, and
  posts batches to `/collect/batch/`. `listen.ts` holds `noteError`, the global
  handler wrapper, Hermes's rejection tracker and the delivery of fatal
  crashes saved in MMKV. `scrub.ts` is react's text, kept as expo's own file.
  `src/components/shared/root-error-boundary.tsx` is the screen Expo Router
  shows for a render error, and it reports through `noteError`.
- **`flags/`.** `flag-query.ts` holds the scope (a workspace slug or none), the
  path, the query key and the query. `flag-hooks.ts` holds `useFlagValues`,
  `useVariant` and `useFeaturePropertiesSync`. `register.ts` and
  `feature-property-names.ts` keep the `$feature/*` super properties.
  `exposure.ts` reports an experiment's keys to express. `flag-keys.ts` (the
  port) lists the flags this app reads, and `flag-types.ts` and
  `flag-values.ts` (react's, byte for byte) hold their types and fallbacks.
- **The root layout** calls `initAnalytics()` and `installErrorListeners()`
  at module scope, installs the identity, restores the session and runs
  `useScreenViews()`. It exports `RootErrorBoundary`.
- **The `(app)` layout** calls `useTenantGroup()` and
  `useFeaturePropertiesSync()` before its early returns, so both run for every
  signed-in screen.
- **Privacy.** `src/app/(app)/settings/account/privacy.tsx` holds the "Share
  usage analytics" switch, which writes `analyticsOptOut` through
  `useUpdateAnalyticsOptOut`, and the privacy policy link.
  `src/lib/privacy-policy.ts` reads `extra.privacyPolicyUrl`, which
  `app.config.ts` takes from `PRIVACY_POLICY_URL`, and decides whether the
  Settings row shows. `app.config.ts` also declares the iOS privacy manifest
  and `ITSAppUsesNonExemptEncryption`.

## Builds and releases

One value, `APP_VARIANT`, drives `app.config.ts`. Each `eas.json` profile sets
it, and unset it reads `production`. The rules and their reasons are in
[CLAUDE.md](CLAUDE.md#builds-updates-and-releases), and the owner's setup is in
[README.md](README.md#release-setup).

| Variant       | App ID suffix | Name suffix | Update channel | Local networking |
| ------------- | ------------- | ----------- | -------------- | ---------------- |
| `development` | `.dev`        | Dev         | none           | yes              |
| `e2e`         | `.e2e`        | E2E         | none           | yes              |
| `preview`     | `.preview`    | Preview     | `preview`      | no               |
| `production`  | none          | none        | `production`   | no               |

The app ID is `com.mahaverick.expoboilerplate` plus the suffix, on iOS and
Android, and the name is `expo-boilerplate`, then a space and the name suffix. Local networking
means `NSAllowsLocalNetworking` on iOS and `usesCleartextTraffic` on Android
(through `expo-build-properties`); without it a build reaches HTTPS hosts
only.

**The files.**

- `app.config.ts`: `VARIANTS`, `appVariant()` and `updatesConfig()`, which
  turns updates on only for a variant with a channel, an `EAS_PROJECT_ID` and
  a committed `certs/<variant>/certificate.pem`.
- `eas.json`: the four profiles, each with its EAS environment
  (`development`, `preview` or `production`; `e2e` takes `development`), the
  channels, remote build numbers, and `SOURCEMAP_FILE` for preview and
  production.
- `certs/<variant>/certificate.pem`: the public certificates, one per
  variant that takes updates.
- `metro.config.js`: PostHog's serializer, which writes a chunk ID into each
  bundle and its source map, wrapped by NativeWind.
- `src/observability/errors/report.ts`: `isAppFrame` counts an update's
  bundle under `.expo-internal/` as the app's, and `scrubFrame` keeps the
  chunk ID.
- `scripts/install-posthog-cli.sh` and `scripts/posthog-cli.sha256`: the
  hash-checked PostHog command-line tool.
- `scripts/upload-native-sourcemaps.sh`: the store build's map upload, which
  EAS runs from the `eas-build-post-install` and `eas-build-on-success`
  scripts in `package.json`.
- `scripts/check-bundle-size.mjs`: the bundle-size budget, run by
  `pnpm bundle:size` in the gate and in CI.
- `scripts/release-route.mjs`: the route of a release, update or build.
- `.github/workflows/preview-update.yml`, `.github/workflows/release.yml`,
  `release-please-config.json` and `.release-please-manifest.json`: the
  release workflows.

**The update path.** On each push to `main`, `preview-update.yml` runs
`eas update` on the `preview` channel, signed with the preview key, then
uploads the maps from `dist/`. A preview build whose fingerprint matches
checks on launch (`checkAutomatically: 'ON_LOAD'`), downloads the update in
the background (`fallbackToCacheTimeout: 0`) and verifies its signature
against its certificate (`keyid: 'main'`, `rsa-v1_5-sha256`). It runs the
update from `.expo-internal/` on the next cold start. A production update
takes the same path from `release.yml`, at 10% of installs.

**The release routing.**

1. release-please keeps the release PR up to date on each push to `main`.
2. A person merges it. release-please tags `vX.Y.Z`, and `route` reads the
   version before it from the manifest at the release commit's parent.
3. `route` compares this commit's fingerprint with each platform's latest
   finished production build (`eas fingerprint:compare`), then runs
   `scripts/release-route.mjs`.
4. A patch bump with an unchanged fingerprint goes to `update`, in the
   environment `production-updates`, which needs a reviewer: a signed
   `eas update` to `production` at 10%, then the maps.
5. Any other release goes to `build`, in `production-builds`:
   `eas build --profile production --platform all --auto-submit`, to
   TestFlight and the Play internal track. EAS Build's hooks upload the
   native maps. A person promotes each build.

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
  the root layout, the analytics facade, the exception reporter, the flags
  client, the session modules, the query managers, the maintenance
  and update behaviour, `safePath`, the current-workspace store and hook, the
  screens, the UI kit, the accessibility harness (`tests/unit/a11y/`), the app
  config and backup plugin, `eas.json`, the `.gitignore` certificate rule, the
  bundle-size check, the release route, the native source-map upload, the
  STYLESEED table, the contrast of the tokens, the lint design lock and the
  sync check.
- `tests/setup.ts` unrefs TanStack Query's timers so a shared test needs no
  teardown.
- `jest.config.ts` maps `@/` to `src/`, `@/tests/` to `tests/`, and `.css`
  files to an empty module.

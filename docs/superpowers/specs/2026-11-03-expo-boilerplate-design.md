# expo-boilerplate: the customer app for iOS and Android

- **Date:** 3 November 2026 (revised the same day after a four-part audit)
- **Status:** Draft, for review by the repository owner
- **Repo:** `expo-boilerplate` (new)
- **Part 3 of 3.** It needs part 1,
  [express: native clients and account deletion](2026-11-03-express-native-clients-design.md),
  and part 2, [react and apex: a shared core](2026-11-03-react-shared-core-design.md),
  merged first.

## Purpose

`expo-boilerplate` is `react-boilerplate`'s customer app for iOS and Android.
A customer signs in to the same account, sees the same workspaces and does the
same work as on the web, against the same `express-boilerplate` API.

It is a fourth sibling repository and follows the house rules of the other
three: pnpm 12.16.1, Node 26, TypeScript strict, a zero-warning gate,
conventional commits, release-please, Renovate, GPG-signed commits, the
writing style in `amazon-writing-style.md`, and the `CLAUDE.md`,
`ARCHITECTURE.md`, `SECURITY.md`, `README.md` and `AGENTS.md` documents.

### Decisions made on 3 November 2026

| Question                         | Decision                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| What the app is for              | The mobile customer app, in step with `react-boilerplate`                                           |
| How a native session is kept     | Express's native client mode: the refresh token in the body (part 1)                                 |
| Version 1 scope                  | Sign-in, onboarding, workspaces, invitations, notifications, account settings, member admin, workspace settings, activity, insights, beta, read-only billing, account deletion |
| How code is shared               | A shared core copied byte for byte from react, after react splits it out (part 2)                     |
| UI toolkit                       | NativeWind, with the STYLESEED tokens                                                              |
| Billing                          | A read-only plan with neutral copy; no prices, no purchase calls to action                         |
| Account deletion                 | Requested in the app, completed by staff within 30 days (part 1, section 5)                          |
| App review access                | A review address on a shared inbox the team watches                                                 |
| Over-the-air updates             | Code-signed, on the Expo Production plan                                                            |

### Defaults set by this spec, open to change in review

- **iPhone and Android phones only**, portrait only (`ios.supportsTablet:
  false`, `orientation: 'portrait'`). An iPad layout means iPad screenshots and
  review on iPad.
- **English only**, as react is.
- **Minimum OS versions are the SDK's defaults.** Android passkeys need Credential
  Manager with Google Play services; a device without it signs in by emailed
  link.

### Out of scope for version 1

Each item gets its own spec when it is picked up.

- **Push notifications.** Express has no device-token routes or push sender.
- **Checkout, plan changes and pricing.** App Store Review Guidelines 3.1.1 and
  3.1.3, and Google Play's payments policy, restrict selling digital
  subscriptions outside their billing systems.
- **Google sign-in.** Express's flow needs a browser cookie; part 1 refuses it
  in native mode. When it is added, guideline 4.8 also requires an equivalent
  private sign-in option, in practice Sign in with Apple.
- **Biometric app lock, app-switcher snapshot blurring, native crash
  reporting, App Attest and Play Integrity, certificate pinning, jailbreak and
  root detection.** `SECURITY.md` records each as a known gap or a decision.
- **Background JavaScript work**, including background refresh.
- **An on-disk query cache.**

## 1. Stack and layout

### Stack

These versions are from Expo's documentation as read on 3 November 2026 and are
**checked again when the plan is written**: Expo SDK 58, React Native 0.88,
React 19.3. The New Architecture is the only architecture since SDK 55.

| Concern            | Library                                                                 | To verify in the plan                                    |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| Routing            | Expo Router                                                             |                                                          |
| Data and forms     | TanStack Query, TanStack Form, Zustand, Zod, axios (react's versions)   |                                                          |
| Styling            | NativeWind                                                              | v4 (Tailwind 3, stable) or v5 (Tailwind 4, pre-release); react uses Tailwind 4.3.3, so the token port is a translation either way |
| Secrets            | `expo-secure-store`                                                     |                                                          |
| Preferences        | `react-native-mmkv`                                                     | New Architecture support on SDK 58                       |
| Passkeys           | `react-native-passkeys`                                                 | New Architecture support on SDK 58                       |
| Notification stream| `react-native-sse`                                                      | New Architecture support; `Last-Event-ID` on reconnect   |
| Connectivity       | `@react-native-community/netinfo`                                       |                                                          |
| Device model       | `expo-device`; native version from `expo-application`                   |                                                          |
| Analytics, errors  | `posthog-react-native`, `@posthog/core`                                 | session replay under the New Architecture on Android     |
| Lint and format    | Vite+ (`vp`): Oxlint, Oxfmt; ESLint for leftovers                       |                                                          |
| Tests              | Jest through `jest-expo`, `@testing-library/react-native`; Maestro      |                                                          |

A library that fails its check is replaced before work starts, and the plan
names the replacement.

### Layout

```
src/
  app/                    Expo Router routes (section 3)
  core/                   the shared core, byte for byte from react (part 2)
  http/                   client.ts, session.ts (body transport, SecureStore), sse.ts
  ports/                  webauthn.ts, navigation.ts, runtime.ts: the per-app modules the core reads
  observability/          telemetry.ts, report.ts, listen.ts: posthog-react-native versions
  components/             ui/ (NativeWind kit), shared/, features/, layouts/
  copy/                   members-limit.ts, billing.ts: the app's neutral copy (section 6)
  states/                 auth.store (memory only), theme.store, current-tenant.store, passkey-setup.store
tests/unit/               shared tests (run unchanged) and app tests
e2e/                      Maestro flows
```

Where the core lives in react (its own paths, or a `core/` folder) is decided
in part 2's plan; expo mirrors it.

### Sync

- react is the source for every shared file; `scrub.ts` changes in express
  first. react's `ARCHITECTURE.md` "Shared core" table lists each file and
  which apps hold it.
- `pnpm sync:check` compares each shared path with `../react-boilerplate` byte
  for byte and fails the gate on any difference. CI checks out
  `react-boilerplate` at `main`.
- Copy rules are react's: "workspace", never "tenant"; "web address", never
  "slug". `copy-style.test.ts` is shared and also scans `src/components/ui/`
  in expo, since the kit is hand-written here.

## 2. Sessions and sign-in

### Sign-in

- **Express is passwordless.** People sign in with an emailed link or a
  passkey. A new account is created by the first sign-in link it opens
  (`auth.controller.ts`, `isNewUser`).
- The link request sends `app: 'web'`, so the mailed link points at `WEB_URL`
  and opens the app through universal links (part 2, section 6).
- The link screen shows the address the link is for and sends `email` with
  the token, as the web does (express `SECURITY.md`, "Sign-in links"), so an
  attacker's link cannot sign the user in to the attacker's account.
- **A link is single use.** One requested on a phone's browser opens in the
  app if it is installed and is spent there. `README.md` states this.
- Required passkey setup: `PASSKEY_SETUP_REQUIRED` opens the setup screen, as
  `lib/passkey-setup.ts` does on the web.

### Tokens

- **Every request** sends `X-Client: native`, `X-Device-Name` (the
  `expo-device` model name), `traceparent`, and never a cookie.
- **The access token is in memory only**, in `auth.store`, which never gets a
  `persist` middleware.
- **The refresh token is in `expo-secure-store`** with
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Version 1 has no background work, so it is
  read only while the device is unlocked, and it never moves to another
  device.
- The app sends the refresh token in the body on refresh, logout,
  `revoke-others`, step-up verify and every sign-in (part 1, section 1).

### Refresh

- `ensureSession()` is the only caller of `/auth/refresh`. It runs on cold
  start and when `AppState` becomes `active`. Concurrent `401` responses share
  one in-flight refresh (`refresh-core.ts`, shared).
- **The new token is written to SecureStore before `ensureSession()`
  resolves.**
- **On a network error, it retries once at once with the same token**, inside
  express's 10-second reuse grace. Outside the grace a replay revokes the
  session, and the user signs in again; `SECURITY.md` records this as the
  accepted outcome.
- Only an auth verdict signs a user out (`isAuthVerdict`, shared).

### Sign-out and reinstall

- Sign-out deletes the SecureStore entry and clears the query cache first,
  then calls `/auth/logout`, retrying on the next launch if the network
  fails. A failed call never keeps the user signed in on the device.
- **iOS keeps Keychain items after an uninstall.** On launch, if the MMKV
  marker `installed` is missing (MMKV is deleted on uninstall), the app calls
  logout with any stored token, deletes it and writes the marker.
- **Backups:** Android's `dataExtractionRules` and `fullBackupContent` exclude
  both the SecureStore preferences file and MMKV, explicitly. Custom backup
  rules replace the defaults, so SecureStore's default exclusion cannot be
  relied on once MMKV is excluded. A SecureStore read
  that fails to decrypt (some Android devices after a lock-screen change) is
  treated as signed out, not a crash.

### Step-up

Writes that may need a recent sign-in go through `useStepUp().run`. A
`401 REAUTH_REQUIRED` opens "Confirm it's you": a passkey first, an emailed
link to `/auth/confirm` second. It retries once.

## 3. Screens and links

### Route map

react's routes, and what the app does with each:

| react route                                         | App                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `index.tsx`                                         | Root redirect by session                                            |
| `_auth/login.tsx`                                   | `auth/login`                                                        |
| `auth/link.tsx`, `auth/confirm.tsx`                 | `auth/link`, `auth/confirm` (the mailed paths)                      |
| `auth/callback.tsx`                                 | Out (Google)                                                        |
| `register`, `verify-email`, `forgot-password`, `reset-password` | Retired password paths: redirect to `auth/login` with the "sign in with an email link" notice, dropping the search, as react does |
| `welcome.tsx`                                       | `welcome`: create the first workspace. A new account, or one with no workspaces, lands here (react `auth/link.tsx`) |
| `_app/dashboard.tsx`                                | Home tab: the greeting placeholder derived projects fill            |
| `_app/tenants/index.tsx`                            | Workspaces list and create form, from the switcher                  |
| `_app/tenants/$slug.index.tsx`                      | Workspace tab: Overview, with the getting-started checklist and the trial explainer (`onboarding.queries`) |
| `_app/tenants/$slug.insights.tsx`, `$slug.beta.tsx` | Workspace tab, pushed screens; beta behind its flag                 |
| `_app/notifications.tsx`                            | Notifications tab                                                   |
| `_app/settings/index.tsx`                           | Settings tab, grouped as react's `SETTINGS_GROUPS`                  |
| `settings/account.{profile,security,notifications}` | Settings › Account; security lists sessions (part 1) and passkeys   |
| `settings/workspace.$slug.{general,members,activity}` | Settings › Workspace, as on the web                               |
| `settings/workspace.$slug.billing`                  | Settings › Workspace › Plan, read-only (section 6)                  |
| `invitations/accept`, `invitations/confirm`         | Same paths                                                          |
| `pricing.tsx`                                       | Out (store payment rules)                                           |
| Legacy redirects: `profile`, `tenants/$slug.{settings,members,activity}`, `settings/workspace/$slug/index`, `account.index` | Same redirects, because old mailed links use them |
| `$.tsx`                                             | "Page not found", with a button to Home, as react                   |

Plus **Settings › Account › Delete account** (section 6).

The tabs are Home, Workspace, Notifications, Settings. The workspace switcher
sits in the Workspace tab's header.

### Rules carried over from react's `CLAUDE.md`

- **Platform access:** a workspace reached with `access === 'platform'` shows
  the platform-access banner, a read-only Members screen with one line
  pointing staff to the staff console, and the Staff filter and badge in
  Activity.
- **The current workspace** comes from the route's `slug`. The store
  (persisted in MMKV) is only the guard's fallback
  (`resolve-current-tenant.ts`, shared).
- **The workspace gate:** a suspended or unknown workspace shows react's
  `tenant-gate` states.
- **Forms:** TanStack Form with Zod, parse before posting, clear a server
  error when its field changes, and send only changed fields
  (`use-changed-fields`).
- **Copy from the API:** link lifetimes and the support address come from
  `client-settings`, never from written copy. Member-limit and role errors use
  the shared `role-error` and `NOT_SENT_AT_LIMIT` handling with the app's
  neutral copy.
- **Screen titles carry no personal data** (`sent-title.ts`, shared).
- **Consent:** the consent prompt, the same answer and the same default as
  react's `features/consent`.

### Links into the app

- **Universal links (iOS) and verified App Links (Android, `autoVerify`) are
  the only way a token reaches the app.** The custom scheme Expo Router needs
  (`expo-boilerplate://`) accepts no path that carries a token, since any app
  can claim a scheme.
- The paths are the ones express emails: `/auth/link`, `/auth/confirm`,
  `/invitations/accept`, `/invitations/confirm`, `/settings/account/security`,
  `/tenants/:slug`. `/settings/workspace/:slug/billing` opens the website
  (part 2, section 6).
- **Tokens are read once and removed from the router state.** Deep links do not
  pass through the analytics URL sanitizer, which drops tokens; only what is
  sent to analytics is sanitized.
- An unknown path shows "Page not found".

### Talking to the API

- **Base URL:** `EXPO_PUBLIC_API_URL`, per build profile. Only
  `src/http/client.ts` reads it. `API_PREFIX` stays `/api/v1`.
- **Query cache:** `focusManager` follows `AppState`; `onlineManager` follows
  NetInfo. Queries pause offline and a banner says so. Nothing is written to
  disk.
- **Notification stream:** `react-native-sse` with the bearer token in the
  `Authorization` header, open only in the foreground. Express closes it when
  the access token expires; on close or a `401` the app calls
  `ensureSession()` and opens a new stream. A `429 too_many_streams` (5 per
  user per server process, `SSE_MAX_STREAMS_PER_USER`) stops retries until the
  next foreground.

### Behaviour the server controls

- **Maintenance mode:** only a known `Maintenance-Mode` value changes the mode
  (`maintenance-state.ts`, shared). The maintenance screen is imported
  statically into the root layout.
- **Feature flags:** the API is the only evaluator. `$feature/*` properties are
  registered from a layout effect.
- **Forced update:** `minimumAppVersion` from `client-settings` (cached for 5
  minutes) is compared with the store build's version
  (`expo-application` `nativeApplicationVersion`), never the JavaScript
  version. Below it, a full-screen "Update the app" screen links to the store.
- **Blocking screens** (forced update, maintenance, step-up) ignore the Android
  back gesture. `android.predictiveBackGestureEnabled` is set on, and the plan
  tests every screen with it.

### Platform

- **Edge to edge on Android** is required at target SDK 36. Every screen uses
  safe-area insets.
- **Theme:** light, dark or system, through NativeWind and the STYLESEED
  tokens, stored in MMKV and applied before the splash screen hides.
- **Permissions:** the app requests none. The plan removes every unused
  permission from the generated manifests.

## 4. Analytics, errors and privacy

### Analytics

- Only `src/observability/` imports `posthog-react-native`. Its `host` is
  `${EXPO_PUBLIC_API_URL}/api/v1/collect`, express's proxy, which strips
  cookies and the bearer token and needs no browser header.
- `event-registry.ts` and `url-sanitizer.ts` are shared. `guardEvent` and
  `resetKeepingConsent` are app versions with the web versions' tests.
- Screen views come from Expo Router, sanitized. The SDK's screen capture is
  off. `$groups` comes from the route's workspace.
- **Session replay** is off unless a flag turns it on. When on, it records in
  wireframe mode only and is paused on the `auth/*`, `invitations/*` and
  account-security screens.
- **`<Pii>`** wraps a value in `PostHogMaskView`: every rendered person name,
  email address, avatar initial and invitation address.
- **The PII probe** (`pii=probe` on the web) exists only in builds with
  `EXPO_PUBLIC_E2E=1`. It is compiled out of preview and production builds; a
  URL cannot turn it on.

### Error tracking

- PostHog `$exception` events through `@posthog/core`, with the shared
  `scrub.ts` (which removes `refreshToken`, part 1) and the shared throttle.
- Sources: a root error boundary, `ErrorUtils.setGlobalHandler` and unhandled
  promise rejections. An axios error's `config.data` is never attached.
- EAS hooks upload Hermes source maps with `@posthog/cli`, keyed by the
  update ID. The CLI key exists only in CI.

### Store privacy

- **`PrivacyInfo.xcprivacy`** through `ios.privacyManifests`: the
  required-reason APIs React Native and the libraries use (UserDefaults
  `CA92.1`, file timestamp `C617.1`, system boot time `35F9.1`, and whatever
  MMKV declares), and `NSPrivacyCollectedDataTypes` for product interaction,
  crash data and, when on, replay. No tracking domains, no advertising
  identifier, no App Tracking Transparency prompt.
- **App Store privacy labels and the Google Play Data safety form** match the
  manifest. `README.md` holds the answers so each release can check them.
- **A privacy policy link** in Settings, as guideline 5.1.1(i) requires.
- `ITSAppUsesNonExemptEncryption: false` (HTTPS only).

### Device security (expo `SECURITY.md`)

- HTTPS only: no App Transport Security exceptions and
  `usesCleartextTraffic: false`, except in the `development` and `e2e`
  profiles, which reach a local express.
- `babel-plugin-transform-remove-console` strips `console.*` from production
  bundles, and ESLint's `no-console` fails on `console.log` in `src/`.
- `EXPO_PUBLIC_*` values are public. Only the API URL, the PostHog project key
  and the environment name use it.
- **Threat model**, in express's format, with rows for: a stolen unlocked
  phone; a malicious app on the same device; another app claiming the custom
  scheme; backup, restore and reinstall; a network attacker; a copied refresh
  token; whoever can publish an over-the-air update; a tampered binary (out of
  scope).

## 5. Over-the-air updates

- **EAS Update with code signing**, which needs the Expo Production or
  Enterprise plan (<https://docs.expo.dev/eas-update/code-signing/>, read on 3
  November 2026). The private key lives only in a release job behind a
  protected GitHub environment that needs a reviewer. The app refuses an
  unsigned update.
- The Expo account requires two-factor sign-in. CI uses a robot token scoped
  to the project.
- `runtimeVersion` uses the `fingerprint` policy. Its default preset ignores
  the app version, so a release-please version bump alone does not change the
  fingerprint.
- **What may ship over the air:** fixes only. Apple's Developer Program License
  Agreement section 3.3.1(B) and guideline 2.5.2 forbid using downloaded code
  to add features. A release-please release with a `feat:` entry ships as a
  store build.
- **Rollout:** a production update starts at 10% (`--rollout-percentage`) and
  is widened by a person. `eas update:rollback` is the documented rollback.
- On launch the app checks for an update, downloads it in the background and
  applies it on the next cold start.

## 6. Billing and account deletion

### Read-only plan

- Settings › Workspace › Plan shows the plan's name and its limits (members,
  entitlements) from the shared billing logic.
- **No prices, no upgrade button, no link to checkout or the billing portal,
  and no text that asks the user to buy.** The app's copy lives in
  `src/copy/`: for example, "You've used 5 of 5 members on Free." with no
  "Upgrade to add more."
- The app relies on no 3.1.3 exemption; it sells nothing and steers to no
  purchase. A `402` from express shows the app's neutral copy, never the
  server's message.
- `README.md` holds review notes that explain this.

### Account deletion

- Settings › Account › Delete account explains that staff delete the account
  within 30 days, then calls `POST /account/deletion-request` through
  `useStepUp().run`.
- Once requested, the screen shows the request date and the due date from
  `GET /account/deletion-request`.
- The user gets a receipt email, and a confirmation email when it is done
  (part 1, section 5).

## 7. Tooling, tests, CI and releases

### The gate

`pnpm gate`: `pnpm check` (`vp check`, then ESLint with
`eslint-plugin-react-native` and `no-console`, zero warnings), `pnpm
typecheck`, `pnpm lint:docs`, `pnpm knip`, `pnpm sync:check`,
`pnpm expo:doctor`, `pnpm test`. `pnpm push` runs it, then
`git push --no-verify`.

### Unit and component tests

- **Jest through `jest-expo`**, not `vp test`. The `react-native` package ships
  Flow-typed source and needs native-module mocks; `jest-expo` provides both
  and is the runner Expo documents. `CLAUDE.md` records the reason.
- Shared tests run unchanged (part 2, section 5).
- Coverage thresholds are numbers in `jest.config.ts`, starting at react's
  values from `vitest.config.ts` when the plan is written.

### Accessibility

- Every pressable has `accessibilityRole` and a label. Each screen has one
  title with the `header` role.
- Text scales with the system font size up to 200% without clipping.
- Touch targets are at least 44 by 44 points on iOS and 48 by 48
  density-independent pixels on Android.
- `tests/unit/a11y/` renders every screen and fails on a pressable without a
  role or label (`@testing-library/react-native` role queries).
- A contrast test checks the NativeWind tokens.

### The design lock

`STYLESEED.md` in expo holds a token table generated from react's
`globals.css`. A test fails if the NativeWind config's values differ from it,
and lint bans raw palette classes and colour literals. react's `ui:drift`
does not apply, because it checks shadcn's registry.

### End-to-end tests (Maestro)

- **An `e2e` build profile:** a separate bundle ID, `http` allowed, the PII
  probe compiled in, pointed at `10.0.2.2` (Android emulator) or `localhost`
  (iOS simulator).
- **Flows:**
  - sign in with an emailed link, opened with `adb shell am start` or
    `xcrun simctl openurl` (verified links cannot verify against a local
    host);
  - the session surviving a cold start;
  - creating a first workspace;
  - switching workspace;
  - accepting an invitation from a link;
  - the forced-update screen;
  - the maintenance screen;
  - the PII probe.
- **Where they run:**
  - Android: on every pull request, on an ubuntu runner with KVM, an emulator
    action, and Postgres and Redis service containers for express. The APK is
    built locally on the runner.
  - iOS: nightly, on a macOS runner, with a simulator build made locally.
    GitHub bills macOS runner minutes at 10 times the Linux rate (GitHub
    Actions billing documentation).
- **Passkeys are not tested end to end**, because simulators cannot complete a
  real ceremony. Component tests mock the `webauthn` port, and `README.md`
  holds a manual checklist for a release build on one iPhone and one Android
  phone.

### CI

- `ci.yml`: check, typecheck, knip, sync check, sharded Jest with merged
  coverage, `expo export` with a bundle-size budget, Android Maestro,
  `pnpm audit --prod --audit-level moderate`.
- `e2e-nightly.yml`: iOS Maestro.
- `pr-title.yml`, `gitleaks.yml`: as in react.
- Renovate: react's schedule. Expo SDK, `react-native` and
  `posthog-react-native` minors and majors wait for a person and are upgraded
  together with `expo install --fix`.

### Build profiles and credentials

| Profile       | Bundle ID / package suffix | API          | Updates channel | Distribution          |
| ------------- | -------------------------- | ------------ | --------------- | --------------------- |
| `development` | `.dev`                     | local        | none            | dev client            |
| `e2e`         | `.e2e`                     | local        | none            | CI only               |
| `preview`     | `.preview`                 | staging      | `preview`       | internal testers      |
| `production`  | none                       | production   | `production`    | App Store, Google Play |

- Each profile has its own app icon badge so they can be told apart.
- Each profile's app ID is in `IOS_APP_IDS` and `ANDROID_APP_LINKS` (part 2)
  and, for Android passkeys, its signing hash is in that environment's
  `WEBAUTHN_ANDROID_ORIGINS` (part 1).
- `eas.json` sets `cli.appVersionSource: "remote"` so `autoIncrement` works.
- EAS holds the iOS credentials and the Android upload keystore. Google Play
  App Signing holds the app-signing key. The Play service-account key for
  `eas submit` is an EAS secret. `README.md` names who owns each.

### Releases

- release-please on `main` sets the app version; `app.config.ts` reads it from
  `package.json`.
- On a release, CI runs `eas fingerprint:compare` against the last production
  build:
  - unchanged fingerprint and no `feat:` entry: a signed `eas update` to
    `production` at 10%;
  - otherwise: `eas build --profile production` for both platforms, then
    `eas submit` to TestFlight and the Play internal track. A person promotes
    the build.
- Each push to `main` publishes a signed update to `preview`.

### First store submission

- **Google Play's first upload is manual** in Play Console; `eas submit` works
  after that. A new personal developer account must run a closed test with 12
  testers for 14 days first (Play Console Help, to confirm for this account's
  type).
- **App review access:** a review address on a shared inbox the team watches,
  on the production API, with a seeded workspace and members. During review the
  team sends the sign-in link when the reviewer requests it. The review notes
  in App Store Connect and Play Console say so, and explain the emailed-link
  sign-in and the read-only billing.
- Store listing assets: the icon (with Android adaptive and monochrome
  layers), the splash screen, and phone screenshots.

## Success criteria

1. On a release build on an iPhone and an Android phone, a customer can:
   - sign in with an emailed link and with a passkey;
   - stay signed in across a cold start;
   - create a first workspace and switch workspace;
   - accept an invitation from an email;
   - manage members, read activity and insights, and read the plan;
   - request account deletion;
   - sign out.
2. After an uninstall and reinstall on iOS, the app opens signed out and the
   previous session is revoked.
3. `pnpm gate` passes with 0 errors and 0 warnings, and `pnpm sync:check`
   reports no differences from `react-boilerplate`.
4. The Android Maestro suite passes on a pull request, and the iOS suite passes
   in the nightly run.
5. An unsigned update is refused by a preview build, a signed fix-only release
   reaches it through EAS Update, and a `feat:` release produces a store build
   instead.

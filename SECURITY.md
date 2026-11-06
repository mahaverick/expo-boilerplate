# Security

This file is for developers and reviewers of the mobile client. It says what
the app defends against, how, and where the defences stop. It describes the
build as of 6 November 2026: the foundation, with no sign-in screens and no
token storage yet. Where a defence belongs to a later plan, the row says so.

The API it talks to, express-boilerplate, owns these, and its own
`SECURITY.md` covers them:

- every authorization decision;
- the refresh token's rotation and reuse grace;
- rate limits;
- the proxy that carries analytics to PostHog.

## Threat model for a mobile client

The app is a bundle of JavaScript that runs on a phone its owner controls.
Whoever holds the phone, or can unpack the app package, can read anything in
the bundle. So:

- **The app enforces nothing.** A hidden button or a route guard is
  presentation. The API refuses what the user may not do.
- **`EXPO_PUBLIC_*` values are public.** Expo inlines them into the bundle.
  Only the API's origin uses one today (`EXPO_PUBLIC_API_URL`). A secret never
  goes in one.
- **Credentials leave the phone only towards the API**, in a header or the
  request body, never in a URL.
- **Production bundles drop every `console` call**
  (`babel-plugin-transform-remove-console`), and ESLint's `no-console` fails on
  a call in `src/` outside the shared files.

| Threat                                     | Defence                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Where it stops                                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A stolen, unlocked phone                   | The access token lives in memory only: `auth.store` has no `persist` middleware. The design stores the refresh token in `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.                                                                                                                                                                                                                                                                                                  | Someone with an unlocked phone is the user. The app has no app lock in version 1. The SecureStore write is not built yet.                                |
| A malicious app on the same device         | The sandbox keeps other apps from reading this app's files. The design keeps secrets in SecureStore, not in MMKV.                                                                                                                                                                                                                                                                                                                                                                   | A rooted or jailbroken device defeats the sandbox. The app does not detect one.                                                                          |
| Another app claiming the custom scheme     | The scheme (`expo-boilerplate://`) is for navigation only. The design accepts a token only through universal links (iOS) and verified App Links (Android), which an app cannot claim.                                                                                                                                                                                                                                                                                               | The deep-link handling is not built yet. Until it is, the app handles no token from any link.                                                            |
| Backup, restore and reinstall              | The design excludes SecureStore's preferences file and MMKV from Android backups explicitly, and revokes a session left in the iOS Keychain after a reinstall. MMKV holds the theme and nothing secret.                                                                                                                                                                                                                                                                             | Neither is built yet. Today the app stores one MMKV value, the theme, and no secret.                                                                     |
| A network attacker                         | On iOS, App Transport Security (ATS) sets `NSAllowsArbitraryLoads: false` and `NSAllowsLocalNetworking: true`, so plain HTTP reaches only local hosts such as `localhost`. On Android, only debug builds allow cleartext: the template's debug manifests set `usesCleartextTraffic`, and release builds, which target SDK 28 or later, refuse it. Every request goes to `EXPO_PUBLIC_API_URL`, and only requests to that origin under `/api/v1` carry the client and trace headers. | The app does not pin certificates. A device that trusts a hostile certificate authority exposes its traffic.                                             |
| A copied refresh token                     | The design sends the token in the request body, never in a header or URL, and relies on express's rotation: a replay outside the 10-second reuse grace revokes the session.                                                                                                                                                                                                                                                                                                         | A token read from a compromised device works until it rotates. The transport is not built yet: `ensureSession` rejects, so the app is always signed out. |
| Whoever can publish an over-the-air update | The design uses EAS Update with code signing, a private key held only in a protected release job, and fixes-only updates.                                                                                                                                                                                                                                                                                                                                                           | Not built yet: the app has no `eas.json` and no update channel. Anyone who holds the signing key can ship code to every install.                         |
| A tampered binary                          | None.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Out of scope for version 1. App Attest, Play Integrity and root detection are not in the app.                                                            |

## The shared core and the stubs

- **The shared files are react's.** Their security rules (the scrubber's
  patterns, the auth verdict, the single-flight refresh) are react's, tested
  in react and copied byte for byte. A change goes to react first
  ([CLAUDE.md](CLAUDE.md#the-shared-core)).
- **`webauthn` is a stub.** `isSupported` resolves `{ create: false, autofill:
  false }`, and `get` and `create` reject, so no passkey ceremony runs.
- **Analytics is a stub.** `track` does nothing and no request carries an
  analytics session, so no event leaves the app.
- **`src/http/client.ts` is the only reader of `EXPO_PUBLIC_API_URL`.** A
  request to any other origin carries neither `X-Client` nor `X-Device-Name`.
- **The bearer token stays on the API through an expo guard.** The shared
  token interceptor sets `Authorization` on every request through
  `apiClient`. `src/http/client.ts` registers a guard that runs after it and
  removes `Authorization` from any request that is not to the API's origin
  under `/api/v1`. Because the shared 401 branch signs out only a request that
  carries `Authorization`, a 401 from another origin does not sign the user
  out. The root fix is a react change to the shared interceptor
  ([CLAUDE.md](CLAUDE.md#follow-ups)).

## Known gaps

This section lists what the defences above do not cover in version 1.

- **The polyfills are not yet checked on a device.** `src/polyfills.ts`
  installs `crypto.getRandomValues`, `URL` and four `Intl` APIs
  ([ARCHITECTURE.md](ARCHITECTURE.md#polyfills)). Jest proves the order and the
  guards, and `pnpm export` proves Metro bundles them. No iOS or Android
  device has run them. If `crypto.getRandomValues` is missing, the first
  request fails when it builds its `traceparent`. The README's device checklist
  closes the gap.
- **The splash screen and the stored theme are not checked on a device.** The
  Jest test models NativeWind's appearance event. The 2-second fallback means
  a lost event costs at most one frame in the wrong theme, never a hung
  splash screen.
- **The React Compiler has not run on a device.** `reactCompiler: true`
  bundles for both platforms in `pnpm export`.
- **No session transport.** The app stores no refresh token, so every session
  restore ends in `NoRefreshTokenError` and the app counts as signed out.
- **No app lock, and no snapshot blur.** The app switcher shows the last
  screen.
- **No certificate pinning.**
- **No jailbreak or root detection.**
- **No App Attest or Play Integrity.** The API cannot tell the app from a
  script that sends the same headers.
- **No native crash reporting.** JavaScript errors are the only ones the
  design reports.
- **Dark-theme contrast.** React's dark `destructive-foreground` on
  `destructive` measures 2.53:1, below WCAG's 4.5:1. It is an accessibility
  gap, not a security one, and [CLAUDE.md](CLAUDE.md#follow-ups) tracks it.

## Out of scope for version 1

The spec lists these (section 1, "Out of scope for version 1"). Each gets its
own spec when it is picked up.

- **Push notifications.** Express has no device-token routes or push sender.
- **Checkout, plan changes and pricing.** App Store Review Guidelines 3.1.1 and
  3.1.3, and Google Play's payments policy, restrict selling digital
  subscriptions outside their billing systems.
- **Google sign-in.** Express's flow needs a browser cookie, and the API
  refuses it in native mode. Adding it also requires an equivalent private
  sign-in option under guideline 4.8, in practice Sign in with Apple.
- **Biometric app lock, app-switcher snapshot blurring, native crash
  reporting, App Attest and Play Integrity, certificate pinning, and jailbreak
  and root detection.** This file records each as a known gap above.
- **Background JavaScript work**, including background refresh.
- **An on-disk query cache.**

## Reporting a vulnerability

Report a security problem privately through GitHub's private vulnerability
reporting on this repository: the **Security** tab, then **Report a
vulnerability**. Do not open a public issue for a security problem.

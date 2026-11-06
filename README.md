# Expo Boilerplate

Expo Boilerplate is the starting point for the Mahaverick Labs mobile app: an
Expo SDK 58 and TypeScript app for iOS and Android that talks to the
`express-boilerplate` API and shares its core logic with `react-boilerplate`.
This file is for a developer who runs, tests or checks the app.

As of 6 November 2026 the app signs a person in with an emailed link and keeps
the session in the device's secure storage. It has four screens: sign-in
(`/login`), the link landing (`/auth/link`), Home (`/`, with Sign out) and a
blocking screen for an account that must add a passkey
(`/passkey-required`). It also holds the shared core copied from react, a
stored light, dark or system theme, and the gate and CI that hold them.
Workspaces and the other screens are in
[the spec](docs/superpowers/specs/2026-11-03-expo-boilerplate-design.md) and
arrive in later plans.

| Concern | Choice                                                        |
| ------- | ------------------------------------------------------------- |
| Runtime | Expo SDK 58, React Native 0.88.1 (Hermes), React 19.3         |
| Routing | Expo Router, file-based from `src/app/`                       |
| Data    | TanStack Query, axios, TanStack Form with Zod 4, Zustand      |
| Styling | NativeWind 4 on Tailwind 3, react's STYLESEED tokens          |
| Storage | `react-native-mmkv` (the theme), `expo-secure-store` (tokens) |
| Tests   | Jest 30 through `jest-expo`, React Native Testing Library     |

Other docs:

- [ARCHITECTURE.md](ARCHITECTURE.md): how the code is organised, and why.
- [SECURITY.md](SECURITY.md): the threat model and the known gaps.
- [CLAUDE.md](CLAUDE.md): the rules for changing code.
- [STYLESEED.md](STYLESEED.md): the design tokens.

## Prerequisites

- **Node 26 or later, and pnpm at the version `packageManager` in
  `package.json` names.** `pnpm install` refuses an older Node. Node 25 and
  later ship no Corepack, so install it yourself, and pnpm then comes from
  `packageManager`:

  ```bash
  npm i -g corepack@0.36.0 && corepack enable
  ```

- **A react-boilerplate checkout** at `../react-boilerplate`, or any path in
  `REACT_BOILERPLATE_DIR`. `pnpm sync:check` and `pnpm styleseed` read it.
- **An express-boilerplate API**, for the checklist's request. It listens on
  port 4040 by default.
- **A native toolchain**, as [Set up a dev client](#set-up-a-dev-client) says.

## Set up a dev client

The app uses native modules (`react-native-mmkv` and its Nitro modules), so
Expo Go cannot run it. A dev client is a debug build of this app that loads
JavaScript from Metro.

```bash
pnpm install
```

Pick the path that matches your machine.

### With a Mac

- **iOS simulator or iPhone:** install Xcode, then run `npx expo run:ios`. Add
  `--device` to install on a connected iPhone.
- **Android emulator or phone:** install Android Studio with a JDK, create an
  emulator or enable USB debugging on a phone, then run `npx expo run:android`.

Each command generates the git-ignored `ios/` or `android/` folder, builds the
dev client, installs it and starts Metro. Later runs start Metro alone with
`pnpm start`.

### Without a Mac

- **Android** builds on Linux and Windows too: the same Android Studio steps
  and `npx expo run:android`.
- **iOS** needs Xcode to build locally, so build in the cloud with EAS Build:
  create an Expo account, install the EAS command-line tool
  (`npm i -g eas-cli`), and join the Apple Developer Program, which installing
  on a physical iPhone requires. This repository has no `eas.json` yet, so run
  `eas build:configure` first, add a `development` profile with
  `developmentClient: true` and `distribution: internal`, then
  `eas build --profile development --platform ios`. Install the build on your
  iPhone from the link EAS prints, then run `pnpm start` and open the app.
  There is no iOS simulator without a Mac.

## Run-time configuration

| Variable              | Used by              | Meaning                                                                                |
| --------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL` | `src/http/client.ts` | The API's origin, with no path: `http://localhost:4040`. The client appends `/api/v1`. |
| `APP_LINK_HOST`       | `app.config.ts`      | The web app's bare hostname, such as `app.example.com`. Build time only.               |

- **Expo inlines it into the bundle when Metro builds.** Change it, then run
  `pnpm start --clear`. It is public: never put a secret in an `EXPO_PUBLIC_*`
  variable.
- **Set it in `.env.local`**, which git ignores:

  ```bash
  EXPO_PUBLIC_API_URL=http://localhost:4040
  ```

- **Choose the host by where the app runs.** The iOS simulator reaches your
  machine at `localhost`. The Android emulator reaches it at `10.0.2.2`. A
  physical phone needs your machine's address on the Wi-Fi network, and a
  firewall that admits port 4040.
- **An `http://` origin works for dev clients only.** A release build needs an
  `https://` API URL.
  - Android allows cleartext only in debug builds, whose manifests set
    `usesCleartextTraffic`. A release build refuses `http://10.0.2.2:4040`.
  - iOS App Transport Security allows plain HTTP only to local hosts, in every
    build. On a phone, `localhost` is the phone itself, so
    `http://localhost:4040` reaches your machine only from the simulator.
- **Unset, the base URL is relative.** No request then counts as an API request,
  so none carries the client headers. The tests set it to
  `https://api.example.test`.

### App links

A mailed link opens in the app when the app is installed, and in the browser
when it is not. A sign-in link works once: the first screen that posts its
token uses it up, so a second open shows the dead-link state.

- **`APP_LINK_HOST` turns app links on.** Set it when you build, as a bare
  hostname with no scheme, port or path (`APP_LINK_HOST=app.example.com`).
  It is not `EXPO_PUBLIC_*`, so the bundle does not carry it. `app.config.ts`
  uses it for the iOS associated domains (`applinks:` and `webcredentials:`),
  the Android intent filter with `autoVerify`, and `extra.webUrl`
  (`https://<host>`), which the passkey screen opens in an in-app browser
  (`expo-web-browser`). A value that is not a bare hostname fails the build.
- **Android claims only `/auth/link` and `/tenants/`.** They are the paths with a screen. A
  verified link to any other path would open the app on Page not found, so
  each later plan adds its paths with its screens. iOS claims the paths in
  the web app's association file, so a link to a path with no screen there
  opens the app too, until that plan ships.
- **Unset, the app has no app links.** The custom scheme
  (`expo-boilerplate://`) still opens the app, but `src/app/+native-intent.tsx`
  drops its query and fragment, so a token never arrives that way. The
  passkey screen then shows no "Open the website" button.
- **The web app must serve the association files** for the same host. React's
  `docker/15-app-links.sh` lists the paths.

## Scripts

| Script               | What it does                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm start`         | `expo start --dev-client`: Metro for the installed dev client                                                                                             |
| `pnpm check`         | The static gate: `pnpm typegen`, `vp check` (Oxfmt, then Oxlint with type-aware rules), then ESLint at zero warnings                                      |
| `pnpm typecheck`     | `pnpm typegen`, then `tsc --noEmit`                                                                                                                       |
| `pnpm typegen`       | `expo customize tsconfig.json`, which writes the typed routes; fails if `.expo/types/router.d.ts` is missing                                              |
| `pnpm test`          | Jest through `jest-expo`, with no coverage thresholds                                                                                                     |
| `pnpm test:coverage` | Jest with coverage; fails below the thresholds in `jest.config.ts`                                                                                        |
| `pnpm lint:docs`     | History phrasing and broken links in markdown and config comments. CI runs it                                                                             |
| `pnpm sync:check`    | `shared-core.json` and every expo row in it are react's copies, byte for byte. Without a react checkout it warns and passes, and under `CI=true` it fails |
| `pnpm styleseed`     | Prints the token table generated from react's `globals.css`; `--write` rewrites `STYLESEED.md`                                                            |
| `pnpm expo:doctor`   | `expo-doctor`: the SDK's version and configuration checks                                                                                                 |
| `pnpm export`        | A Hermes bundle for iOS and one for Android, into `dist/`                                                                                                 |
| `pnpm gate`          | Every check above in order: check, typecheck, lint:docs, sync:check, knip, expo:doctor, test:coverage, export                                             |
| `pnpm push [args]`   | `pnpm gate`, then `git push --no-verify` with the arguments                                                                                               |
| `pnpm knip`          | Unused files, exports and dependencies. It runs knip's binary, so `package.json` has no `knip` script (CLAUDE.md says why)                                |

Run the gate against react with:

```bash
REACT_BOILERPLATE_DIR=../react-boilerplate pnpm gate
```

`pnpm install` runs `prepare`, which points git at the hooks in `.vite-hooks/`.
`pre-commit` checks the lockfile and formats and lints staged files. Commit
messages follow Conventional Commits, and commits are GPG-signed.

## Testing

- **Unit tests** live in `tests/unit/` and run under Jest. The shared tests are
  react's, unchanged; expo's own cover the ports, the polyfills, the entry
  order, the theme, the root layout, the tokens, the session modules, the
  screens, the UI kit and the accessibility harness.
- **The coverage thresholds** are statements 58, branches 57, functions 44 and
  lines 57. They sit below react's until more shared tests run here
  ([CLAUDE.md](CLAUDE.md#follow-ups)).
- **One copy-style case is skipped by name**, for the reason CLAUDE.md gives.

## Device checklist

The tests run on Node. These checks need a dev client on one iPhone and one
Android phone (or an emulator), and nobody has run them yet. Record the
date, the device and the OS version beside each.

- [ ] **The app opens.** The splash screen hides once the theme is reported and
      the session restore has settled. A signed-out phone shows the sign-in
      screen on the theme's background.
- [ ] **The theme follows the system.** With the preference at `system`
      (the default), switch the phone between light and dark in its settings. The
      background changes with it.
- [ ] **A stored dark theme shows no light frame.** Set the preference to
      `dark` through `useThemeStore.getState().setPreference('dark')` from a
      temporary call in `src/app/(app)/(tabs)/index.tsx`, force-quit, and reopen with the
      phone in light mode. Remove the call afterwards. The splash screen hides
      within 2 seconds, and a slow device may show one light frame first.
- [ ] **The polyfills work.** In the dev client's console, `new
  URL('https://a.test/x?y=1').searchParams.get('y')` returns `"1"`,
      `new Intl.RelativeTimeFormat('en').format(-1, 'day')` returns
      `"1 day ago"`, and `new Intl.PluralRules('en').select(1)` returns `"one"`.
- [ ] **The other `Intl` APIs the shared files use work.** In the same
      console, `new Intl.DateTimeFormat('en', { dateStyle: 'medium'
      }).format(0)` returns a date, and `new Intl.DateTimeFormat('en', {
      timeZoneName: 'short', hour: 'numeric' }).format(0)` ends in a zone name
      (`src/lib/format.ts`). `new Intl.DateTimeFormat('en', { timeZone:
      'Not/AZone' })` throws a `RangeError` (`src/schemas/tenant.schemas.ts`).
      `new Intl.NumberFormat('en-IN').format(1234567)` returns `"12,34,567"`
      (`src/lib/billing-format.ts`).
- [ ] **One request carries `traceparent`.** This proves
      `crypto.getRandomValues`. Send one request through `apiClient` from a
      temporary call in `src/app/(app)/(tabs)/index.tsx`, with the API running and
      `EXPO_PUBLIC_API_URL` set. Read the request's headers in the API's log or in
      React Native DevTools. `traceparent` is present, and so are `X-Client:
  native` and `X-Device-Name`. Remove the call afterwards.
- [ ] **Sign-in works end to end.** Request a link on the sign-in screen, open
      the mailed link, and land on Home. Force-quit and reopen: Home shows
      without a new link. Tap Sign out: the sign-in screen shows, and the API
      has revoked the session.
- [ ] **SecureStore survives a lock-screen change.** Signed in, change the
      phone's passcode or biometrics, or remove and set the screen lock, then
      reopen the app. Record whether the session survives. A value that can no
      longer be decrypted is dropped, and the app then counts as signed out.
- [ ] **A locked phone keeps the session.** Signed in, send the app to the
      background, lock the phone, then unlock it and return to the app, which
      refreshes on that return. It is still signed in. Record any error code a
      read returns; the app deletes a value only on `ERR_DECRYPT`.
- [ ] **A reinstall signs out on iOS.** Signed in, delete the app and install
      it again. The first launch shows the sign-in screen, because the
      previous install's Keychain item is dropped and queued for revoke.
- [ ] **"Open the website" stays in the browser on Android.** Build with
      `APP_LINK_HOST` set, sign in to an account in passkey-required mode, and
      tap Open the website. The security page opens in the in-app browser,
      not back in the app.
- [ ] **Both kinds of app link open in the app.** Build with `APP_LINK_HOST`
      set to a host whose association files are live. Open a mailed
      `https://<host>/auth/link?...` link from the mail app: it opens in the
      app, not the browser. Open `expo-boilerplate://auth/link?token=x`: the
      app opens on Home or the sign-in screen and ignores the token.
- [ ] **Android backup leaves the app signed out.** Signed in, run
      `adb shell bmgr backupnow com.mahaverick.expoboilerplate`, uninstall,
      reinstall to restore, and open the app. It shows the sign-in screen. If it
      does not, the backup rules do not match SecureStore's preferences file
      ([SECURITY.md](SECURITY.md#known-gaps)).
- [ ] **200% font size fits on every screen.** Set the system font size to its
      largest on both platforms. On the sign-in, link, Home and passkey screens,
      every control is reachable by scrolling, and no text is cut off.
- [ ] **The back gesture does nothing on the passkey screen.** With an account
      in passkey-required mode, swipe back on iOS and press Back on Android.
      The screen stays.

## Reporting a problem

Report a security problem as [SECURITY.md](SECURITY.md#reporting-a-vulnerability)
says. Open an issue for anything else.

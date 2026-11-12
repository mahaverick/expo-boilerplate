# Expo Boilerplate

Expo Boilerplate is the starting point for the Mahaverick Labs mobile app: an
Expo SDK 58 and TypeScript app for iOS and Android that talks to the
`express-boilerplate` API and shares its core logic with `react-boilerplate`.
This file is for a developer who runs, tests or checks the app.

As of 8 November 2026 the app signs a person in with an emailed link and keeps
the session in the device's secure storage. A signed-in person sees four tabs:
Home, Workspace (the current workspace's overview), Notifications (a live list
with an unread badge) and Settings. Settings opens Profile, Security (sign-in
methods, signed-in devices and "Sign out other devices"), notification
preferences, Privacy (the usage analytics switch and the privacy policy link)
and Delete account, shows each workspace's plan read-only, and holds Sign out.
An action that needs a recent sign-in asks the person to confirm it by an
emailed link. The app also lists and creates workspaces (`/tenants`,
`/welcome`), shows a full-screen notice for an update or for maintenance, and
has a blocking screen for an account that must add a passkey
(`/passkey-required`). It holds the shared core copied from react, a stored
light, dark or system theme, and the gate and CI that hold them. The remaining
screens are in
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

- **iOS simulator or iPhone:** install Xcode, then run
  `APP_VARIANT=development npx expo run:ios`. Add `--device` to install on a
  connected iPhone.
- **Android emulator or phone:** install Android Studio with a JDK, create an
  emulator or enable USB debugging on a phone, then run
  `APP_VARIANT=development npx expo run:android`.

Each command generates the git-ignored `ios/` or `android/` folder, builds the
dev client, installs it and starts Metro. Later runs start Metro alone with
`pnpm start`.

`APP_VARIANT=development` gives the dev client its own app ID
(`com.mahaverick.expoboilerplate.dev`), the name "expo-boilerplate Dev" and
plain HTTP to a local API. Without it the config is the production variant's:
the production app ID, and HTTPS only
([The build variants](#the-build-variants)). After a change of variant, delete
`ios/` and `android/` so the next run generates them again.

### Without a Mac

- **Android** builds on Linux and Windows too: the same Android Studio steps
  and `APP_VARIANT=development npx expo run:android`.
- **iOS** needs Xcode to build locally, so build in the cloud with EAS Build.
  It needs the Expo project from [Release setup](#release-setup) steps 1 and
  2, the EAS command-line tool at 27.5.0 or later
  (`npm i -g eas-cli@27.5.0`), and the Apple Developer Program, which
  installing on a physical iPhone requires. Run
  `EAS_PROJECT_ID=<the project ID> eas build --profile development --platform ios`.
  Install the build on your iPhone from the link EAS prints, then run
  `pnpm start` and open the app. There is no iOS simulator without a Mac.

## Run-time configuration

| Variable                  | Used by                                 | Meaning                                                                                                           |
| ------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`     | `src/http/client.ts`                    | The API's origin, with no path: `http://localhost:4040`. The client appends `/api/v1`.                            |
| `APP_LINK_HOST`           | `app.config.ts`                         | The web app's bare hostname, such as `app.example.com`. Build time only.                                          |
| `IOS_APP_STORE_ID`        | `app.config.ts`                         | The app's numeric App Store ID, such as `1234567890`. Build time only.                                            |
| `EXPO_PUBLIC_POSTHOG_KEY` | `src/observability/telemetry/config.ts` | The PostHog project key. Unset, analytics and exception reporting are inert and make no request.                  |
| `EXPO_PUBLIC_APP_ENV`     | `src/observability/telemetry/config.ts` | The environment name that every event and exception carries, such as `production`. Unset, it reads `development`. |
| `PRIVACY_POLICY_URL`      | `app.config.ts`                         | The privacy policy's https address. Build time only. Each store build must set it.                                |
| `APP_VARIANT`             | `app.config.ts`                         | `development`, `e2e`, `preview` or `production`. Unset, it reads `production`. Each `eas.json` profile sets it.   |
| `EAS_PROJECT_ID`          | `app.config.ts`                         | The EAS project's ID, a lowercase UUID. Build time only. Unset, updates are off.                                  |

- **A cloud build reads these from its EAS environment**, not from
  `.env.local`. [Release setup](#release-setup) says which environment holds
  which value. `APP_VARIANT` is the exception: `eas.json` sets it per profile.
- **Expo inlines each `EXPO_PUBLIC_*` value into the bundle when Metro
  builds.** Change one, then run `pnpm start --clear`. They are public: never
  put a secret in an `EXPO_PUBLIC_*` variable.
- **Set them in `.env.local`**, which git ignores:

  ```bash
  EXPO_PUBLIC_API_URL=http://localhost:4040
  ```

- **Choose the host by where the app runs.** The iOS simulator reaches your
  machine at `localhost`. The Android emulator reaches it at `10.0.2.2`. A
  physical phone needs your machine's address on the Wi-Fi network, and a
  firewall that admits port 4040.
- **An `http://` origin works in the development and e2e variants only.** A
  preview or production build needs an `https://` API URL.
  - Android allows cleartext in the development and e2e variants
    (`usesCleartextTraffic: true` through `expo-build-properties`). Preview
    and production set it to false and refuse `http://10.0.2.2:4040`.
  - iOS App Transport Security (ATS) allows plain HTTP to local hosts in the
    development and e2e variants (`NSAllowsLocalNetworking`), and to no host
    in preview and production. On a phone, `localhost` is the phone itself,
    so `http://localhost:4040` reaches your machine only from the simulator.
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
- **Android claims only `/auth/link`, `/tenants/`, `/auth/confirm`,
  `/settings/account/security`, `/invitations/accept` and
  `/invitations/confirm`.** They are the paths with a screen. A verified link
  to any other path would open the app on Page not found, so each later plan
  adds its paths with its screens. `/settings/workspace/…` is not claimed,
  because the web app's association file does not list it. iOS claims the
  paths in that file, so a link to a path with no screen there opens the app
  too, until that plan ships.
- **Unset, the app has no app links.** The custom scheme
  (`expo-boilerplate://`) still opens the app, but `src/app/+native-intent.tsx`
  drops its query and fragment in every variant but `e2e`, so a token never
  arrives that way. The
  passkey screen then shows no "Open the website" button.
- **The web app must serve the association files** for the same host. React's
  `docker/15-app-links.sh` lists the paths.

### Analytics, exception reports and the privacy policy

Events and exception reports go to PostHog through the API's collect proxy
(`<EXPO_PUBLIC_API_URL>/api/v1/collect`). The app holds no PostHog host.

- **`EXPO_PUBLIC_POSTHOG_KEY` turns them on.** It is the project key, which is
  public by design. With no key the app sends no event and no report, and the
  Privacy screen hides the "Share usage analytics" switch.
- **A signed-in person has analytics on until they turn it off** in Settings,
  Account, Privacy. The choice is stored on the profile (`analyticsOptOut`).
  Exception reports send whatever the choice, anonymous unless the person is
  identified and sharing.
- **`PRIVACY_POLICY_URL` shows the policy link.** `app.config.ts` reads it at
  build time, as an https address, into `extra.privacyPolicyUrl`; any other
  value fails the build. Each store build must set it. The Privacy row hides
  when the build has neither a key nor a policy address.

### The store answers

These answers describe what the app sends as of 8 November 2026, and match the
privacy manifest in `app.config.ts` (`ios.privacyManifests`). The app does not
track people across other companies' apps or websites.

| Data                | App Store privacy label                                            | Google Play Data safety                                                        |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Product interaction | Collected. Linked to the person. Used for analytics.               | App activity, "App interactions". Collected. Used for analytics. Optional.     |
| User ID             | Collected. Linked to the person. Used for analytics.               | "User IDs" under personal info. Collected. Used for analytics. Optional.       |
| Crash data          | Collected. Linked to the person. Used for app functionality.       | App info and performance, "Crash logs". Collected. Used for app functionality. |
| Tracking            | No. `NSPrivacyTracking` is false and no tracking domain is listed. | Nothing is shared with third parties for their own purposes.                   |

- **Product interaction** is the screens the person opens and the actions they
  take, with names and email addresses masked. **User ID** is the API's user
  id. Both stop when the person turns "Share usage analytics" off. Google
  Play's "Optional" means the person can turn the collection off.
- **Crash data** is an exception report: the scrubbed error text, the stack
  frames, the app version and build, the route pattern and the environment. It
  names the person (their user id) only when they are identified and sharing
  analytics, so crash data is declared as linked. Otherwise it is anonymous,
  and a crash saved for the next launch always is.
- **Location is not collected.** Express's collect proxy forwards the
  client's IP address, which PostHog would resolve to a city and a country.
  The app sets `$geoip_disable` on every event and every exception report, so
  PostHog adds no location, and neither store answer declares one. The
  PostHog project should also have "Discard client IP data" on, which is the
  project owner's setting.
- **PostHog processes the data for the app.** On Google Play, mark the data as
  encrypted in transit (HTTPS), and declare the account deletion path (Settings,
  Account, Delete account).
- **Encryption.** `ITSAppUsesNonExemptEncryption` is false, because the app uses
  only the operating system's HTTPS.

### The store link

When the installed build is older than the API's `minimumAppVersion`, the
update screen offers a button to the store.

- **`IOS_APP_STORE_ID` sets the iOS link**, `itms-apps://apps.apple.com/app/id{id}`.
  It is digits only, and any other value fails the build. With no ID the iOS
  update screen has no button.
- **Android needs no variable.** It opens `market://details?id={package}`, with
  the package from `app.config.ts`.

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
| `pnpm bundle:size`   | Fails when either Hermes bundle in `dist/` is over its budget, 7,500,000 bytes each (`scripts/check-bundle-size.mjs`). Run it after `pnpm export`         |
| `pnpm gate`          | Every check above in order: check, typecheck, lint:docs, sync:check, knip, expo:doctor, test:coverage, export, bundle:size                                |
| `pnpm push [args]`   | `pnpm gate`, then `git push --no-verify` with the arguments                                                                                               |
| `pnpm knip`          | Unused files, exports and dependencies. It runs knip's binary, so `package.json` has no `knip` script (CLAUDE.md says why)                                |

`package.json` also holds two scripts that EAS Build runs and nobody runs by
hand. `eas-build-post-install` installs the checked PostHog command-line tool
and prepares the iOS source map. `eas-build-on-success` uploads the build's
source map. Both skip without `POSTHOG_CLI_API_KEY`
([Source maps](#source-maps)).

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
- **The coverage thresholds** are statements 92, branches 87, functions 89 and
  lines 93, above react's (88, 82, 86 and 89). The shared tests alone cover
  less ([CLAUDE.md](CLAUDE.md#follow-ups)).
- **One copy-style case is skipped by name**, for the reason CLAUDE.md gives.
- **The analytics and exception tests** use a fake PostHog SDK and a fake
  network. They check what an event carries and what a report scrubs, not what
  PostHog receives; the device checklist covers that.
- **The end-to-end tests** drive the `e2e` build on an emulator or a
  simulator against a real express ([End-to-end tests](#end-to-end-tests)).

## End-to-end tests

Seven Maestro flows in `e2e/flows/` drive the `e2e` build against
express-boilerplate's `main`, with Postgres, Redis and Mailpit.
`scripts/e2e-run.mjs` runs them in a fixed order, and each flow that signs in uses a
fresh address, `e2e+<flow>-<run id>@example.test`.

| Flow                | What it proves                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sign-in`           | A signed-out app asks for a link, and the mailed link opens the app and signs a new account in, landing on Welcome                                                                |
| `cold-start`        | The session survives a stop and a relaunch: the app opens Home with no sign-in                                                                                                    |
| `first-workspace`   | A new account creates its first workspace on Welcome and lands on the Workspace tab                                                                                               |
| `switch-workspace`  | An account with two workspaces, created through the API, switches from one to the other in the switcher                                                                           |
| `accept-invitation` | A mailed invitation link, opened by the signed-in invitee, joins the workspace and lands on the Workspace tab                                                                     |
| `maintenance`       | Maintenance `full` covers the app with the owner's message, and when the mode goes `off` the screen goes within one status poll (30 to 40 seconds) and the sign-in screen returns |
| `forced-update`     | With express requiring version 99.0.0 for the platform, the update screen covers the app                                                                                          |

Every flow that starts signed out clears the Keychain and the app's state
first. A failure prints `e2e: <flow> failed: <step>: <reason>`, every later
flow prints `not run`, and the runner exits non-zero: 75 for a lost device
connection ([One rerun](#one-rerun-for-a-lost-device-connection-only)), 1 for
anything else.

### Where they run

- **`e2e-android.yml`** runs on every pull request, with no path filter, and
  on pushes to `main`. It builds the release APK for `x86_64` and runs the
  flows on an API 35 emulator. Between 8 and 11 November 2026 the job took 15
  to 25 minutes.
- **`e2e-ios-nightly.yml`** runs every night at 03:43 UTC and on dispatch. It
  builds a Release app for the simulator and runs the flows on an iPhone 17
  Pro. Between 8 and 11 November 2026 the job took 16 to 51 minutes, because
  the macOS runners' build time varied from 4 to 14 minutes.
- **On a failure** each job uploads Maestro's output, express's `api.log` and
  the device's log as the `e2e-android` or `e2e-ios` artifact, kept 7 days.

### The throwaway environment

Each run writes its own environment and reads no secret.

- **Express** runs from its `main` checkout with a `.env` that the workflow
  writes: a JWT secret and a session secret generated in the step, the
  database password `boilerplate`, `WEB_URL=https://e2e.example.test`,
  `RATE_LIMIT_SCALE=10` (every request comes from one runner address),
  `SIGN_IN_LINK_MAIL_COOLDOWN=1s` (switch-workspace signs one address in
  twice, and the default cooldown of 1 minute mails nothing the second time)
  and `WORKER_ENABLED=true` (the worker sends the mail).
- **Mailpit catches every mail.** The addresses are on `example.test`, a
  domain reserved for testing (RFC 2606), so nothing leaves the runner.
- **No PostHog key is set**, so analytics and exception reports stay inert.
- **Android** runs Postgres, Redis and Mailpit from express's
  `docker-compose.yml`, and deletes their volumes at the end. The maintenance
  helper runs `psql` and `redis-cli` from the stack's own images
  (`docker run --rm -i --network host <image>`), because on 11 November 2026
  the runner could not resolve its apt mirrors.
- **iOS** installs Postgres 18, Redis and Mailpit with Homebrew, because the
  macOS runner has no Docker. They listen on the ports that express's compose
  file publishes (5433, 6380, 1025 and 8025), so both jobs use the same
  addresses.

### What the iOS job does that a simulator needs

- **It signs the simulator build ad hoc**, with no certificate or team, and
  fails when `codesign --verify` does not pass. An unsigned app gets no answer
  from the simulator's Keychain, where `expo-secure-store` keeps the refresh
  token, so sign-in cannot finish.
- **It approves the app's scheme in the simulator** before and after the
  boot. Without the approval, iOS asks "Open in …?" before it hands an
  `expo-boilerplate://` link to the app, and the flow waits on the prompt.
- **It boots an iPhone 17 Pro** from the newest iOS runtime that has one, the
  model every green run used. Without one, it boots the first iPhone in the
  newest runtime and prints a warning.
- **The issue step acts on `main` only.** A red scheduled or dispatched run on
  `main` opens an `e2e-nightly` issue, or comments on the open one, and a green
  one closes it. `exercise_issue=fail` or `pass` skips the flows to test the
  step.

### One rerun, for a lost device connection only

The runner exits 75 when the failed flow's own Maestro run lost the device or
its driver: on Android, a dropped adb link or a driver that did not start; on
iOS, an XCTest driver that did not start or stopped answering. On 75, and on
no other code, each workflow prints a `::warning::` naming the flow and the
reason, moves the output to `maestro-output-1/` and runs the flows once more
with a new run id. A failed selector, a missing mail, a helper or a restart
exits 1 and is never rerun, so a real failure is never masked.

### Run them locally

You need an Android emulator or an iOS simulator, express-boilerplate checked
out beside this repository, Docker, Java 17, `psql` and `redis-cli`, and
Maestro CLI 2.11.0. Check the Maestro zip against `scripts/maestro.sha256`
before you unzip it.

1. **Start express** in its checkout. Write its `.env` as
   `.github/workflows/e2e-android.yml` does (step "Write express's .env"),
   then:

   ```bash
   docker compose up -d --wait postgres redis mailpit
   pnpm run build
   node dist/database/migrate.js
   nohup node dist/index.js > api.log 2>&1 < /dev/null &
   echo $! > api.pid
   for _ in $(seq 1 60); do
     curl -sf -o /dev/null http://localhost:4040/health/ready && break
     sleep 1
   done
   ```

   `scripts/e2e-api-restart.sh` restarts express for the forced-update flow by
   the pid in `api.pid`, so start it this way. The loop waits up to 60
   seconds for `/health/ready`, as the workflow does; if it ends without an
   answer, read `api.log` before you go on.

2. **Build and install the `e2e` variant.** Set `APP_VARIANT=e2e` and
   `EXPO_PUBLIC_API_URL` before the build, because both are inlined into the
   bundle: `http://10.0.2.2:4040` for the Android emulator, or
   `http://localhost:4040` for the iOS simulator. For Android:

   ```bash
   pnpm exec expo prebuild --platform android --no-install
   (cd android && ./gradlew assembleRelease -PreactNativeArchitectures=x86_64)
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```

   For iOS, run the `prebuild` and `build` steps of
   `.github/workflows/e2e-ios-nightly.yml`, then write the scheme approval as
   the workflow's `simulator` step does, then `xcrun simctl install`. Without
   the approval, iOS asks "Open in …?" on each link.

3. **Run the flows** from this repository:

   ```bash
   E2E_API_URL=http://127.0.0.1:4040 \
   E2E_MAILPIT_URL=http://127.0.0.1:8025 \
   DATABASE_URL=postgres://boilerplate:boilerplate@localhost:5433/boilerplate \
   REDIS_URL=redis://localhost:6380 \
   E2E_API_DIR="$PWD/../express-boilerplate" \
   E2E_API_RESTART_CMD="$PWD/scripts/e2e-api-restart.sh" \
   E2E_RUN_ID=local-1 \
   node scripts/e2e-run.mjs android
   ```

   Use `ios` for the simulator. `E2E_RUN_ID` takes lowercase letters, digits
   and hyphens; change it for each run, because each address signs in once.
   Maestro's output goes to `maestro-output/`, which git ignores. To run
   `psql` and `redis-cli` from containers instead of the host, set
   `E2E_PSQL` and `E2E_REDIS_CLI` to the command and its leading arguments.

### Make `e2e-android` a required check

Branch protection is the owner's setting. As of 11 November 2026 the job
passed 4 of 4 attempts on `5a820f1`, 2 of 2 on `9dc3928`, 2 of 2 on `43f02e9`
and 1 of 1 on `ce4085e`, all on pushes to a branch, and no pull request had
run it. Require it once it has passed 5 pull-request runs in a row.

The job checks out express-boilerplate's `main` unpinned: the second
`actions/checkout` step in `e2e-android.yml` sets `ref: main`. As a required
check, an express change can then fail every open pull request here. If that
happens, pin `ref` to the last express commit that passed (the job prints it
in "Record express's commit"), or drop the requirement until express is
fixed.

To require it:

1. In the repository's **Settings**, open **Rules** (or **Branches**) and edit
   the rule for `main`.
2. Turn on **Require status checks to pass**, and add the check
   `e2e-android`, the job's ID.
3. Save.

The workflow has no path filter on `pull_request`, so every pull request gets
the check, and none waits on a check that never runs. Do not require the iOS
job: it runs nightly, not on pull requests.

## Builds and releases

As of 8 November 2026 the repository holds the build profiles, the signed
update settings and the release workflows, and none of it has run on EAS. The
project has no Expo account, no certificate and no secret, so every workflow
ends with a notice that names what is missing, and every variant has updates
off. [Release setup](#release-setup) turns each part on.

### The build variants

`APP_VARIANT` picks the variant, and each `eas.json` profile of the same name
sets it. Unset, it reads `production`, the strictest one.

| Variant       | App ID (iOS and Android)                 | Name                     | Update channel | Plain HTTP to a local API | Distribution           |
| ------------- | ---------------------------------------- | ------------------------ | -------------- | ------------------------- | ---------------------- |
| `development` | `com.mahaverick.expoboilerplate.dev`     | expo-boilerplate Dev     | none           | yes                       | internal, dev client   |
| `e2e`         | `com.mahaverick.expoboilerplate.e2e`     | expo-boilerplate E2E     | none           | yes                       | iOS simulator, APK     |
| `preview`     | `com.mahaverick.expoboilerplate.preview` | expo-boilerplate Preview | `preview`      | no                        | internal testers       |
| `production`  | `com.mahaverick.expoboilerplate`         | expo-boilerplate         | `production`   | no                        | App Store, Google Play |

- **Updates are on only in preview and production, and only when the build
  has both** an `EAS_PROJECT_ID` and the variant's certificate at
  `certs/<variant>/certificate.pem`. Without either, the build has updates off
  and accepts none.
- **The runtime version is the native fingerprint** (`policy: 'fingerprint'`).
  An update reaches only the builds whose native code and config match it.
  A patch bump alone keeps the fingerprint. The production config also
  carries `extra.releaseLine`, the major and minor version, so a minor or
  major bump changes production's runtime, and a patch update reaches only
  the production builds of its own minor release. Preview carries no release
  line and takes every update from `main`.
- **The config carries the certificate's SHA-256** (`extra.updatesCertificate`)
  in each variant with updates on, so a new certificate changes the
  fingerprint.
- **An update applies on the next cold start.** The app checks on launch,
  downloads in the background and keeps running the bundle it started with.
- **Preview and production take build numbers from EAS** (`appVersionSource:
  "remote"`, `autoIncrement`), and the version from `package.json`, which
  release-please sets.
- **No workflow builds the preview variant.** Run
  `eas build --profile preview --platform all` by hand when the native code
  changes.

### Release setup

Do these once, in order. Run every `eas` command from the repository root,
with `EAS_PROJECT_ID` set in the shell once step 2 gives it.

1. **Create the Expo account** with two-factor sign-in, and take the
   Production plan. Update code signing needs the Production or Enterprise
   plan ([Expo's code signing page](https://docs.expo.dev/eas-update/code-signing/),
   read on 3 November 2026).
2. **Create the project** with `eas init`. It cannot write to `app.config.ts`,
   so copy the project ID it prints. Set `EAS_PROJECT_ID` to that ID as a
   GitHub repository variable and as a plain variable in each of the EAS
   environments `development`, `preview` and `production`. All four hold the
   same ID: eas-cli reads the GitHub one to find the project, and the EAS
   one then replaces it, so a different value changes the fingerprint.
3. **Create a robot token** scoped to this project, and store it as the
   GitHub repository secret `EXPO_TOKEN`.
4. **Create the three GitHub environments** and limit each to the `main`
   branch:
   - `preview-updates`, with no reviewer;
   - `production-updates`, with a required reviewer;
   - `production-builds`, with a required reviewer.
5. **Create one signing key and certificate per variant.** For `preview`,
   then `production`:

   ```bash
   npx expo-updates codesigning:generate \
     --key-output-directory <a directory outside the repository> \
     --certificate-output-directory certs/<variant> \
     --certificate-validity-duration-years 10 \
     --certificate-common-name "expo-boilerplate <variant>"
   ```

   - Commit `certs/<variant>/certificate.pem` only. `.gitignore` ignores
     every `*.pem` file except `certs/*/certificate.pem`.
   - Store `private-key.pem` as an environment secret:
     `PREVIEW_UPDATE_PRIVATE_KEY` on `preview-updates`, and
     `PRODUCTION_UPDATE_PRIVATE_KEY` on `production-updates`.
   - Keep the production key in the owner's password manager too. GitHub
     never shows a secret again, and `eas update:rollback` needs the key.
     Then delete the key files.
   - To rotate a key, run the same command, commit the new certificate and
     replace the secret. Live builds verify updates against the certificate
     they shipped with, so they refuse an update signed with the new key. The
     new certificate's hash changes the fingerprint, so the next production
     release routes to store builds. Preview has no workflow that builds, so
     run `eas build --profile preview --platform all` by hand after a preview
     rotation.

6. **Set the EAS environment variables** in the table below.
7. **Add the PostHog command-line credentials** to EAS and to GitHub:
   `POSTHOG_CLI_API_KEY` (a PostHog personal API key),
   `POSTHOG_CLI_PROJECT_ID` and, for a project outside PostHog's US cloud,
   `POSTHOG_CLI_HOST`. Without the key, nothing uploads and nothing fails.
   With the key and no project ID, a preview or production build fails in
   `eas-build-post-install`, before the native compile, with a message that
   names `POSTHOG_CLI_PROJECT_ID`.
8. **Create the release GitHub App**, as react does. Give it Contents and Pull
   requests read and write, install it on this repository, then set its
   client ID as the variable `RELEASE_APP_CLIENT_ID` and its private key as
   the secret `RELEASE_APP_PRIVATE_KEY`. `GITHUB_TOKEN` is no substitute:
   GitHub starts no workflow from an event it creates, so its release PRs
   would get no CI.
9. **List each variant's app ID in react.** Add it to the matching
   environment's `IOS_APP_IDS` and `ANDROID_APP_LINKS` (spec part 2), so the
   web app's association files name it. Once passkeys land, also add each
   variant's Android signing hash to `WEBAUTHN_ANDROID_ORIGINS` in express
   (spec part 1).
10. **Set up iOS submission before the first iOS auto-submit.** The `build`
    job runs `eas submit` through `--auto-submit --non-interactive`, which
    cannot ask for anything.
    - Add an App Store Connect API key to EAS with `eas credentials` (iOS,
      App Store Connect API key). eas-cli can create one or upload one made
      in App Store Connect.
    - Once App Store Connect has the app, add its Apple ID, the number on the
      app's App Information page, to `eas.json` as
      `submit.production.ios.ascAppId`.

    Without either, the iOS submission fails on EAS while the GitHub run
    stays green, because the job does not wait for the build. Check the
    first release's submission on the EAS dashboard.

Finish steps 2 and 5 before the first store build. A build made without the
project ID or its certificate has updates off for its whole life, and adding
either changes the fingerprint, so the next release ships as a store build.
So does a later change to `APP_LINK_HOST`, `IOS_APP_STORE_ID` or
`PRIVACY_POLICY_URL`, because each one lands in the config's `extra`.
The first build of each profile runs interactively (`eas build --profile
<profile>`), so EAS can create the iOS credentials and the Android upload
keystore.

#### Secrets and variables

| Name                            | Where                                                       | Read by                                                                     |
| ------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| `EAS_PROJECT_ID`                | GitHub repository variable                                  | `release.yml` (`route`, `update`, `build`) and `preview-update.yml`         |
| `EXPO_TOKEN`                    | GitHub repository secret                                    | `release.yml` (`route`, `update`, `build`) and `preview-update.yml`         |
| `RELEASE_APP_CLIENT_ID`         | GitHub repository variable                                  | `release.yml` (`release-please`)                                            |
| `RELEASE_APP_PRIVATE_KEY`       | GitHub repository secret                                    | `release.yml` (`release-please`)                                            |
| `PREVIEW_UPDATE_PRIVATE_KEY`    | Secret of the GitHub environment `preview-updates`          | `preview-update.yml`                                                        |
| `PRODUCTION_UPDATE_PRIVATE_KEY` | Secret of the GitHub environment `production-updates`       | `release.yml` (`update`)                                                    |
| `POSTHOG_CLI_API_KEY`           | GitHub repository secret                                    | The source-map upload of `release.yml` (`update`) and `preview-update.yml`  |
| `POSTHOG_CLI_PROJECT_ID`        | GitHub repository variable                                  | The same upload                                                             |
| `POSTHOG_CLI_HOST`              | GitHub repository variable, optional                        | The same upload. Unset, the command-line tool uses `https://us.posthog.com` |
| `EAS_PROJECT_ID`                | EAS `development`, `preview` and `production`, plain        | `app.config.ts`: `updates.url` and `extra.eas.projectId`                    |
| `EXPO_PUBLIC_API_URL`           | Each EAS environment, plain                                 | The bundle                                                                  |
| `EXPO_PUBLIC_APP_ENV`           | Each EAS environment, plain                                 | The bundle: the environment name on every event, such as `production`       |
| `EXPO_PUBLIC_POSTHOG_KEY`       | Each EAS environment that sends analytics, plain            | The bundle                                                                  |
| `APP_LINK_HOST`                 | Each EAS environment, plain                                 | `app.config.ts`                                                             |
| `PRIVACY_POLICY_URL`            | EAS `preview` and `production`, plain                       | `app.config.ts`                                                             |
| `IOS_APP_STORE_ID`              | EAS `production`, plain, once App Store Connect has the app | `app.config.ts`                                                             |
| `POSTHOG_CLI_API_KEY`           | EAS `preview` and `production`, secret                      | `eas-build-post-install` and `eas-build-on-success`                         |
| `POSTHOG_CLI_PROJECT_ID`        | EAS `preview` and `production`, plain                       | `eas-build-on-success`                                                      |
| `POSTHOG_CLI_HOST`              | EAS `preview` and `production`, plain, optional             | `eas-build-on-success`                                                      |

- **A value that shapes the app config lives only in the EAS environment,
  with plain or sensitive visibility, never secret.** That covers
  `EAS_PROJECT_ID`, `APP_LINK_HOST`, `IOS_APP_STORE_ID`, `PRIVACY_POLICY_URL`
  and every `EXPO_PUBLIC_*`. The fingerprint's default `balanced` preset
  includes `extra` and the EAS project, and EAS gives a secret value to a
  build but not to `eas update` or `eas fingerprint:compare`. A value that
  differs between the two makes every patch release a store build. The
  workflows read these values only through `--environment`, and the one
  exception is the GitHub `EAS_PROJECT_ID`, which must match.
- **`POSTHOG_CLI_API_KEY` shapes no config**, so in EAS it takes secret
  visibility.
- **`APP_VARIANT` and `SOURCEMAP_FILE` come from `eas.json`.** Set neither in
  an EAS environment.

#### Credentials and who owns them

Each owner is the repository owner until the team names others.

| Credential                                               | Where it lives                                                            | Owner            |
| -------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------- |
| iOS distribution certificate and provisioning profiles   | EAS (`eas credentials`)                                                   | Repository owner |
| Android upload keystore                                  | EAS (`eas credentials`)                                                   | Repository owner |
| Android app-signing key                                  | Google Play App Signing                                                   | Repository owner |
| Google Play service-account key, which `eas submit` uses | EAS (`eas credentials`, Android); `eas.json` names no key file            | Repository owner |
| App Store Connect API key, which `eas submit` uses       | EAS (`eas credentials`, iOS); `eas.json` holds only `ascAppId`            | Repository owner |
| Preview update signing key                               | GitHub environment `preview-updates`                                      | Repository owner |
| Production update signing key                            | GitHub environment `production-updates`, and the owner's password manager | Repository owner |
| Expo robot token                                         | GitHub repository secret `EXPO_TOKEN`                                     | Repository owner |
| Release GitHub App private key                           | GitHub repository secret `RELEASE_APP_PRIVATE_KEY`                        | Repository owner |
| PostHog personal API key                                 | EAS `preview` and `production`, and a GitHub repository secret            | Repository owner |

### The release flow

Each push to `main` does two things:

- **`preview-update.yml` publishes a signed update to the `preview`
  channel.** Every preview build whose fingerprint matches runs `main`'s
  JavaScript after its next cold start. A newer push cancels an older run.
- **`release.yml` runs release-please**, which opens or updates the release
  PR from the conventional commits since the last release.

A person merges the release PR, and nothing merges it on its own, because the
merge ships. The merge tags `vX.Y.Z`, and the same run routes the release by
its version bump (`scripts/release-route.mjs`). On 1.x, release-please bumps
the minor version for a `feat:` commit and the patch version for a `fix:`.

| Release                          | Route                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patch, fingerprint unchanged     | After a reviewer approves `production-updates`, a signed update to the `production` channel at 10% (`--rollout-percentage 10`), then the source maps |
| Patch, fingerprint changed       | Store builds                                                                                                                                         |
| Patch, no production certificate | Store builds, with a notice that names `certs/production/certificate.pem`                                                                            |
| Minor (a `feat:` commit)         | Store builds                                                                                                                                         |
| Major (a breaking change)        | Store builds                                                                                                                                         |

- **The fingerprint check** compares this commit with each platform's latest
  finished production build (`eas fingerprint:compare --environment
  production`). A platform with no such build counts as changed, and a
  fingerprint that cannot be read fails the job, so nothing ships on a guess.
- **The fingerprint covers more than native code.** It hashes the config,
  which holds the release line and the certificate's hash, and also every
  `package.json` script and `.gitignore`. A `fix:` release that edits a
  script or `.gitignore` therefore ships as store builds.
- **A missing production key fails the `update` job red.** Every other
  missing secret prints a notice and passes. With the certificate committed,
  production builds take updates, so the route sends a patch release to
  `update`; a skipped publish there would leave a tagged release that shipped
  nowhere behind a green run. The error names `PRODUCTION_UPDATE_PRIVATE_KEY`.
  Set it, then re-run the job.
- **Store builds** wait for a reviewer on `production-builds`, then run
  `eas build --profile production --platform all --auto-submit`. EAS submits
  each finished build to TestFlight or the Play internal track, and nobody
  receives it until a person promotes it in App Store Connect and Play
  Console.
- **Widen a rollout** with `eas update:edit <update group ID>
  --rollout-percentage <1 to 100>`, such as 50, then 100.
  `eas update:list --branch production` lists the group IDs.
- **Roll back** with `eas update:rollback <update group ID> --private-key-path
  <the production key> --force-end-active-rollout`. The group must be the
  latest on its branch and runtime version. EAS republishes the group before
  it, or, with none, rolls back to the bundle the build embeds. Run both
  commands with `APP_VARIANT=production` and `EAS_PROJECT_ID` set, so eas-cli
  reads the production config and its certificate.
- **A feature never ships over the air.** Apple's Developer Program License
  Agreement section 3.3.1(B) and App Review Guideline 2.5.2 forbid using
  downloaded code to add features. A `feat:` commit bumps the minor version,
  so it always ships as a store build, and an update carries fixes only. The
  release line in the production config keeps a fix to 1.1 off 1.0 installs:
  without it, a 1.1 build with no native change would share 1.0's
  fingerprint, and a 1.1.1 update would carry 1.1's feature to 1.0.

### Source maps

PostHog's Metro serializer (`posthog-react-native/metro`, in
`metro.config.js`) writes a chunk ID into each Hermes bundle and its source
map. An exception frame carries that chunk ID, and PostHog resolves the frame
through the uploaded map, so a release stack trace names the source file and
line.

- **An update's maps** upload in the same workflow job, right after
  `eas update` writes `dist/` (`posthog-cli hermes upload --directory dist`).
- **A store build's maps** upload from EAS Build's hooks.
  `eas-build-post-install` installs the command-line tool and, on iOS,
  rewrites one line of React Native's `react-native-xcode.sh` so the
  packager's map survives at `$SOURCEMAP_FILE.packager`.
  `eas-build-on-success` runs `scripts/upload-native-sourcemaps.sh`, which
  copies the chunk ID into the composed map (`hermes clone`) and uploads it,
  named by the app ID, the version and the build number. `eas.json` sets
  `SOURCEMAP_FILE` for the preview and production profiles only.
- **Without `POSTHOG_CLI_API_KEY`, every step skips** and the build or update
  ships with no map. Its frames still carry chunk IDs, but PostHog shows
  them as bundle positions.

### The first store submission

- **Google Play's first upload is manual** in Play Console. Download the
  Android App Bundle from the EAS build page and upload it; `eas submit`
  works after that. A new personal developer account must first run a closed
  test with 12 testers for 14 days (Play Console Help; confirm the rule for
  this account's type before planning around it).
- **App review access.** Use a review address on a shared inbox the team
  watches, on the production API, with a seeded workspace and members.
  During review the team sends the sign-in link when the reviewer asks for
  it.
- **The review notes** in App Store Connect and Play Console say that, and
  explain the emailed-link sign-in and the read-only billing
  ([Notes for app review](#notes-for-app-review)).
- **The store listing needs** the icon (with Android's adaptive and
  monochrome layers), the splash screen and phone screenshots. The
  repository holds none of them as of 8 November 2026.

## Notes for app review

The app sells nothing, as the spec's section 6 requires, so Apple's guideline
3.1.1 and Google Play's payments policy have nothing to review here.

- The app shows no prices and has no upgrade button, checkout link or text that
  asks the person to buy. The Plan screen (Settings, Workspace, Plan) shows the
  plan's name, its state, its limits and its features, and nothing else.
- Billing notifications show the app's neutral text, not the server's.
- Sign-in is by emailed link, with no password. The reviewer gets the
  review address; the team sends the link when the reviewer asks for it
  ([The first store submission](#the-first-store-submission)).
- Account deletion is in Settings, Account, Delete account. A person in
  passkey-required mode cannot use it yet; the blocking screen says to ask by
  email ([SECURITY.md](SECURITY.md#known-gaps)).

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
      the mailed link, and land on Home (or Welcome, for a new account).
      Force-quit and reopen: the app opens signed in without a new link. On the
      Settings tab, tap Sign out: the sign-in screen shows, and the API has
      revoked the session.
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
      app opens on Home or the sign-in screen and ignores the token. (Only the
      `e2e` build keeps the token, so the Maestro flows can sign in.)
- [ ] **Android backup leaves the app signed out.** Signed in, run
      `adb shell bmgr backupnow com.mahaverick.expoboilerplate`, uninstall,
      reinstall to restore, and open the app. It shows the sign-in screen. If it
      does not, the backup rules do not match SecureStore's preferences file
      ([SECURITY.md](SECURITY.md#known-gaps)).
- [ ] **200% font size fits on every screen.** Set the system font size to its
      largest on both platforms. On the sign-in, link, passkey, Home,
      Workspace, Notifications and Settings screens, every control is reachable
      by scrolling, and no text is cut off.
- [ ] **The workspace switcher fits at 200% text.** With the largest system
      font, open the switcher on the Workspace tab and on `/tenants/{slug}`.
      Every workspace and Create a workspace are reachable, and no name is cut
      off. On Android with edge-to-edge, the sheet's first row is clear of the
      status bar.
- [ ] **The overview fits at 200% text.** Open a workspace's overview with the
      largest system font. Getting started and Details are reachable by
      scrolling, and no text is cut off.
- [ ] **A toast sits above the tab bar and the home indicator on both
      platforms.** Mark a Getting started step done on the Workspace tab. The
      success toast shows clear of the tab bar and the home indicator, and
      the tab bar stays reachable.
- [ ] **Offline and back.** Turn on airplane mode. The offline banner shows
      below the status bar, queries pause, and no screen shows an empty state
      for a failed load. Turn it off. The banner goes, and the screens refetch
      without a reload. Then stop the API with the network on: within 75
      seconds the same banner shows ("You’re offline, or the app can’t reach
      its server."). The app's online check asks express's `/health` every
      60 seconds and waits 15 for an answer (NetInfo's defaults).
- [ ] **Full maintenance and its recovery.** Set the API's maintenance mode to
      `full`. The maintenance screen covers the app on both platforms, the back
      gesture does nothing, and a signed-in person keeps their place. Set the
      mode to `off`. The screen goes, the session is checked, and the screens
      refetch.
- [ ] **The update screen on both platforms.** Raise the API's
      `minimumAppVersion` for iOS and for Android above the installed build.
      Within 5 minutes, or on the next foreground, the update screen covers the
      app. The back gesture does nothing. On Android the button opens the
      store. On iOS the button shows only for a build with `IOS_APP_STORE_ID`
      set, and it opens the App Store.
- [ ] **A mailed `/tenants/{slug}` link opens the workspace on Android.** Build
      with `APP_LINK_HOST` set. Open `https://<host>/tenants/<slug>` from the
      mail app while signed in: the workspace's overview opens in the app, not
      the browser. While signed out, sign in and land on it.
- [ ] **Back from a workspace returns to the tabs.** Open
      `https://<host>/tenants/<slug>` cold, and open the workspaces list from
      the switcher. On each of `/tenants/{slug}` and `/tenants`, swipe back on
      iOS and press Back on Android: the tab bar shows. The header shows a
      Back arrow and no title, and never the text "(tabs)".
- [ ] **A new workspace opens on the Workspace tab.** With a new account,
      create a workspace on Welcome. The Workspace tab opens on it, with the
      tab bar.
- [ ] **Offline sign-in shows its error.** Signed out, turn on airplane mode
      and request a sign-in link. The screen shows "We couldn’t send the
      link. Check your connection and try again." at once, with no spinner
      left running.
- [ ] **The back gesture does nothing on the passkey screen.** With an account
      in passkey-required mode, swipe back on iOS and press Back on Android.
      The screen stays.
- [ ] **An emailed step-up link opened while the dialog waits.** On the
      Security screen, wait until the last confirmation is older than the API's
      step-up window, then select Sign out other devices. The "Confirm it’s
      you" dialog opens full screen. Select Email me a link, open the mailed
      link from the mail app on the same phone, on iOS and on Android. The
      dialog shows "Confirmed. Continuing…", closes, and the screen goes back
      to Security. The other devices are signed out once, with one toast.
- [ ] **A step-up link opened from another phone.** Request the link on phone
      A, then open it on phone B. Phone B shows "Sign in to confirm" or "This
      link didn’t confirm it’s you", and phone A's dialog keeps waiting. A
      link requested on phone A confirms there and nowhere else.
- [ ] **Android back on each dialog view.** Press Back on the start view and on
      the resume-failed view: the dialog cancels, and the action reports its
      refusal. Resume-failed needs a verify that succeeds, then a refresh
      that fails. The dialog refreshes only when the stored token is no newer
      than the one it opened with, so use a debugging proxy: let the verify
      through, rewrite its `accessToken` to the bearer token the request
      carried, and fail the next `/auth/refresh`. Press Back on the email view
      and on "Confirmed. Continuing…": nothing happens, and only Cancel leaves.
- [ ] **A failed link shows in the dialog.** With the dialog open on the email
      view, open a used or expired link, then turn on airplane mode and open a
      live one. Each time the app returns to the dialog, which shows the
      reason inline and keeps Resend link.
- [ ] **A late foreground refresh keeps the confirmation.** With the dialog on
      the email view, send the app to the background, then open the mailed
      link from the mail app. After the action goes through, run a second
      step-up action, such as Sign out other devices, within 10 minutes. It
      goes through with no prompt.
- [ ] **The dialog hides under full maintenance and comes back.** With the
      dialog open, set the API's maintenance mode to `full`. The maintenance
      screen shows with no dialog above it. Set the mode to `off`. The dialog
      returns on the same view.
- [ ] **The Settings rows and switches fit at 200% text.** With the largest
      system font, open the Settings tab, Profile, Security and Notifications.
      Every row, field, button and switch is reachable by scrolling, no text
      is cut off, and each switch can be toggled.
- [ ] **An invitation accepted signed out, on both platforms.** Invite an
      address from Members, then open the mailed
      `https://<host>/invitations/accept?token=...` link from the mail app on a
      signed-out phone. The screen names the
      inviter, the workspace and the role, then shows "Check your inbox". Open
      the second mail's confirmation link. The app signs the invitee in, toasts
      "You joined ...", and opens the Workspace tab on that workspace with the
      tab bar beneath. A second open of the confirmation link shows the
      dead-link state.
- [ ] **An invitation accepted signed in as the invitee, on both platforms.**
      Signed in with the invited address, open the invitation link. The app
      joins at once, toasts, and opens the Workspace tab on the workspace.
- [ ] **An invitation opened signed in as someone else, on both platforms.**
      Open an invitation link while signed in with a different address. The
      screen asks first and has joined nothing: check the invitation is still
      pending on the web. Select Continue: the app signs out, mails the
      confirmation link to the invited address and shows "Check your inbox".
- [ ] **The router clears an invitation token from the URL, on both
      platforms.** After either invitation screen reads its link, the route
      carries no `token` or `email` (`setParams` with `undefined`). Back from
      the screen never returns to a link with a token.
- [ ] **The time zone and locale checks work on Hermes.** On Settings, General,
      enter `Not/AZone` in Time zone and `en-abcde-abcde` in Language and
      region. Each shows its field error and posts nothing. Both pass the
      schema's pattern, so the error proves that Hermes's
      `Intl.DateTimeFormat` and `Intl.getCanonicalLocales` threw (the second
      value repeats a variant). Enter `Asia/Kolkata` and `en-IN`: the save
      goes through.
- [ ] **The role sheets fit at 200% text.** With the largest system font,
      open Members, select a member's role, then open the invite form's role
      picker, which is a `ChoiceSheet` too. In each sheet every role is
      reachable by scrolling, no label is cut off, and Cancel closes it.
- [ ] **A step-up dialog opens right after the role sheet closes, on iOS.** On
      the platform workspace's Members, with the last confirmation older than
      the API's step-up window, change a member's role. A customer workspace
      asks its members for no step-up, so the check needs the platform
      workspace. The "Confirm it’s you" dialog opens and stays
      open. On iOS a `Modal` that opens while another is still closing can be
      dropped; record whether it is.
- [ ] **The platform-access banner shows for staff.** Signed in as platform
      staff, open a customer workspace from the staff console's link. The
      overview, General, Members, Activity, Insights and Beta each show
      "You’re viewing ... as platform staff", and Members and General show no
      write controls.
- [ ] **The notification stream works on both platforms, in a release build.**
      Check it in a release build, not the development client. From another
      account, invite the test account's address to a workspace. Express creates
      an in-app invitation notification for an existing account with a verified
      email. It appears in the Notifications tab within a few seconds, with no
      pull to refresh.
- [ ] **The stream opens after an iOS cold launch.** Force-quit the app on
      iOS, launch it, and at once send the test account a notification from
      another account. It appears with no pull to refresh. At a cold launch
      `AppState.currentState` can read `unknown`, and the stream waits for the
      first `active`; record whether the notification arrives.
- [ ] **The stream survives 15 minutes in the foreground.** Leave the app open
      on the Notifications tab for more than 15 minutes, past the access token's
      expiry. Express ends the stream, and the app reopens it. A notification
      created afterwards still appears with no refresh.
- [ ] **The stream stops in the background and resumes.** Send the app to the
      background, then invite the test account's address to a workspace from
      another account. Return to the app: the list and the badge include the
      invitation, and the stream is open again.
- [ ] **The badge counts.** With unread notifications, the Notifications tab
      shows the count, with a plus sign when the server capped it. Mark one
      read: the count drops. Mark all read: the badge disappears.
- [ ] **A leave from Members opened through Getting started lands on the
      workspace list.** On a customer workspace's overview, select Open members
      in Getting started, then Leave. The app lands on `/tenants`. Back reaches
      the tabs, and no screen of the left workspace flashes.
- [ ] **A deletion request goes through step-up on both platforms.** With the
      last confirmation older than the API's step-up window, open Settings,
      Account, Delete account and send a request. The "Confirm it’s you" dialog
      opens, and the request goes through after the emailed link. The screen
      then shows when the account will be deleted.
- [ ] **Events reach PostHog through the proxy.** Build with
      `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_APP_ENV` set. Sign in, open a
      few screens and a workspace. In PostHog, find a `$screen` event for each
      screen, with a route pattern such as `/tenants/[slug]` and no filled-in
      path, no email address and no `token` in any property. The API's log
      shows `POST /api/v1/collect/batch/` and no request to a PostHog host.
      Every event carries `$geoip_disable` true and no `$geoip_*` property.
- [ ] **A cold launch from an app link sends only its scheme and host.**
      Force-quit the app, then open an https app link that carries a web
      address, such as `https://<web host>/tenants/<slug>`. The app opens on
      that workspace. In PostHog, the `Application Opened` event's `url` is
      `https://<web host>`, with no path and no slug.
- [ ] **Turning analytics off stops the events.** In Settings, Account,
      Privacy, turn "Share usage analytics" off, then open screens and tap.
      PostHog receives no new event from this install. Turn it on again and
      events resume.
- [ ] **A fatal crash in a release build is sent on the next launch.** In a
      release build with a key, trigger a fatal JavaScript error (a throw from
      a button's handler in a throwaway build). The app closes. Launch it
      again: PostHog shows one `$exception` with origin `global`, no person's
      id, and `$process_person_profile` false. The launch after that sends
      nothing more.
- [ ] **Hermes stack frames parse, and an app frame names only its bundle.**
      Open the `$exception` from the check above on both platforms. Its app
      frames show the bundle's base name (`main.jsbundle` on iOS,
      `index.android.bundle` on Android), a function and a position, with
      `in_app` true. No filename holds an install directory. The event carries
      `$geoip_disable` true.
- [ ] **The privacy report of an archive matches the manifest.** Archive an iOS
      build in Xcode, then choose Generate Privacy Report. It lists product
      interaction and user ID (linked, analytics) and crash data (linked,
      app functionality), no tracking, and no tracking domain.
- [ ] **The Privacy screen reads and writes the choice.** With a key and
      `PRIVACY_POLICY_URL` set, open Settings, Account, Privacy. The switch
      matches the profile, toggling it posts once and shows a toast, and "Read
      our privacy policy" opens the address in the in-app browser. Check it
      with VoiceOver and TalkBack.

These checks need [Release setup](#release-setup) done, and EAS builds of the
preview variant. None of the release path has run on EAS as of 8 November 2026.

- [ ] **Each variant installs side by side with its own name.** Install the
      development, preview and production builds on one phone. Three icons
      show, named "expo-boilerplate Dev", "expo-boilerplate Preview" and
      "expo-boilerplate", and each keeps its own session.
- [ ] **A preview build refuses plain HTTP.** In a throwaway preview build
      with `EXPO_PUBLIC_API_URL` set to an `http://` address, the first
      request fails on both platforms.
- [ ] **A preview build refuses an update its certificate does not verify.**
      Generate a throwaway key with `npx expo-updates codesigning:generate`
      into a temporary directory, and publish to `preview` with
      `--private-key-path` set to it. Cold-start the preview build twice: it
      keeps running the bundle it had, on both platforms.
- [ ] **A preview build refuses an unsigned update.** Publish to `preview`
      with `eas update --channel preview --environment preview` and no
      `--private-key-path`. Cold-start the preview build twice: it keeps
      running the bundle it had, on both platforms. If eas-cli refuses to
      publish, because the config names a certificate, record its message
      here as the result: no unsigned update can reach the channel.
- [ ] **A signed patch reaches a preview build on the next cold start.** Push
      a visible fix to `main`, wait for `preview-update.yml`, then cold-start
      the preview build. The first launch runs the old bundle and downloads
      the update. The second runs the fix.
- [ ] **A crash after an update shows readable frames in PostHog.** With
      `POSTHOG_CLI_API_KEY` set, trigger a fatal error in a preview build
      running an update, and launch it again. The `$exception`'s app frames
      sit under `.expo-internal/`, carry `in_app` true and a `chunk_id`, and
      PostHog shows them as source files and lines, not bundle positions.
- [ ] **A crash in a store build shows readable frames too.** Do the same in a
      preview build that runs its embedded bundle, on iOS and on Android.
- [ ] **The iOS map rewrite works on EAS.** In an iOS preview build's log, the
      `eas-build-post-install` step prints "react-native-xcode.sh keeps the
      packager's source map at /tmp/main.jsbundle.map.packager", which proves
      the rewrite matched React Native 0.88.1's script.
- [ ] **`SOURCEMAP_FILE` reaches the Xcode build phase.** The same build's
      `eas-build-on-success` step finds both maps and uploads. "no Hermes
      source map at /tmp/main.jsbundle.map" means the Xcode phase never saw
      the variable.
- [ ] **The release fields parse on EAS.** On each platform, the upload step
      prints "uploaded the <platform> Hermes source map for <app ID>
      <version> (<build>)" with the variant's app ID, `package.json`'s
      version and the build number EAS assigned.
- [ ] **Remote versioning raises the build number.** Two preview builds in a
      row show build numbers one apart on the EAS build page, on both
      platforms, and the version stays `package.json`'s.

## Reporting a problem

Report a security problem as [SECURITY.md](SECURITY.md#reporting-a-vulnerability)
says. Open an issue for anything else.

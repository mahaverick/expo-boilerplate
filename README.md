# Expo Boilerplate

Expo Boilerplate is the starting point for the Mahaverick Labs mobile app: an
Expo SDK 58 and TypeScript app for iOS and Android that talks to the
`express-boilerplate` API and shares its core logic with `react-boilerplate`.
This file is for a developer who runs, tests or checks the app.

As of 7 November 2026 the app signs a person in with an emailed link and keeps
the session in the device's secure storage. A signed-in person sees four tabs:
Home, Workspace (the current workspace's overview), Notifications (a live list
with an unread badge) and Settings. Settings opens Profile, Security (sign-in
methods, signed-in devices and "Sign out other devices"), notification
preferences and Delete account, shows each workspace's plan read-only, and
holds Sign out. An action that needs a recent sign-in asks the
person to confirm it by an emailed link. The app also
lists and creates workspaces (`/tenants`, `/welcome`), shows a full-screen
notice for an update or for maintenance, and has a blocking screen for an
account that must add a passkey (`/passkey-required`). It holds the shared
core copied from react, a stored light, dark or system theme, and the gate and
CI that hold them. The remaining screens are in
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
| `IOS_APP_STORE_ID`    | `app.config.ts`      | The app's numeric App Store ID, such as `1234567890`. Build time only.                 |

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
  drops its query and fragment, so a token never arrives that way. The
  passkey screen then shows no "Open the website" button.
- **The web app must serve the association files** for the same host. React's
  `docker/15-app-links.sh` lists the paths.

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
- **The coverage thresholds** are statements 90, branches 85, functions 87 and
  lines 90, above react's (88, 82, 86 and 89). The shared tests alone cover
  less ([CLAUDE.md](CLAUDE.md#follow-ups)).
- **One copy-style case is skipped by name**, for the reason CLAUDE.md gives.

## Notes for app review

The app sells nothing, as the spec's section 6 requires, so Apple's guideline
3.1.1 and Google Play's payments policy have nothing to review here.

- The app shows no prices and has no upgrade button, checkout link or text that
  asks the person to buy. The Plan screen (Settings, Workspace, Plan) shows the
  plan's name, its state, its limits and its features, and nothing else.
- Billing notifications show the app's neutral text, not the server's.
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
      app opens on Home or the sign-in screen and ignores the token.
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
      without a reload.
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

## Reporting a problem

Report a security problem as [SECURITY.md](SECURITY.md#reporting-a-vulnerability)
says. Open an issue for anything else.

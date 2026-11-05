# expo foundation (plan 3a): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Expo app that bundles for iOS and Android. It holds react's shared core byte for byte, runs that core's tests under Jest, and passes a zero-warning gate. It opens to one placeholder screen in the STYLESEED theme.

**Architecture:**
- The 75 files and 31 tests that `react-boilerplate/shared-core.json` gives expo are copied to the same paths as in react. Expo writes the 11 port modules they import.
- `pnpm sync:check` proves the copies match react. It is apex's script with the app set to `expo`.
- Sessions, screens, analytics and releases follow in plans 3b to 3e, one at a time, each written once the plan before it has merged.

**Tech Stack:**
- Expo SDK 58 (`expo` 58.0.x), React Native 0.88.1, React 19.3.0, Expo Router 58, the New Architecture.
- TanStack Query and Form, Zustand, Zod and axios, all at react's versions.
- NativeWind 4.2.7 with Tailwind 3.4, `react-native-mmkv` 4.3 with `react-native-nitro-modules`, `expo-secure-store` 58.
- Jest through `jest-expo` 58.0.x and `@testing-library/react-native`.
- Vite+ (`vp`, the siblings' `vite-plus` version) for Oxlint and Oxfmt, with ESLint for the leftover rules.

**Repo:** `/Users/abhijeet/Mahaverick/expo-boilerplate`. It holds only `docs/` today and has no remote yet. Work in a worktree on `feat/foundation`.

**Spec:** `/Users/abhijeet/Mahaverick/expo-boilerplate/docs/superpowers/specs/2026-11-03-expo-boilerplate-design.md`, sections 1, 3 ("Platform") and 7. Part 2's spec, `react-boilerplate/docs/superpowers/specs/2026-11-03-react-shared-core-design.md`, section 5, covers the shared tests.

**The library check** that spec section 1 asks for was done on 5 November 2026. Its sources are in `scratchpad/expo-stack-research.md`, and the findings are summarised in "Deviations".

## Global Constraints

- The house rules of the sibling repos apply:
  - pnpm 12.16.1 (`packageManager`), Node 26 (`.node-version` `26`, `engines.node` `>=26`, `devEngines.runtime` with `onFail: "error"`);
  - TypeScript strict;
  - zero errors and zero warnings;
  - conventional commits, GPG-signed (`git commit -S`);
  - the `Assisted-by: Claude Code` and `Claude-Session:` trailers;
  - `pnpm push`, which runs the gate first, then `git push --no-verify`;
  - writing in the style of `/Users/abhijeet/Mahaverick/amazon-writing-style.md`.
- **A shared file is copied, never edited here.** The paths come from react `main` at the SHA recorded in the first commit: `c6185d6` today, or a later one if react has moved.
  - If a copied file or test fails in expo, stop and report. The fix is a react PR, then a copy.
  - A polyfill, a Jest or tsconfig setting, or a port is the only expo-side answer.
- **Copy rules are react's.** Customers read "workspace" (never "tenant") and "web address" (never "slug"). Curly apostrophes. `tests/unit/copy-style.test.ts` passes and also scans `src/components/ui`.
- **Only `src/http/client.ts` reads `EXPO_PUBLIC_API_URL`.** `EXPO_PUBLIC_*` values are public, and only the API URL, the PostHog key and the environment name use them.
- **The app requests no permission.** Remove every permission that a generated manifest adds and nothing uses.
- **Development runs on a dev client** (`expo-dev-client`), never Expo Go. MMKV, and later passkeys and replay, need native code.
- **Coverage thresholds start at react's values:** statements 88, branches 82, functions 86, lines 89 (`jest.config.ts`).

## Deviations from the spec, to confirm in review

1. **The core sits at react's own paths** (`src/lib/`, `src/queries/`, `src/http/` and so on), not `src/core/`. Part 2 kept react's paths, and the spec says expo mirrors it.
2. **NativeWind 4.2.7 with Tailwind 3.4, not v5.** v5 is `5.0.0-rc.1` (2 November 2026, "not for production"). Porting the tokens from react's Tailwind 4 `globals.css` is a translation either way.
3. **The template is pinned to `default@sdk-58`.** `create-expo-app` 5.0.0 still makes SDK 57 projects until Expo Go ships SDK 58.
4. **Hermes gaps get polyfills that load first.** Three shared files rely on APIs that Jest's Node has and Hermes may lack:
   - `crypto.getRandomValues` in `traceparent.ts`, which every request calls;
   - full `URL` parsing in `url-sanitizer.ts` and `tenant.schemas.ts`;
   - `Intl.RelativeTimeFormat` in `relative-time.ts`.

   `src/polyfills.ts` loads them before anything else (Task 2). Green Jest runs don't prove they work on a device. No simulator is available on the build machine, so the device check is a README checklist until plan 3e's Maestro runs.
5. **`sync-check` is apex's script with `APP = 'expo'`.** Making it a react manifest row, so that no repo keeps a third hand copy, is a follow-up for react.
6. **The TypeScript pin is the one `npx expo install --check` accepts.** If SDK 58 accepts react's `~6.0.3`, keep it. Otherwise pin what `expo install` picks, and record the reason in `CLAUDE.md`.

## Ports: what 3a ships and what replaces it

Every port exports exactly the names react's `shared-core.json` `ports` lists. None throws when imported.

| Port | 3a ships | Replaced in |
| --- | --- | --- |
| `src/http/client.ts` | `createApiClient({ baseURL: EXPO_PUBLIC_API_URL + API_PREFIX, withCredentials: false })` with `installInterceptors`. Sends `X-Client: native` and `X-Device-Name` (the `expo-device` `modelName`) on every API request. `unwrap` is re-exported. | final |
| `src/http/session.ts` | `ensureSession()` rejects with `NoRefreshTokenError`, a verdict, so the app counts as signed out. `broadcastAuthMessage` and `broadcastLogout` do nothing, since there is one process. `redirectToLogin` calls `router.replace('/')`. `switchIdentity` clears `auth.store`. | 3b (body transport, SecureStore) |
| `src/states/auth.store.ts` | Memory only, never `persist`. Same shape as react's store. | final |
| `src/states/maintenance-mode.store.ts` | Same shape as react's store. It holds the mode, with no browser reads. | final |
| `src/observability/telemetry/index.ts` | `track` does nothing. `analyticsKey` is the identity. `getAnalyticsSessionIdFor` returns `null`. | 3d |
| `src/observability/flags/flag-keys.ts` | react's `CLIENT_FLAGS`, unchanged. | final |
| `src/constants/frontend-app.ts` | `FRONTEND_APP = 'web' as const`. Mailed links point at `WEB_URL` and open the app through universal links (spec section 2). | final |
| `src/lib/toast.ts` | react's `toast` API (`success`, `error`, `warning`, `dismiss`) feeding a Zustand queue. Nothing renders the queue yet. | 3c (the toaster) |
| `src/ports/runtime.ts` | `isDev = __DEV__` | final |
| `src/ports/navigation.ts` | `assignLocation(url)` calls `Linking.openURL(url)`. | final |
| `src/ports/webauthn.ts` | `isSupported()` resolves `{ create: false, autofill: false }`. `get` and `create` reject with a not-supported `Error`. `cancelGeneration` returns 0. The `signal*` methods do nothing. | 3b (after its passkey spike) |
| `tests/support/runner.ts` (test port) | Re-exports `describe`, `it`, `test`, `expect`, `beforeEach` and `afterEach` from `@jest/globals`. `repoRoot` is `path.resolve(__dirname, '../..')`. `copyStyleRoots` is `['src', 'src/components/ui']`. | final |

## Open items owned by later plans

- **3b:** a spike that chooses between `react-native-passkeys` 0.4.2 and `react-native-passkey` 3.6.2 on a dev client. Neither lists SDK 58 or the New Architecture. `assetlinks.json` needs the `get_login_creds` relation.
- **3b:** spec section 2 says a token-store write failure after a refresh must not lose the session. React's final review asked for a retry, or for the failure to count as a verdict.
- **3b:** a sign-in link from `/delete-account` can create an account (react PR #183).
- **3b:** passkey-required mode blocks account deletion (react PR #183).
- **3c:** a spike on `react-native-sse` 1.2.1, last released March 2024, against an `expo/fetch` stream. It covers `Authorization` and `Last-Event-ID`.
- **3d:** whether replay works on Android under the New Architecture (`@posthog/react-native-plugin` 2.13). Unconfirmed on 5 November 2026.
- **3e:** a Maestro check on device that the polyfills in deviation 4 work.

## Review Focus

1. **A shared file passes Jest but crashes on Hermes.** `src/polyfills.ts` must be the first import of the entry, before Expo Router. Test: `tests/unit/entry-order.test.ts` (Task 2).
2. **No react checkout locally, or `CI=true`.** `sync:check` warns and passes locally. Under `CI=true` it fails. Test: `tests/unit/scripts/sync-check.test.ts` (Task 3).
3. **The theme paints before the splash screen hides.** A stored dark theme must never flash light. Test: `tests/unit/app/root-layout.test.tsx` (Task 4).
4. **`expo-doctor` disagrees with a pinned version** (TypeScript, React or axios). The gate runs `pnpm expo:doctor` (Task 1).
5. **A shared file edited in expo.** `sync:check` names it and fails. Test: `tests/unit/scripts/sync-check.test.ts` (Task 3).

---

### Task 1: The app, the toolchain and the gate

**Files:**
- Create, from `npx create-expo-app@5 . --template default@sdk-58`, then cut down:
  - `package.json`, `app.config.ts` (not `app.json`), `tsconfig.json`, `babel.config.js`, `metro.config.js`;
  - `src/app/_layout.tsx`, `src/app/index.tsx` (the placeholder);
  - `.node-version`, `.npmrc` (only if Metro needs `node-linker=hoisted`);
  - `vite.config.ts` (vp lint and fmt settings), `eslint.config.js`, `knip.jsonc`;
  - `scripts/push.sh`, `scripts/lint-docs.mjs` (react's copy), `.vite-hooks/pre-commit`;
  - `.gitignore`, `.editorconfig`.
- Delete every template screen, component, asset and font that `src/app/index.tsx` doesn't use.

**Interfaces:**
- Produces these `package.json` scripts, which later tasks extend:
  - `start` (`expo start --dev-client`)
  - `check` (`vp check`, then `eslint . --max-warnings 0`)
  - `typecheck` (`tsc --noEmit`)
  - `lint:docs`, `knip`
  - `expo:doctor` (`expo-doctor`)
  - `export` (`expo export --platform all --output-dir dist`)
  - `test` (Task 2)
  - `gate`: check, typecheck, lint:docs, knip, expo:doctor, export. Task 2 adds `test` before `export`, and Task 3 adds `sync:check` after `lint:docs`.
  - `push`
- `app.config.ts` gives later plans these settings:
  - `ios.supportsTablet: false` and `orientation: 'portrait'`;
  - `android.predictiveBackGestureEnabled: true`;
  - `experiments.typedRoutes: true`;
  - `scheme: 'expo-boilerplate'`;
  - `version` read from `package.json`.

- [ ] **Step 1: Scaffold and pin.** Run the template command. Then:
  - Set `packageManager`, `engines` and `devEngines` to the siblings' values.
  - Install the libraries in Tech Stack with `npx expo install`. TanStack, Zustand, Zod and axios take react's exact ranges.
  - Run `npx expo install --check`, and apply deviation 6 to TypeScript.
  - Add `expo-dev-client`.
  - Expected: `pnpm install --frozen-lockfile` and `pnpm expo:doctor` exit 0.
- [ ] **Step 2: Spike the toolchain.** Each check has a named fallback. Record the result of each in `CLAUDE.md`.
  - **(a) `vp check` in a Jest project.** The fallback is the `oxlint` and `oxfmt` CLIs at the versions vite-plus bundles, run from `check`.
  - **(b) Metro with pnpm's isolated `node_modules`.** Check it with `pnpm export`. The fallback is `.npmrc` `node-linker=hoisted`.
  - **(c) `.vite-hooks` with `vp config --hooks`.** The fallback is the same pre-commit script that `check` runs.
- [ ] **Step 3: ESLint.** Port react's leftover rules, then add `eslint-plugin-react-native` and `no-console: error` over `src/`. Add `babel-plugin-transform-remove-console` to the production env in `babel.config.js`.
- [ ] **Step 4: Run** `pnpm check && pnpm typecheck && pnpm lint:docs && pnpm knip && pnpm expo:doctor && pnpm export`. Expected: every command exits 0, and `dist/` holds an iOS and an Android bundle.
- [ ] **Step 5: Commit:** `build: an Expo SDK 58 app with the house toolchain and gate`. The body records the react SHA this branch copies from.

### Task 2: The shared core, its ports and its tests

**Files:**
- **Copy from react `main`** with `git -C ../react-boilerplate show <sha>:<path>`. Copy every `files` and `tests` row of `shared-core.json` that names `expo`: 75 files and 31 tests, `scripts/check-shared.{mjs,d.mts}` among them. Copy `shared-core.json` itself as well.
- **Create:**
  - the 11 ports in "Ports" above, and `tests/support/runner.ts`;
  - `src/polyfills.ts`;
  - `index.ts`, the entry: `import './src/polyfills'`, then `import 'expo-router/entry'`. Set `package.json` `main` to it;
  - `jest.config.ts`, `tests/setup.ts`;
  - `tests/unit/entry-order.test.ts`;
  - `tests/unit/ports/*.test.ts`, one file per port.
- **Modify:** `package.json` (`test` and `test:coverage`; `test` joins `gate` before `export`; plus `react-native-get-random-values`, `react-native-url-polyfill` and `@formatjs/intl-relativetimeformat`), `tsconfig.json` (`paths` `@/*` → `src/*` and `@/tests/*` → `tests/*`).

**Interfaces:**
- **Consumes:** react's port contracts. They are in `react-boilerplate/src/types/webauthn.types.ts` (`WebAuthnPort`), `src/http/refresh-core.ts` and `src/http/interceptors.ts` (`InterceptorPorts`), plus each react port file.
- **Produces:**
  - `src/polyfills.ts` imports `react-native-get-random-values`, then `react-native-url-polyfill/auto`. It loads `@formatjs/intl-relativetimeformat/polyfill-force` (with its `en` locale data) only when `@formatjs/intl-relativetimeformat/should-polyfill` returns true.
  - `jest.config.ts`:
    - `preset: 'jest-expo'`;
    - `moduleNameMapper` with `^@/tests/(.*)$` first, then `^@/(.*)$`;
    - `setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']`;
    - `testMatch: ['<rootDir>/tests/**/*.test.ts?(x)']`;
    - `collectCoverageFrom: ['src/**/*.{ts,tsx}']`;
    - the thresholds in Global Constraints.

- [ ] **Step 1: Write the failing tests.**
  - `entry-order.test.ts`: reads `index.ts` and asserts its first import is `./src/polyfills` and that `expo-router/entry` comes after it.
  - **One test per port:**
    - **`client`:** a request sent through a stub adapter carries `X-Client: native`, `X-Device-Name`, `traceparent`, and no `withCredentials`.
    - **`session`:** `ensureSession()` rejects with an error for which `isAuthVerdict` returns true.
    - **`webauthn`:** `isSupported()` resolves both flags false, and `get` rejects.
    - **`navigation`:** calls `Linking.openURL` with the URL.
    - **`toast`:** `toast.error('x')` puts one item in the queue, and `dismiss()` empties it.
- [ ] **Step 2: Run** `pnpm test tests/unit/entry-order.test.ts tests/unit/ports`. Expected: they fail, because the modules don't exist.
- [ ] **Step 3: Copy the rows, then write the ports, the polyfills, the entry and the Jest config.** No copied file may be edited. If a copied file or test fails, find which expo-side answer in Global Constraints fixes it. If none of them does, stop and report the file and the error.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm export`. Expected: all 31 shared tests and the new tests pass, the thresholds hold, and the tree typechecks with React Native's types and no DOM lib.
- [ ] **Step 5: Commit:** `build(shared): copy react's shared core and give it expo's ports`.

### Task 3: `sync:check` and CI

**Files:**
- **Create:**
  - `scripts/sync-check.mjs` and `scripts/sync-check.d.mts`: apex's, with `APP = 'expo'`;
  - `tests/unit/scripts/sync-check.test.ts`;
  - `.github/workflows/ci.yml`, `.github/workflows/pr-title.yml`, `.github/workflows/gitleaks.yml`;
  - `renovate.json`.
- **Modify:** `package.json`. Add `"sync:check": "node scripts/sync-check.mjs"` and put it in `gate` after `lint:docs`.

**Interfaces:**
- **What `sync:check` compares and runs:**
  - It compares every manifest row that names `expo` with react's copy. It prints `path: differs from react-boilerplate`, `path: missing` or `path: missing in react-boilerplate`.
  - It then runs the copied `checkShared({ root, manifest, app: 'expo' })` and keeps the findings on expo rows.
- **Where it finds react:** from `--react`, then `REACT_BOILERPLATE_DIR`, then `../react-boilerplate`.
  - With no react checkout, it warns and exits 0.
  - With `CI=true` and no checkout, it exits 1.

- [ ] **Step 1: Write the failing tests.** Babel-based Jest can't import the `.mjs` script, which uses `import.meta`, so each test spawns `node scripts/sync-check.mjs --react <tmp>` against temporary trees with `child_process.spawnSync`. It asserts the exit code and stdout. The test names are apex's:
  - `passes when every expo row matches`
  - `names a file that differs`
  - `names a file that is missing`
  - `names a file that react lacks`
  - `ignores rows that do not name expo`
  - `warns and passes with no react directory`
  - `fails with no react directory when CI is true`
  - `reports one line for a malformed manifest`
  - `passes on a check-shared finding on an expo row`
- [ ] **Step 2: Run** `pnpm test tests/unit/scripts/sync-check.test.ts`. Expected: every test fails, because the script doesn't exist.
- [ ] **Step 3: Implement.** Copy apex's script, set `APP = 'expo'`, and pass `app: 'expo'` to `checkShared`.
- [ ] **Step 4: CI.** `ci.yml` follows react's job shape and pins `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, as the siblings do. Its jobs:
  - **`lint`:** `pnpm check`, `lint:docs`, `knip`, `typecheck`, `expo:doctor`, `export`, and `pnpm audit --prod --audit-level moderate`.
  - **`unit`:** Jest sharded with `--shard=i/4`, then a `test` job that merges coverage and enforces the thresholds.
  - **`sync`:** on `pull_request` only. A second checkout of `mahaverick/react-boilerplate` at `main` into `react-boilerplate`, then `pnpm sync:check` with `REACT_BOILERPLATE_DIR`. This is apex's job.

  `pr-title.yml`, `gitleaks.yml` and `renovate.json` are react's. In `renovate.json`, `expo`, `react-native` and `posthog-react-native` minors and majors wait for a person.
- [ ] **Step 5: Run** `pnpm test tests/unit/scripts/sync-check.test.ts && REACT_BOILERPLATE_DIR=/Users/abhijeet/Mahaverick/react-boilerplate pnpm gate`. Expected: exit 0.
- [ ] **Step 6: Commit:** `build(shared): check expo's copies against react in the gate and CI`.

### Task 4: NativeWind, the STYLESEED tokens and the theme

**Files:**
- **Create:**
  - `tailwind.config.ts`, `global.css`, `nativewind-env.d.ts`;
  - `scripts/styleseed.mjs` and `scripts/styleseed.d.mts`, which generate the token table from `../react-boilerplate/src/styles/globals.css`;
  - `STYLESEED.md`;
  - `src/states/theme.store.ts`, with MMKV through `createMMKV`;
  - `tests/unit/styleseed.test.ts`, `tests/unit/contrast.test.ts`, `tests/unit/app/root-layout.test.tsx`.
- **Modify:**
  - `babel.config.js` and `metro.config.js`, for NativeWind's `withNativeWind`;
  - `src/app/_layout.tsx`;
  - `src/app/index.tsx`, the placeholder: one `header`-role title showing `APP_NAME` from `@/constants/app`, on `bg-background`;
  - `eslint.config.js`.

**Interfaces:**
- `theme.store`:
  - `useThemeStore` holds `{ preference: 'light' | 'dark' | 'system', setPreference }`.
  - It persists `preference` under MMKV key `theme`.
  - `resolvedScheme(preference, systemScheme)` returns `'light' | 'dark'`.
- **The token names are react's CSS variables without the `--`** (`background`, `foreground`, `primary` and so on). Each one maps to a Tailwind colour in `tailwind.config.ts`, with both light and dark values.

- [ ] **Step 1: Write the failing tests.**
  - **`styleseed.test.ts`:**
    - The token table that `scripts/styleseed.mjs` generates equals `STYLESEED.md`'s table.
    - Every colour in `tailwind.config.ts` equals that table's value.
    - With no react checkout, the test reads `STYLESEED.md` alone and still checks the config against it.
  - **`contrast.test.ts`:** in both themes, every token `X` that has an `X-foreground` partner (such as `primary` and `card`), plus `foreground` and `muted-foreground` on `background`, has a WCAG contrast ratio of at least 4.5.
  - **`root-layout.test.tsx`:** with MMKV mocked to hold `dark`, `SplashScreen.hideAsync` is called only after the colour scheme is set to `dark`.
- [ ] **Step 2: Run** `pnpm test tests/unit/styleseed.test.ts tests/unit/contrast.test.ts tests/unit/app`. Expected: they fail.
- [ ] **Step 3: Implement.**
  - Translate react's OKLCH values into the colour format NativeWind 4 accepts. Record the method in `STYLESEED.md`.
  - Lint bans raw palette classes (`bg-red-500`) and colour literals in `src/`.
  - The root layout calls `SplashScreen.preventAutoHideAsync()` at module scope. It hides the splash screen once the stored theme is applied.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm export`. Expected: exit 0.
- [ ] **Step 5: Commit:** `feat(theme): NativeWind with react's STYLESEED tokens, and a stored theme`.

### Task 5: The documents

**Files:**
- **Create:** `CLAUDE.md`, `ARCHITECTURE.md`, `SECURITY.md`, `README.md`, `AGENTS.md`.
- **Modify:** `package.json` (`lint:docs` covers them).

- [ ] **Step 1: Write them in the siblings' shape and house style.**
  - **`CLAUDE.md`:**
    - "Shared core": react is the source, the rules, and a pointer to react's table.
    - "The gate": every step, and why Jest and not `vp test`.
    - The toolchain spike's results from Task 1.
    - The TypeScript pin.
    - "Never install": react's list.
  - **`ARCHITECTURE.md`:** the layout, the port table above (kept current), the polyfill order, the theme.
  - **`SECURITY.md`:**
    - The threat model rows the spec lists.
    - The known gaps for version 1, among them "the polyfills are not yet checked on a device".
    - Spec section 1's out-of-scope list.
  - **`README.md`:**
    - Set up a dev client, with and without a Mac.
    - Each script.
    - `EXPO_PUBLIC_API_URL`.
    - A manual device checklist: the app opens, the theme follows the system, and one request carries `traceparent`, which proves `crypto.getRandomValues`.
  - **`AGENTS.md`:** points to `CLAUDE.md`, as the siblings' does.
- [ ] **Step 2: Run** `pnpm lint:docs && REACT_BOILERPLATE_DIR=/Users/abhijeet/Mahaverick/react-boilerplate pnpm gate`. Expected: exit 0.
- [ ] **Step 3: Commit:** `docs: the expo app's rules, architecture, security notes and setup`.

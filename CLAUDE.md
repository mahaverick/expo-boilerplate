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
  manifest is one of them.
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
  absolute URL goes through `openURL`, and a refusal is caught.
- **knip reads the manifest.** `knip.ts` enters every expo row, and the runner
  port, whose names are the manifest's `testPorts` row. A shared file or export
  this app does not reach yet is react's code, not dead code here.
- **`src/components/ui/` holds only `.gitkeep`.** `copy-style.test.ts` scans
  it as the runner port's second root, and the scan fails on a missing
  directory.
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

1. `pnpm check`: `vp check` (Oxfmt, then Oxlint with type-aware rules), then
   `eslint . --max-warnings 0` for the rules Oxlint lacks.
2. `pnpm typecheck`: `tsc --noEmit`.
3. `pnpm lint:docs`: history phrasing and broken links in markdown and in the
   `#` comments of config and shell files.
4. `pnpm sync:check`: every expo row of `shared-core.json` is react's copy.
   With no react checkout it warns and passes; under `CI=true` it fails. Point
   it at react with `REACT_BOILERPLATE_DIR=<path>`.
5. `pnpm knip`: unused files, exports, types and dependencies.
6. `pnpm expo:doctor`: `expo-doctor`'s 20 checks, among them the SDK's pinned
   versions.
7. `pnpm test:coverage`: Jest with the coverage thresholds. `pnpm test` runs
   the same tests with no thresholds.
8. `pnpm export`: a Hermes bundle for iOS and one for Android.

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
  NativeWind reports the stored scheme, or after 2 seconds
  (`SPLASH_FALLBACK_MS`), whichever comes first. NativeWind drops the native
  appearance event while the app is not active, so without the bound a lost
  event would hold the splash screen until a force-quit. The cost: on a slow
  device, the fallback can show one light frame before a stored dark theme
  paints. That is the chosen trade against hanging on the splash screen.
- **No device has run the splash or the theme.** The tests model NativeWind's
  event.

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

Class-name merging has no replacement here yet. The plan that writes the UI
kit adds a helper in `src/lib/` without `clsx` or `tailwind-merge`.

Do not add shadcn, Base UI or any other web-only UI package either. They
render DOM, and the app renders React Native views.

Adding a banned package gives the project two ways to do the same thing.

## Follow-ups

Each item is a change for react or for a later plan, with the reason it waits.

- **Coverage thresholds sit below react's.** React's are statements 88,
  branches 82, functions 86 and lines 89. The shared tests alone (31 manifest
  rows, 29 of them test files) cover statements 43.78%, branches 46.00%,
  functions 31.47% and lines 42.51% of `src/`, because they exercise only part
  of the 75 shared files. The full suite measures 45.40%, 46.82%, 33.27% and
  44.18% on 6 November 2026. `jest.config.ts` holds 43, 46, 31 and 42. React
  should mark more of its tests for expo; then expo raises each threshold
  toward react's.
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
- **`scripts/sync-check.mjs` is apex's script with `APP` set to `expo`.** A
  react PR should make it one shared row, so the copies cannot drift.
- **Plans are not tracked.** `docs/superpowers/plans/` is git-ignored, and the
  specs under `docs/superpowers/specs/` are tracked. A plan lives on the
  machine of whoever wrote it.
- **The Hermes polyfills, the splash screen and the React Compiler are
  unchecked on a device.** [SECURITY.md](SECURITY.md#known-gaps) and the
  README checklist carry them.

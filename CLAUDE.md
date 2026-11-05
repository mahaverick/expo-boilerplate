# CLAUDE.md

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

## The shared core

The paths `shared-core.json` gives `expo` are react's files, byte for byte.
None is edited here. Each place a shared file needed something from expo is
answered on expo's side:

- **TypeScript has no DOM lib.** `tsconfig.json` sets `lib: ["ESNext"]` over
  Expo's `["DOM", "ESNext"]`. React Native's own globals declare `Blob` and
  `URL`. `crypto` type-checks through `@types/node`, which the tests need, so
  `tsc` does not prove Hermes has it: `src/polyfills.ts` installs it.
- **`src/polyfills.ts` loads first.** `index.ts`, the package entry, imports it
  before `expo-router/entry`. The `@formatjs/intl-relativetimeformat` paths end
  in `.js`, the only subpaths its `exports` map lists. `vite.config.ts` allows
  `require()` in that one file, so the `Intl.RelativeTimeFormat` polyfill loads
  only where the engine lacks it.
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

## Follow-ups

- **Coverage thresholds sit below react's.** React's are statements 88,
  branches 82, functions 86 and lines 89. The 29 shared tests react gives expo
  cover statements 43.88%, branches 46.19%, functions 31.34% and lines 42.61%
  of the tree, so `jest.config.ts` holds 43, 46, 31 and 42. React should mark
  more of its tests for expo; raise each threshold as the shared tests grow.
- **One copy-style case is skipped by name.** `test` and `test:coverage` pass
  `--testNamePattern` with a negative lookahead that skips only "finds the copy
  it guards" in `tests/unit/copy-style.test.ts`. That case expects more than
  500 pieces of copy and the anchor "Check your inbox", which react's screens
  hold and expo's shared rows do not. Every other copy-style case runs. A
  react PR moves the 500 floor and the anchors into the runner port beside
  `copyStyleRoots`; once expo copies it, drop the pattern from both scripts.

# CLAUDE.md

## Toolchain

Each tool below was checked on 6 November 2026 against Expo SDK 58
(`expo` 58.0.23, React Native 0.88.1), pnpm 12.16.1 and Node 26.13.0.

- **`vp check` runs as the siblings run it.** `pnpm check` is `vp check`
  (Oxfmt, then Oxlint with type-aware rules), then `eslint . --max-warnings 0`.
  `vp check` formats and lints only and never starts a test runner. It passes
  on this tree, which has no Jest yet; the first Jest tests confirm the Jest
  side. The fallback, the `oxlint` and
  `oxfmt` command-line tools at vite-plus 1.3.0's versions (Oxlint 1.88.0,
  Oxfmt 0.73.0), is not needed.
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

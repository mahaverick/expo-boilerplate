# react shared core and the web pages the app needs: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split react's browser-free logic into files that apex and expo copy byte for byte, enforce that with a checked manifest, and add the app-association files and the account deletion page.

**Architecture:**
- `shared-core.json`, at the repo root, is the single list of shared files. It names which other apps hold each file, the **ports** (per-app modules at fixed paths) a shared file may import, and the exact exports it may take from each.
- `scripts/check-shared.mjs`, run in `pnpm gate`, parses every shared file with the TypeScript compiler. A shared file may import only:
  - another shared file;
  - a declared export of a declared port;
  - an npm package that isn't banned.

  It may reference no banned browser global. It also checks that ARCHITECTURE.md's "Shared core" table matches the manifest.
- Shared files keep their current paths; there is no `core/` folder. The expo app mirrors these paths. The new ports the spec names live in `src/ports/`, matching the expo spec's layout.

**Tech Stack:** React 19, TanStack Router and Query, axios, Zustand, Zod 4, Vitest through `vp test` (`vite-plus/test`), nginx (`nginxinc/nginx-unprivileged`).

**Repo:** `/Users/abhijeet/Mahaverick/react-boilerplate`, branch `feat/shared-core` in a worktree.

**Order:** part 2b of 3 plans. It is independent of 2a (express). Plan 2c (apex) copies its files, so this PR merges before 2c's.

**Spec:** `/Users/abhijeet/Mahaverick/expo-boilerplate/docs/superpowers/specs/2026-11-03-react-shared-core-design.md`. Task 1 moves it to `react-boilerplate/docs/superpowers/specs/`, as the spec says. Part 3's spec (`2026-11-03-expo-boilerplate-design.md`, sections 1, 2 and 6) states what expo will read from these files.

## Global Constraints

- Every rule in `react-boilerplate/CLAUDE.md` applies. In particular:
  - UI copy uses curly apostrophes, "workspace" never "tenant", and "web address" never "slug";
  - `tests/unit/copy-style.test.ts` passes.
- **Banned in a shared file:**
  - the globals `window`, `document`, `location`, `navigator`, `localStorage`, `sessionStorage`, `import.meta.env` and `import.meta.dirname`;
  - the packages `posthog-js`, `posthog-react-native`, `@tanstack/react-router`, `@simplewebauthn/browser`, `react-native` and `@tabler/icons-react`;
  - the path `@/components/*`.
- **A shared test** takes `describe`, `it`, `test`, `expect`, `beforeEach` and `afterEach` only from the runner port `@/tests/support/runner`. It uses no `vi.*`, no `import.meta` and no `node:fs`.
- **No behaviour changes on the web.** Every existing test still passes. When one moves or changes, its assertions keep their values.
- **Copying.** Each task that moves a file into the manifest gives it `"apex"` only when `cmp` against `/Users/abhijeet/Mahaverick/apex-boilerplate` shows it equal today, or when the spec's section 3 says apex takes it. Every core file gets `"expo"`.
- **Commits** use conventional-commit prefixes, end with the session's attribution lines, and are GPG-signed. Push with `pnpm push`. The branch is done when `pnpm gate` exits 0.

## The shared list

This is the import closure of the spec's named files, computed on 4 November 2026 with the ports below (`scratchpad/closure2.cjs`).

**Already clean.** Task 1 adds these to the manifest:
- `src/constants/`: `app`, `audit-action-names`, `audit-actions`, `maintenance-mode`, `membership-roles`, `roles`, `routes`
- `src/types/`: `api`, `billing`, `list`, `passkey`, `tax` (`.types.ts`)
- `src/schemas/`: `auth`, `email-domain`, `list`, `list-request`, `passkey`, `profile`, `safe-text`, `search`, `slug`, `tenant` (`.schemas.ts`)
- `src/lib/`:
  - `api-error`, `billing-banner`, `billing-format`, `countdown`, `format`, `notification-link`, `notification-type`, `passkey-sign-in-message`, `plan-refusal`, `plural`, `relative-time`;
  - `retry`, `role-denied`, `step-up`, `tenant-guard`, `trial-summary`, `write-failure`, `zod-jitless`.
- `src/hooks/use-now.ts`, `src/http/traceparent.ts`, `src/observability/flags/flag-types.ts`
- `src/queries/`: `audit`, `beta`, `billing`, `client-settings`, `insights`, `invitation`, `list`, `maintenance-status`, `notification`, `notification-list`, `onboarding`, `profile`, `tenant`, `tenant-forms` (`.queries.ts`)

**Need a split first** (the task that adds each one):
- `src/http/interceptors.ts` (Task 2)
- `src/http/create-api-client.ts`, `src/http/auth-verdict.ts`, `src/http/refresh-core.ts`, all new (Task 2)
- `src/observability/flags/flag-values.ts` (Task 3)
- `src/observability/telemetry/url-sanitizer.ts` (Task 3)
- `src/queries/auth.queries.ts` (Task 3)
- `src/queries/tax.queries.ts` (Task 3)
- `src/lib/maintenance-state.ts`, new (Task 3)
- `src/queries/passkey.queries.ts`, `passkey-manage.queries.ts`, `step-up.queries.ts` and `src/types/webauthn.types.ts` (new) (Task 4)
- `src/lib/members-limit.ts` and `src/lib/billing-page.ts`, both after their copy moves out (Task 5)
- `src/queries/account-deletion.queries.ts`, new (Task 7)

**Ports, with the exports a shared file may import.** Each app writes its own copy of these modules.

| Port | Exports |
| --- | --- |
| `src/http/client.ts` | `apiClient`, `unwrap` |
| `src/http/session.ts` | `broadcastAuthMessage`, `broadcastLogout`, `ensureSession`, `redirectToLogin`, `switchIdentity` |
| `src/states/auth.store.ts` | `useAuthStore` |
| `src/states/maintenance-mode.store.ts` | `useMaintenanceModeStore` |
| `src/observability/telemetry/index.ts` | `AnalyticsKey`, `analyticsKey`, `getAnalyticsSessionIdFor`, `track` |
| `src/observability/flags/flag-keys.ts` | `CLIENT_FLAGS` |
| `src/constants/frontend-app.ts` | `FRONTEND_APP` |
| `src/lib/toast.ts` | `toast` |
| `src/ports/runtime.ts` (new) | `isDev` |
| `src/ports/navigation.ts` (new) | `assignLocation` |
| `src/ports/webauthn.ts` (new) | `webauthn` |
| `tests/support/runner.ts` (new, test port) | `describe`, `it`, `test`, `expect`, `beforeEach`, `afterEach`, `repoRoot`, `copyStyleRoots` |

**Not shared.** These stay per-app:
- every `src/states/*` store;
- `src/lib/step-up-presence.ts`, `current-tenant.ts`, `maintenance-mode.ts`, `webauthn.ts` and `download-file.ts`;
- `src/constants/navigation.ts`, `settings.ts` and `auth-providers.ts` (they import icons or components);
- `src/lib/action-message.ts`.

Files part 3 names but this spec doesn't (`event-registry.ts`, `sent-title.ts`, `scrub.ts`, `use-changed-fields.ts`) are added to the manifest by part 3's plan when expo needs them.

## Deviations from the spec, to confirm in review

1. **`src/configs/runtime.ts` and `constants/frontend.ts` don't exist.**
   - The runtime file is `configs/runtime-config.ts`, which has no `isDev`. Ruling: the new port is `src/ports/runtime.ts`, matching part 3's `ports/` layout.
   - The frontend constant is `src/constants/frontend-app.ts`, and it becomes a port.
2. **`resolve-current-tenant.ts` isn't needed.** The pure resolver already exists and is clean: `correctTenant` in `src/lib/tenant-guard.ts`. Ruling: share `tenant-guard.ts`. `lib/current-tenant.ts` stays per-app, and part 3 calls `correctTenant`.
3. **The webauthn port is wider than `create`, `get`, `isSupported`.** The shared queries also read a cancel generation, and send three WebAuthn Signal API hints. Ruling: the port adds `cancelGeneration`, `signalUnknown`, `signalAccepted` and `signalUser`. On native these can be no-ops.
4. **`billing.queries.ts` downloads nothing.** Only `tax.queries.ts` does, through `downloadTaxDocument`. Ruling: that function moves to a per-app `src/queries/tax-download.queries.ts`.
5. **Tests import from `vite-plus/test`, not globals.** `copy-style.test.ts` also uses `node:fs` and `typescript` throughout, not only at line 28. `tax-details.schemas.test.ts` reads its own source to assert ASCII, not fixtures.
   - Ruling: shared tests import from a runner port.
   - `copy-style.test.ts` takes `repoRoot` from that port, and is the manifest's one exemption from the `node:fs` ban, because Jest runs in Node.
   - The ASCII assertion moves to a per-app test.
6. **`write-failure.ts` and `tenant-guard.ts` aren't browser-free on their own.** They reach `auth.store` and `tenant.queries`. Ruling: they are shared, and reach the store only through the declared `useAuthStore` port.
7. **A shared test needs none of `vi`.** Tests of shared files that use `vi.*` or MSW stay per-app. Expo writes its own versions; react and apex keep theirs.
8. **`@tabler/icons-react` is added to the ban list.** It is web-only, and the spec's list missed it.

## Review Focus

1. **`location` as a property or key in a shared file**, such as `error.response.headers.location` or `{ location }` in a callback. It must not trip `check-shared`, and neither must `window` inside a comment or a string. Test in Task 1.
2. **Body transport, two concurrent `401`s.** They must share one `POST /auth/refresh`, and the new token must be stored before either caller resumes. Nothing else exercises this until part 3. Test in Task 2.
3. **`IOS_APP_IDS` or `ANDROID_APP_LINKS` unset.** Its path must answer `404`, not fall through `location /` to `index.html` with a `200`. Test in Task 6.
4. **The extensionless AASA file must be served as `application/json`**, not `application/octet-stream`. Test in Task 6.
5. **A signed-in visitor at `/delete-account`** must land on the settings page, not be sent a sign-in link. Test in Task 7.

---

### Task 1: The manifest, `check-shared` and runner-neutral tests

**Files:**
- Move: the spec file to `docs/superpowers/specs/2026-11-03-react-shared-core-design.md`
- Create: `shared-core.json`, `scripts/check-shared.mjs`, `scripts/check-shared.d.mts`, `tests/support/runner.ts`, `tests/unit/scripts/check-shared.test.ts`, `tests/unit/schemas/tax-details-source.test.ts`
- Modify: `package.json` (`check:shared`, added to `gate` after `lint:docs`), `tests/unit/copy-style.test.ts`, `tests/unit/schemas/tax-details.schemas.test.ts`, and each shared test listed in Step 5

**Interfaces:**
- Produces the `shared-core.json` shape. Every later task adds rows to it.

```json
{
  "files": { "src/lib/plural.ts": ["apex", "expo"] },
  "tests": { "tests/unit/lib/plural.test.ts": ["expo"] },
  "ports": { "src/http/client.ts": ["apiClient", "unwrap"] },
  "testPorts": { "tests/support/runner.ts": ["describe", "it", "test", "expect", "beforeEach", "afterEach", "repoRoot", "copyStyleRoots"] },
  "exemptions": { "tests/unit/copy-style.test.ts": ["node:fs", "node:path", "typescript"] }
}
```

- Produces the CLI `node scripts/check-shared.mjs [--manifest <path>] [--root <dir>] [--app <name>] [--docs <ARCHITECTURE.md>]`.
  - It checks every row whose apps include `expo` and, when `--app` is given, that app too. Exit 0 when clean; exit 1 with one `path:line: reason` per finding.
  - Its exported `checkShared(options): Finding[]` is what the unit test calls.
- `tests/support/runner.ts` re-exports the six test functions from `vite-plus/test`. It also exports:
  - `repoRoot`, the repo's absolute path;
  - `copyStyleRoots: readonly string[]`, the directories `copy-style.test.ts` scans, relative to `repoRoot`. Today that is `['src']`. Expo adds `src/components/ui` without editing the shared test.
- **A shared test that imports `tests/fixtures/*`.** The fixture becomes a shared row when it passes the check; otherwise the test stays per-app.

- [ ] **Step 1: Write the failing tests** in `tests/unit/scripts/check-shared.test.ts`, against temporary fixture trees:
  - `refuses window in a shared file`
  - `allows window inside a comment or a string`
  - `allows location as a property name or a destructured key`
  - `allows a parameter or local variable named location`
  - `refuses import.meta.env`
  - `refuses a banned package`
  - `refuses an @/components import`
  - `refuses an import of a file that is neither shared nor a port`
  - `refuses an export a port does not declare`
  - `refuses vi in a shared test`
  - `refuses node:fs in a shared test unless exempt`
  - `refuses a shared test importing vite-plus/test directly`
  - `reports a manifest path missing from the docs table, and a table row missing from the manifest`
- [ ] **Step 2: Run** `pnpm vp test tests/unit/scripts/check-shared.test.ts`. Expected: fails, because the module doesn't exist.
- [ ] **Step 3: Implement `check-shared.mjs`.**
  - Use `typescript`'s parser.
  - A banned global is an `Identifier` that resolves to no local declaration and isn't the name side of a property access, property assignment or binding element.
  - Resolve `@/` to `src/`, `@/tests/` to `tests/`, and relative paths as written.
- [ ] **Step 4: Fill the manifest and the runner port.**
  - Add the "Already clean" rows of **The shared list** with their apex column (Global Constraints, Copying).
  - Add every port in the ports table whose file exists today, with exactly the exports listed: `client`, `session`, `auth.store`, `maintenance-mode.store`, `telemetry/index`, `flag-keys`, `frontend-app` and `toast`.
  - Add every row of ARCHITECTURE.md's "Sibling sync with apex" table that names a byte-for-byte file, after checking it with `cmp`, with apps `["apex"]`. A row that isn't byte-equal today stays in prose (Task 8).
  - Create `tests/support/runner.ts`.
  - Add `scripts/check-shared.mjs` and `scripts/check-shared.d.mts` with `["apex", "expo"]`, so the siblings run the same checker.
- [ ] **Step 5: Make the shared tests runner-neutral.** Shared tests are the tests of shared files that use no `vi.*`, no MSW and no `tests/mocks` import. The researched candidates:
  - `tests/unit/lib/`: `billing-banner`, `billing-format`, `countdown`, `notification-link`, `notification-type`, `plan-refusal`, `plural`, `relative-time`, `retry`, `role-denied`, `step-up`, `trial-summary`, `write-failure`, `api-error`, `format`;
  - the schema tests of the shared schemas;
  - `copy-style.test.ts`.

  For each one, switch its import to `@/tests/support/runner` and add it under `tests`. In `copy-style.test.ts`, replace `import.meta.dirname` with `repoRoot`, and replace its fixed `src/` walk with `copyStyleRoots`. Move `tax-details.schemas.test.ts`'s source-ASCII assertion (near line 123) to `tests/unit/schemas/tax-details-source.test.ts`, then add the schema test.
- [ ] **Step 6: Run** `pnpm vp test tests/unit && node scripts/check-shared.mjs`. Expected: all pass, and the check prints nothing and exits 0. The `--docs` flag is added to `gate` in Task 8.
- [ ] **Step 7: Commit:** `build(shared): a checked manifest of the files react shares with apex and expo`.

### Task 2: The HTTP split

**Files:**
- Create: `src/http/create-api-client.ts`, `src/http/auth-verdict.ts`, `src/http/refresh-core.ts`, `tests/unit/http/refresh-core.test.ts`, `tests/unit/http/auth-verdict.test.ts`
- Modify: `src/http/client.ts`, `src/http/interceptors.ts`, `src/http/session.ts` (both stay per-app, and keep every export they have today), `shared-core.json`
- Test: the existing `tests/unit/http/*` suites, unchanged in their assertions

**Interfaces:**
- `create-api-client.ts`: `createApiClient({ baseURL, withCredentials }: { baseURL: string; withCredentials: boolean }): AxiosInstance`. It keeps today's `timeout: 30_000` and the JSON `Content-Type` header. It also exports `unwrap`, which `client.ts` re-exports.
- `auth-verdict.ts`: `SessionIdentityChangedError` and `NoRefreshTokenError` (new), and `isAuthVerdict(error: unknown): boolean`. It is true for either class, or for an axios `401`. `session.ts` re-exports `SessionIdentityChangedError` and `isAuthVerdict`.
- `interceptors.ts`: `installInterceptors(client: AxiosInstance, ports: InterceptorPorts): void`.
  - `InterceptorPorts` is `{ isApiRequest(config: InternalAxiosRequestConfig): boolean; ensureSession(): Promise<string>; signOut(): void; redirectToLogin(): void }`.
  - `signOut` replaces today's `logout()`, `broadcastLogout()`, `redirectToLogin()` sequence.
  - The order and behaviour of today's five interceptors don't change.
  - `client.ts` owns `isApiRequest`, the `window.location.origin` check from today's lines 101–108.
- `refresh-core.ts`: `createRefreshCore(options: RefreshCoreOptions): { ensureSession(): Promise<string>; reset(): void }`. `RefreshCoreOptions` has:
  - `client: AxiosInstance`;
  - `transport: 'cookie' | 'body'`;
  - `tokenStore?: RefreshTokenStore`, required for `body`, where `RefreshTokenStore = { read(): Promise<string | null>; write(token: string): Promise<void>; clear(): Promise<void> }`;
  - `lock?: <T>(run: () => Promise<T>) => Promise<T>`;
  - `onIdentityChanged?: () => void`;
  - `onSignedOut?: () => void`.
- The core does what `refreshSession` and `ensureSession` do today (`session.ts` lines 247–321):
  - one in-flight promise;
  - `POST /auth/refresh` with `skipAuthRetry`;
  - `GET /profile` with the new bearer;
  - `SessionIdentityChangedError` when the stored user differs;
  - `useAuthStore.getState().login`;
  - on an auth verdict, `logout()`, then `onIdentityChanged` or (`wasAuthed` only) `onSignedOut`.
- **Body transport.** Express's native response is `{ accessToken, refreshToken, refreshTokenExpiresAt }` (`express-boilerplate/src/controllers/helpers.controller.ts:296`).
  - It reads the token from `tokenStore`, and with none, rejects with `NoRefreshTokenError` without a request.
  - It posts `{ refreshToken }`, and awaits `tokenStore.write(response.refreshToken)` before fetching the profile.
  - On an error with no response, it retries once at once with the same token. On an auth verdict, it calls `tokenStore.clear()`.
  - The cookie transport posts no body and never retries, as today.
- `session.ts` builds the core with `transport: 'cookie'` and `lock` from `navigator.locks.request('auth-refresh', …)` when present. It passes `onIdentityChanged: yieldSharedIdentity` and `onSignedOut: broadcastLogout`.
- **Import cycle.** `client.ts` imports `session.ts` for the ports, and `session.ts` imports `apiClient`. To keep this safe:
  - `session.ts` keeps hoisted `export function` declarations;
  - it builds the core lazily on the first `ensureSession()` call, never at module top;
  - `client.ts` passes the ports as functions that call `session.ts`'s exports when invoked.

- [ ] **Step 1: Write the failing tests** in `refresh-core.test.ts`, with a stub axios adapter and an in-memory `tokenStore`. Use no MSW, and the runner port only.
  - `shares one refresh between concurrent callers`
  - `body: two concurrent callers send one POST and both see the stored token`
  - `body: stores the new token before resolving`
  - `body: rejects with NoRefreshTokenError and sends nothing when no token is stored`
  - `body: retries once at once on a network error, with the same token`
  - `body: clears the store on a 401`
  - `cookie: posts no body and does not retry on a network error`
  - `throws SessionIdentityChangedError when the profile is another user`
  - `calls onSignedOut only when a user was signed in`

  In `auth-verdict.test.ts`: `NoRefreshTokenError is a verdict` and `a 500 is not a verdict`.

  Add two load-order tests:
  - `tests/unit/http/load-order-session-first.test.ts` imports `@/http/session` and then `@/http/client`;
  - `load-order-client-first.test.ts` imports them in the other order.

  Each calls `ensureSession()` against a stub adapter and expects no `ReferenceError`.
- [ ] **Step 2: Run** `pnpm vp test tests/unit/http/refresh-core.test.ts tests/unit/http/auth-verdict.test.ts`. Expected: fails, because the modules don't exist.
- [ ] **Step 3: Implement** the three new files. Then rewire `client.ts`, `interceptors.ts` and `session.ts` to use them.
- [ ] **Step 4: Run** `pnpm vp test tests/unit/http tests/unit/lib/maintenance-mode.test.ts && pnpm typecheck`. Expected: every existing http test passes unchanged.
- [ ] **Step 5: Manifest.** Add the four shared http files with `["apex", "expo"]`. Add the two new tests. The `client` and `session` port rows from Task 1 stay as they are. Run `node scripts/check-shared.mjs`. Expected: exit 0.
- [ ] **Step 6: Commit:** `refactor(http): share the client factory, the interceptor chain and one refresh core`.

### Task 3: Runtime, navigation, telemetry types, tax download and the maintenance machine

**Files:**
- Create: `src/ports/runtime.ts`, `src/ports/navigation.ts`, `src/queries/tax-download.queries.ts`, `src/lib/maintenance-state.ts`, `tests/unit/lib/maintenance-state.test.ts`
- Modify: `src/observability/flags/flag-values.ts`, `src/observability/telemetry/url-sanitizer.ts`, `src/queries/auth.queries.ts`, `src/queries/tax.queries.ts` (and the components that import `downloadTaxDocument`), `src/states/maintenance-mode.store.ts`, `src/lib/maintenance-mode.ts`, `shared-core.json`

**Interfaces:**
- `src/ports/runtime.ts`: `export const isDev: boolean = import.meta.env.DEV`. `flag-values.ts` reads it in place of lines 94 and 100.
- `src/ports/navigation.ts`: `assignLocation(url: string): void`, a full page load. `auth.queries.ts` calls it in place of `window.location.assign` (line 132).
- `auth.queries.ts`'s `useRequestSignInLink` sends `app: FRONTEND_APP` in place of the literal `'web'` (near line 44). Otherwise expo's sign-in links would open the website. React still sends `'web'`.
- `url-sanitizer.ts`: a local `CaptureResult` type with only the fields it reads, in place of the `posthog-js` import. `posthog-options.ts` still type-checks against the real one.
- `tax-download.queries.ts`: `downloadTaxDocument`, moved unchanged from `tax.queries.ts`.
- `maintenance-state.ts` holds the mode machine:
  - `maintenanceHeaderValue(headers: unknown): unknown`, moved from `maintenance-mode.ts`;
  - `modeFromHeader(current: MaintenanceMode, value: unknown): MaintenanceMode | null`, which is null when nothing changes;
  - `stateFromError(code: typeof MAINTENANCE_MODE | typeof READ_ONLY_MODE, body: unknown): MaintenanceSnapshot`;
  - `stateFromStatus(status: MaintenanceStatus): MaintenanceSnapshot`;
  - `MaintenanceSnapshot`, which is `{ mode, message, since }`.

  The store's three setters call these. `maintenance-mode.ts` keeps its storage and router code.

- [ ] **Step 1: Write the failing tests** in `maintenance-state.test.ts`, using the runner port:
  - `an unknown header value changes nothing`
  - `the current mode in the header changes nothing`
  - `a known new mode in the header clears the message`
  - `a 503 body naming read_only wins over the code`
  - `a non-string message in a 503 body becomes null`
- [ ] **Step 2: Run** `pnpm vp test tests/unit/lib/maintenance-state.test.ts`. Expected: fails, because the module doesn't exist.
- [ ] **Step 3: Implement** the files and the rewiring the interfaces state.
- [ ] **Step 4: Run** `pnpm vp test tests/unit && pnpm typecheck`. Expected: all pass, including the existing maintenance, flag, url-sanitizer, auth and tax suites.
- [ ] **Step 5: Manifest.** Add `flag-values.ts`, `url-sanitizer.ts`, `auth.queries.ts`, `tax.queries.ts`, `maintenance-state.ts` and its test, and the `runtime` and `navigation` ports. Run `node scripts/check-shared.mjs`. Expected: exit 0.
- [ ] **Step 6: Commit:** `refactor(shared): move platform reads in flags, auth, tax and maintenance behind ports`.

### Task 4: The webauthn port

**Files:**
- Create: `src/ports/webauthn.ts`, `src/types/webauthn.types.ts`, `tests/unit/ports/webauthn.test.ts`
- Modify: `src/queries/passkey.queries.ts`, `passkey-manage.queries.ts`, `step-up.queries.ts`, `shared-core.json`

**Interfaces:**
- `webauthn.types.ts` declares, structurally:
  - `PublicKeyCredentialRequestOptionsJSON`, `PublicKeyCredentialCreationOptionsJSON`, `AuthenticationResponseJSON` and `RegistrationResponseJSON`, copied from `@simplewebauthn/browser`'s definitions;
  - `interface WebAuthnPort`.
- `WebAuthnPort` has:
  - `isSupported(): Promise<{ create: boolean; autofill: boolean }>`
  - `get(options, mode: 'modal' | 'autofill', since?: number): Promise<AuthenticationResponseJSON>`
  - `create(options): Promise<RegistrationResponseJSON>`
  - `cancelGeneration(): number`
  - `signalUnknown(rpId: string, credentialId: string): void`
  - `signalAccepted(…)` and `signalUser(…)`, with today's `signalAcceptedPasskeys` and `signalPasskeyUser` parameters.
- `src/ports/webauthn.ts`: `export const webauthn: WebAuthnPort`, built from today's `src/lib/webauthn.ts` functions. `lib/webauthn.ts` and the components that use it don't change.

- [ ] **Step 1: Write the failing test** in `tests/unit/ports/webauthn.test.ts` (per-app). Name it `the local JSON types are assignable to and from @simplewebauthn/browser's`, with `expectTypeOf` from `vite-plus/test` in both directions for all four types. Then run `pnpm vp test tests/unit/ports/webauthn.test.ts`. Expected: fails, because the module doesn't exist.
- [ ] **Step 2: Implement.** The three queries import only `webauthn` from `@/ports/webauthn`, and types from `@/types/webauthn.types`. `step-up.queries.ts` imports `isAuthVerdict` from `@/http/auth-verdict`, because the `session` port doesn't declare it.
- [ ] **Step 3: Run** `pnpm vp test tests/unit && pnpm typecheck`. Expected: all pass, including the passkey and step-up suites unchanged.
- [ ] **Step 4: Manifest.** Add the three queries and `webauthn.types.ts` with `["apex", "expo"]`, and the `webauthn` port. Run `node scripts/check-shared.mjs`. Expected: exit 0.
- [ ] **Step 5: Commit:** `refactor(passkeys): the shared queries reach WebAuthn through a port`.

### Task 5: Copy leaves the shared billing and member-limit logic

**Files:**
- Create: `src/copy/billing.ts`, `src/copy/members-limit.ts`
- Modify: `src/lib/billing-page.ts`, `src/lib/members-limit.ts`, their importers, their tests, `shared-core.json`

**Interfaces:**
- The rule: an export that returns or is a sentence a person reads moves to `src/copy/`. An export that returns data or a boolean stays.
  - It moves from `billing-page.ts`: `paymentsOff`, `CARD_CODE_HINT`, `INTERVAL_ADJECTIVE`, `billingStateLine`, `intervalPriceLine`, `yearlySaving`, `upgradeLabel`, `cancelBody`, `cancelToast` and `BillingLineContext`.
  - It moves from `members-limit.ts`: `membersLimitLine`.
  - They stay: `cardChangeNeedsCode`, `showsPlanChoice`, `hasLiveSubscription`, `canChangeSubscription`, `switchArea` (when it returns data; otherwise it moves), `NOT_SENT_AT_LIMIT` (neutral copy, which expo reuses) and `isMembersLimitRefusal`.
- Names and signatures don't change. Only import paths do.

- [ ] **Step 1: Move the exports and their tests.** Tests of moved exports move to `tests/unit/copy/`.
- [ ] **Step 2: Run** `pnpm vp test tests/unit && pnpm typecheck`. Expected: all pass, with assertions unchanged.
- [ ] **Step 3: Manifest.** Add `billing-page.ts` and `members-limit.ts` and their remaining tests. Run `node scripts/check-shared.mjs`. Expected: exit 0.
- [ ] **Step 4: Check every expo row for sales copy.** Expo's spec, section 6, forbids any text that asks the user to buy. Run `grep -nE "Upgrade|upgrade|Paid|payment|checkout|price|Buy|Subscribe" $(node -e "console.log(Object.entries(require('./shared-core.json').files).filter(([,a])=>a.includes('expo')).map(([p])=>p).join(' '))")`, then read each hit.
  - An endpoint path, a query key or a comment is fine.
  - A string a person reads moves to `src/copy/`.

  On 4 November 2026 the only hits outside these two files were endpoint paths in `billing.queries.ts`.
- [ ] **Step 5: Commit:** `refactor(billing): keep sales copy out of the shared billing logic`.

### Task 6: App-association files

**Files:**
- Create: `docker/15-app-links.sh`, `tests/unit/docker/app-links-script.test.ts`
- Modify: `Dockerfile` (copy the script into `/docker-entrypoint.d/`), `nginx.conf`, `tests/unit/docker/nginx-conf.test.ts`, `tests/unit/docker/dockerfile.test.ts`, `docker/check-image.sh`, `README.md` (env table)

**Interfaces:**
- The script reads `IOS_APP_IDS` and `ANDROID_APP_LINKS`, and writes to `${RUNTIME_CONFIG_DIR:-/tmp/runtime}/well-known/`.
  - `IOS_APP_IDS` is comma-separated, each entry matching `^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$`.
  - `ANDROID_APP_LINKS` is comma-separated `package:FINGERPRINT`, split at the first colon. The package matches `^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$`, and the fingerprint `^([0-9A-F]{2}:){31}[0-9A-F]{2}$`.
  - A malformed entry makes it exit 1 with one line naming the variable, as `10-runtime-config.sh` does. An unset or empty variable writes no file and removes a stale one.
- `apple-app-site-association`:

```json
{"applinks":{"details":[{"appIDs":["<ids>"],"components":[{"/":"/auth/link"},{"/":"/auth/confirm"},{"/":"/invitations/accept"},{"/":"/invitations/confirm"},{"/":"/settings/account/security"},{"/":"/tenants/*"}]}]},"webcredentials":{"apps":["<ids>"]}}
```

- `assetlinks.json`: an array with one statement per entry. Each statement is `{"relation":["delegate_permission/common.handle_all_urls","delegate_permission/common.get_login_creds"],"target":{"namespace":"android_app","package_name":"<package>","sha256_cert_fingerprints":["<fingerprint>"]}}`.
- nginx has two exact-match locations, `location = /.well-known/apple-app-site-association` and `location = /.well-known/assetlinks.json`. Each has `default_type application/json;` and an `alias` into `/tmp/runtime/well-known/`. A missing file answers `404`. They have no `add_header`, because the server block's headers must apply.
- **Apex takes the same files.** Ruling: the `Dockerfile`, `docker/check-image.sh` and `tests/unit/docker/*` rows that Task 1 gave `"apex"` keep it, and `docker/15-app-links.sh` joins them with `["apex"]`.
  - With both variables unset, apex answers `404` on both paths, which is harmless.
  - `nginx.conf` is only partly shared, so plan 2c adds the two locations to apex's copy by hand.
  - `check-image.sh` must therefore pass on an image with the variables unset.

- [ ] **Step 1: Write the failing tests.**
  - Script, run with env as `prepare-script.test.ts` does:
    - `writes both files for valid values`
    - `writes one assetlinks statement per entry, both relations each`
    - `exits 1 naming IOS_APP_IDS for a lowercase team id`
    - `exits 1 naming ANDROID_APP_LINKS for a short fingerprint`
    - `writes nothing and removes a stale file when a variable is unset`
  - nginx: `serves the AASA path as application/json`, and `the well-known locations are exact matches with no add_header`.
- [ ] **Step 2: Run** `pnpm vp test tests/unit/docker`. Expected: the new tests fail.
- [ ] **Step 3: Implement** the script, the nginx locations and the Dockerfile line.
- [ ] **Step 4: Extend `docker/check-image.sh`.**
  - With both variables set, `curl` gets `200`, `Content-Type: application/json` and both relations for each package.
  - With both unset, `curl` gets `404` on each path.

  Run `pnpm vp test tests/unit/docker && docker/check-image.sh`. Expected: all pass, which is the spec's success criterion 3.
- [ ] **Step 5: Commit:** `feat(docker): serve the app-association files from the container's environment`.

### Task 7: Account deletion pages

**Files:**
- Create: `src/queries/account-deletion.queries.ts`, `src/pages/_app/settings/account.delete.tsx`, `src/pages/delete-account.tsx`, `src/components/features/account/delete-account-section.tsx`, `tests/unit/queries/account-deletion.queries.test.ts`, `tests/unit/pages/_app/settings/account-delete.test.tsx`, `tests/unit/pages/delete-account.test.tsx`
- Modify: `src/types/api.types.ts`, `src/constants/settings.ts` (a "Delete account" entry in the Account group and in `AccountSettingsPath`), `src/routeTree.gen.ts` (regenerated), `shared-core.json`, plus every route list a test enforces (grep `tests/` and `docs/` for `/settings/account/security`)

**Interfaces:**
- `api.types.ts`: `interface DeletionRequest { requestedAt: string; dueAt: string }`.
- `account-deletion.queries.ts` (shared, `["expo"]`):
  - `accountDeletionKeys`;
  - `deletionRequestQueryOptions()`, which calls `GET /account/deletion-request` and returns `DeletionRequest | null`;
  - `useRequestAccountDeletion()`, which posts `{ reason?: string }` to `POST /account/deletion-request` and puts the returned request in the query cache.
- The settings page lives at `/settings/account/delete`.
  - With no open request, it shows:
    - the text "Ask us to delete your account. Our team deletes it within 30 days and emails you when it’s done.";
    - an optional "Why are you leaving?" field (at most 500 characters);
    - a destructive "Request deletion" button that runs the mutation through `useStepUp().run`.
  - With an open request, it shows "You asked us to delete your account on {requestedAt}. We’ll delete it by {dueAt}." The dates come from `formatDate`.
  - "Within 30 days" is always true, because express caps `ACCOUNT_DELETION_DAYS` at 30.
- **Google Play's requirements** for the deletion web page, as I recall them; check them against Play Console help before writing the copy. The page must:
  - name the app or developer as the store listing does (`APP_NAME` from `src/constants/app.ts`);
  - list the steps to request deletion;
  - say which data is deleted, which is kept, and for how long.

  Take the deleted and kept data from express's SECURITY.md "Account deletion" section: the user row is soft-deleted, then purged, and the audit entries are kept. Put it in a "What we delete" paragraph on both pages, and list it for the owner to confirm in the PR.
- `/delete-account` is a top-level route.
  - `beforeLoad` sends a signed-in visitor to `/settings/account/delete`, with the same check `_auth.tsx` uses.
  - A signed-out visitor sees `AuthLayout` with the existing sign-in link form, which posts `redirect: '/settings/account/delete'` and then shows its "check your email" state. Express accepts any same-origin path (`redirect.validators.ts`).

- [ ] **Step 1: Write the failing tests** (MSW, per-app, except the queries test).
  - `shows the open request's dates instead of the button`
  - `requests deletion through step-up and then shows the due date`
  - `sends the optional reason`
  - `a signed-in visitor at /delete-account lands on the settings page`
  - `a signed-out visitor at /delete-account requests a sign-in link that returns to the settings page`

  In the queries test, using the runner port and a stub adapter: `reads null when no request is open`.
- [ ] **Step 2: Run** `pnpm vp test tests/unit/pages/delete-account.test.tsx tests/unit/pages/_app/settings/account-delete.test.tsx tests/unit/queries/account-deletion.queries.test.ts`. Expected: fails.
- [ ] **Step 3: Implement**, regenerate the route tree, and add the routes to each enforced route list.
- [ ] **Step 4: Run** `pnpm vp test tests/unit && node scripts/check-shared.mjs && pnpm typecheck`. Expected: all pass.
- [ ] **Step 5: Commit:** `feat(account): request account deletion from settings or from /delete-account`.

### Task 8: Documentation

**Files:**
- Modify: `ARCHITECTURE.md` (replace "Sibling sync with apex", near lines 1345–1406), `CLAUDE.md` ("Sibling sync", line 11, and the rule near line 157), `README.md`, `package.json` (`check:shared` gains `--docs ARCHITECTURE.md`)

- [ ] **Step 1: Write the "Shared core" section.**
  - **The core table:** one row per manifest file, with columns `Path | apex | expo`.
  - **The ports table:** port path, exports, and what react's version does.
  - **The prose list:** the apex rows that aren't byte-for-byte.
  - **The rules:**
    - react is the source;
    - `scrub.ts` changes in express first;
    - `check-shared` runs in the gate;
    - apex and expo run `sync-check` against react `main`.
- [ ] **Step 2: Update CLAUDE.md "Sibling sync"** to name expo alongside apex, and point to `shared-core.json`.
- [ ] **Step 3: Update README.md.** Add `IOS_APP_IDS`, `ANDROID_APP_LINKS` and `/delete-account`, which is the URL to enter in Google Play Console.
- [ ] **Step 4: Run** `pnpm lint:docs && pnpm gate`. Expected: exit 0, with `check-shared --docs` finding the table equal to the manifest.
- [ ] **Step 5: Commit:** `docs: the shared core, its ports, and the app-association settings`.

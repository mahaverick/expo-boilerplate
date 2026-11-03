# Express native clients and account deletion: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Expo app hold an express session without a cookie, list a user's sessions, and let a customer request account deletion that staff complete.

**Architecture:**
- A router-level middleware sets `request.clientKind` (`'web'` or `'native'`) and refuses a native request that carries browser headers.
- Two controller helpers decide where the refresh token travels. `presentedRefreshToken` reads the cookie on web and the body on native. `deliverRefreshToken` sets the cookie on web and returns body fields on native. Every handler that touches the refresh token calls them instead of the cookie functions.
- Refresh rows record their client kind and device name, copied on rotation, and a rotation across kinds is refused.
- Deletion requests are a new table and route. The existing staff `deleteUser` completes them.

**Tech Stack:** Express 5, TypeScript, Drizzle ORM (Postgres), Redis, BullMQ, Zod 4, Vitest through `vp test`, supertest through `tests/helpers/request.ts`.

**Repo:** `/Users/abhijeet/Mahaverick/express-boilerplate`, on a new branch `feat/native-clients` in a worktree.

**Spec:** `/Users/abhijeet/Mahaverick/expo-boilerplate/docs/superpowers/specs/2026-11-03-express-native-clients-design.md`

## Global Constraints

- Every rule in `express-boilerplate/CLAUDE.md` applies. The ones every task meets:
  - every named function, method, type and exported const has a JSDoc description;
  - tests live in `tests/unit/` or `tests/integration/` (database or Redis), mirroring `src/`;
  - HTTP tests use `request` or `agent` from `tests/helpers/request.ts`;
  - no `process.env` outside the four allowed files: read config through `getEnv()`;
  - log through `logger`, never `console.*`.
- Every new route gets a row in `MAINTENANCE_ROUTE_RULES`, and every authenticated write gets a limiter (`tests/unit/routes/route-limiters.test.ts`).
- Copy: each sentence is under 30 words, every error gives a next step, and no message says "token". `tests/unit/copy-style.test.ts` must pass.
- A dead link or credential answers 400, never 401. Never rename an existing `code`.
- Migrations are generated with `pnpm db:migration:generate` from the Drizzle models, never hand-numbered. The next number after `0039` is whatever drizzle-kit assigns.
- Commits use conventional-commit prefixes, end with the session's attribution lines, and are GPG-signed. A task is done when its tests pass. The branch is done when `pnpm gate` exits 0.
- Spec values used verbatim:
  - header `X-Client: native`, header `X-Device-Name`, error code `NATIVE_CLIENT_REFUSED`;
  - `refreshToken` is 64 hexadecimal characters;
  - `deviceName` is at most 64 characters;
  - `REFRESH_REUSE_GRACE_MS = 10_000` is unchanged;
  - `ACCOUNT_DELETION_DAYS` defaults to 30;
  - the deletion reason is at most 500 characters;
  - staff are alerted about requests within 5 days of `due_at`;
  - the Android origin pattern is `^android:apk-key-hash:[A-Za-z0-9_-]{43}$`;
  - `client-settings` keeps `public, max-age=300`.

### Deviation from the spec, to confirm in review

Spec section 5 says an active paid subscription "is cancelled at period end". The existing `deleteUser` (`src/services/platform-user.service.ts:636`) already clears the user as payer (`billingRepository.clearPayer`), closes their upgrade requests and emails "payer left" to each workspace (`sendPayerLeftEverywhere`). The subscription belongs to the workspace, not the user. This plan keeps that behaviour and adds no cancellation.

## Review Focus

1. **The app is killed after express rotates the token but before the app stores the new one.** The app replays the old token within 10 s and expects a sibling session, not a sign-out. Test in Task 3.
2. **A native request also carries a cookie**, from React Native's cookie jar. Express must ignore the cookie and use the body. Test in Task 2.
3. **A web request puts `refreshToken` in the body.** Express must answer 400 and leave the cookie's session unconsumed. Test in Task 1.
4. **`X-Device-Name` holds control characters or 200 characters.** The sign-in must still succeed, with `deviceName` null. Test in Task 5.
5. **A user requests deletion twice.** The second call returns the first request and sends no second receipt. Test in Task 9.

---

### Task 1: Client kind and the browser-header refusal

**Files:**
- Create: `src/constants/native-client.constants.ts`
- Create: `src/middlewares/native-client.middleware.ts`
- Modify: `src/types/express.d.ts` (add `clientKind`)
- Modify: `src/routes/auth.routes.ts`, `src/routes/invitation.routes.ts` (mount first, before `requireJsonContentType` and every limiter; `/auth/passkeys` is under the auth router)
- Test: `tests/unit/middlewares/native-client.middleware.test.ts`, `tests/integration/api/native-client-refusal.test.ts`

**Interfaces:**
- Produces:
  - `CLIENT_KINDS = ['web', 'native'] as const`, `type ClientKind`, `NATIVE_CLIENT_HEADER = 'x-client'`, `DEVICE_NAME_HEADER = 'x-device-name'`, `NATIVE_CLIENT_REFUSED = 'NATIVE_CLIENT_REFUSED'`, `REFRESH_TOKEN_IN_BODY = 'REFRESH_TOKEN_IN_BODY'` (all in `native-client.constants.ts`)
  - `resolveClientKind: RequestHandler`, which sets `request.clientKind: ClientKind` (always set after it runs)
  - `isNativeRequest(request: Request): boolean`

- [ ] **Step 1: Write the failing unit tests**

```ts
describe('resolveClientKind', () => {
  it('sets native for X-Client: native with no browser headers', …)            // request.clientKind === 'native', next() called with no error
  it('sets web when X-Client is absent or any other value', …)                  // 'web' for undefined, 'Native', 'ios'
  it('refuses native with an Origin header, including null and empty', …)       // next(HttpError) status 400, code NATIVE_CLIENT_REFUSED, for 'https://a.test', 'null', ''
  it('refuses native with any Sec-Fetch-* header', …)                           // 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'
  it('refuses a web request whose body has refreshToken', …)                    // 400, code REFRESH_TOKEN_IN_BODY
})
```

- [ ] **Step 2: Run `pnpm test:unit tests/unit/middlewares/native-client.middleware.test.ts`.** Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Implement `resolveClientKind`.**
  - Native-refusal message: `"This app request came with browser headers, so we refused it. Update the app and try again."`
  - Body-refusal message: `"This request can't carry sign-in details in its body. Reload the page and try again."`

- [ ] **Step 4: Write the failing integration test** (`native-client-refusal.test.ts`):
  - `POST /api/v1/auth/link/verify` with `X-Client: native` and `Origin: https://example.com` → 400 `NATIVE_CLIENT_REFUSED`.
  - That refused request leaves the `signInLinkVerify` limiter's budget unchanged. Read its `RateLimit-Remaining` before and after with a plain request.
  - `POST /api/v1/auth/refresh` with a live web cookie and `{ refreshToken: <64 hex> }` in the body → 400 `REFRESH_TOKEN_IN_BODY`. Then a cookie-only refresh with the same cookie → 200, which proves the session was not consumed.
  - A CORS preflight `OPTIONS` asking for `x-client` gets no `x-client` in `Access-Control-Allow-Headers`.

- [ ] **Step 5: Mount the middleware and run both test files.** Expected: PASS.

- [ ] **Step 6: Commit** `feat(auth): recognise native clients and refuse browser headers on them`

---

### Task 2: Where the refresh token travels

**Files:**
- Modify: `src/controllers/helpers.controller.ts`
- Test: `tests/unit/controllers/refresh-transport.test.ts`

**Interfaces:**
- Consumes: `request.clientKind`, `isNativeRequest` (Task 1).
- Produces (in `helpers.controller.ts`):
  - `presentedRefreshToken(request: Request): string | undefined`. Web: `readRefreshTokenCookie(request)`. Native: `request.body?.refreshToken` when it is a string, never a cookie.
  - `type RefreshTokenBody = { refreshToken: string; refreshTokenExpiresAt: string } | Record<string, never>`
  - `deliverRefreshToken(request: Request, response: Response, token: { raw: string; expiresAt: Date }, sameSite?: 'strict' | 'lax'): RefreshTokenBody`. Web: calls `setRefreshTokenCookie` and returns `{}`. Native: sets no cookie and returns `{ refreshToken, refreshTokenExpiresAt: expiresAt.toISOString() }`.
  - `revokePresentedSession` reads `presentedRefreshToken` instead of the cookie. Its signature is unchanged.
  - `clearPresentedRefreshToken(request: Request, response: Response): void`, which does nothing on native. It replaces the controller's `clearRefreshTokenCookie` and `clearPresentedRefreshCookie` call sites in Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
it('presentedRefreshToken reads the body on native and ignores a cookie', …)    // body 'a'*64 plus cookie 'b'*64 → returns 'a'*64
it('presentedRefreshToken reads the cookie on web', …)
it('deliverRefreshToken on native sets no Set-Cookie and returns both fields', …) // response.getHeader('set-cookie') undefined; refreshTokenExpiresAt is an ISO string
it('deliverRefreshToken on web sets the cookie and returns {}', …)
it('clearPresentedRefreshToken on native clears nothing', …)
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the helpers.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): choose cookie or body for the refresh token by client kind`

---

### Task 3: Refresh rows record their client, and rotation keeps them apart

**Files:**
- Modify: `src/database/models/user-token.model.ts` (columns `client`, `deviceName`; `user_tokens_shape_check`; a new `user_tokens_client_check`)
- Create: the migration generated by `pnpm db:migration:generate`
- Modify: `src/services/session.service.ts` (`createRefreshRow`, `issueRefreshToken`, `continueSession`, `findGraceSession`, `rotateRefreshToken`), `src/services/auth.service.ts` (`refresh`), `src/services/sign-in-session.service.ts`, `src/services/tenant-invitation.service.ts:1454`, `src/services/google-auth.service.ts:347`
- Test: `tests/integration/services/session-client.test.ts`, plus the existing `tests/integration/database/` constraint tests

**Interfaces:**
- Consumes: `ClientKind` (Task 1).
- Produces:
  - `type SessionClient = { kind: ClientKind; deviceName: string | null }` (exported from `session.service.ts`)
  - `issueRefreshToken(userId, sessionId, executor = db, options: { recentAuth?: boolean; client: SessionClient })`. `client` is required, so every caller fails to compile until it passes one. The Google caller passes `{ kind: 'web', deviceName: null }`.
  - `rotateRefreshToken(raw: string, kind: ClientKind): Promise<IssuedRefreshToken>`. A presented row whose `client` differs from `kind` answers the same 401 as an unknown token and consumes nothing.
  - `issueSignInSession(user, refuse, client: SessionClient, canSignInUnderLock?)`
  - `refresh(rawToken: string, kind: ClientKind)` in `auth.service.ts`

**Schema:**
- `client`: `varchar(8)`, nullable.
- `device_name`: `varchar(64)`, nullable.
- `user_tokens_client_check`: `client is null or client in ('web','native')`.
- The `refresh` branch of `user_tokens_shape_check` adds `client is not null`, and every other branch adds `client is null and device_name is null`.
- Existing refresh rows are backfilled with `client = 'web'` in the same migration, before the constraint changes. Add that `UPDATE` to the generated SQL by hand, and say so in the migration's comment.

- [ ] **Step 1: Write the failing tests** (`session-client.test.ts`)

```ts
it('a rotation copies client and deviceName to the new row', …)
it('a grace sibling copies client and deviceName', …)                         // replay within REFRESH_REUSE_GRACE_MS: the sibling row has the same client/deviceName
it('a native replay within 10 s gets a sibling, not a revoke', …)             // Review Focus 1: rotate with 'native', replay the old raw with 'native' → resolves, session not killed
it('rotating a web row as native answers 401 and consumes nothing', …)        // then rotating it as 'web' succeeds
it('rotating a native row as web answers 401 and consumes nothing', …)
it('the shape check refuses a refresh row with no client', …)                 // a raw insert fails with user_tokens_shape_check
it('the shape check refuses a sign_in_link row with a client', …)
```

- [ ] **Step 2: Run `pnpm test:integration tests/integration/services/session-client.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Change the model, generate the migration, add the backfill `UPDATE`, and run `pnpm db:migrate`.**
- [ ] **Step 4: Thread `SessionClient` through the session triple**, `{ sessionId, sessionStartedAt, authenticatedAt }` → `{ …, client }`, which every function above copies forward. Then fix each caller the compiler names. Until Task 4, controllers pass `clientOf(request)` from Task 5's helper, stubbed here as `{ kind: request.clientKind, deviceName: null }`.
- [ ] **Step 5: Run the new file plus `tests/integration/api/auth-refresh.test.ts` and `tests/integration/database/`.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(auth): record the client on refresh rows and refuse cross-client rotation`

---

### Task 4: Handlers use the transport

**Files:**
- Modify: `src/controllers/auth.controller.ts` (`verifySignInLink`, `refresh`, `logout`, `verifyStepUpLink`, `revokeOtherSessions`, the Google start and callback); `src/controllers/passkey.controller.ts` (sign-in verify, step-up verify); `src/controllers/invitation.controller.ts` (confirm)
- Modify: `src/validators/auth.validators.ts` (`revokeOtherSessionsSchema`, `stepUpLinkVerifySchema`), `src/validators/sign-in-link.validators.ts` (`signInLinkVerifySchema`), and the passkey and invitation-confirm verify schemas. Each gains `refreshToken: z.string().regex(/^[0-9a-f]{64}$/).optional()`.
- Test: `tests/integration/api/native-client.test.ts`, `tests/unit/controllers/refresh-cookie-callers.test.ts`

**Interfaces:**
- Consumes: Task 2's helpers and Task 3's `refresh(rawToken, kind)`.
- Produces: each token-issuing response's `data` spreads `...deliverRefreshToken(…)`. The web response body is unchanged.

- [ ] **Step 1: Write the failing source test** (`refresh-cookie-callers.test.ts`). It reads `src/controllers/*.ts` and fails if any file other than `helpers.controller.ts` calls `setRefreshTokenCookie(` or `readRefreshTokenCookie(`, naming the file and line.
- [ ] **Step 2: Write the failing integration tests** (`native-client.test.ts`, all with `X-Client: native`):

```ts
it('link verify returns refreshToken in the body and no Set-Cookie', …)
it('refresh rotates a body token and returns the next one', …)
it('refresh ignores a cookie on a native request', …)                      // Review Focus 2: cookie = live web token, body = live native token → rotates the native one; the web session is untouched
it('logout with a body token revokes that session', …)
it('passkey sign-in verify returns a body token', …)                       // reuse passkeys-sign-in.test.ts's virtual authenticator helper
it('invitation confirm returns a body token', …)
it('a new sign-in with the old body token revokes the old session', …)     // revokePresentedSession on native
it('revoke-others with a body token spares only the presented chain', …)   // a grace sibling of the caller's session is revoked
it('step-up link verify with a body token marks only the presented row', …)
it('Google start and callback answer 400 NATIVE_CLIENT_REFUSED', …)
```

- [ ] **Step 3: Run both test files.** Expected: FAIL.
- [ ] **Step 4: Replace every cookie call in the listed handlers** with `presentedRefreshToken`, `deliverRefreshToken` or `clearPresentedRefreshToken`. Refuse native at the top of the Google start and callback handlers.
- [ ] **Step 5: Run both new files, then every existing `tests/integration/api/{auth-*,cookie-attributes,passkeys-*,invitation-*,google-oauth*,sign-in-link}.test.ts`.** Expected: PASS, with the web behaviour unchanged.
- [ ] **Step 6: Commit** `feat(auth): send and read the refresh token in the body for native clients`

---

### Task 5: Device names

**Files:**
- Modify: `src/controllers/helpers.controller.ts`
- Test: `tests/unit/controllers/client-of.test.ts`, plus one case in `native-client.test.ts`

**Interfaces:**
- Produces: `clientOf(request: Request): SessionClient`. On native, `deviceName` is the `X-Device-Name` value when it passes `safeText` and is at most 64 characters, else `null`. On web, `deviceName` is always `null`. It replaces Task 3's stub at every sign-in call site. The refresh path never reads it.

- [ ] **Step 1: Write the failing tests**

```ts
it('takes a valid device name on native', …)                     // 'iPhone 16' → 'iPhone 16'
it('drops a name with control characters or over 64 characters', …) // Review Focus 4: '\u0007x', 'a'.repeat(200) → null, and no throw
it('ignores the header on web', …)
```

  Integration case: a native link verify with `X-Device-Name: iPhone 16`, then a refresh with `X-Device-Name: Evil` → the new row's `device_name` is still `'iPhone 16'`.

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `clientOf` and use it at the four sign-in call sites.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): store the device model when a native session starts`

---

### Task 6: `GET /auth/sessions`

**Files:**
- Modify: `src/repositories/user-token.repository.ts`, `src/routes/auth.routes.ts`, `src/controllers/auth.controller.ts`, `src/constants/rate-limit.constants.ts`, `src/constants/maintenance-mode.constants.ts`
- Create: `src/presenters/session.presenter.ts`
- Test: `tests/integration/api/auth-sessions-list.test.ts`

**Interfaces:**
- Produces:
  - `userTokenRepository.listLiveSessions(userId: string, executor?): Promise<LiveSession[]>`. One entry per `session_id` with a live `refresh` row (not consumed, not revoked, not expired): `{ sessionId, client: ClientKind, deviceName: string | null, startedAt: Date, lastUsedAt: Date }`. `lastUsedAt` is the newest live row's `created_at`. Sorted by `lastUsedAt` descending. Use the existing `user_tokens_session_id_idx` and a `user_id` filter. It is not a paged list, because one user's live sessions are bounded by the session lifetime.
  - `toSessionResponse(session: LiveSession, currentSessionId: string | undefined)` → `{ id, client, deviceName, createdAt, lastUsedAt, current }`, with ISO strings
  - `RATE_LIMITS.sessionsList`: `keyBy: 'user'`, 60 per minute
  - The route: `requireAuth`, the limiter, then the handler. The maintenance rule is a read.

- [ ] **Step 1: Write the failing tests**

```ts
it('lists a web and a native session for the caller, marking the current one', …)
it('omits revoked and expired sessions', …)
it('never lists another user\'s sessions', …)
it('answers 401 without a bearer token', …)
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the repository query, the presenter, the controller method and the route.**
- [ ] **Step 4: Run them, plus `tests/unit/routes/maintenance-mode-gates.test.ts` and `route-limiters.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): list the caller's sessions with their client and device`

---

### Task 7: Native refresh limit keyed by token

**Files:**
- Modify: `src/constants/rate-limit.constants.ts` (the `refresh` spec)
- Test: `tests/integration/api/native-client.test.ts` (new cases)

**Interfaces:**
- Produces: `refreshRateLimitKey(request: Request): string`, set as `RATE_LIMITS.refresh.keyBy`. On native with a body `refreshToken`, the key is `refresh-token:${hashToken(refreshToken)}`. Otherwise it is the key the middleware derives for `keyBy: 'ip'` today; call that function rather than copying it. The limit stays 300 per 5 minutes. A native refresh with no body token answers the existing 401 before the limiter counts it.

- [ ] **Step 1: Write the failing tests**
  - Two native tokens from one IP keep separate budgets: exhaust one with `RATE_LIMITS.refresh.limit` requests, and the other still gets 200.
  - Web refreshes from one IP still share one budget.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): key native refresh limits by session, not IP`

---

### Task 8: Settings and passkey origins

**Files:**
- Modify: `src/configs/env.config.ts`, `src/configs/env-consistency.config.ts`, `src/configs/passkey.config.ts`, `src/services/client-settings.service.ts`; regenerate `.env.example` with `pnpm env:example`
- Test: `tests/unit/configs/passkey.config.test.ts`, `tests/unit/configs/env-consistency.config.test.ts`, `tests/integration/api/client-settings.test.ts`

**Interfaces:**
- Produces:
  - Env:
    - `MINIMUM_APP_VERSION_IOS` and `MINIMUM_APP_VERSION_ANDROID`: optional, matching `^\d+\.\d+\.\d+$`;
    - `WEBAUTHN_ANDROID_ORIGINS`: optional, comma-separated, each matching `^android:apk-key-hash:[A-Za-z0-9_-]{43}$`;
    - `WEBAUTHN_IOS_ENABLED`: boolean, default `false`.
  - `clientSettingsFrom(env)` adds `minimumAppVersion: { ios: string | null; android: string | null }`.
  - `passkeyRelyingParty(env)` appends the Android origins to `origins`. Its `Pick` widens to include `WEBAUTHN_ANDROID_ORIGINS`.
  - `assertEnvConsistent` refuses `WEBAUTHN_IOS_ENABLED=true` when `WEBAUTHN_RP_ID` is set and differs from `WEB_URL`'s host, with: `"WEBAUTHN_RP_ID is {rpId}, but iOS passkeys need it to equal {host}, the host of WEB_URL. Set WEBAUTHN_RP_ID to {host}, or set WEBAUTHN_IOS_ENABLED=false."`

- [ ] **Step 1: Write the failing tests:**
  - an Android origin is added to `origins`;
  - a malformed one fails env parsing;
  - the iOS consistency refusal and its message;
  - `client-settings` returns `minimumAppVersion` with both nulls when unset and the values when set;
  - the `Cache-Control` is still `public, max-age=300`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement them, and run `pnpm env:example`.**
- [ ] **Step 4: Run them, plus `tests/unit/architecture-env-table.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(config): minimum app versions and native passkey origins`

---

### Task 9: Account deletion requests

**Files:**
- Create: `src/database/models/account-deletion-request.model.ts` and its generated migration
- Create: `src/repositories/account-deletion-request.repository.ts`, `src/services/account-deletion.service.ts`, `src/controllers/account.controller.ts`, `src/routes/account.routes.ts`, `src/validators/account.validators.ts`
- Create: `src/templates/email/account-deletion-requested.template.ts`
- Modify:
  - `src/routes/index.routes.ts` (mount `/account`)
  - `src/constants/notification.constants.ts`: add `'account_deletion_requested'` to `NOTIFICATION_TYPES` and to `STAFF_ONLY_NOTIFICATION_TYPES`
  - `src/configs/env.config.ts`: `ACCOUNT_DELETION_DAYS`, an integer from 1 to 30, default 30
  - the maintenance rules and the rate limits
- Test: `tests/integration/api/account-deletion-request.test.ts`

**Interfaces:**
- Produces:
  - Table `account_deletion_requests`:
    - `id`, a `uuid` primary key;
    - `user_id`, a foreign key to `users` with `ON DELETE RESTRICT`;
    - `requested_at`, `due_at` and `completed_at` (nullable), all `timestamptz`;
    - `status`: `'open' | 'completed'`, with a check constraint;
    - `reason`: `varchar(500)`, nullable.

    A partial unique index on `user_id where status = 'open'`.
  - `requestAccountDeletion(userId: string, reason: string | null): Promise<{ request: AccountDeletionRequest; created: boolean }>`
  - `findOpenDeletionRequest(userId: string): Promise<AccountDeletionRequest | undefined>`
  - Routes:
    - `POST /account/deletion-request`, chained `requireAuth`, `requireJsonContentType`, `requireRecentAuth()`, then `RATE_LIMITS.authenticatedWrite`. Body `{ reason?: safeText max 500, multiline }`. Answers 201 when created and 200 when it returns the open request. Both bodies are `{ requestedAt, dueAt }` with the message `"We'll delete your account by {dueAt as formatUtcDateTime}. We emailed you a receipt."`
    - `GET /account/deletion-request`, chained `requireAuth` then a read limiter. Returns `{ request: { requestedAt, dueAt } | null }`.
  - On `created: true` only, after commit:
    - `addEmailJob` with `account_deletion_requested`. Its variables are `dueAt` (formatted UTC) and the support address. The subject is "We received your request to delete your account".
    - One `addNotificationJob` per platform admin, of type `account_deletion_requested`. The title is "Account deletion requested". The body is "A customer asked us to delete their account. Complete it in Deletion requests by {dueAt}." The recipient query follows `listMaintenanceModeNoticeRecipients` (`src/repositories/maintenance-mode.repository.ts:86`) and lives in the new repository as `listAccountDeletionRecipients()`.

- [ ] **Step 1: Write the failing tests**

```ts
it('needs a recent sign-in', …)                                         // 401 REAUTH_REQUIRED without step-up
it('creates a request due ACCOUNT_DELETION_DAYS days later and mails a receipt', …) // startEmailWorker; Mailpit has one message to the user
it('returns the open request on a second call and mails nothing', …)   // Review Focus 5: 200, same dueAt, still one message
it('alerts each platform admin with a staff-only notification', …)
it('GET returns null before a request and the request after', …)
it('refuses a reason over 500 characters with a field error', …)
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the model, migration, repository, service, template, controller and routes.** Register the template the way `welcome.template.ts` is registered in `email-template-meta.template.ts`.
- [ ] **Step 4: Run them, plus `tests/unit/routes/*` and `tests/unit/copy-style.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(account): let a customer request account deletion`

---

### Task 10: Completing a deletion and the due-soon alert

**Files:**
- Modify: `src/services/platform-user.service.ts` (`deleteUser`)
- Create: `src/templates/email/account-deleted.template.ts`, `src/jobs/account-deletion.job.ts`, `src/workers/account-deletion.worker.ts`
- Modify: `src/services/worker-supervisor.service.ts` (start the worker)
- Test: `tests/integration/api/account-deletion-complete.test.ts`, `tests/integration/jobs/account-deletion.job.test.ts`

**Interfaces:**
- Consumes: Task 9's repository.
- Produces:
  - `accountDeletionRequestRepository.completeOpenFor(userId: string, tx: DbTransaction): Promise<boolean>`. Inside `deleteUser`'s transaction, after `softDelete`, it sets `status = 'completed'` and `completed_at = now()`.
  - After commit, when it returned true, `deleteUser` enqueues the `account_deleted` email to the address the user had. The subject is "We deleted your account".
  - A repeatable job at `0 4 * * *` UTC. It alerts platform admins once per request when `due_at - now() <= 5 days` and `status = 'open'`, deduped by a Redis key per request through `redisKey()`.

- [ ] **Step 1: Write the failing tests**

```ts
it('staff delete of a user with an open request completes it and mails the confirmation', …)
it('a last-owner 409 leaves the request open', …)                      // deleteUser refuses; status stays 'open'
it('the job alerts once for a request due in 4 days and not for one due in 10', …)
it('the job does not alert twice for the same request', …)
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement them.** Mount the worker's `failed` listener with `reportFinalJobFailure` first.
- [ ] **Step 4: Run them, plus `tests/integration/api/platform-users*.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(account): complete deletion requests from the staff delete and alert before they fall due`

---

### Task 11: Scrubbing and error reports

**Files:**
- Modify: `tests/fixtures/error-scrub-vectors.json`; `src/services/errors/error-scrubber.service.ts` only if the new vectors fail
- Test: `tests/unit/services/errors/error-scrubber.service.test.ts`, `tests/integration/api/error-tracking.test.ts`

- [ ] **Step 1: Add the vectors:**
  - `{"refreshToken":"<64 hex>"}`
  - `refreshToken=<64 hex>`
  - `"refresh_token": "<64 hex>"`
  - an axios-style `config.data` string holding the first vector

  Each is expected to have its value replaced. Add an integration case: a forced 500 on a native `POST /auth/refresh` with a body token. The captured `$exception` event must not contain the 64-hex value (`util.inspect(event, { depth: null })`).
- [ ] **Step 2: Run them.** If they pass, `KV_SECRET_KEY`'s existing `token` match already covers the key. Keep the vectors as the pin and leave the scrubber unchanged. If they fail, add `refresh[_-]?token` to the key list.
- [ ] **Step 3: Run `pnpm scrub:gate`.** Expected: PASS.
- [ ] **Step 4: Commit** `test(errors): pin refresh-token scrubbing for native bodies`

---

### Task 12: Documentation

**Files:**
- Modify: `SECURITY.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md` (env table only, if it lists variables)

- [ ] **Step 1: `SECURITY.md`** gets a "Native clients" section:
  - the header and the browser-header refusal;
  - body transport, and cookies ignored on native;
  - cross-client rotation refused;
  - device names set once;
  - CORS left closed to `X-Client`;
  - the CGNAT limiter table.

  Threat-model rows from spec section "Documentation":
  - script on the web;
  - a relayed link or passkey assertion, as an accepted residual;
  - a copied native refresh token, accepted for version 1 with a later `proof` field;
  - CGNAT.

  An "Account deletion" section covering the request, the 30 days, staff completion and the confirmation.
- [ ] **Step 2: `ARCHITECTURE.md`:**
  - the native branch in the session flow;
  - the `client` and `device_name` columns;
  - the sessions list;
  - deletion requests and the job;
  - the new environment variables in its env table.
- [ ] **Step 3: `CLAUDE.md`** gets three rules, each with its reason:
  - "A handler reads and sets the refresh token only through `presentedRefreshToken` and `deliverRefreshToken`" (the source test enforces it);
  - "Never add `X-Client` or `X-Device-Name` to CORS `allowedHeaders`";
  - "`X-Device-Name` is read only when a session starts".
- [ ] **Step 4: `README.md`:**
  - the new env variables;
  - where each Android signing hash comes from (Play App Signing for production; the upload key, EAS preview keystore and debug key only in their own environments);
  - that `minimumAppVersion` reaches devices within 5 minutes.
- [ ] **Step 5: Run `pnpm lint:docs`.** Expected: PASS.
- [ ] **Step 6: Run `pnpm gate`.** Expected: exit 0 (lint, lint:docs, knip, test:coverage, build).
- [ ] **Step 7: Commit** `docs: native clients, the sessions list and account deletion`

---

## Spec coverage

| Spec section                               | Task      |
| ------------------------------------------ | --------- |
| 1. Opting in and refusal                   | 1         |
| 1. Routes that issue a token               | 2, 4      |
| 1. Routes that read the presented token    | 2, 4      |
| 1. Keeping the two modes apart             | 3         |
| 1. Device names                            | 5         |
| 1. Sessions list                           | 3, 6      |
| 1. Rate limits behind CGNAT                | 7, 12     |
| 2. Settings the app reads                  | 8         |
| 3. Passkey origins                         | 8         |
| 4. Errors and logs                         | 11        |
| 5. Account deletion requests               | 9, 10     |
| Tests, Documentation, Success criteria     | 1–12      |

The spec's web deletion page and the apex staff queue belong to part 2.

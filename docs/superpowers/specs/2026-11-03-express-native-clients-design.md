# Express: native clients and account deletion

- **Date:** 3 November 2026
- **Status:** Draft, for review by the repository owner
- **Repo:** `express-boilerplate` (2.1.1 at the time of writing). The spec is
  kept in `expo-boilerplate` during review and moves to
  `express-boilerplate/docs/superpowers/specs/` when its plan starts.
- **Part 1 of 3.** Part 2 is
  [react: shared core](2026-11-03-react-shared-core-design.md). Part 3 is
  [the expo app](2026-11-03-expo-boilerplate-design.md). This part lands first.

## Purpose

Let the Expo app hold a session with express without a cookie, and let any
customer start deleting their account from inside an app, which App Store
Review Guideline 5.1.1(v) and Google Play's account-deletion policy require.

Express today is passwordless (`src/database/migrations/0029_passwordless.sql`):
people sign in with an emailed link, a passkey or Google. The refresh token is
an httpOnly cookie, and the routes it authenticates check `Origin`.

## 1. The native client mode

### Opting in and refusal

- A request asks for native behaviour with `X-Client: native`.
- **Express answers `400 NATIVE_CLIENT_REFUSED`** when such a request carries an
  `Origin` header (any value, including `null` and empty) or any `Sec-Fetch-*`
  header. Browsers send `Origin` on every non-GET request, same-origin
  included; React Native's networking sends neither. The check runs on the
  auth, passkey and invitation routers, before their rate limiters, so a
  refused request spends no budget.
- **`X-Client` and `X-Device-Name` stay out of the CORS `allowedHeaders`**
  (`src/configs/cors.config.ts`), so a cross-origin page also fails at the
  preflight.
- **A native request never reads, sets or clears a cookie**, and ignores any
  cookie it sends. React Native keeps a cookie jar, so a stray cookie can
  arrive.

### Routes that issue a token

These are the callers of `setRefreshTokenCookie` today. On a native request
each returns `refreshToken` and `refreshTokenExpiresAt` in the JSON body and
sets no cookie:

| Route                                  | Handler                               |
| -------------------------------------- | ------------------------------------- |
| `POST /auth/link/verify`               | `auth.controller.ts`, `verifySignInLink` |
| `POST /auth/refresh`                   | `auth.controller.ts`, `refresh`       |
| `POST /auth/passkeys/sign-in/verify`   | `passkey.controller.ts`               |
| `POST /invitations/confirm`            | `invitation.controller.ts`            |

`GET /auth/google/callback` also sets the cookie. Native Google sign-in is out
of scope, so the native mode refuses it with `400 NATIVE_CLIENT_REFUSED`.
`POST /invitations/accept` uses the bearer token and sets no cookie, so it
needs no change.

**A test fails if a new handler calls `setRefreshTokenCookie` without a native
branch.** It lists the callers from the source.

### Routes that read the presented token

On a web request these read the cookie. On a native request they read
`refreshToken` from the body:

| Route                                    | Why it needs the token                                        |
| ---------------------------------------- | ------------------------------------------------------------- |
| `POST /auth/refresh`                     | Rotates it                                                    |
| `POST /auth/logout`                      | Revokes its session                                           |
| `POST /auth/sessions/revoke-others`      | Spares only the caller's session. With no token it spares the whole session, grace siblings included (`auth.constants.ts`, the comment above `REFRESH_REUSE_GRACE_MS`) |
| `POST /auth/step-up/link/verify`         | Marks only the presented row as reauthenticated. With no token `markSessionReauthenticated` marks every row in the session (`session.service.ts`) |
| `POST /auth/passkeys/step-up/verify`     | As above                                                      |
| The four token-issuing routes            | `revokePresentedSession` (`helpers.controller.ts`) ends the previous session on a new sign-in |

The validators change to match. `revokeOtherSessionsSchema` is
`z.strictObject({})` today, so it answers `400` to a body token, and
`signInLinkVerifySchema` is a plain `z.object`, which strips it. Both accept an
optional `refreshToken` (64 hexadecimal characters) on a native request and
refuse it on a web request.

### Keeping the two modes apart

- The `user_tokens` refresh row gains `client` (`'web'` or `'native'`), set
  when the session starts and copied on every rotation and grace sibling.
- **A rotation across modes is refused.** A native refresh presenting a web
  row, or a web refresh presenting a native row, answers `401` as an unknown
  token. A web session therefore cannot be turned into a body token.
- Everything else is unchanged: 32 random bytes with only the SHA-256 hash
  stored, rotation with reuse detection, the 10-second reuse grace
  (`REFRESH_REUSE_GRACE_MS = 10_000`), the absolute lifetime, the denylist and
  the step-up rules.

### Device names

- `X-Device-Name` is read **only when a session starts**, stored on the row and
  copied on rotation. A later request cannot rename the session.
- At most 64 characters, through the existing `safeText` validator.
- The app sends the device model (`expo-device` `modelName`, such as
  "iPhone 16"), never the user-set device name, which is personal data.
- The name is kept out of logs and analytics events.

### Sessions list

There is no sessions table: a session is the `session_id` shared by rotating
`user_tokens` rows (`user-token.model.ts`). This spec adds:

- a migration (after `0039`) adding `client` and `device_name` to
  `user_tokens`, and updating the shape `CHECK` constraint that lists the
  nullable columns allowed per purpose;
- `GET /auth/sessions`, `requireAuth`, scoped to the caller's own user ID. It
  returns, per live session: `id`, `client`, `deviceName`, `createdAt`,
  `lastUsedAt` and `current` (true for the caller's `sid`). The current
  session is marked by `sid`, never by name;
- a presenter, a limiter and the web and native clients' security pages
  reading it.

Revoking one chosen session is out of scope; "Sign out other devices" stays.

### Rate limits behind carrier-grade NAT

Mobile carriers put many users behind one IPv4 address (carrier-grade network
address translation, CGNAT). These limiters key by IP today
(`src/constants/rate-limit.constants.ts`):

| Limiter                | Limit                     |
| ---------------------- | ------------------------- |
| `refresh`              | 300 per 5 minutes         |
| `signInLinkRequest`    | 10 per 15 minutes         |
| `signInLinkVerify`     | 20 per 15 minutes         |
| `passkeySignIn`        | 20 per 15 minutes         |
| `invitationVerify`     | 20 per 15 minutes         |

- **`refresh` on a native request keys by the SHA-256 hash of the presented
  token**, not by IP, with the same limit. A refresh without a token is
  refused before the limiter.
- The others stay keyed by IP. `SECURITY.md` records the CGNAT risk, and the
  limiter logs carry `client` so the risk can be measured before it is changed.
- The plan checks how the installed `express-rate-limit` keys IPv6 addresses.

## 2. Settings the app reads

`GET /status/client-settings` gains:

```ts
minimumAppVersion: { ios: string | null; android: string | null }
```

- They come from `MINIMUM_APP_VERSION_IOS` and `MINIMUM_APP_VERSION_ANDROID`
  (semantic versions, validated in `env.config.ts`). Unset means no minimum.
- The response keeps `Cache-Control: public, max-age=300`, so a new minimum
  reaches devices within 5 minutes. `README.md` states this.

Sign-in link and step-up link requests already require `{ app }`
(`sign-in-link.validators.ts`), whose values are `web` and `apex`
(`frontend.constants.ts`). The app sends `web`, so mailed links point at
`WEB_URL`, which opens the app through universal links. No new `app` value is
added.

## 3. Passkey origins

- **Android** ceremonies arrive with origin `android:apk-key-hash:<hash>`.
  `WEBAUTHN_ANDROID_ORIGINS` (comma-separated) adds them to the expected
  origins in `passkey.config.ts`. `env-consistency.config.ts` refuses a value
  that does not match `^android:apk-key-hash:[A-Za-z0-9_-]{43}$`.
- **Production holds only the Play App Signing key's hash.** The upload key,
  the EAS preview keystore and debug keys belong only to their own
  environments. `README.md` says where each hash comes from.
- **iOS** ceremonies arrive with origin `https://<rpId>`. That is in the
  expected origins only when `WEBAUTHN_RP_ID` is unset or equals the host of
  `WEB_URL`. `env-consistency.config.ts` gains a check that refuses a parent
  domain RP ID while `WEBAUTHN_IOS_ENABLED=true`, naming the reason.

## 4. Errors and logs

- `scrub.ts` gains `refreshToken` as a key whose value is always removed. It
  changes here first, then is copied to react, apex and expo, as today.
- Request logging never records the body of the auth, passkey or invitation
  routes.

## 5. Account deletion requests

Apple accepts a deletion that "takes a reasonable amount of time" if it starts
in the app, the person is told how long it takes, and they get a confirmation;
it must not need a call, email or support chat
(<https://developer.apple.com/support/offering-account-deletion-in-your-app/>,
read on 3 November 2026).

### The request

- `POST /account/deletion-request`, `requireAuth`, `requireRecentAuth()`
  (step-up), with an optional `reason` (at most 500 characters, `safeText`).
- It writes an `account_deletion_requests` row (`user_id`, `requested_at`,
  `due_at`, `status`, `reason`), with one open request per user. A second
  request returns the open one.
- `due_at` is `requested_at` plus `ACCOUNT_DELETION_DAYS` (default 30 days,
  inside the one month that Article 12(3) of the General Data Protection
  Regulation allows before an extension).
- It emails the user a receipt stating the due date, and alerts staff through
  the existing staff-alert path.
- `GET /account/deletion-request` returns the open request, so both apps can
  show "Deletion requested on 3 November 2026. We will delete your account by
  3 December 2026."
- The user stays signed in and can use the account until staff complete the
  request. A request cannot be withdrawn in version 1; the receipt names the
  support address for that.

### Completing it (staff, in apex)

- Staff complete a request through the existing `DELETE /platform/users/:id`,
  which already refuses a user who is the last owner of a workspace with a
  `409` naming the workspaces (`platform-user.service.ts`, `deleteUser`). Staff
  then contact the user to hand over or delete those workspaces. This contact
  is our step, not one the user must start, so it meets Apple's rule.
- Completing the deletion marks the request `completed`, denies the user's
  sessions (as `deleteUser` does today) and emails a confirmation.
- A job alerts staff each day about requests within 5 days of `due_at`.
- An active paid subscription is cancelled at period end as part of
  completion. The plan names the billing service call.

### Web deletion page

Google Play also requires a web page where people can request deletion
without the app. `react-boilerplate` provides it (part 2), using the same
route.

## Tests

- Integration tests per route above: a native request gets a body token and no
  `Set-Cookie`; a native request with `Origin` or `Sec-Fetch-Site` gets `400`;
  a cross-mode rotation gets `401`; `revoke-others` and step-up with a body
  token act only on the presented row; `X-Device-Name` on a refresh does not
  rename the session.
- The source test that every `setRefreshTokenCookie` caller has a native
  branch.
- Deletion: step-up required, one open request per user, receipt email, the
  `409` path at completion, the confirmation email.

## Documentation

- `SECURITY.md`: a "Native clients" section and threat-model rows for: script
  on the web asking for a native token; a relayed link token or passkey
  assertion (accepted residual: the Origin refusal checks a request's shape,
  not who sent it); a copied native refresh token (accepted for version 1;
  device-bound proofs such as RFC 9449 are a later option, so the body schema
  stays open to a `proof` field); CGNAT rate limits.
- `ARCHITECTURE.md`: the native branch in the session flow, the sessions list,
  deletion requests.
- `CLAUDE.md`: "A handler that sets the refresh cookie has a native branch",
  "Never add `X-Client` to CORS".

## Success criteria

1. Every integration test above passes, and `pnpm gate` passes.
2. A request with `X-Client: native` and `Origin: https://example.com` to
   `POST /auth/link/verify` gets `400 NATIVE_CLIENT_REFUSED`.
3. `GET /auth/sessions` lists a web and a native session for one user, each
   with its `client`, and marks the caller's.
4. A deletion request created through the API appears for staff and produces
   the receipt email.

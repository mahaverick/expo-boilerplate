# Express staff list of deletion requests: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give staff an API that lists open account deletion requests, oldest due first, with the workspaces each requester solely owns, so apex can show the queue the alerts point to.

**Architecture:**
- One repository function decides which workspaces a user solely owns. Both `deleteUser`'s last-owner `409` and the new list call it, so the page and the refusal can't disagree.
- `GET /platform/deletion-requests` is a standard keyset list (`listParamsSchema`, `defineList`, `listPage`) behind `requirePlatformRole('admin')`.

**Tech Stack:** Express 5, TypeScript, Drizzle ORM (Postgres), Zod 4, Vitest through `vp test`, supertest through `tests/helpers/request.ts`.

**Repo:** `/Users/abhijeet/Mahaverick/express-boilerplate`. Run `git -C /Users/abhijeet/Mahaverick/express-boilerplate pull` on `main` first: local `main` is at 38805fb, one commit behind `origin/main` (62319fb, PR #190). Branch `feat/deletion-request-list` in a new worktree.

**Order:** part 2a of 3 plans. It merges first; the react plan (2b) doesn't depend on it, and the apex plan (2c) calls its endpoint.

**Spec:** `/Users/abhijeet/Mahaverick/expo-boilerplate/docs/superpowers/specs/2026-11-03-react-shared-core-design.md`, section 6, "Staff deletion queue". Part 1's Ruling 21 assigns this API to part 2.

## Global Constraints

- Every rule in `express-boilerplate/CLAUDE.md` applies:
  - every named function, method, type and exported const has a JSDoc description;
  - tests live in `tests/unit/` or `tests/integration/`, mirroring `src/`;
  - no `process.env` outside the allowed files;
  - log through `logger`, never `console.*`.
- The new route gets a row in `MAINTENANCE_ROUTE_RULES` (`src/constants/maintenance-mode.constants.ts`), a row in the route-gates table (`tests/integration/api/platform-route-gates.test.ts`) and the shared `searchLimiter`.
- Copy: each sentence is under 30 words, and `tests/unit/copy-style.test.ts` passes.
- Commits use conventional-commit prefixes, end with the session's attribution lines, and are GPG-signed. The branch is done when `pnpm gate` exits 0.

## Deviations from the spec, to confirm in review

1. **The spec says the page gets solely owned workspaces "from the `409` details".** Neither `409` carries `details`. The last-owner `409` has only a message (`platform-user.service.ts`, the `This user is the last owner of …` error). `REQUESTER_PAYS_SUBSCRIPTION` has a `code` and a message. Ruling: the list returns `soleOwnedWorkspaces` itself, computed by the same function the `409` uses. The `409`s stay unchanged.
2. **The list doesn't say who pays a live subscription.** Staff learn that from the `REQUESTER_PAYS_SUBSCRIPTION` `409` when they press Delete. That `409` follows from part 1's Ruling 19, which the owner hasn't confirmed yet. If the owner keeps the `409`, a `paidWorkspaces` field is a small follow-up.
3. **The list is admin-only, not viewer.** Only admins and owners can complete a request, and only they get the alerts.

## Review Focus

1. **A requester's only workspace is archived.** `listOwnedTenants` includes archived workspaces, so the list must name it, as the `409` does. Test in Task 1.
2. **A requester shares ownership with a deactivated owner.** `countOwners` counts deactivated owners, so the workspace isn't solely owned in either place. Test in Task 1.
3. **The list and the delete agree.** For a seeded requester, the list names workspace X, and `DELETE /platform/users/:id` answers `409` naming X. Test in Task 2.
4. **A viewer calls the list.** It gets the `404` route refusal with no RateLimit headers, like every admin route. Test in Task 2 (the route-gates row).
5. **A completed request.** After staff delete the user, the request leaves the list. Test in Task 2.

---

### Task 1: One function for solely owned workspaces

**Files:**
- Modify: `src/repositories/user-membership.repository.ts` (add the function)
- Modify: `src/services/platform-user.service.ts` (`deleteUser` calls it in place of its per-tenant `countOwners` loop)
- Test: `tests/integration/repositories/user-membership.repository.test.ts` (create it if missing, following the nearest repository test's helpers)

**Interfaces:**
- Produces: `userMembershipRepository.listSoleOwnedTenants(userIds: readonly string[], executor?: Executor): Promise<Map<string, SoleOwnedTenant[]>>`, with `interface SoleOwnedTenant { tenantId: string; tenantName: string }`. A user with none has no key. Each list is ordered by tenant id, as `listOwnedTenants` orders.
- Semantics, identical to today's `deleteUser` check: an owner membership in a tenant with `deletedAt IS NULL`, archived included and the platform tenant excluded, where the owner count from `countOwners` (owners whose user has `deletedAt IS NULL`, deactivated included) is 1 or less.
- `deleteUser` keeps its separate `countActiveOwners` check for the platform tenant, and its exact error message.

- [ ] **Step 1: Write the failing tests:** `lists a workspace the user alone owns`, `lists an archived workspace the user alone owns`, `skips a workspace with a deactivated co-owner`, `lists a workspace whose only other owner is soft-deleted` (a soft-deleted co-owner doesn't count), `skips the platform tenant`, `answers for several users in one call`, and `returns no key for a user who solely owns nothing`.
- [ ] **Step 2: Run them:** `pnpm vp test tests/integration/repositories/user-membership.repository.test.ts`. Expected: they fail because the function doesn't exist.
- [ ] **Step 3: Implement `listSoleOwnedTenants`** as one query: owner memberships for `userIds` joined to live, non-platform tenants, filtered by a correlated owner count `<= 1`. Then replace `deleteUser`'s loop with a call on the transaction's executor.
- [ ] **Step 4: Run the new tests and the existing delete tests:** `pnpm vp test tests/integration/repositories/user-membership.repository.test.ts tests/integration/api/platform-user-lifecycle.test.ts tests/integration/api/account-deletion-complete.test.ts`. Expected: all pass, and the last-owner message assertion near `platform-user-lifecycle.test.ts:370` is unchanged.
- [ ] **Step 5: Commit:** `refactor(platform): one query decides which workspaces a user solely owns`.

### Task 2: `GET /platform/deletion-requests`

**Files:**
- Create: `src/routes/platform-deletion-request.routes.ts`, `src/controllers/platform-deletion-request.controller.ts`
- Modify: `src/routes/platform.routes.ts` (mount at `/deletion-requests` with `searchLimiter`), `src/validators/platform.validators.ts`, `src/repositories/account-deletion-request.repository.ts`, `src/services/account-deletion.service.ts`, `src/constants/maintenance-mode.constants.ts`
- Test: `tests/integration/api/platform-deletion-requests.test.ts`, `tests/integration/api/list-contract.test.ts` (a new `describeListContract` block), `tests/integration/api/platform-route-gates.test.ts` (a new row), `tests/unit/routes/platform-deletion-request.routes.test.ts`, `tests/unit/validators/platform.validators.test.ts`

**Interfaces:**
- Consumes: `listSoleOwnedTenants` (Task 1).
- Produces, for apex: `GET /api/v1/platform/deletion-requests` →
  - `data = { items: DeletionRequestRow[], page, total? }`, the standard list envelope;
  - `DeletionRequestRow = { id: string, requestedAt: string, dueAt: string, reason: string | null, user: { id: string, email: string, firstName: string | null, lastName: string | null }, soleOwnedWorkspaces: { id: string, name: string }[] }`;
  - message `Deletion requests retrieved.`
- Query: `platformDeletionRequestListSchema = listParamsSchema({ sorts: ['due', '-due'], defaultSort: 'due', filters: {} })`. Search matches the user's email, as the users list does. Only `status = 'open'` rows are listed.
- Gate order: `requirePlatformRole('admin')`, then `searchLimiter`, then the handler.

- [ ] **Step 1: Write the failing tests.**
  - API: `lists open requests oldest due first`, `omits completed requests`, `returns each requester's solely owned workspaces`, `the list and the delete's 409 name the same workspace`, `drops a request once staff delete the user`, `finds a request by the user's email`.
  - Gates: a route-gates row `{ method: 'get', path: '/platform/deletion-requests', minRole: 'admin', requiresStepUp: false }`.
  - Router unit test: middleware order and limiter identity, as `tests/unit/routes/platform-user.routes.test.ts` asserts them.
  - List contract: `describeListContract` with the `due` sort, seeding requests with distinct `dueAt`.
  - Validator: an unknown sort is a `400`.
- [ ] **Step 2: Run them:** `pnpm vp test tests/integration/api/platform-deletion-requests.test.ts tests/unit/routes/platform-deletion-request.routes.test.ts`. Expected: they fail with `404` or a missing module.
- [ ] **Step 3: Implement.**
  - Repository: `accountDeletionRequestRepository.listOpen(params: ListParams, executor?)` uses `defineList` with a `timestampSort` on `dueAt`, joins `users` for the email and names, and returns the page.
  - Service: `listOpenDeletionRequests(query)` calls `listOpen`, then fills `soleOwnedWorkspaces` with one `listSoleOwnedTenants` call for the page's user ids.
  - Controller and route as the interfaces state. Add the `MAINTENANCE_ROUTE_RULES` row with the same mode as `GET /platform/users`.
- [ ] **Step 4: Run the tests from Step 2, plus** `tests/integration/api/list-contract.test.ts tests/integration/api/platform-route-gates.test.ts tests/unit/routes/route-limiters.test.ts`. Expected: all pass.
- [ ] **Step 5: Commit:** `feat(platform): list open account deletion requests for staff`.

### Task 3: Documentation and part 1's follow-ups

**Files:**
- Modify: `ARCHITECTURE.md` (the platform routes table near line 745 and the list-endpoint table near lines 970–990), `SECURITY.md` (the "Account deletion" section near line 1261, and line 674), `README.md` (the account deletion section near line 299)
- Modify: `src/templates/email/account-deletion-due-soon.template.ts` (`ACCOUNT_DELETION_DUE_SOON_TITLE`) and its test

- [ ] **Step 1: Docs.** Add the route and its list row: search on email, no filters, sorts `due` and `-due`. Replace SECURITY.md's "arrives in part 2" with what the route returns and who may call it.
- [ ] **Step 2: Fix SECURITY.md line 674.** It says a malformed token "is never hashed". In fact only the limiter skips the hash, and the per-IP budget bounds the database lookups. Say that.
- [ ] **Step 3: Fix the due-soon title.** The daily alert includes overdue requests, but the subject says "due within 5 days". Each alert covers one request. Change `ACCOUNT_DELETION_DUE_SOON_TITLE` to `Account deletion due soon or overdue`, and update the template test that pins it.
- [ ] **Step 4: Run** `pnpm vp test tests/unit/templates tests/unit/copy-style.test.ts && pnpm lint:docs`. Expected: both pass.
- [ ] **Step 5: Run `pnpm gate`.** Expected: exit 0.
- [ ] **Step 6: Commit:** `docs: the staff deletion request list, and correct two part 1 statements`.

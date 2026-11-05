# apex shared core and the deletion request queue: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy react's shared core into apex, make CI prove the copies match react byte for byte, and add the staff "Deletion requests" page.

**Architecture:**
- `scripts/sync-check.mjs` reads `shared-core.json` from a react checkout. It compares every row that names `apex` byte for byte, then runs react's `check-shared.mjs` against apex's tree.
- The page is a standard apex list page (route, `defineList` query, `DataTable`) over express's `GET /platform/deletion-requests`. Its delete action is the existing `useDeleteUser` inside `ReasonDialog`, with the reason fixed to the request ID.

**Tech Stack:** React 19, TanStack Router and Query, Vitest through `vp test`, Testing Library, MSW.

**Repo:** `/Users/abhijeet/Mahaverick/apex-boilerplate`, branch `feat/shared-core-deletion-queue` in a worktree.

**Order:** part 2c of 3 plans. Start it after plan 2b (react) has merged to `main`, because the files it copies come from react's `main`. Plan 2a (express) supplies the endpoint, but the tests use MSW, so 2a needs only to be designed, not deployed.

**Spec:** `/Users/abhijeet/Mahaverick/react-boilerplate/docs/superpowers/specs/2026-11-03-react-shared-core-design.md` (moved there by plan 2b), sections 3, 4 and 6. Plan 2b's "The shared list", "Ports" and "Deviations" apply here unchanged.

## Global Constraints

- Every rule in `apex-boilerplate/CLAUDE.md` applies. UI copy uses curly apostrophes and "workspace", never "tenant", and `tests/unit/copy-style.test.ts` passes.
- **A shared file is copied, never edited here.** A needed change goes to react first.
- **The page is admin-only.** That matches express's gate, `requirePlatformRole('admin')`.
- `pnpm gate` gains `pnpm sync:check`. Commits use conventional-commit prefixes, end with the session's attribution lines, and are GPG-signed. Push with `pnpm push`. The branch is done when `pnpm gate` exits 0 with `../react-boilerplate` on `main`.
- `react-boilerplate` is public, so CI checks it out with no token.
- Express's item shape, verbatim from plan 2a: `DeletionRequestRow = { id: string, requestedAt: string, dueAt: string, reason: string | null, user: { id: string, email: string, firstName: string | null, lastName: string | null }, soleOwnedWorkspaces: { id: string, name: string }[] }`.

## Deviations from the spec, to confirm in review

1. **The page lists solely owned workspaces from the list API, not from "the `409` details".** Plan 2a's deviation 1 explains why.
2. **The action reuses `ReasonDialog` with a fixed reason**, not a new dialog, so `403` and `409` refusals show inline as they do on the user page. The typed-email confirmation stays.
3. **A requester who pays a live subscription** is visible only when the delete is refused (plan 2a's deviation 2).

## Review Focus

1. **A delete refused with `409`.** The message shows inline in the dialog and the row stays. Test in Task 2.
2. **A viewer opens `/deletion-requests`.** They see the not-found page, and the nav doesn't offer the item. Test in Task 2.
3. **A request already past `dueAt`.** The row says "Overdue". It must not show a negative countdown. Test in Task 2.
4. **The react checkout is missing locally.** `sync:check` warns and exits 0. With `CI=true` it exits 1. Test in Task 1.
5. **A shared file edited in apex.** `sync:check` names the file and fails. Test in Task 1.

---

### Task 1: Copy the shared core and check it

**Files:**
- Copy from `../react-boilerplate` at `main`: every `shared-core.json` row whose apps include `apex`, including `scripts/check-shared.mjs` and `.d.mts`, and `tests/support/runner.ts` when a copied test imports it
- Modify: `src/http/client.ts` and `src/http/session.ts`. They are now per-app; start from react's versions, which apex's matched until now.
- Create: any `src/ports/*` module a copied file imports, from react's version. Create `scripts/sync-check.mjs`, `scripts/sync-check.d.mts` and `tests/unit/scripts/sync-check.test.ts`.
- Modify: `package.json` (`"sync:check": "node scripts/sync-check.mjs"`, added to `gate` after `lint:docs`), `.github/workflows/ci.yml`

**Interfaces:**
- `node scripts/sync-check.mjs [--react <dir>]` reads the react directory from `--react`, then `REACT_BOILERPLATE_DIR`, then `../react-boilerplate`.
  - It compares each `files` and `tests` row naming `apex` with `cmp` semantics.
  - It then calls `checkShared({ manifest, root: apexRoot, app: 'apex' })` from the copied `scripts/check-shared.mjs`.
  - It prints `path: differs from react-boilerplate` or `path: missing`, one line per file, and exits 1 on any finding.
  - With no react directory: a warning and exit 0, unless `CI` is `true`, then exit 1.
  - Its exported `syncCheck(options): string[]` is what the test calls.
- CI: a separate `sync` job, so `eslint .`, `vp check` and knip never scan react's tree. Its steps:
  1. checkout;
  2. a second `actions/checkout` with the same pinned SHA, `repository: mahaverick/react-boilerplate`, `ref: main` and `path: react-boilerplate`;
  3. `pnpm install --frozen-lockfile`;
  4. `pnpm sync:check` with `REACT_BOILERPLATE_DIR: ${{ github.workspace }}/react-boilerplate`.
- Locally, `sync:check` compares against whichever branch `../react-boilerplate` has checked out. The docs say so.

- [ ] **Step 1: Write the failing tests** against temporary trees:
  - `passes when every apex row matches`
  - `names a file that differs`
  - `names a file that is missing`
  - `ignores rows that do not name apex`
  - `warns and passes with no react directory`
  - `fails with no react directory when CI is true`
- [ ] **Step 2: Run** `pnpm vp test tests/unit/scripts/sync-check.test.ts`. Expected: fails, because the module doesn't exist.
- [ ] **Step 3: Implement `sync-check.mjs`.**
  - Run `git -C ../react-boilerplate fetch origin`.
  - Copy the files with `git -C ../react-boilerplate show origin/main:<path> > <path>` for each row.
  - Adapt `client.ts` and `session.ts`.
  - Add react's two `.well-known` locations to apex's `nginx.conf` by hand (plan 2b, Task 6, apex ruling).
- [ ] **Step 4: Run** `pnpm vp test tests/unit && pnpm typecheck && pnpm sync:check`. Expected: every existing http and query test passes, and `sync:check` exits 0.
- [ ] **Step 5: Docs.** In `CLAUDE.md` "Sibling sync" (lines 14–26) and ARCHITECTURE.md "Sibling sync with react-boilerplate" (from line 1367), replace the table with a pointer to react's "Shared core" section and `shared-core.json`. Keep apex's own rules, such as `sse.ts` being react's alone. Run `pnpm lint:docs`.
- [ ] **Step 6: Commit:** `build(shared): copy react's shared core and check it byte for byte in CI`.

### Task 2: The Deletion requests page

**Files:**
- Create:
  - `src/queries/deletion-request.queries.ts`
  - `src/pages/_app/deletion-requests.tsx`
  - `src/components/features/deletion-requests/deletion-requests-table.tsx`
  - `tests/unit/pages/_app/deletion-requests.test.tsx`
  - `tests/unit/queries/deletion-request.queries.test.tsx`
- Modify:
  - `src/types/api.types.ts` (`DeletionRequestRow`)
  - `src/components/features/reason-dialog.tsx` (`fixedReason`)
  - `src/queries/user-admin.queries.ts` (`useDeleteUser` also invalidates `deletionRequestKeys.all`)
  - `src/constants/routes.ts` (`deletionRequests: '/deletion-requests'`)
  - `src/constants/navigation.ts` (`NavPath` and `NAV_ITEMS`)
  - `src/routeTree.gen.ts` (regenerated)
  - `tests/mocks/handlers.ts` (a default handler returning an empty page)
  - `tests/unit/a11y.test.tsx`
  - `e2e/capture/manifest.ts`
  - `e2e/contrast/contrast.test.ts`
  - `docs/pages/README.md`
  - ARCHITECTURE.md's page table (near line 549)

**Interfaces:**
- **Query:** `deletionRequestsList = defineList({ sorts: ['due', '-due'], filters: {}, table: analyticsKey('deletion_requests') })`. `deletionRequestsListOptions(request, { total? })` calls `listQueryOptions<DeletionRequestRow>({ key: deletionRequestKeys.all, path: '/platform/deletion-requests', request })`, as `usersListOptions` does.
- **`ReasonDialog`:** gains `fixedReason?: string`. When set, the reason field is hidden and `onConfirm` receives `fixedReason`. Everything else is unchanged, including `confirmText` and the inline refusal.
- **Page:**
  - It is admin-only, with the `PlatformNotFound` guard `billing-alerts.tsx` uses.
  - It has the `<h1>` "Deletion requests" and the intro "People who asked us to delete their account. Delete each account by its due date."
  - Columns:
    - Person: `<Pii>`-wrapped name and email, linking to `ROUTES.user`.
    - Requested.
    - Due: the date from `formatDate`, plus "Overdue" when `dueAt` has passed.
    - Sole owner of: workspace names, or "None".
    - An actions cell: "Delete account".
  - Empty state: "No one has asked to delete their account."
- **Delete:** `ReasonDialog` with `title="Delete account"`, `confirmText={row.user.email}`, `destructive` and `fixedReason={row.id}`. `onConfirm` is `stepUp.run(() => remove.mutateAsync({ userId: row.user.id, reason }))`, then `toast.success('Account deleted.')`.
- **Nav item:** `{ label: 'Deletion requests', to: ROUTES.deletionRequests, minRole: 'admin', group: 'Operations' }`, with an icon from the set the other items use.

- [ ] **Step 1: Write the failing tests** with `renderAppAt`, `signIn` and `server.use`:
  - `lists requests oldest due first`
  - `marks a request past its due date as Overdue`
  - `shows the workspaces the person solely owns, or None`
  - `deletes through step-up with the request id as the reason, then drops the row`
  - `shows a 409 inline and keeps the row`
  - `a viewer sees the not-found page and no nav item`

  In the query test: `asks for the first page with total=1`.
- [ ] **Step 2: Run** `pnpm vp test tests/unit/pages/_app/deletion-requests.test.tsx tests/unit/queries/deletion-request.queries.test.tsx`. Expected: fails.
- [ ] **Step 3: Implement**, regenerate the route tree, and add the page to every list in **Files**.
- [ ] **Step 4: Run** `pnpm vp test tests/unit && pnpm typecheck && pnpm lint:docs`. Expected: all pass, including `tests/unit/docs-pages.test.ts` and the user page's existing `ReasonDialog` tests.
- [ ] **Step 5: Run `pnpm gate`.** Expected: exit 0.
- [ ] **Step 6: Commit:** `feat(deletion-requests): a staff queue of account deletion requests`.

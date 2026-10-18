# KCC SKOOLSYS 2.0 — PR-004 IMPLEMENTATION-READY MASTER PROMPT

**Assignment:** KCC-DEV-004 / PR-004 — Attendance Integrity, Academic-Year Validation and Offline Synchronization Safety  
**Approval:** IMPLEMENTATION APPROVED ONLY IN AN ISOLATED DEVELOPMENT BRANCH  
**Architecture:** ARCH-001, single-school first, Kattankudy Central College National School, Grades 6–13  
**Design baseline:** PR-004 v1.2 final design addendum, plus the overriding final engineering safeguards below  
**Production permission:** NONE. **Real KCC student data permission:** NONE. **Deployment/merge/push permission:** NONE.

## YOUR ROLE AND MISSION

You are acting as the accountable lead engineer, SQLite/database specialist, backend and frontend TypeScript engineer, security reviewer, and automated QA engineer.

Implement PR-004 in the **existing** SkoolSys repository. This is not a greenfield project. Preserve PR-001, PR-002 and PR-003, the existing React/Vite + Express/TypeScript + `node:sqlite` stack, functional routes, and supported student/teacher workflows. Do not replace the framework, build a multi-school SaaS, or add unrelated modules.

**Start immediately with repository inspection and branch isolation; implement each stage below; run checks at each gate; stop only for a documented blocker or after final review. Never claim a test passed unless it ran.**

### Known repository anchors (verify in current checkout)

- `server/src/routes/attendance.ts`: online session, offline batch sync, daily/monthly reports. Current write paths use unvalidated record upserts.
- `server/src/db/database.ts`: SQLite initialization/schema, attendance tables; dynamic test-db switching from PR-001.
- `server/src/middleware/auth.ts`: PR-002/003 authentication and record-level access.
- `server/src/utils/audit.ts`: existing audit helper currently suppresses errors; implement fail-closed transaction-aware audit writes.
- `client/src/api/offlineQueue.ts`: IndexedDB v1 and unsafe localStorage roster fallback.
- `client/src/pages/Attendance.tsx`: attendance editor, default date currently derived using UTC, catches failed API responses and may queue rejections.
- `client/src/components/OfflineBanner.tsx`: offline queue state.
- `client/src/api/client.ts`: currently throws generic errors, losing HTTP error details.
- `client/src/pages/AttendanceReports.tsx` and `client/src/pages/Dashboard.tsx`: hardcoded date/misleading attendance fallback.
- `client/public/sw.js`: current PWA cache version; inspect carefully before making offline changes.
- `server/test/helpers/testDb.ts` and `server/test/helpers/testServer.ts`: temporary synthetic test harness.
- Root `package.json`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; client tests may need a dedicated script.

These paths were observed in the supplied `SkoolSys(2).zip`; verify them in your actual working tree. If code has advanced, adapt without discarding newer changes.

---

## ABSOLUTE EXECUTION BOUNDARIES

1. **Do all work in a dedicated isolated checkout/worktree and feature branch**, proposed `feature/pr-004-attendance-integrity`. Before modifying anything, inspect `git status`, current branch, last commit, ignored/untracked DB files and any local edits. Never overwrite existing changes; if the current checkout is dirty, create a safe separate worktree/copy from a known commit, or stop and report the obstacle. Never run destructive checkout/reset/clean commands.
2. Preserve the original uploaded ZIP and any original database. **Never run migrations, seed/reset, restore, backup testing, or automated test writes against `server/skoolsys.db`, `.db-wal`, `.db-shm`, a school database, a production connection or an unknown DB path.** Use only created temporary fixture databases. Add a hard test-env DB-path guard that rejects accidental workspace or live DB connections.
3. No deployment, production environment edits, real data import, production restore, remote push, pull request merge, main-branch edits, or infrastructure changes. Local commits on the PR-004 branch are allowed; do not push.
4. Synthetic fictional data only. Do not put real guardian/student data, credentials, tokens or personal information in code, logs, test fixtures or screenshots. Do not enable production demo credentials.
5. Do not relax PR-002/003 auth, introduce fallback secrets, circumvent permissions, change unrelated API routes, or silently invent attendance values.
6. Do not implement PR-005 exams, PR-006 production backup/restore, PR-007 complete enrolment history, or the separate whole-school demo/search/filter phases. Build only focused synthetic fixtures needed to test PR-004.
7. If a mandatory safety test fails, **repair and rerun before advancing**. If the cause cannot be safely resolved, stop with a precise blocker report; do not bypass or skip critical tests.
8. KCC institutional policies `KCC-POL-001` through `005` remain **provisional defaults**, not officially approved school policy. Implement conservative configurable behavior in development, annotate it, and require school leadership sign-off before real-school use.

---

## STAGE 0 — BASELINE, ISOLATION AND PLAN

**Implementation tasks**
- Inspect current Git state, running processes, package scripts, source, schema and migration conventions, auth/role rules, cache/IndexedDB format, existing tests, and API/UI behavior.
- Establish the separate PR-004 branch/worktree without touching user work; record the original commit SHA and current state.
- Run and record existing checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Antigravity previously reported **61 passing baseline tests**; independently verify the actual test and suite counts in this checkout. Record existing lint warnings rather than silently fixing unrelated code.
- Inspect how `switchDatabase()` and static imports behave in tests. Prevent overlapping tests from redirecting a shared DB connection between fixtures; prefer separate processes or isolated per-test connections where needed.
- Draw the existing mutation/read paths and a concise file-by-file implementation plan. Add safety checklist to `docs/architecture/ATTENDANCE_V2.md` or a separate PR-004 work log.

**Gate 0 — PASS only if** original code/data are preserved, an isolated branch/worktree is established, exact baseline commands/results are recorded, and a safe synthetic DB is proven. If not, **STOP**.

## STAGE 1 — CONTRACTS, VALIDATION AND DATE UTILITIES

**Create/modify:**
- NEW `server/src/validation/attendanceValidation.ts`
- NEW `server/src/services/attendanceService.ts` (interfaces/skeleton first)
- NEW `client/src/types/attendance.ts` (or existing conventions)
- NEW shared date utility if appropriate; avoid bundling server code into client
- UPDATE `client/src/api/client.ts` for typed `HttpError`/problem details

**Required canonical mutation request:** `classId`, ISO civil `date`, `mode: 'draft' | 'submitted'`, `baseRevision` (integer >=0), stable `clientMutationId` UUID, `rosterFingerprint`, `records` array of `{ student_id, status, remarks? }`, optional notes/correction reason. Do not trust client academic-year IDs; derive from class. Define a single schema for online and offline paths; limits must be compatible with configured school class sizes.

- Validate real Gregorian `YYYY-MM-DD` dates, including leap days and impossible dates; interpret school dates as **Asia/Colombo civil dates**, not UTC-converted ISO timestamps.
- Reject duplicate, unknown, zero or negative student IDs; invalid status; invalid/overlong remarks; non-array or oversized payloads. Status must be one of `present`, `absent`, `late`, `excused`. Missing/unmarked is **not** `present` and may exist only in drafts, never as a submitted attendance status.
- Final submission requires exactly one attendance record per eligible canonical roster member, no more and no less. Draft permits partial records without manufacturing defaults.
- Document and implement deterministic canonical payload hashing: stable field names/ordering, sorted student records, explicit normalization; include mutation identity/scope, class, date, mode, baseline revision, roster fingerprint, remarks and notes so materially different payloads cannot replay accidentally. Do not canonicalize away meaningful user edits.
- Define `application/problem+json` errors with `type`, `title`, `status`, `detail`, and stable `code`. `400` = malformed/legacy payload, `401` = unauthenticated/deactivated, `403` = unauthorized, `404` = missing class when safe to disclose, `409` = stale session/roster/key reuse, `422` = validly shaped but invalid attendance state, `413` = excessive size, `503` = bounded database contention/unavailable.
- Direct `POST /api/attendance/session`: HTTP `200/201` when applied, `200` replay, appropriate error status otherwise. Batch `POST /api/attendance/sync`: HTTP `200` for a processed batch with explicit per-item `applied | replayed | conflicted | rejected | retryable` outcomes. Never return the phrase “200 Multi-Status”. Do not hide top-level auth failures inside successes.
- Legacy V1 client mutation payloads lacking revision/UUID/mode are **rejected safely**, never guessed or silently accepted. Provide an actionable refresh/review message.

**Gate 1:** typechecks for new contracts; request-validation unit tests including wrong-class, duplicate IDs, invalid status, leap-day/date cases, oversized payloads, legacy clients, canonical hash stability. No writes on invalid input.

## STAGE 2 — SAFE SCHEMA MIGRATION AND BACKUP RECOVERY TESTS

**Create/modify:**
- NEW `server/src/db/migrations/004_attendance_integrity.ts` plus runner as needed
- UPDATE `server/src/db/database.ts` only as required; preserve test DB routing
- NEW `server/test/attendance_migration.test.ts`

**Proposed schema (adapt to actual schema and constraints):**
- Add an integer positive `revision` to `attendance_sessions`, initialized safely for pre-existing sessions.
- Ensure session status supports `draft` and `submitted` with well-defined transitions; do not assume a status CHECK constraint is already compatible.
- Add `attendance_sync_receipts` with unique mutation UUID, actor ID, class/year/date, stable canonical request fingerprint, resulting revision, result, and timestamp. Keep receipt and session mutations in the same transaction.
- Add useful composite indexes for class/year/status, class/date and receipt lookup; avoid redundant or unnecessary indexes.
- Record actual migration state **and verify actual columns/indexes/constraints**. `PRAGMA user_version` alone is not proof of a complete migration. Handle existing version/schema drift and fail closed on incompatible states.

**Mandatory backup and migration sequence on synthetic DB only:**
1. Establish known clean fixture and baseline row counts, foreign-key/integrity checks and schema inventory.
2. Produce a **consistent point-in-time backup** using SQLite Online Backup API (where actually supported) or `VACUUM INTO` **outside an open write transaction**, to a unique destination. Do not use a plain live `.db` file copy in WAL mode. `wal_checkpoint(TRUNCATE)` is not a prerequisite for a consistent `VACUUM INTO` snapshot; do not add an unsafe mandatory checkpoint.
3. Verify the output by opening it as SQLite and running `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, critical row counts and schema checks; perform a trial recovery to a disposable path. Do not label an interrupted, partial snapshot a valid backup.
4. Execute versioned transactional DDL and schema validation, with clean rollback on a deliberate injected failure. Exercise re-run idempotence and partial/schema-drift detection.
5. Test WAL-mode concurrency and backup interruption. If an output snapshot is corrupt or missing, preserve original fixture and report failure.

**Gate 2:** new migration tests pass; a pre-migration synthetic fixture survives failed migrations without data loss; successful migration is idempotent; backup and trial recovery are empirically verified. Do not migrate working/local school DB.

## STAGE 3 — ATOMIC ATTENDANCE SERVICE, PERMISSIONS AND AUDIT

**Create/modify:**
- IMPLEMENT `server/src/services/attendanceService.ts`
- UPDATE `server/src/routes/attendance.ts` into thin controllers
- UPDATE `server/src/middleware/auth.ts` only where needed for year-scoped checks
- UPDATE `server/src/utils/audit.ts` to provide fail-closed in-transaction logging
- NEW `server/test/attendance_integrity.test.ts`
- NEW `server/test/attendance_concurrency.test.ts`

**Single canonical write flow for BOTH direct sessions and offline sync:**
1. Parse/validate payload and JWT before transaction to reject obvious invalid input promptly.
2. Begin a short `BEGIN IMMEDIATE` transaction on a single DB connection. No `await` or HTTP/network operations while holding the lock.
3. **Inside transaction**, re-check `users.is_active`, relevant token/session revocation state and current class/year authorization. Do not rely only on a cached `req.user` or a pre-transaction check. Check actor authorization BEFORE returning a stored idempotent receipt.
4. Resolve the class's `academic_year_id`, confirm date falls in that year's configured bounds, and validate school roster from DB. Do not attach the session to whichever academic year is globally current.
5. Compute a **server-owned** roster fingerprint from a stable canonical roster snapshot scoped to class, year and date. Verify client's observed fingerprint; reject stale/changed rosters with `409` and safe, permission-filtered conflict metadata.
6. Atomically check `clientMutationId` receipt. Same actor and same canonical payload => `replayed` without duplicate revision/audit. Same UUID but different content => `409`. Different actor => deny without disclosing other actor's receipt. Concurrent duplicate calls must serialize deterministically.
7. Look up session revision, compare `baseRevision` to current revision (first write requires `0`); reject stale mutation `409` without changing a single row.
8. Validate all student IDs belong to the eligible class/year roster and status permits mutation; partial draft accepted, complete submitted only. No invalid status coercion.
9. Implement full-snapshot draft reconciliation **only where safe**. Never delete or amend historical attendance records for a transferred student using the current roster. Where date-effective historical placement cannot be proved with the legacy schema, **make the ambiguous historical session read-only** and signal a clear reason. Keep old records visible and preserve original class/date/status.
10. Enforce `none → draft`, `draft → draft`, `draft → submitted`, audited `submitted → submitted` correction; forbid `submitted → draft`. Same-day correction requires reason; past-day corrections are **admin-only provisional default** and historical transfer ambiguity can still block edits pending PR-007. Keep these rules configurable/documented; not official policy sign-off.
11. Write session, records, revision, audit event and receipt in **one transaction**, then commit; if any step fails, roll back all. Do not use the old audit helper's catch-and-continue path for these writes.
12. Surface `SQLITE_BUSY`/timeout as bounded retryable failure (e.g., `503` with safe semantics) rather than an invented successful save. Configure supported connection timeout/PRAGMA busy timeout and test with independent connections/processes; busy timeout is NOT a success guarantee.

**Reads:** `GET /session`, daily/monthly reports and absent-student details must respect class/year permissions, preserve genuine stored historical rows, avoid leaking guardian contacts to unauthorized teachers, and not recompute historical rosters from today's placement when no date-effective history exists.

**Gate 3:** ATT integrity/concurrency tests pass: cross-class writes rejected with **zero mutations**, drafts and final submissions correct, stale revisions produce 409, identical UUID retries only one commit, concurrent writers serialized or safely rejected, audit failures roll back entire mutation, historical records survive.

## STAGE 4 — OFFLINE QUEUE V2, ACCOUNT ISOLATION AND LEGACY MIGRATION

**Create/modify:**
- REFACTOR `client/src/api/offlineQueue.ts`
- UPDATE `client/src/api/client.ts` and `client/src/components/OfflineBanner.tsx`
- REVIEW `client/public/sw.js` caching/service-worker update strategy
- ADD browser/IndexedDB unit and integration tests using suitable compatible tooling

**Storage design:** static object stores, not per-user dynamic stores; composite cache key **`[schoolId, userId, academicYearId, classId]`**. Pending mutations must carry owner identity, year, class, date, mode, base revision, server roster fingerprint, stable UUID, payload, queue state and last error. New schema upgrades must preserve existing pending items.

- Do **not** store guardian phone, guardian NIC, address or sensitive health details. Names/admission numbers still count as personal data; minimize them, and document that browser-origin IndexedDB is **not cryptographically isolated by application user ID**. Recommend separate trusted OS/browser profiles for shared staff devices; do not claim userId keys provide a security sandbox.
- Remove unsafe localStorage fallback for full roster or queue payloads. If IndexedDB write/upgrade/transaction fails, show **Not Saved** and retain UI state for manual recovery instead of claiming persistence.
- Await IDB `transaction.oncomplete` before saying **Saved Locally / Pending Sync**. Keep queue items until explicit server `applied` or `replayed` acknowledgement.
- Do not sync another teacher's queue under the current account or after logout/token expiry; on `401`, pause and require same-account reauthentication. Preserve unsynced data on logout with a privacy-conscious warning; after 7 days require reauthentication, do not automatically delete unsynced evidence.
- `400/403/422`: rejected, require review; `409`: conflict retained; network timeout/offline/ambiguous `5xx`: retain original UUID and retry only under bounded backoff where safe (no fake success); prevent retry storms and concurrent duplicate sync engines.
- IndexedDB v1 → v2 legacy entries that lack trustworthy identity/year/revision/fingerprint must be **quarantined** as `legacy_review_required`; never auto-replay or synthesize `baseRevision:0` and immediately sync. Require fresh server roster/revision and explicit authorized human reconciliation. If original owner identity is unknowable, **do not claim that an arbitrary logged-in teacher is the original owner**; offer safe local export/administrative remediation, subject to privacy controls.
- Upgrade SW/PWA safely so stale cached clients cannot mutate through legacy API, and no private `/api/` responses are cached; preserve pending queue across version upgrades. Never purge caches/IndexedDB indiscriminately.

**Gate 4:** browser/IDB tests demonstrate persistence only after completion, quota-abort errors, upgrade preservation, quarantined legacy entries, same-user reconnect, no cross-user sync, transient retry, no retry of deliberate 403/422 rejection, and safe logout.

## STAGE 5 — ATTENDANCE UI, CONFLICT REVIEW AND TRUTHFUL REPORTS

**Modify:**
- `client/src/pages/Attendance.tsx`
- `client/src/components/OfflineBanner.tsx`
- `client/src/pages/AttendanceReports.tsx`
- `client/src/pages/Dashboard.tsx`
- Add focused components/types (e.g. conflict reconciliation modal) as appropriate

- Default every unmarked student to unmarked, **not present**. Provide explicit `Save Draft` and `Submit Register` actions. Confirm `Mark All Present` before applying. Show counts for all four actual statuses plus unmarked.
- UI must tell the truth: `Saved on Server (Rev N)`, `Saved Locally — Pending Sync` **only after committed IDB transaction**, `Conflict — Review Required`, `Validation Error — Not Saved`, or `Storage Failure — Not Saved`.
- On server revision or roster conflict, show accessible side-by-side comparison. Actions: **Keep Server**, **Review & Reapply with new baseRevision and new UUID**, or **Export Local Draft** (privacy-aware). **No blind Overwrite action.** A second concurrent change triggers another 409 and new review.
- Enforce UI role restrictions but rely on server for security. Don't expose sensitive guardian fields through cached data, stale reports or error details.
- Fix `new Date().toISOString().split('T')[0]` where used as Colombo civil-day default; remove hardcoded `2026-10-17` and the fake 92% dashboard fallback. Show **Not Recorded** for no submitted registers; identify drafts separately. Explain attendance numerator/denominator and maintain existing approved definitions for late/excused rather than silently changing school policy.
- Reports should distinguish today's pending classes, drafts, submitted classes and genuine absences; they must not count unmarked drafts as absences or compute today's population from unrelated year enrolments.

**Gate 5:** frontend build/typecheck, component and browser tests for offline/save/conflict/date cases, accurate dashboard/report UI, keyboard-accessible modal and no broken navigation links. Screens must not display success after failure.

## STAGE 6 — COMPLETE REGRESSION AND FUNCTIONAL VERIFICATION

Create/update the following, adapting to the actual test architecture:

- `server/test/attendance_integrity.test.ts`
- `server/test/attendance_sync.test.ts`
- `server/test/attendance_reports.test.ts`
- `server/test/attendance_migration.test.ts`
- `server/test/attendance_concurrency.test.ts`
- focused client IndexedDB/storage + UI tests and browser E2E tests
- `docs/testing/ATTENDANCE_TEST_MATRIX.md`

**Mandatory traceability:** Implement and map **all 64 planning scenarios ATT-001 through ATT-064** from PR-004 v1.2, adjusting faulty expected HTTP details to the agreed contract and recording any deviation explicitly. Important scenarios:
- ATT-002/003: foreign class ID, mixed valid/invalid payload => **zero session/record/receipt/audit writes**.
- ATT-006/007/008: invalid status rejected, submitted roster complete, draft partial/unmarked.
- ATT-009/010/012/013: correct class year, date, transferred/inactive enrollment.
- ATT-014/015/016: class teacher boundaries and disabled account.
- ATT-017/018/019/041/042: optimistic revision race, duplicate actor replay, foreign actor denial.
- ATT-020/021/025/060: retry with same UUID, different payload conflict, canonical hash behavior.
- ATT-022/034/035/051/061: transaction failure rollback, migration idempotency, interruption, WAL backup verification.
- ATT-023/024: sync **HTTP 200 batch** with per-item applied/rejected/conflicted (not top-level HTTP 409 for individual batch conflicts).
- ATT-026..030,047..050,054,056,062,063: user isolation, storage confirmation and failure, legacy quarantine, retry and conflict UI.
- ATT-031..033,040,052,053,058,059,064: truthful reports, timezone, guardian privacy, historical transfer preservation, one-student roster.
- ATT-037/038/057: measured p50/p95 and bounded lock behavior on independent SQLite connections/processes. Never assert every contending writer must succeed; acceptable outcome is successful serialized writes **or controlled, retryable contention response** without partial commits.

Add important uncovered edge cases where needed: lost network response after server commit, service worker stale-shell refresh, background sync racing logout, unexpected browser storage eviction, maliciously forged roster fingerprint, changes to user/class assignment during an in-flight request, and read-only historical session access.

Use real tests for client-side requirements. Node API tests are NOT a substitute for actual browser-backed IndexedDB and UI/connection tests. If browser automation cannot run, report the gate as **BLOCKED**, not PASS.

**Gate 6 commands** (adjust if repo scripts differ, quote actual commands/output):
```bash
npm test
npm run typecheck
npm run lint
npm run build
```
Plus browser tests, two-connection/process stress tests, integrity/foreign-key checks and migration/recovery tests.

Baseline was previously **reported** as 61 passing tests; verify current count independently. Maintain all previous PR-001/002/003 tests. 64 is the scenario ID range, not permission to claim 64 passing tests when some were unexecuted or combined.

## STAGE 7 — SELF-REVIEW, DOCUMENTATION AND LOCAL HANDOFF

Deliver:
1. `docs/architecture/ATTENDANCE_V2.md` — contracts, state diagram, roster/date-year rules, privacy and migration details, limitations.
2. `docs/testing/ATTENDANCE_TEST_MATRIX.md` — ATT-001..064 mapped to exact test files, execution statuses/evidence, gaps, test environment.
3. `docs/security/PR004_REVIEW.md` (or equivalent) — permission checks, current user verification inside transaction, shared-device residual risks, no secret leakage.
4. `docs/roadmap/PR004_HANDOFF.md` (or equivalent) — all changed files, API/schema changes, compatibility notes, feature flags, rollout prerequisites, policies requiring KCC approval, rollback/recovery procedure verified on synthetic data.
5. A final terminal report with: original SHA and branch; every file added/changed; commits made; actual commands + pass/fail/skipped counts; examples of valid/rejected responses; migration trial output; backup restore verification; browser E2E results; known defects/limitations; explicit readiness status.

Before finishing:
- Inspect `git diff`, `git status`, secret/tracked DB detection, artifact list and lockfile changes.
- Verify **no production or original school files have been changed**, no data was leaked, no deployment/push/merge occurred.
- Ensure there is no automatic schema upgrade touching arbitrary DBs at application import/start; any future operational rollout must be separately approved.
- Do not claim full historical transfers are solved: PR-007 remains required for date-effective class placements.
- Do not call the system production-ready while KCC policy sign-off, separate PR-005/006 work, and real-school acceptance remain outstanding.

**Gate 7 / Definition of Done:** All applicable gates above pass, with genuinely executed evidence, no critical privacy/integrity regression, safe synthetic backup and recovery proven, and no production changes. If any must-pass gate remains blocked, mark PR-004 **NOT READY FOR MERGE**, explain why, and stop safely.

---

## DECISION LEDGER — DO NOT MISREPRESENT AS SCHOOL APPROVAL

- `KCC-POL-001` proposed development default: assigned class teacher may correct same-day submitted attendance with reason; prior-day changes admin-only, unless historical roster is not trustworthy—in which case keep read-only.
- `KCC-POL-002` proposed default: historical attendance preserved and not rewritten on transfer; full date-effective enrolment history deferred to PR-007.
- `KCC-POL-003` proposed default: date must be inside class academic-year boundaries; don't hardcode holiday/weekend bans. Record exceptional school days for a future calendar module.
- `KCC-POL-004` proposed default: after 7 days, offline sync requires same-user reauthentication, **not deletion**.
- `KCC-POL-005` proposed default: guardian contact disclosure only to legitimate authorized school roles/assigned classes.

All five still require the appropriate KCC leadership approvals before real-world rollout. If a school-policy ambiguity affects safe implementation, choose a restrictive dev default, document it and halt only that unsafe flow—not unrelated work.

---

## STRICT FINISH CONDITION

**You are NOW authorized to write code and tests only in your isolated PR-004 development checkout.** You are **NOT** authorized to deploy, push, merge, operate on any real student database or begin PR-005/006/007. Do not ask for approval again for the stages already covered here; implement safely through Stage 7, providing concise stage-by-stage verification summaries.

**Begin with Stage 0 now. Stop at the final local PR-004 engineering report.**

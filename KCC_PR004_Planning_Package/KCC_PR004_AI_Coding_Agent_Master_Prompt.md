# KCC / SkoolSys 2.0 — PR-004 AI Coding Agent Master Prompt

**INSTRUCTION MODE: PLAN AND REVIEW ONLY.** This prompt is for Antigravity, Cursor or a similar engineering agent. Pasting it **does not** authorize code edits, migrations, installs, commits, merges or deployment. An explicit later user instruction must approve PR-004 implementation before the agent enters execution mode.

## Identity and task

You are the Lead Software Architect, Attendance Domain Engineer, Security Engineer, SQLite Database Engineer, Frontend Engineer and Test Lead for **SkoolSys 2.0 — Kattankudy Central College National School, Kattankudy, Batticaloa District, Eastern Province, Sri Lanka**.

Project decisions:
- ARCH-001: Build a secure, production-quality **single-school** system; Grades 6–13. No multi-school SaaS/billing.
- KCC-DEV-004: **PR-004 planning approved only**. The target PR is **Attendance Integrity, Academic-Year/Class Enrolment Validation and Offline Sync Reliability**.
- PR-002 authentication hardening and PR-003 record-level authorization are existing source baselines; preserve them.
- This is an existing React/Vite + Express/TypeScript + SQLite application, not a greenfield rewrite.
- Demo/test data must be synthetic. No production access or data import.

Read the accompanying **`KCC_PR004_Attendance_Integrity_Engineering_Specification.md` in full**. Treat its proposed contracts, file tasks, ATT-001–ATT-040 regression matrix and acceptance gates as the planning reference. Inspect the actual repository and correct any assumptions with evidence before proposing implementation.

## Critical verified source findings

1. `server/src/routes/attendance.ts` POST `/session` allows arbitrary student IDs in a class register; a foreign-class student was successfully inserted in an isolated test.
2. The same route silently normalizes invalid status strings to `present` and writes without one all-or-nothing transaction.
3. POST `/sync` does per-item unconditional UPSERTs without revision or replay control; can overwrite newer online updates.
4. `attendance_sessions` lacks a revision; `enrollments` supports one placement per student per year, no effective-dated midyear transfer history.
5. Current GET register and reports are not consistently scoped to the chosen class's academic year.
6. `client/src/pages/Attendance.tsx` defaults unmarked students to `present`, while a failed online save of any kind can be enqueued offline.
7. `client/src/api/offlineQueue.ts` stores cached roster data keyed only by class and returns before IndexedDB transaction completion; user/year/date/version metadata are missing.
8. `client/src/components/OfflineBanner.tsx` triggers automatic sync without a way to review conflicts.
9. `client/src/pages/AttendanceReports.tsx` hardcodes `2026-10-17`; some dates use UTC instead of school-local civil date.

**Do not report prior PRs, builds or 21/40 tests as independently passed unless you execute and capture evidence after explicit execution authorization.**

## CURRENT AUTHORIZATION: planning-only workflow

You MAY:
- Inspect and read all relevant source files and existing documentation.
- Analyze architecture, API contracts, schema constraints and historical-data limitations.
- Identify file-level tasks, propose diffs textually, and design fixtures and tests.
- Produce a comprehensive written design review, execution checklist and risk assessment.
- Explain where the current code cannot meet a requirement without a separately approved schema/policy decision.

You MUST NOT:
- Modify source, database, docs, config or generated files in the repository.
- Run seeds, migrations, production calls, installs or commands that alter project state.
- Create/checkout branches, commit, merge, deploy, alter environment variables or cloud resources.
- Start coding PR-004 on the basis of this prompt alone.
- Introduce new roles, unrelated modules, a database switch or a whole-site redesign.

If an operation may write, skip it in planning mode and state the intended later command instead.

## Proposed architecture to evaluate

### A. Canonical attendance domain service

Introduce a **shared validation + transactional service** used by both POST `/api/attendance/session` and POST `/api/attendance/sync`. Do not duplicate rule implementations. Strictly validate class, school-local date, academic year, enrolled roster, status, duplicate IDs, expected revision and teacher authorization. Draft may be partial; submitted must include every eligible student exactly once. Never infer `present` from missing or invalid input.

### B. Correct academic-year scoping

Derive the year from `classes.academic_year_id`, not a global `is_current` lookup for historical classes. Validate date against that year's bounds and enrolment against the matching class and year. Existing schema has no midyear effective-date ranges; fail closed on ambiguous historical edits and specify the separate solution rather than fabricating membership history. Maintain historical report accuracy wherever the current data can establish it.

### C. Transaction and audit

Make session, records, correction audit and sync receipt a **single atomic SQLite write**. Validate and re-check revision inside the transaction. On errors roll back all changes, including audit and idempotency receipts. Use additive, tested schema migration, never destructive reset.

### D. Optimistic concurrency + idempotency

Use `baseRevision`, server `revision`, stable `clientMutationId` UUID and durable operation receipt / payload hash. Two writers using the same base revision cannot silently overwrite one another; return HTTP 409 with a minimal authorized comparison summary. Identical operation replay returns prior success with no duplicate change. Same operation ID with altered content must fail. Model direct and offline mutations identically.

### E. Secure, durable offline queue

Require successful IndexedDB `oncomplete` before claiming local save. Cache only necessary roster fields, partition by authenticated actor/year/class/date, and include roster fingerprint/revision. Do not cache guardian phone, NIC or address. Preserve conflicting/rejected operations for review; do not auto-resubmit an HTTP 400/401/403/409/422 response. Handle unknown server acknowledgement via retry with same mutation ID. Prevent cross-account queue replay.

### F. User interface and reports

Use distinct labels: **Saved on server**, **Saved locally / pending sync**, **Conflict — review required**, **Rejected**, **Not saved**. Show local versus server record and require explicit human reconciliation for conflicts. Never auto-mark the full class `present`; a separate explicit “Mark all” action can remain. Fix attendance-related hardcoded dates and fake percentages. Interpret school civil dates using `Asia/Colombo` and do not invent KCC holiday/calendar rules.

## Files to inspect and propose changes for

Server:
- `server/src/routes/attendance.ts`
- `server/src/db/database.ts`
- `server/src/middleware/auth.ts` (narrow year-aware checks only)
- `server/src/utils/audit.ts` (minimal adjustments)
- NEW proposed `server/src/services/attendanceService.ts`
- NEW proposed `server/src/validation/attendanceValidation.ts`
- NEW proposed versioned attendance migration and associated safe migration test
- `server/test/helpers/testDb.ts`, `server/test/helpers/testServer.ts`
- NEW tests for integrity, sync, reports, migration; preserve all PR-001/002/003 tests

Client:
- `client/src/pages/Attendance.tsx`
- `client/src/api/offlineQueue.ts`
- `client/src/api/client.ts`
- `client/src/components/OfflineBanner.tsx`
- `client/src/pages/AttendanceReports.tsx`
- `client/src/pages/Dashboard.tsx` (attendance metrics only)

Documentation:
- `docs/architecture/ATTENDANCE_V2.md` (proposed)
- `docs/testing/ATTENDANCE_TEST_MATRIX.md` (proposed)
- `docs/security/KNOWN_RISKS.md`
- `docs/roadmap/PHASE_0.md`

## Mandatory regression test design

Map every scenario ATT-001–ATT-040 in the accompanying spec to a named test or a documented blocker. Highest priorities:
- Cross-class student injection returns 422; **all DB snapshots unchanged**.
- Mixed valid/invalid roster and duplicate IDs cause zero writes.
- Unknown/invalid statuses are rejected, never changed to present.
- Academic-year mismatch and out-of-range dates are rejected.
- Non-assigned teacher and revoked account cannot write or read restricted data.
- Full submitted roster only; draft's missing students remain unmarked.
- Transaction failure halfway through leaves zero mutation/audit/receipt changes.
- Base revision mismatch, simultaneous first write, retry replay and changed-payload replay are safe.
- Offline stale replay returns conflict; no newer server value is overwritten.
- Per-item offline batch outcome is explicit; queue removal occurs only on acknowledged apply/replay.
- IndexedDB quota failure shows Not Saved, not Queued.
- Report counts, historic years, Colombo day boundary and guardian-data privacy are accurate.
- Existing authentication and teacher-permission tests do not regress.
- Browser checks cover desktop/mobile, keyboard, Tamil Unicode names, offline/online transition and cross-account logout/login.

Tests and fixtures must always use disposable synthetic databases and simulated networks; never use genuine KCC student records.

## Proposed implementation order — **DO NOT EXECUTE UNTIL APPROVED**

1. Reconfirm code baseline and reproduce defect on an isolated fixture.
2. Finalize API error/status contract, revision semantics, and DB migration/rollback proposal.
3. Obtain principal/authorized-owner decisions on correction policy and unavoidable historic-transfer limits.
4. Add isolated migration and fixture tests.
5. Add strict validators, year-aware roster resolver, shared attendance transactional service.
6. Convert POST session to use that service; add optimistic revision / receipts.
7. Convert offline sync to same service with independent atomic per-item outcomes.
8. Upgrade IndexedDB queue semantics and UI conflict review.
9. Correct attendance report scope and hardcoded dates / fake attendance state.
10. Execute all tests, typecheck, lint, build, browser E2E, security and performance checks.
11. Deliver diff summary, failing/passing evidence, migration and rollback instructions. Stop after PR-004; no merge or deployment without separate approval.

## Acceptance criteria

The PR is NOT ready unless:
- Foreign-class student ID is blocked and writes are atomic.
- Valid statuses, unique IDs, complete submitted roster and correct year/date permissions are enforced on server.
- No legitimate historical record is silently changed by new current-year roster logic.
- Session revision and idempotency prevent blind concurrent overwrites and duplicate replay.
- Offline conflicts are visible, retained, and resolved only by conscious user action.
- Network failure/local persistence failure/HTTP rejection produce truthful states.
- Teacher/offline cache/privacy boundaries are not bypassable.
- Attendance reports show accurate real counts; no hardcoded date or fake 92% fallback.
- Schema changes preserve data and pass foreign-key checks on isolated DB copies.
- PR-001/002/003 tests still pass; target ATT-001–ATT-040 coverage is evidenced.
- No real KCC information, original archive or production deployment is touched.

## Required response in THIS planning-only turn

Deliver a structured review containing:
1. Source facts and open ambiguities.
2. File-by-file proposed change list.
3. API request/response/errors and database migration design (written only).
4. Transaction + sync state diagram or unambiguous pseudocode (written only).
5. Test matrix with expected HTTP codes and DB assertions.
6. Release blockers, policies needing owner/principal confirmation, and acceptance checklist.
7. Implementation estimate by relative effort or dependency, **not a future time promise**.
8. Next gate and exact words to request permission: **“Approve PR-004 implementation in an isolated development branch.”**

**STOP AFTER PLANNING. Do not implement, modify, deploy or claim completion.**

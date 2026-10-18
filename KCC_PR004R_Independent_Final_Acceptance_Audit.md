# KCC SkoolSys 2.0 — Independent PR-004R Source Acceptance Audit

**Date:** 2026-10-18  
**Reviewed:** User-uploaded `SkoolSys_PR004R_Clean_Source.zip` and Antigravity final handoff text.  
**Decision:** **HOLD FINAL PR-004 SIGN-OFF**; allow a **narrow PR-004S completion pass** in the existing isolated development branch. **No production merge or deployment.**

## What was independently verified

- The ZIP was successfully opened and 103 entries inspected. It includes root, server and client `.env.example` templates. No active `.env`, SQLite `.db`/WAL/SHM, `.git` or `node_modules` entries were found.
- The source includes attendance V2 service, SQLite migration 004, verified-backup helper, revised attendance UI, IndexedDB V2 queue and the documented regression suite.
- Three tests in `server/test/attendance_conflict_diff.test.ts` ran directly on Node.js v22.16.0 with `node --experimental-strip-types --test`: **3 passed, 0 failed**.
- The **129/129** suite result and Git commit/clean branch state are reported by Antigravity, **not independently reverified** in this review. Running `npm ci --offline` failed on an uncached npm package; an attempted registry install timed out. Browser recordings and Git metadata are not included in the ZIP.

## Findings requiring closure

### BLOCKER A — Idempotent replay can become a false conflict after roster changes
`server/src/services/attendanceService.ts` around lines **183–259** calculates and rejects `ROSTER_FINGERPRINT_MISMATCH` *before* consulting `attendance_sync_receipts`. Repro scenario: mutation X is successfully committed, network acknowledgment is lost, a new student joins the class, and X is retried unchanged. Despite already being committed, the stale fingerprint causes `409` rather than `replayed`. Check auth/assignment and idempotency within the same transaction **before applying current-roster checks to a newly requested mutation**, without allowing cross-actor replays. Regression must prove exactly-once semantics across intervening roster changes.

### BLOCKER B — Conflict UI reuses stale comparisons after a second collision
`client/src/pages/Attendance.tsx` around lines **510–519** updates `latestServerSession` and revision on the second HTTP 409 but **does not recalculate student-by-student diffs** from the newly fetched server records. Teacher choices and displayed comparison can refer to the prior server state. Rebuild comparisons and re-require deliberate review before further submission. Include two successive concurrent updates in browser E2E.

### BLOCKER C — Conflict re-submit takes status from older local session
`client/src/pages/Attendance.tsx` around line **478** decides `mode` using `existingSession?.status` rather than the fresh conflict target. A locally drafted register may have become `submitted` on the server, but resolution sends it back as `draft` and receives `CANNOT_REVERT_SUBMITTED_TO_DRAFT`. Use server-current state to choose the allowed transition, retain audit reason where required, and test `local draft -> server finalized -> reconcile`.

### HIGH D — Seven-day offline reauthentication is described but not enforced
`client/src/api/offlineQueue.ts` lines **637–642** define `isMutationExpired`; repository references show no invocation in `syncPendingQueue` or any other production logic. `JWT_EXPIRES_IN=7d` is an independent token lifetime and does not enforce the age of a pending offline mutation. Require same-user reauthentication and explicit aged-item review without deleting unsynced evidence; test with eight-day-old pending entries.

### HIGH E — Unsynced logout counts miss some unsaved work
`client/src/api/offlineQueue.ts` around lines **303–306** counts only `pending` and `conflicted`, omitting `rejected`, `syncing` and quarantined legacy records. Thus the logout warning can claim no unsynced work while recoverable records remain. Differentiate pending, rejected, conflicted, quarantined and in-flight states in both the warning and recovery workflow.

### HIGH F — Recovery helper must remain restricted to offline and controlled shutdown
`server/src/db/backupUtils.ts` around lines **105–149** copies a backup over a target database and removes WAL/SHM files without itself enforcing closure of *all* target connections or an atomic swap. Do not expose this as safe live restore. PR-006 must implement shutdown/exclusive access, verified staged replacement, WAL lifecycle and tested failure rollback before it is approved for real school use.

### TEST EVIDENCE GAP — Client E2E scenarios are not reproducible from source package
`server/test/attendance_conflict_diff.test.ts` contains stand-alone duplicate conflict helper logic rather than exercising `Attendance.tsx`. The matrix labels browser-dependent ATT-054 and ATT-056 as PASS but there is no automated browser test suite or video file inside the uploaded archive. Request reproducible Playwright (or equivalent) tests against the actual UI: offline IndexedDB v1-to-v2 migration, queue durability, reauthentication, multi-account separation, revision conflicts, two consecutive conflicts, and draft-to-final conflicts. Antigravity's browser recordings are mentioned but cannot be inspected here.

### TEST TRACEABILITY GAP
Some ATT scenario IDs were reassigned from the original planning baseline (for example, ATT-001 now addresses legacy payload validation instead of valid full attendance submission). Preserve a stable requirements-to-tests crosswalk and distinguish **70 scenario labels** from **129 executable tests across the entire repository**.

## Positive findings

- Migration initialization no longer silently swallows Migration 004 errors.
- Verified SQLite pre-migration snapshot wiring exists.
- Attendance authorization and session version checks are inside the transaction.
- Conflict UI presents per-student choices rather than a single blind overwrite action.
- The source includes domain-specific validation for student enrolment, academic-year bounds, and statuses.
- The handoff now explicitly distinguishes school holiday rules that have not yet been built.

## Final gate

A PR-004S completion report must include: precise code diffs, dedicated automated regressions for A–E, proof that restore is restricted to offline maintenance (F), reproducible browser E2E for key client cases, baseline 129 tests rerun, builds/typecheck, separate synthetic DB checks, and explicit no-production-change attestation. Then seek independent PR-004 final sign-off. **Only afterwards begin PR-005 planning/implementation under fresh approval.**

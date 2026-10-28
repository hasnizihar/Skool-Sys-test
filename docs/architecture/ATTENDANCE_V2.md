# SkoolSys 2.0 — PR-004 Attendance Integrity Architecture (V2)

**Institution:** Kattankudy Central College National School, Batticaloa, Eastern Province, Sri Lanka  
**Milestone:** PR-004 (Attendance Integrity, Academic-Year Validation & Offline Synchronization Reliability)  
**Branch:** `feature/pr-004-attendance-integrity`  
**Starting Commit:** `d37efe375a9bd4cd2b5b2cc429b6698237528278`  
**Baseline Verification:** 61 passing automated tests across 23 test suites  

---

## 1. Safety & Execution Mandates

1. **No Live Database Alterations:** All development tests execute against isolated synthetic temporary SQLite databases via `setupIsolatedTestDb()`. The live database `server/skoolsys.db` is never modified or migrated during automated test execution.
2. **Atomic Writes:** All register mutations (`attendance_sessions`, `attendance_records`, `attendance_sync_receipts`, `audit_logs`) execute inside a single `BEGIN IMMEDIATE` transaction.
3. **Optimistic Concurrency:** Server session `revision` increments monotonically. Clients supply `baseRevision`. Stale mutations return RFC 7807 problem details (HTTP 409).
4. **Idempotency Guarantee:** Replay of a confirmed `clientMutationId` with matching canonical payload returns `200 OK` (`status: 'replayed'`) without duplicating revisions or audit logs.
5. **No Blind Coercion:** Invalid attendance status strings are rejected with HTTP 422, never silently converted to `present`.
6. **Sri Lankan Civil Time:** Civil dates are evaluated strictly in `Asia/Colombo` (UTC+05:30) to eliminate UTC midnight boundary date shifts.

---

## 2. Implementation Gate Log

| Stage | Milestone | Status | Verified Evidence |
| :--- | :--- | :--- | :--- |
| **Stage 0** | Baseline, Isolation & Branch Setup | **PASS** | Branch `feature/pr-004-attendance-integrity` created. Baseline: 61/61 tests pass, typecheck 0 errors, build clean. |
| **Stage 1** | Contracts, Validation & Date Utilities | *PENDING* | Strict schemas, RFC 7807 problem details, canonical payload hashing. |
| **Stage 2** | Schema Migration & Backup Recovery | *PENDING* | Versioned migration 004, `VACUUM INTO` snapshot, foreign key checks. |
| **Stage 3** | Atomic Service, Permissions & Audit | *PENDING* | Shared `attendanceService.ts`, in-transaction auth, roster boundary. |
| **Stage 4** | Offline Queue V2 & Storage Isolation | *PENDING* | IndexedDB v2, composite keys, PII scrub, legacy quarantine. |
| **Stage 5** | Attendance UI, Conflict Modal & Reports | *PENDING* | Draft/Submit modes, side-by-side reconciliation, truthful Colombo dates. |
| **Stage 6** | Comprehensive Regression (ATT-001..064)| *PENDING* | 64 test scenarios implemented and executed against temporary DBs. |
| **Stage 7** | Self-Review, Docs & Local Handoff | *PENDING* | Audit report, diff review, zero-production-change attestation. |

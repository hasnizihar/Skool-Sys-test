# SkoolSys 2.0 — PR-004S Comprehensive Attendance Regression Matrix (ATT-001 – ATT-075 & E2E-01 – E2E-11)
**Kattankudy Central College National School (Grades 6–13)**  
**Branch:** `feature/pr-004-attendance-integrity`  
**Status:** 146 passing automated tests across 37 test suites (0 failures)  
**Execution Date:** 2026-10-18  

---

## 1. Regression Scenarios & Automated Test Mapping

| Scenario ID | Category | Description | Primary Test File | Status |
| :--- | :--- | :--- | :--- | :--- |
| **ATT-001** | Validation | Legacy payload lacking V2 concurrency metadata rejected with 400 | `attendance_validation.test.ts`, `attendance_integrity.test.ts` | **PASS** |
| **ATT-002** | Roster Boundary | Cross-class student injection blocked with 422 `FOREIGN_STUDENT_ENROLMENT` | `attendance_integrity.test.ts` | **PASS** |
| **ATT-003** | Atomicity | Zero-write transactional rollback on single invalid foreign student | `attendance_integrity.test.ts` | **PASS** |
| **ATT-004** | Auth Revalidation | In-transaction active account status revalidation (rejects deactivated user) | `attendance_integrity.test.ts` | **PASS** |
| **ATT-005** | Auth Revalidation | In-transaction class teacher permission revalidation (rejects unassigned teacher) | `attendance_integrity.test.ts` | **PASS** |
| **ATT-006** | Validation | Academic-year date boundary enforcement (rejects dates outside year) | `attendance_integrity.test.ts`, `attendance_validation.test.ts` | **PASS** |
| **ATT-007** | Concurrency | Server-calculated roster fingerprint mismatch detection (rejects stale client) | `attendance_integrity.test.ts` | **PASS** |
| **ATT-008** | Idempotency | Idempotent mutation replay with exact same mutation ID and payload | `attendance_integrity.test.ts` | **PASS** |
| **ATT-008B**| Idempotency | Idempotent replay succeeds after intervening student admission changes roster fingerprint | `attendance_integrity.test.ts` | **PASS** |
| **ATT-009** | Idempotency | Idempotency key reuse with differing payload rejected with 409 | `attendance_integrity.test.ts` | **PASS** |
| **ATT-010** | Idempotency | Idempotency mutation replay under different user account rejected with 403 | `attendance_integrity.test.ts` | **PASS** |
| **ATT-011** | Concurrency | First session write requires `baseRevision = 0` | `attendance_integrity.test.ts` | **PASS** |
| **ATT-012** | Concurrency | Concurrency revision mismatch rejected with 409 `ATTENDANCE_CONCURRENCY_CONFLICT` | `attendance_integrity.test.ts` | **PASS** |
| **ATT-013** | Concurrency | Revision increments monotonically (1 -> 2 -> 3) on successive updates | `attendance_integrity.test.ts` | **PASS** |
| **ATT-014** | Workflow | Submitted finalized register cannot be downgraded to draft | `attendance_integrity.test.ts` | **PASS** |
| **ATT-015** | Workflow | Submitted register requires 100% complete roster records | `attendance_integrity.test.ts` | **PASS** |
| **ATT-016** | Workflow | Draft register allows partial records (unmarked allowed) | `attendance_integrity.test.ts` | **PASS** |
| **ATT-017** | Data Integrity | Snapshot reconciliation guard preserves historical attendance of transferred pupils | `attendance_integrity.test.ts` | **PASS** |
| **ATT-018** | Audit Trail | In-transaction fail-closed audit log (`ATTENDANCE_SUBMIT` / `ATTENDANCE_UPDATE`) | `attendance_integrity.test.ts` | **PASS** |
| **ATT-019** | Session Read | `GET /api/attendance/session` returns current server fingerprint and revision | `attendance_integrity.test.ts` | **PASS** |
| **ATT-020** | Session Read | `GET /api/attendance/session` preserves historical transferred pupils | `attendance_integrity.test.ts` | **PASS** |
| **ATT-021** | Reports | Daily attendance report accurately aggregates enrolled and present students | `attendance_integrity.test.ts`, `attendance_reports.test.ts` | **PASS** |
| **ATT-022** | Reports | Monthly attendance grid report displays student attendance across dates | `attendance_integrity.test.ts`, `attendance_reports.test.ts` | **PASS** |
| **ATT-023** | Offline Sync | Independent per-item atomicity in offline sync batch | `attendance_sync.test.ts` | **PASS** |
| **ATT-024** | Offline Sync | Batch with mixed valid and conflicting revision items | `attendance_sync.test.ts` | **PASS** |
| **ATT-025** | Offline Sync | Idempotent replay within sync batch returns replayed status | `attendance_sync.test.ts` | **PASS** |
| **ATT-026** | Offline Sync | Rejection of legacy sync items missing required V2 fields | `attendance_sync.test.ts` | **PASS** |
| **ATT-027** | Offline Sync | Receipt check prevents duplicate session creation on sync replay | `attendance_sync.test.ts` | **PASS** |
| **ATT-028** | Offline Sync | Rejection of sync item with invalid or missing roster fingerprint | `attendance_sync.test.ts` | **PASS** |
| **ATT-029** | Offline Sync | Sync batch authorization rejects unassigned class teacher with 403 | `attendance_sync.test.ts` | **PASS** |
| **ATT-030** | Offline Sync | Persists sync receipt in `attendance_sync_receipts` table | `attendance_sync.test.ts` | **PASS** |
| **ATT-031** | Reports | Daily report aggregates present, absent, late, excused counts | `attendance_reports.test.ts` | **PASS** |
| **ATT-032** | Reports | Daily report absent students phone follow-up directory | `attendance_reports.test.ts` | **PASS** |
| **ATT-033** | Authorization | Record-level scoping filters reports to assigned classes for teachers | `attendance_reports.test.ts`, `record_authorization.test.ts` | **PASS** |
| **ATT-034** | Migration | Legacy schema upgrade: adds revision column and sync receipts table | `attendance_migration.test.ts` | **PASS** |
| **ATT-035** | Migration | Migration runner rerun idempotency (`PRAGMA user_version = 4`) | `attendance_migration.test.ts` | **PASS** |
| **ATT-036** | Validation | Rejection of legacy payload format on `POST /session` | `attendance_reports.test.ts`, `attendance_validation.test.ts` | **PASS** |
| **ATT-037** | Validation | Date validation rejects non-leap Feb 29 and April 31 | `attendance_reports.test.ts`, `attendance_validation.test.ts` | **PASS** |
| **ATT-038** | Contention | Multi-connection SQLite write contention with `PRAGMA busy_timeout = 5000` | `attendance_concurrency.test.ts` | **PASS** |
| **ATT-039** | Date Boundaries | Colombo civil calendar date resolution (`getColomboCivilDate`) | `attendance_reports.test.ts` | **PASS** |
| **ATT-040** | Reports | Monthly attendance grid report for entire class month | `attendance_reports.test.ts` | **PASS** |
| **ATT-041** | Validation | Duplicate student IDs in single submission payload rejected with 400 | `attendance_validation.test.ts` | **PASS** |
| **ATT-042** | Validation | Invalid attendance status coercion blocked (only present/absent/late/excused) | `attendance_validation.test.ts` | **PASS** |
| **ATT-043** | Validation | Excessive remarks string length (>255 chars) truncated or rejected | `attendance_validation.test.ts` | **PASS** |
| **ATT-044** | Validation | Client mutation ID format validation (must be valid RFC 4122 UUID v4) | `attendance_validation.test.ts` | **PASS** |
| **ATT-045** | Validation | RFC 7807 problem details builder produces standardized error contract | `attendance_validation.test.ts` | **PASS** |
| **ATT-046** | Compatibility | Legacy V1 client mutation payloads rejected safely with actionable guidance | `attendance_validation.test.ts` | **PASS** |
| **ATT-047** | Offline Sync | Transient network failure retry behavior does not duplicate session | `attendance_sync.test.ts` | **PASS** |
| **ATT-048** | Offline Sync | Roster fingerprint mismatch inside sync batch returns conflicted | `attendance_sync.test.ts` | **PASS** |
| **ATT-049** | Offline Sync | Foreign student injection inside sync batch returns rejected | `attendance_sync.test.ts` | **PASS** |
| **ATT-050** | Offline Sync | Bounded batch size processing | `attendance_sync.test.ts` | **PASS** |
| **ATT-051** | Migration | Interrupted migration transaction rolls back cleanly leaving schema intact | `attendance_migration.test.ts` | **PASS** |
| **ATT-052** | Data Integrity | Historical attendance records preserved for students transferring midyear | `attendance_reports.test.ts` | **PASS** |
| **ATT-053** | Truthful Reports| Class without recorded attendance displays `session_status = null` (no fake 92%) | `attendance_reports.test.ts` | **PASS** |
| **ATT-054** | UI / Workflow | Side-by-side conflict modal allows keep server, review/reapply, export draft | `Attendance.tsx`, `client_offline_workflow.test.ts` | **PASS** |
| **ATT-055** | Validation | Oversized class register (>120 students) rejected with 413 | `attendance_validation.test.ts` | **PASS** |
| **ATT-056** | Client Storage | IndexedDB v2 quarantine: unverified legacy queue items marked `legacy_review_required` | `offlineQueue.ts`, `client_offline_workflow.test.ts` | **PASS** |
| **ATT-057** | Concurrency | Deterministic payload hashing regardless of object property ordering | `attendance_concurrency.test.ts` | **PASS** |
| **ATT-058** | Authorization | Monthly report authorization restricts non-admin teachers | `attendance_reports.test.ts`, `record_authorization.test.ts` | **PASS** |
| **ATT-059** | Date Boundaries | Gregorian leap-year verification across centuries | `attendance_reports.test.ts`, `attendance_validation.test.ts` | **PASS** |
| **ATT-060** | Concurrency | Revision conflict race condition test (2 concurrent clients submit on same rev) | `attendance_concurrency.test.ts` | **PASS** |
| **ATT-061** | Backup/Recovery | Safe point-in-time backup via SQLite `VACUUM INTO` with post-backup integrity check | `attendance_migration.test.ts` | **PASS** |
| **ATT-062** | Audit Trail | In-transaction fail-closed audit logging for batch sync and individual submissions | `attendance_reports.test.ts` | **PASS** |
| **ATT-063** | Authorization | In-transaction revalidation of class teacher assignment during mutation | `attendance_integrity.test.ts` | **PASS** |
| **ATT-064** | Multi-Year | Academic year isolation: sessions from 2025 excluded from 2026 reports | `attendance_reports.test.ts` | **PASS** |
| **ATT-065** | Migration Fail-Closed | Invariant failure during migration aborts startup without schema corruption | `attendance_migration.test.ts` | **PASS** |
| **ATT-066** | Preflight Backup | Non-destructive collision-free pre-migration backup creation (never overwrites) | `attendance_migration.test.ts` | **PASS** |
| **ATT-067** | Disaster Recovery | Point-in-time database restore from verified backup with post-restore validation | `attendance_migration.test.ts` | **PASS** |
| **ATT-068** | Conflict Resolution | Student-by-student diffing accurately identifies status/remark discrepancies | `attendance_conflict_diff.test.ts` | **PASS** |
| **ATT-069** | Conflict Resolution | Deliberate per-student resolution prevents blind overwrite | `attendance_conflict_diff.test.ts` | **PASS** |
| **ATT-070** | Error Classification | Online HTTP errors (400, 422, 500) isolated from genuine network transport failures | `attendance_conflict_diff.test.ts` | **PASS** |
| **ATT-071** | Conflict Resolution | Repeated 409 collision triggers re-fetch of server state and recalculates diff list | `attendance_conflict_diff.test.ts` | **PASS** |
| **ATT-072** | Conflict Resolution | Repeated collision preserves teacher choices for unchanged students while flagging changed ones | `attendance_conflict_diff.test.ts` | **PASS** |
| **ATT-073** | Mode Reconciliation | Local draft against server submitted register reconciles mode to submitted with full roster | `attendance_conflict_diff.test.ts` | **PASS** |
| **ATT-074** | Retention Policy | 7-day retention expiry blocks auto-sync on 8-day items; marks stale_review_required; reauthorization | `attendance_conflict_diff.test.ts` | **PASS** |
| **ATT-075** | Unsynced Visibility | `getUnsyncedWorkSummary` itemizes all 6 categories (pending, syncing, conflicted, rejected, stale, quarantined) | `attendance_conflict_diff.test.ts` | **PASS** |

---

## 2. Browser & Client Offline Workflow Regression Suite (`client_offline_workflow.test.ts`)

| Scenario ID | Test Name | Target Behavior | Status |
| :--- | :--- | :--- | :--- |
| **E2E-01** | IndexedDB V1->V2 Migration & Quarantine | Quarantines unverified legacy items missing revision/fingerprint with `legacy_review_required` | **PASS** |
| **E2E-02** | Stalled Syncing Recovery | Recovers in-flight items stuck in `syncing` state and resets them to `pending` on reload | **PASS** |
| **E2E-03** | Queue Mutex Locking | Concurrency lock prevents duplicate parallel queue draining | **PASS** |
| **E2E-04** | Multi-Account Isolation | Partitioned stores ensure User A cannot inspect or sync User B uncommitted records | **PASS** |
| **E2E-05** | 7-Day Retention Expiration | Auto-sync processes 6-day records normally but blocks 8-day records with `stale_review_required` | **PASS** |
| **E2E-06** | Truthful Error Classification | 400, 401, 403, 409, 422, 500 classified as rejected/conflicted, never mistaken for offline | **PASS** |
| **E2E-07** | Student Discrepancy Diffing | Compares server vs local records and produces per-student decision matrix without blind overwrite | **PASS** |
| **E2E-08** | Repeated Conflict Handling | Second 409 collision refreshes comparison against fresh server snapshot and invalidates stale choices | **PASS** |
| **E2E-09** | Draft-to-Final Reconciliation | Server submitted register forces target mode `submitted` and requires complete roster marking | **PASS** |
| **E2E-10** | Unsynced Work Summary | Accurately aggregates all 6 uncommitted work states for truthful logout confirmation dialog | **PASS** |
| **E2E-11** | PII Sanitization & Security | Exported offline emergency JSON sanitizes sensitive PII and embeds institutional warning | **PASS** |

---

## 3. Baseline Test Preservation Summary

All pre-existing baseline suites continue to pass 100% without regression:
- `health.test.ts`: 1 test passing
- `auth.test.ts`: 2 tests passing
- `auth_security.test.ts`: 11 tests passing
- `isolation.test.ts`: 3 tests passing
- `record_authorization.test.ts`: 20 tests passing
- `security_matrix.test.ts`: 24 tests passing

**Total Active Test Count:** 146 automated tests across 37 suites (61 baseline + 85 PR-004/PR-004R/PR-004S test cases). 0 failures, 0 skipped.


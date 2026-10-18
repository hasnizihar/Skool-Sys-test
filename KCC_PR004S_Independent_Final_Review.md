# KCC SkoolSys 2.0 — Independent PR-004S Review

**Date:** 18 October 2026  
**Scope:** Uploaded `SkoolSys_PR004S_Clean_Source.zip` and Antigravity's PR-004S completion report.  
**Decision:** **Engineering baseline improved; final PR-004 acceptance remains blocked.** No original project files were changed during this review.

## Verified

- The uploaded `SkoolSys_PR004S_Clean_Source.zip` and `SkoolSys_PR004R_Clean_Source(1).zip` have identical SHA-256 hashes: `9bf3e5e1669514d51169eeb711de67c1db679ae9bd5d96e0aafdb5fd87e3b280`.
- ZIP contains 107 archive entries, including `.env.example` templates, and no actual `.env` secrets, SQLite `.db`/sidecars or `node_modules` entries.
- In source comparison against the previous review baseline, PR-004S adds `client/src/utils/conflictDiffUtils.ts`, `server/test/client_offline_workflow.test.ts`, and changes the actual attendance service, client UI/queue and documentation.
- `attendanceService.ts` checks idempotency receipts before the live roster fingerprint comparison, after in-transaction active-user, role and class/date verification.
- `Attendance.tsx` refetches server state when another HTTP 409 occurs and determines submitted/draft target mode from latest server state.
- The 7-day stale check is now called in `syncPendingQueue`; old items are moved to `stale_review_required` rather than automatically uploaded.
- The provided Antigravity handoff claims 146 passing tests. This claim could not be independently reproduced in full because the clean archive excludes required npm dependencies, and `npm ci --offline` failed for uncached packages.

## Confirmed acceptance blockers

### P0 — Stale conflict choice is preserved after another server change

**Source:** `client/src/utils/conflictDiffUtils.ts`, lines 39–41; `client/src/pages/Attendance.tsx`, approximately lines 510–532.

On a second conflict, the application passes `priorChoices` to `buildStudentDiffList`. For a student whose server status changed again, the helper still sets `chosen = priorChoice || 'server'`. A previous 'local' choice is therefore retained without requiring a new selection for the new server revision. This contradicts the claim that new conflicting edits invalidate earlier choices.

**Independently reproduced:** compiled and executed the actual helper with a local `absent` record, a newer server `excused` record and a prior 'local' choice; returned `chosen: 'local'`.

**Required correction:** compare the previous and new server snapshots and invalidate or reset choices where the server value/remarks changed; require explicit review before resubmitting. Add an integration test with two consecutive 409 responses and student-level assertions.

### P1 — Stale queue reauthorization has no authenticated identity check or UI workflow

**Source:** `client/src/api/offlineQueue.ts`, approximately lines 744–773.

`reauthorizeStaleItem(clientMutationId)` accepts just a mutation ID, changes item status to `pending` and resets its timestamp; it neither checks the logged-in teacher's user ID nor verifies current session and fresh server revisions. Repository search found no caller in the frontend. Consequently, the documented recovery policy is neither safely enforced nor actionable from the UI.

**Required correction:** a real authenticated same-user review flow; preserve the original creation time in an immutable field; fetch and reconcile current server roster/revision; block unverified replay. Do not treat a changed client timestamp as proof of reauthentication.

### P1 — Invalid offline timestamps bypass the age limit

**Source:** `client/src/api/offlineQueue.ts`, approximately lines 735–739.

`isMutationExpired()` returns **false** on `NaN` timestamps, treating malformed/corrupted timestamps as eligible for automatic synchronization.

**Independently reproduced:** compiled and executed the real helper; `isMutationExpired({timestamp:'invalid-date'})` returned `false`.

**Required correction:** fail closed into a review-required state on invalid, future or absent timestamps. Include boundary and corrupted-data tests.

### P1 — Legacy migration and browser workflows lack genuine automated browser evidence

**Source:** `server/test/client_offline_workflow.test.ts`.

All 11 tests labeled `E2E-01` through `E2E-11` construct local arrays/functions inside Node tests. They do not open real IndexedDB, exercise the real `App.tsx` UI, trigger an actual offline browser event, or inspect the real conflict modal. These are useful logic examples, but do not establish browser E2E coverage. The real `openOfflineDB()` IndexedDB v1→v2 transaction also requires a real browser upgrade/recovery test before sign-off.

**Required correction:** add actual browser-level tests (Playwright or other supported runner) against the running application using synthetic fixtures; test legacy queue migration, disconnect/reconnect, stale review, account switching, and repeated conflicts. Retain the Node tests but relabel them unit/simulation tests.

### P2 — Quarantined records counted for all users

**Source:** `client/src/api/offlineQueue.ts`, approximately lines 333–353.

`getUnsyncedWorkSummary(userId)` filters pending records by `userId`, but counts all entries in `quarantined_attendance` regardless of user. Those legacy records may lack trustworthy ownership. On a shared device this can misrepresent another teacher's legacy data as the current account's unsynced work.

**Required correction:** quarantine unknown-owner records in a device-level administrative recovery flow, not an individual user's counts; never auto-assign unknown entries.

## Additional safety note

`restoreFromBackup` is marked OFFLINE MAINTENANCE ONLY and live restore remains disabled. That boundary is appropriate for PR-004; the full operational disaster-recovery workflow belongs in PR-006. Do not imply live restore is certified.

## Sign-off criteria

1. No stale conflict choices survive new server-side student changes without deliberate reconfirmation.
2. Seven-day stale mutations have a usable, authenticated, same-user review and reconciliation workflow; invalid timestamps fail closed.
3. Legacy IndexedDB migration is tested using actual browser storage and does not silently discard queued records.
4. Automated browser tests use the real client and server rather than simulation-only logic.
5. All prior 146 reported tests remain passing, plus new negative regressions; verify CI logs independently.
6. No production deployment, real student data, remote merge or push.

**Next roadmap phase after PR-004 sign-off:** PR-005 **Examination Integrity, Marks Approval, and Results Publication**, planning only until separately approved.

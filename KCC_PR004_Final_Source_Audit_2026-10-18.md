# KCC SkoolSys 2.0 — PR-004 Source Acceptance Audit

**Date:** 18 October 2026  
**Input:** `SkoolSys_PR004R_Clean_Source(2).zip`, `SkoolSys_PR004S_Clean_Source(1).zip`, and Antigravity final closure report.  
**Decision:** Core PR-004 work materially improved; **final sign-off withheld** pending a focused corrective acceptance gate. Production deployment and real student data remain unauthorized.

## Independently verified

- Both supplied ZIPs are byte-for-byte identical (SHA-256 `653fdf65c76b35809d2a383cf62130ce4fc103a4ef84c371d44aaaa2868c2db6`), 110 archived entries each.
- Archive contains environment templates, and no active `.env` or SQLite database files by filename inspection. Source was extracted into a separate review directory. No original source was modified.
- PR-004 conflict-diff and offline-flow helper suites passed when executed via Node.js type stripping: **19/19 tests**, two suites. These are unit/simulation checks, not browser E2E evidence.
- Antigravity reports **151/151** tests across 38 suites, but the full count was not independently reproduced. Offline npm dependency installation could not complete because `vary@1.1.2` was absent from the package cache.
- Attempting the browser test in the clean environment failed in suite setup: missing machine-specific Playwright module. The new browser tests are not hermetic; this test failure is an environment/dependency limitation, not proof that the runtime feature itself fails.

## Release-blocking issues

### 1. Stale offline review can overwrite newer server changes

**Source:** `client/src/components/OfflineBanner.tsx:92–115` and `client/src/api/offlineQueue.ts:810–853`.

The action called **Reconcile & Queue for Sync** fetches the latest attendance session, assigns its `serverRevision` and `rosterFingerprint` to the old unsent mutation, changes it back to `pending`, then calls sync immediately. It does **not** compare old statuses/remarks with current server statuses nor require a deliberate per-student choice. This artificially rebases the old payload and may overwrite newer server decisions, even though the normal conflict feature correctly avoids blind overwrites. Comparing only the user IDs in IndexedDB is not fresh reauthentication.

**Fix:** Route aged/legacy items through the same per-student conflict-resolution workflow; preserve old base revision and fingerprint as evidence. Show changed records and require explicit authorized confirmation before generating a **new** mutation ID against the latest revision. Do not silently auto-sync; verify the active authenticated actor on the server. Include tests with an eight-day-old 'absent' local record versus a newly saved 'present' server record. The server must remain unchanged without deliberate reconciliation.

### 2. Browser E2E tests do not validate the actual production migration or conflict journey

**Source:** `server/test/attendance_browser_real.test.ts:9–30, 47–168, 198–269, 272–370, 372–end`.

- The production offline database name is `skoolsys_offline_db` (`client/src/api/offlineQueue.ts:15`). E2E-01 and E2E-03 use independent test-created databases (`skoolsys_offline` and `skoolsys_offline_v2`) and manually recreate the migration/logout behavior; they do not call the production `openOfflineDB()` upgrade path.
- E2E-04 performs an inline rewrite of conflict comparison logic inside `page.evaluate` rather than triggering and resolving two actual server 409 responses using the application modal.
- E2E-02 checks an offline banner then reconnects; it does not assert a locally saved attendance draft was committed exactly once.
- E2E-05 asserts the review modal and action buttons are visible, but does not click through authenticated reconciliation or verify that newer server data remains intact.
- The suite imports Playwright via a hard-coded Windows user npm-cache path, requires manually running `localhost:5173` and `localhost:5000`, and uses fixed demo credentials. Playwright is not declared in `server/package.json`. It therefore cannot be consistently executed from a clean checkout.

**Fix:** Provide a supported, pinned browser-test dependency and reproducible test startup using an isolated synthetic API/database. Drive the **real** app functions and DOM, not hand-copied algorithms. Include migration against production `OFFLINE_DB_NAME`, offline save/reconnect/acknowledge, two successive server conflicts, account switching, expired-item review and adverse cases. Distinguish failed environment setup from failed assertions.

## Follow-up safeguards

- Review the actual `openOfflineDB()` upgrade of `pending_attendance`: it schedules `oldStore.getAll()` and then immediately deletes the old object store before the callback. Verify retention of every legacy record with an actual v1-to-v2 browser upgrade, including failure injection and zero-loss assertions.
- Keep restoration `OFFLINE MAINTENANCE ONLY`; do not enable live API restores before PR-006.
- KCC institutional policies remain provisional until authorized school leadership approves them. School holidays are not yet modeled in a dedicated school calendar.
- Dev quick-login, complete demo records, smart search and advanced filters remain separate subsequent work; do not add them to the targeted attendance fix.

## Required exit evidence

1. Aged local attendance against a changed server register cannot modify the server without visible per-student decisions and correct permissions.
2. Genuine browser tests invoke the shipped IndexedDB migration and application conflict modal.
3. Test runner passes from a clean checkout with documented dependencies and disposable synthetic fixtures; the normal backend regression suite is preserved.
4. Git work is isolated, with no push, merge, real student data, production deployment, or production database mutation.
5. An updated clean-source archive, exact test log, changed-file manifest, and known residual limitations are supplied for independent review.

**Next milestone after acceptance:** PR-005 planning — Examination Integrity, Marks Approval and Result Publication. No PR-005 implementation before its own explicit approval.

# Kattankudy Central College SkoolSys 2.0 — PR-004 Independent Audit & Next Action

**Date:** 2026-10-18  
**Source:** User-supplied `SkoolSys(3).zip` and Antigravity PR-004 report  
**Scope:** Source review and test verification only. No changes were made to the supplied project or production systems.

## Verdict

PR-004 is implemented in source and its backend tests can pass, but **PR-004 cannot be signed off yet**. Complete a focused corrective pass, **PR-004R**, on the existing isolated branch before starting PR-005.

### Independently verified positives

- Attendance V2 service, validation module, schema migration and tests exist.
- Full server TypeScript compilation completed successfully in an extracted review copy.
- 123/123 backend tests passed independently under Node.js v22.16.0 using TypeScript-to-JavaScript transpilation and Node's test runner. Original `tsx` execution could not be used on Linux because the ZIP bundled the Windows esbuild native package. This workaround checks backend test behavior but is not a substitute for normal CI or browser tests.
- No real KCC student records were used in these tests; tests used synthetic SQLite fixtures.

### PR-004R blockers, prioritized

1. **P0 — Migration failure is not fail-closed.** `server/src/db/database.ts`, around lines 221–226, logs Migration 004 errors and continues startup. Change to abort startup cleanly and provide actionable recovery instructions.
2. **P0 — Required pre-migration backup is not wired in.** `server/src/db/backupUtils.ts` exports `createSafeDatabaseBackup`, but it is only imported by a test and not invoked before `runMigration004` in normal startup. Design/implement verified recovery snapshot handling with file/path validation and restore tests before activating automatic migration. Never delete an existing valid backup to create a new one.
3. **P0 — Conflict reconciliation is not safe as described.** `client/src/pages/Attendance.tsx`, around lines 370–414 and 959–1049, displays only revision and record-count summaries. Clicking “Review & Re-apply” fetches the latest revision and immediately posts existing local statuses without showing per-student differences or asking for deliberate selection. Replace with true per-student diff, explicit user selection, and a second optimistic revision check.
4. **P1 — HTTP errors can masquerade as offline saves.** `Attendance.tsx`, around lines 339–355, handles only 401/403/422 as explicit errors; other HTTP responses, including 400 or 5xx, are placed into the offline queue and described as connection loss. Queue only after a genuine transport failure; retain ambiguous failures for explicit safe retry with the same mutation ID, not a fresh mutation.
5. **P1 — Offline queue error and interrupted-state handling.** `client/src/api/offlineQueue.ts`, around lines 394–480, sends all pending as `syncing`, but has no complete recovery for interrupted `syncing` items; HTTP 401 is reverted to pending instead of pausing for same-user reauthentication. Differentiate 401, 403, 409, 422, 429, 5xx and timeouts. Do not automatically retry authorization/validation failures. Verify no double sync for the same account/mutation.
6. **P1 — KCC policy IDs changed without approval.** The handoff invents KCC-POL-002 as an 80% examination attendance eligibility rule and KCC-POL-003 as an 08:00 late cutoff. Original proposed policy IDs were POL-002 (midyear transfers), POL-003 (holidays/special school days), POL-004 (shared-device offline retention), POL-005 (guardian contact access). The new thresholds were not institutionally approved and no server enforcement was found. Correct the document ledger and do not implement invented school regulations.
7. **P1 — Privacy and source packaging.** `SkoolSys(3).zip` includes `server/.env`, `client/.env`, `server/skoolsys.db`, `server/skoolsys.db-wal` and `server/skoolsys.db-shm`. Exclude these from future source distributions; verify whether any values are sensitive or real, and rotate exposed credentials if appropriate. Use a separate, intentionally sanitized fictional demo dataset.
8. **P2 — E2E and test traceability.** The handoff mentions a browser recording stored on the agent's Windows machine, but the recording and executable browser test suite are not in the ZIP. Some ATT test IDs differ from earlier v1.2 scenario definitions (e.g. ATT-057). Map original requirements to test assertions, add repeatable UI tests, and distinguish executed from claimed coverage.

## Required PR-004R verification gates

- All existing 123 server tests remain passing; add targeted tests for each discovered defect.
- Startup cannot proceed on a failed migration; verified snapshot is created using SQLite-consistent backup before schema mutation; restore is proven on an isolated copy.
- Browser E2E proves conflict dialog shows student-level server/local differences and cannot silently overwrite.
- Online HTTP 400/401/403/409/422, server 5xx, browser offline, ambiguous timeout and quota failure each produce truthful distinct outcomes.
- Queue recovers interrupted in-flight items, respects same-user identity, preserves failed drafts, and never invents successful synchronization.
- Principal-unapproved institutional policies are not silently enforced and the requirements ledger preserves original IDs.
- Publish clean source package without `.env` or SQLite files; no real data, no deployment, no merge or push.

## Next milestones as per approved roadmap

1. **PR-004R** — Address and independently verify these attendance/migration/offline defects within the existing approved PR-004 scope.
2. **PR-004 sign-off** — Verify all backend, browser, migration, security, rollback and provisional-policy gates; only then consider merge/pilot approval as a separate decision.
3. **PR-005 planning** — Examination & marks integrity: workflow for draft → submit → review/approve → publish, correct subject permissions, historical corrections, report-card accuracy, Sri Lankan O/L–A/L vs term-exam handling.
4. **PR-006 planning** — Safe backup/restore and operational disaster recovery (beyond migration preflight snapshots).
5. **PR-007 planning** — Student lifecycle and date-effective class enrolments/transfers/promotions.
6. **Product-quality stage** — Complete synthetic demo data per existing implemented module, local development quick-login roles, advanced filters, permission-aware global smart search, and a repeatable all-buttons/links E2E audit.

## Antigravity corrective instruction

Review PR-004 against this independent audit. Implement **only** corrective changes within the existing isolated `feature/pr-004-attendance-integrity` development scope. Do not introduce new school features or unapproved school policies. Before code changes, show a short exact-file corrective plan. Fix migration preflight and recoverability; implement true per-student conflict reconciliation; correct online/offline error categorization and in-flight queue recovery; restore original KCC policy IDs; and add repeatable targeted regression and browser E2E tests. Test with fictional temporary databases and local browser storage. Rerun existing and new tests, builds and type checking. Stop without pushing, merging, deploying, or modifying any existing/live school database. Provide an evidence-based handoff with test commands, counts, unresolved defects and file-level diff.

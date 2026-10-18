# KCC SkoolSys 2.0 — PR-004S Final Completion Prompt

**Approved context:** Continue the already authorized PR-004 isolated development work only. Do not merge, push, deploy, access real school data, implement PR-005, or change unrelated modules.

Read `KCC_PR004R_Independent_Final_Acceptance_Audit.md` and the current branch source before editing. Your latest final handoff is **not yet accepted**. This is a tightly scoped corrective and reproducible verification pass, not an architecture rewrite.

## Required coding corrections

1. **Idempotent replay ordering:** In `server/src/services/attendanceService.ts`, after in-transaction active-account/authorization checks, evaluate existing `clientMutationId` and the canonical payload hash before enforcing *current* roster fingerprint on new writes. Identical already-committed requests must replay even after roster membership changes; mismatched payloads and cross-user replays must remain blocked. Test timeout-after-commit, subsequent admission, exact retry, and wrong actor.
2. **Repeated conflict correctness:** On a second `409`, rebuild the student comparison from the newly fetched server snapshot, invalidate prior decisions as needed, and prevent applying stale choices. Add browser E2E for two successive conflicts.
3. **Draft-to-final reconciliation:** Derive allowed `mode` from the latest server register rather than stale local state; never downgrade submitted registers. Add `draft local / submitted server / reconcile` test with audit reason where policy requires.
4. **7-day offline policy:** Actually call the age validation in queue processing. Require same-account fresh authentication and manual review for aged unsynced items; never silently delete pending entries. Do not confuse JWT lifetime with data age. Test clock-controlled 6-day and 8-day records.
5. **Unsynced-work visibility:** Include rejected, in-flight, and quarantined items in truthful logout and recovery warnings; provide safe review/recovery paths. Ensure one account cannot replay another account's records.
6. **Restore scope:** Mark `restoreFromBackup` as OFFLINE MAINTENANCE ONLY and enforce/explain mandatory close of all target database connections before any replacement. Avoid claiming production-safe live restore. Leave full restore redesign to PR-006.

## Evidence and acceptance gates

- Preserve all 129 reported existing tests; verify actual count by executing the suite, not copying a report.
- Add new automated tests that directly exercise the real implementation rather than copying helpers into test files.
- Add committed and reproducible frontend/browser tests (Playwright or equivalent) for IndexedDB v1->v2 quarantine, persistence failure, offline reconnect, user switching, rejection classification, conflict dialog, repeated conflicts and draft-to-final reconciliation. Browser recordings alone are insufficient.
- Verify schema migration/backup on disposable synthetic WAL-mode databases.
- Run server tests, builds, typechecks, lint and browser E2E. State each exact command and actual result; report blocked checks explicitly.
- Reconcile the ATT scenario ID matrix against the original plan without renumbering silently.
- Confirm that the final clean source ZIP preserves `.env.example` and excludes real `.env`, databases, WAL/SHM, backups, build output and node_modules.
- Return a small PR-004S report, updated clean source ZIP, branch/commit status and concrete regression evidence. Do not claim final sign-off for yourself. Stop for independent review.

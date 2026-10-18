# KCC SkoolSys 2.0 — PR-004 Architecture Review and Required Plan Revision

**Decision:** Architecture broadly suitable; **NOT YET APPROVED FOR IMPLEMENTATION**.
**Scope:** Planning-only corrections to the Antigravity report “SkoolSys 2.0 — KCC PR-004 Technical Review & Engineering Architecture”.
**Repository baseline:** Latest inspected KCC SkoolSys repository per Antigravity's report; do not assume this document independently verifies live repository state.
**Institution:** Kattankudy Central College National School, Kattankudy, Batticaloa, Sri Lanka.

## The instruction to give Antigravity

You produced a planning-only report for PR-004. Thank you. **Do not implement, modify source files, create branches, run migrations, install packages or deploy.** Revise the architecture document to **v1.1**, retaining the existing single-school architecture and the ATT-001–ATT-040 coverage, but address the mandatory corrections below. Each proposed correction must include a precise API and database contract, file responsibilities, edge cases, automated test IDs, migration/rollback impact, and any required school policy approval. Clearly separate verified source facts from design assumptions.

### Mandatory design corrections

1. **Atomic idempotency and authorization:** Move authoritative idempotency lookup/insert into the same `BEGIN IMMEDIATE` transaction as revision check, roster validation, register changes, and audit insert. Verify that retrying the same mutation is allowed only for the correct authorized actor/operation. Define concurrent same-key insert behavior and data-safe error handling. Re-check current authorization on a replay, without exposing prior user data.

2. **Server-owned roster fingerprint:** Define a canonical digest over school/class/year/effective date plus the eligible roster (stable ID/status representation and roster version, not display names). Document when the digest changes and how stale offline submissions are rejected or reviewed. Include added students, removals, transfers, inactive status changes, and the limitations caused by missing date-effective enrolments. Never accept the client fingerprint as authoritative.

3. **Draft replacement semantics:** Define whether each mutation is a *full snapshot* or *patch*. Ensure a student removed from a draft does not leave an old persisted attendance entry. Specify how transitions `draft -> submitted` and authorized amendments are validated; disallow `submitted -> draft` unless formally approved. Include deletion/reconciliation rules within the same transaction.

4. **Legacy schema/historical enrolments:** The existing `UNIQUE(student_id, academic_year_id)` model cannot accurately reconstruct within-year transfers. Propose a safe restricted PR-004 policy, clearly mark historical unknowns, and defer a complete date-effective enrolment migration to its own approved work item. Existing dated sessions must not be rewritten or misattributed to a new class. Explain historical reports with incomplete membership history.

5. **IndexedDB design and privacy:** Avoid dynamic object store names (`queue_${userId}`) for unlimited users. Use stable object stores and composite keys including school identifier, authenticated user ID, academic year, class and register date. Make the account-switch and logout behavior explicit; never replay Teacher A's queue under Teacher B's token. Await `tx.oncomplete` for writes/deletions; preserve queued items safely across database version upgrades. Minimize PII and acknowledge browser storage partitioning alone is not confidentiality from someone with device access. Clarify shared-device retention and recovery.

6. **Conflict resolution authority:** Remove unrestricted “Overwrite” from the UI specification. Permit only `Keep server`, `Review & reapply` (on freshly fetched data and current revision), and `Export local draft` until a separate approval is given. Any post-submission correction must have a reason, validated user authority and audit evidence. A changed server state during manual conflict review must generate another conflict, never a lost update.

7. **Migration idempotence and rollback:** `ALTER TABLE ... ADD COLUMN revision` cannot simply be re-executed idempotently. Specify a version-controlled migration runner using `PRAGMA user_version` or a migration ledger, inspect schema before migration, run preflight checks and validate `PRAGMA foreign_key_check`. Test legacy snapshots including old sessions with records, draft-like incomplete sessions, WAL/SHM state, duplicate operations, and existing schema drift. Define rollback as recovery from a verified backup/snapshot or an explicitly safe compatible downgrade, not silently leaving an unknown schema. Preserve all historical data.

8. **API backward compatibility/PWA caching:** Provide a rollout strategy for existing frontend clients, service workers and queued V1 payloads lacking `mode`, `baseRevision`, `clientMutationId` or roster fingerprint. Never silently guess missing statuses or replay old mutations. Explicitly define response when client versions are unsupported and how users recover pending offline entries before upgrade.

9. **Correct HTTP contracts:** Use HTTP 200 for a successful batch request with `results[]` item statuses (even when some items are rejected); do not call it “200 Multi-Status”. For synchronous single-item calls, use explicit 200/201, 409, 422 as appropriate. If claiming RFC 7807 compatibility, use `application/problem+json` and standard fields (`type`, `title`, `status`, `detail`, `instance`) plus stable application `code`; otherwise call it a custom JSON contract. Avoid leaking guardian details in errors.

10. **Honest attendance reporting:** Define treatment of `not recorded`, incomplete draft and published/finalized attendance separately; never treat unmarked as present or absent. Explicitly describe denominators, academic-year scoping, day boundaries, missing sessions, class changes and data-quality warnings. Use `Asia/Colombo` civil dates without relying on a locale string that might format differently across environments. The report should display “Not Recorded” for missing data, not artificial 0% or 92%.

11. **Authentication and offline retry behavior:** Explain behavior for `401` (retain pending, require same-account reauthentication), `403/422` (reject, retain for review or export but do not auto-retry), `409` (conflict review), offline/network error (retry with same operation ID, backoff), `429/5xx` (bounded retry), and ambiguous timeout after server commit (replay exactly once logically). Never claim server save before explicit confirmation.

12. **Realistic test gates:** The claimed 61 baseline tests must be re-counted on the actual implementation branch. Treat 40 planned scenarios as unexecuted until independently run. Test multiple SQLite connections/processes if claiming concurrency support. Do not require a fixed `<100ms` threshold on uncalibrated hardware; propose a documented environment, dataset, baseline, percentile target, and maximum acceptable regressions. Always include end-to-end browser checks of Save Draft, Final Submit, reconnect/replay, conflict review, account switch and teacher permission denials.

### Add regression tests ATT-041 to ATT-056

- **ATT-041:** Two simultaneous requests reuse the same operation UUID: one commit; second replay or safe conflict; no duplicate audit/revision.
- **ATT-042:** Mutation UUID replay attempted under another user/role: no private data disclosure and no unauthorized success.
- **ATT-043:** Eligible roster changes between offline capture and sync: stale fingerprint detected; register untouched.
- **ATT-044:** Draft previously contains Student X; next authorized full snapshot omits X: old row removed atomically (or patch behavior explicitly tested if approved).
- **ATT-045:** Transition from submitted register back to draft: rejected unless approved policy permits.
- **ATT-046:** Legacy clients missing new V2 fields: deterministic compatibility response, zero silent data changes.
- **ATT-047:** Migrating browser IndexedDB V1 with pending queue retains entries and handles them safely.
- **ATT-048:** Logout/account switching with pending queue never sends one teacher's data as another teacher.
- **ATT-049:** Server returns 401 during replay: pending queue retained; reauthentication required, no cross-user replay.
- **ATT-050:** Mutation reviewed against server revision N, but server advances to N+1 before reapply: second 409; no overwrite.
- **ATT-051:** Legacy database migration rerun and interrupted migration: safe recovery and original records intact.
- **ATT-052:** Historical class/year reports with a within-year transfer limitation: no invented student membership or misleading attendance percentage.
- **ATT-053:** Missing, draft-only and submitted days yield distinct, truthful statistics and labels.
- **ATT-054:** Client statuses 403/422/409 vs transient network/5xx all display correct messages and do not produce false success.
- **ATT-055:** Request/body size limits and sync batch size cap prevent excessive memory/DB load; no partial writes for invalid item.
- **ATT-056:** File/DB/IndexedDB transaction failure simulation proves atomic state and preserved queue with no false acknowledgments.

### Decisions to explicitly leave pending for KCC leadership/product owner

- **KCC-POL-001:** Authority to amend submitted attendance; whether prior-day changes need principal approval. Propose same-day correction by assigned class teacher with reason + audit; past-day changes admin/principal approval, pending school confirmation.
- **KCC-POL-002:** Midyear transfers: PR-004 safety restriction (no unsafe historical backdate edits) until effective-dated enrolment model is separately approved.
- **KCC-POL-003:** Working days/holidays: configurable school calendar later; don't hardcode Fridays, weekends or public holidays as blocked without the principal's approval.
- **KCC-POL-004:** Offline retention and shared-device policy: propose re-auth after 7 days while preserving any unsynced data for authorized recovery; don't automatically destroy pending records.
- **KCC-POL-005:** Who may view absent-student guardian contact data in reports; default to deny unless specific school-approved role and purpose.

### Output required, PLANNING ONLY

Deliver `PR-004 Engineering Design v1.1` with:
1. Updated file-by-file task list with dependency order.
2. Explicit API request/response/error compatibility specification.
3. DB migration + snapshot + rollback design.
4. Transaction and idempotency sequence with race analysis.
5. Versioned roster membership strategy and historical-transfer limitation.
6. IndexedDB migration, state machine, shared-device privacy and queue recovery.
7. Browser UI acceptance journeys and screen-state matrix.
8. ATT-001–ATT-056 traceability matrix (existing 40 preserved; 16 additions).
9. School policy decisions, recommendations and impact if deferred.
10. Release-gate checklist listing what would block future implementation acceptance.

**STOP after revised planning. No changes, implementation or deployment.**

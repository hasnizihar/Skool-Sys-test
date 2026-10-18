# KCC SkoolSys — Final PR-004 Acceptance Corrections

I have independently reviewed the latest `SkoolSys_PR004S_Clean_Source.zip` and the PR-004S completion report. Keep all PR-001–PR-004 work, remain in the authorized isolated development scope, and do not push, merge, deploy or use real school data.

**Do not begin PR-005.** Complete these tightly scoped final acceptance items:

1. **Repeated 409 conflicts:** In `conflictDiffUtils.ts` and `Attendance.tsx`, detect which students' server status or remarks changed since the previous conflict. Invalidate their previous `local`/`server` choice and require explicit re-review. Add an integration regression that reproduces a second 409 after the teacher chose 'My Draft'. Do not let a stale choice reapply implicitly.

2. **Stale offline review:** Implement an accessible interface for `stale_review_required`. Verify the currently authenticated teacher owns the item; never trust only a supplied mutation ID. Refresh the server roster and revision, require deliberate reconciliation, and preserve the original timestamp instead of resetting age to bypass the 7-day limit. Ensure existing online permission checks remain authoritative.

3. **Corrupted timestamps:** Make missing, malformed or implausibly future-dated queue timestamps fail closed into manual review instead of allowing automatic sync. Add real function tests using the production `isMutationExpired` logic.

4. **Legacy IndexedDB and real browser tests:** Build browser-based tests that use the production IndexedDB upgrade path, real application interface, offline/online transitions, 2-account switching and conflict modal. The existing `server/test/client_offline_workflow.test.ts` is simulation/unit testing; do not label it browser E2E. Test old v1 queue migration with unsynced records and prove none disappear.

5. **Quarantine scope:** Do not count unknown-owner legacy quarantined entries as a specific teacher's unsynced work. Provide a separate, guarded recovery count/workflow.

6. **Verification:** Rerun all existing tests plus new regressions, frontend and backend typechecking, builds, lint, and actual browser journeys. Provide commands, pass/fail logs and evidence. Preserve `.env.example` and exclude secrets/databases from a new clean-source ZIP.

7. **Handoff:** Return exact file diffs, commit hash, test mapping, browser artifacts, remaining risks and no-production-change attestation. Stop after PR-004 final handoff and await explicit approval for PR-005 planning.

Reference: `KCC_PR004S_Independent_Final_Review.md`.

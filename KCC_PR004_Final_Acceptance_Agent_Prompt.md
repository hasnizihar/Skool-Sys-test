# SkoolSys 2.0 — Focused PR-004 Acceptance Completion Prompt

**Scope:** Kattankudy Central College National School, single-school build. Continue only within the previously approved isolated attendance-development branch. **No live data, push, merge, deploy, unrelated features, or PR-005 coding.**

Read the attached independent source audit. Do not claim final completion until each requirement below is demonstrated with actual executable evidence.

## Task A — Make stale-register reauthorization conflict-safe

Inspect `OfflineBanner.tsx`, `offlineQueue.ts`, `Attendance.tsx`, `conflictDiffUtils.ts`, and the attendance V2 API. The current `handleReconcileStale` is unsafe: it fetches the current revision/fingerprint, writes both onto an old mutation, and immediately syncs unchanged attendance statuses.

Replace this with a review flow that retains the original revision and fingerprint, compares the stale local register with the current server roster/records, requires explicit per-student choices whenever data changed, and uses a new mutation ID only after deliberate confirmation. Authenticate and authorize against current server-side identity and class assignment. If the local account, roster, school year, or server state cannot be verified, block automatic submission and preserve the draft for safe review. Recheck revision atomically when saving. Never call it safe merely because local `userId` matches.

Add tests: 8-day local absent vs current server present, changed roster, revoked class-teacher assignment, expired session, repeat 409 during review, draft-versus-final state, and interrupted save. Assert zero overwrite without deliberate choice.

## Task B — Make browser tests real and reproducible

`attendance_browser_real.test.ts` currently duplicates migration and conflict logic instead of invoking production functions. It also depends on a user-specific Windows Playwright path and existing localhost servers.

Use declared and pinned test dependencies, a self-contained browser-test command, isolated synthetic database/startup, and deterministic test accounts. Test the shipped `OFFLINE_DB_NAME` / `openOfflineDB()` v1-to-v2 upgrade with preserved legacy entries. Exercise the real attendance page, offline save, reconnect, idempotent sync, second 409 conflict, account switch, and stale-review *completion*, including server-side data assertions. Don't confuse rendering a button with successfully completing its workflow.

Keep fast backend tests separate from browser E2E if appropriate, but provide explicit commands and CI setup for both. Clean checkouts must not require private cache paths or live school databases.

## Task C — Handoff and stop

Rerun baseline regressions, newly added backend/IDB/browser tests, TS checks and builds. Provide actual pass/fail/skipped counts, per-test evidence, and a code diff. Do not hide environment failures. Generate an updated sanitized ZIP with `.env.example` but no secrets, DB, backup or dependencies. Stop after the local PR-004 handoff. Await independent acceptance before beginning PR-005.

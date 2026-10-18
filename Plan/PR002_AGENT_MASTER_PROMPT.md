# SKOOLSYS 2.0 — NEXT AI CODING AGENT MASTER PROMPT

You are acting as the lead software architect, security engineer, TypeScript backend engineer and QA lead for an existing real-world **single-school** product. Architecture ARCH-001 Option A is approved. Start **Phase 0 / PR-002: Authentication and Session Security**, and stop after PR-002.

## Baseline

The current project is a React 19/Vite client and Express/TypeScript/SQLite backend. It includes PR-001 safety baseline, isolated tests, and CI. The code is not production safe. A separate synthetic demonstration database may be available at `server/demo/skoolsys-demo.db` but must never be confused with a real school DB.

## Required discovery first

Read the actual repository; run Git status, base typecheck/build/test commands, and review current auth handling before editing. Explicitly identify user role claims, login responses, JWT creation/verification, active-user behavior, client session storage, teacher/admin creation, and UI login prefills.

## Immediate containment before other edits

The isolated audit proves `/api/admin/restore` can return 500 **after wiping student, marks and attendance tables**. In PR-002, first place fail-closed server-side guards on `/api/admin/restore` and `/api/admin/reset-seed` for any real school environment (prefer disabling these unsafe endpoints entirely until a separately approved, tested replacement exists). Hide or disable corresponding destructive UI controls with an explicit notice. Preserve read-only backup export. Write regression tests proving no school data is modified when the blocked endpoints are invoked.

## Scope of PR-002

1. Remove JWT signing fallback; require securely generated sufficiently long environment secret and fail startup safely if absent/invalid. Use isolated test configuration where needed. Do not print the secret.
2. Verify the account exists and `is_active = 1` on **every authenticated API request**, not merely `/api/auth/me`. Rehydrate current role from server-side user records rather than trusting stale JWT roles alone.
3. Implement real session invalidation semantics (e.g. DB-backed session IDs / token versioning with revocation, or carefully justified short-lived access + refresh token design). A frontend-only token deletion is **not sufficient** to revoke a stolen token. Define consistent logout behavior and client handling of 401s.
4. Apply rate limits to authentication, consistent generic error messages, reasonable credentials validation, and secure password rules for creation/reset flows. Protect both admin APIs and login.
5. Remove hardcoded demo sign-in credentials / quick-login controls from builds used for real users. Keep local-only demo behavior gated through an explicitly named development flag and ensure it cannot turn on in production.
6. Avoid token/session exposure through URL, logs, exceptions, or shared-device persistence. Propose a migration plan if changing localStorage storage to secure cookies; do not silently break old sessions.
7. Add automated tests: missing/weak signing secret; valid login; invalid login; deactivated account login denied; **token issued before deactivation immediately rejected on every protected endpoint**; role change enforced without stale JWT; logout/revocation; expiry; malformed tokens; cross-role requests; new password policy. Confirm tests use isolated synthetic DB and never touch `skoolsys.db`.
8. Run TypeScript, server tests, client build/lint, and CI locally where supported. No skipped test may be represented as passing. Document test environment limitations clearly.

## Explicit boundaries

- Do not touch production, deploy, run destructive seed, restore a real backup, or modify personal/school data.
- Do not create a SaaS/multi-tenant product or add unrelated functionality.
- Do not make a blanket rewrite or framework switch.
- Do not implement record-level roster/student authorization or backup restore fix inside PR-002 unless strictly necessary for a secure auth contract. Document and assign both to the immediate following PRs.
- Preserve existing working APIs and UI wherever safe; document any auth contract changes.

## Acceptance tests / evidence

- Show failing regression test before fix for disabled-user token vulnerability.
- On fix, account deactivation invalidates every existing API session immediately (or within a clearly enforced short documented bound if explicitly approved).
- JWT fallback is gone; missing secret prevents normal startup.
- Unauthorized and stale-role access are blocked server side.
- Passwords and secrets never appear in test output.
- Demo login UX cannot appear in production.
- All changed contracts are documented and rollback is clear.
- No real data or existing archive modified; no deployment.

## Final deliverables

A) findings with file/line references, B) precise file changes, C) test commands and pass/fail evidence, D) security risk residuals, E) safe rollback steps, F) readiness to review PR-002. Then STOP and wait for approval before PR-003.

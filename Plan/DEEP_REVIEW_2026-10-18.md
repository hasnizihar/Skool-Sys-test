# SkoolSys 2.0 — Independent Deep Audit and Next Steps

**Date**: 2026-10-18  
**Scope**: Uploaded `SkoolSys(1).zip`; not a live deployment.  
**Architecture**: ARCH-001 — approved production-quality **single-school** system.  
**Original ZIP**: Not modified. All mutations occurred in an extracted review copy and one disposable `/tmp` database.

## 1. What was independently verified

1. The new ZIP includes PR-001 additions: isolated test harness, `createApp`, CI workflow, Git ignore rules, environment examples, architecture/security documentation. The included agent report claims 21 tests passed during its previous Windows execution; these are **reported**, not independently reproduced here.
2. Both client and server TypeScript projects successfully passed local compiler checking using `node .../typescript/bin/tsc`.
3. Compiled server was started against a disposable **copy** of the new demo database at `/tmp/skoolsys_api_test.db` (port 5088).
4. The API read/error/role smoke matrix passed **40/40** expected HTTP status checks. See `API_AUDIT_RESULTS.json`. This is a smoke test, not proof all data is correct or secure.
5. Synthetic CRUD tests exercised create student, create user, update student, assign teacher, deactivate user, submit attendance, save marks. These exercised endpoints, but three dedicated security-negative checks failed as described below. See `WORKFLOW_AUDIT_RESULTS.json`.
6. Source-level navigation review: **7/7 sidebar destinations** have corresponding `App.tsx` pages; **5/5 dashboard shortcut destinations** exist. Telephone and email anchors (`tel:` / `mailto:`) are present. See `NAVIGATION_AUDIT.json`.
7. **Live browser interaction tests were not executed**: Chromium navigation was blocked with `ERR_BLOCKED_BY_ADMINISTRATOR`. An initial attempt to run ZIP-included test binaries failed because `node_modules` originated on Windows with Windows-native esbuild. Don't equate static routing checks with clickable UI acceptance.
8. The original seeded database was not opened for a mutating test. `server/demo/skoolsys-demo.db` was independently generated from synthetic data and passed SQLite foreign-key checks.

## 2. Critical failures (release blockers)

### R-01: Backup restore is destructive on failure (CRITICAL)

- Admin `GET /api/admin/backup`: HTTP 200, a JSON export was produced.
- Admin `POST /api/admin/restore` with the system's own export: **HTTP 500** with `FOREIGN KEY constraint failed`.
- On disposable `/tmp` DB: `students: 361 -> 0`, `marks: 1421 -> 0`, `attendance_records: 3621 -> 0`, while `users: 22 -> 22`.
- Root cause evidenced in `server/src/routes/admin.ts` lines ~205–260: deletes across live tables without transaction; retains `audit_logs` references to users; the deletion order fails, leaving partial changes.
- Original demo DB SHA-256 was checked before and after and remained identical. See `RESTORE_AUDIT_RESULT.json`.
- **Immediate guardrail**: disable the destructive restore UI/API for any non-disposable installation until full transaction, integrity validation, dry-run checks, crash recovery, and a restore test pass.

### R-02: Deactivated token still authorizes student data (CRITICAL)

- Created test teacher, logged in, deactivated via admin, then reused previous token.
- `GET /api/students` returned **HTTP 200**, instead of HTTP 401.
- `server/src/middleware/auth.ts` verifies JWT signature but does not reload `users.is_active`.
- Auth service also contains a hardcoded default JWT secret.

### R-03: Subject-teacher unauthorized student exposure (CRITICAL)

- Teacher with a restricted class-subject assignment could query `GET /api/students` and obtained all 361 student records in the disposable test DB.
- `GET /api/academic/classes/13/roster` for an unassigned upper-grade class returned **HTTP 200**.
- Full student details include guardian and contact fields, amplifying privacy risk.

### R-04: Other outstanding risks from source review / prior audit

- Attendance session POST accepts out-of-class `student_id` values; lacks record-level enrollment validation.
- Marks submission/report APIs lack consistent server authorization and publication controls.
- Offline sync blindly upserts conflicting records; older offline edits may silently replace newer ones.
- `server/src/app.ts` reflects arbitrary CORS origins and exposes internal exception messages.
- `client/src/pages/Login.tsx` prefills a demo admin username and password; demo-only behavior must be disabled for production.
- The frontend stores JWT in localStorage and offline attendance in browser storage, increasing exposure on shared school devices.

## 3. UI/functional data defects

- `client/src/pages/Dashboard.tsx` hardcodes the daily report to **2026-10-17**, and falls back to `92%` with no real attendance records.
- `client/src/pages/AttendanceReports.tsx` also defaults to 2026-10-17. Generated demo attendance is on 10 weekdays ending **2026-10-16**; user must select a populated date until fixed.
- Not every teacher has access to every class, but the subject-teacher marks UI class selector lists school-wide classes and applies an insufficient fallback when no assignment matches.
- Client navigation uses in-memory tab state rather than URL routes; refresh/back/deep-link behavior needs deliberate product design.
- Re-seed/reset and restore buttons can cause data destruction; restrict or remove from normal school admin workflows.
- Audit logs are not cryptographically tamper-evident despite that description appearing in the dashboard.

## 4. Demo database changes in the review package

Added `server/scripts/create-demo.mjs` and new `server/demo/skoolsys-demo.db`, both **isolated**. Also added `npm run demo:create` command in `server/package.json`. The generator aborts if the demo database exists and never points at the main system DB. See `docs/demo/QUICK_START.md`.

Dataset: 21 fake users, 18 classes, 360 fake students, 17 subjects, 42 assignments, 180 attendance sessions (3600 records), 3 exams, 1420 marks. No real student records. Fictitious `.test` emails and non-dialable demo phone numbers are used.

## 5. Engineering readiness decision

- **PR-001 provisional approval for baseline only**: foundational structure is present; API and typecheck evidence is encouraging. Actual GitHub CI outcome, browser E2E, and clean-platform dependency installation still require verification on the developer's own machine.
- **Reject production launch**: severe authentication, privacy and database recovery flaws remain.
- **Next authorized work recommended: PR-002 (authentication + session hardening)**, then PR-003 authorization and PR-004 backup atomicity, without waiting for module expansion.
- Before a school pilot: implement a read-only safe restore strategy, guard seed/reset functionality, add full browser E2E with Playwright, build client on clean machine, and conduct field-test walkthroughs.

## 6. Suggested implementation order

1. **PR-002** — Immediately disable unsafe restore/reset endpoints, then remove fallback JWT secret; reject tokens from disabled users; secure logout/token invalidation; password policy; remove demo login prefills from production; tests.
2. **PR-003** — Centralized record-level permission checks for all student, roster, marks, report, and attendance endpoints; negative integration tests for every role.
3. **PR-004** — Disable dangerous restore until replaced with transactional restore via temp DB verification / atomic file replacement as appropriate; back up before restore; rollback tests.
4. **PR-005** — Attendance enrollment validation, offline reconciliation, idempotency, conflict UI.
5. **PR-006** — Examination approval/publishing rules, grade/reports integrity.
6. **PR-007** — UX: real navigation click E2E; truthful latest/today attendance, empty states, role-specific dashboard, mobile workflows.
7. **PR-008** — Pilot readiness: load, backup restore drills, school privacy policy, device security, access audit, training.

Each PR should have a feature branch, tests, measured rollback and a separate approval before proceeding.

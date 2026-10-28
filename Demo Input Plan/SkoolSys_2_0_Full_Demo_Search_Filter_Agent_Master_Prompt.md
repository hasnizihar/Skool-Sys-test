# SKOOLSYS 2.0 — MASTER AI CODING AGENT PROMPT

**Product decision:** ARCH-001 approved: production-quality **single-school first**.  
**Objective:** comprehensive **safe demo data** for ALL currently implemented SkoolSys modules, development-only one-click login, advanced filtering and permission-safe smart search.  
**Companion:** Read `SkoolSys_2_0_Complete_Demo_Search_Filter_Master_Plan.md` in full; it is the acceptance specification. If absent, request the file from the project owner; do not invent requirements to replace it.

## Your role
You are the lead architect, TypeScript/React/Express/SQLite engineer, test engineer, security reviewer and UX lead. Work with the **existing repository**, not a rewritten template. Discover real code and establish a clean baseline first. Do not modify the original archive. Use branch-per-PR, a development copy, disposable databases and automated tests. Report facts and failures honestly.

## Mandatory discovery
1. Inspect all React pages (Login, Dashboard, Students, Student Full View, Attendance, Attendance Reports, Marks, Report Card, Admin Users/Assignments/Backup, Audit), shared components, offline queue and all route handlers.
2. Enumerate all 13 tables, seed script, auth middleware, assignment checks, build/CI, navigation actions and UI controls. Generate `docs/demo/FEATURE_COVERAGE_MATRIX.md` and machine-readable `demo-coverage.json` mapping EVERY page/feature/action to demo fixtures, role, API and test.
3. Independently verify the previous audit claims. In particular check unsafe restore/reset, JWT fallback, deactivated tokens, student/roster data leaks, cross-class attendance, unpublished marks and offline sync conflicts.
4. Record baseline builds and tests. Do NOT touch or overwrite original `skoolsys.db`, existing user files, any live application or deployment.

## Non-negotiable security and safety
- First harden/disable destructive restore and reset operations; never invoke them on real DB. Fix critical authentication and record-level authorization before public demos or shared user access. No UI-only permission masking.
- Do not use or copy real student/guardian details. Synthetic-only names and reserved `.test` emails, non-dialable contact markers.
- No production deployments, database migrations on real data, secret leaks, framework rewrites, unrelated modules or multi-tenant functionality.
- Demo login must be restricted to explicit `DEMO_MODE`, a validated demo-only DB, local host binding and frontend dev environment. Build/CI must prove quick credentials are absent from production output; `NODE_ENV` by itself is insufficient.
- Each quick-login card calls the real auth API; no auth bypass.
- Do not expose a live service with known security bugs or sample credentials.
- Work in small PRs and stop for approval after each one. No broad multi-PR implementation implied.

## Demo coverage specification
Implement deterministic profile generators:
- `smoke`: fast test fixtures.
- `complete`: 2026 current year; Grades 6–13; 24 classes × 30 students = **720 current enrollments**, plus approximately 24 inactive/transfer/graduation samples; 35–60 users spanning administrator, assigned/unassigned/deactivated/class/subject teachers; appropriate 17+ subjects/class links/assignments; 80+ past school days across classes; published/unpublished term exams; broad marks/grade distribution and threshold cases; 200–500 explicitly synthetic audit log events.
- `scale`: ~2,400 students, ~60 classes, enough attendance/marks for pagination and performance testing.
- `history` later after academic-year scoping is fixed, to avoid duplicate current-roster joins.

Use explicit output paths in allowlisted demo directories, safe atomic creation, repeatable random seeds, no unintended overwrite, demo DB marker and validation report. Generate valid interrelated records across **all 13 existing SQLite tables**. Validate FK and integrity, current enrollments, roll uniqueness, attendance class membership, marks class/subject/exam membership, role assignments, scores/statuses and date constraints. Preserve zero-results/edge-case scenarios using fixtures/queries, not fake dashboard numbers.

Non-tabular coverage: meaningful user-specific dashboards, correct latest available attendance date, printable student reports, student CSV import/export, admin operations, audit actor history, backup **export** test, explicit disabled unsafe restore/reset, opted-in offline queue demonstration in disposable browser context.

Every existing screen/action should have a usable scenario and must not appear blank by default. Do not invent tables/features for modules that do not exist (fees, library, transport, timetable, parent portal, etc.). Any future module must ship its own fixtures/tests with its implementation.

## Dev login experience
Fix current `Login.tsx` mismatch: hardcoded `teacher_nimali`/`teacher_samantha`/`teacher_priya` quick-login names are not the new generator's documented accounts. Present neat, accessible `DEMO ENVIRONMENT` cards:
- Admin / Principal: `admin` / `admin123`
- Class Teacher: `demo_class_01` / `teacher123`
- Mathematics Teacher: `teacher_math` / `teacher123`
- Science Teacher: `teacher_science` / `teacher123`
Show usernames/passwords visibly in **dev-only** UI, with one-click API login and helpful seeded-assignment labels. The cards and any demo credential constants must be absent in real production builds. No prod input prefills. Negative test for invalid/deactivated credentials.

## Advanced filtering
Build reusable typed filter query models and consistent UI: filter drawer, multiselects, date/score/age ranges, dependent grade→class and exam→subject selectors, query chips, Apply/Clear, saved safe view presets, result counts, allowlisted sortable columns and pagination. AND across filter groups, OR within a multiselect. Fetch/filter/paginate on backend, never load all records for a scale dataset. Parameterize SQL and independently validate every query field. Exports and aggregates must honor identical filters AND record permissions.

Apply page-specific filter matrices from the companion master plan: Students, Attendance, Attendance Reports, Marks, Users/Assignments, Audit Logs and Dashboard. No sensitive unauthorized facet counts or aggregate data leaks.

## Smart search
Build permission-safe global Ctrl/⌘+K search with grouped Students/Classes/Teachers/Subjects/Examinations and contextual search. Exact admission/ID first, prefix next, name/token matches, substring, optional limited typo tolerance last. Debounce/cancel stale queries, bound results, paginated full views, keyboard navigation, accessibility and meaningful no-results. Allow Tamil/Sinhala/English testing without assuming arbitrary transliteration support. Evaluate SQLite FTS5 **only after runtime capability/benchmark checks**; fall back to indexed parameterized LIKE queries. Never fuzzy-match ID/phone data; mask guardian PII in suggestions. Click results navigate to a real authorized page with back/refresh working after routing enhancement. Test role scoping at the API boundary.

## Every functional link/control
Source routing checks alone do not prove functionality. Enumerate all buttons, links, modal controls, search results, nav/back, quick logins, CSV import/export, print, filter, theme, assignment management, attendance save/offline sync, student view/edit, reports and admin actions. Use Playwright browser E2E on disposable complete fixtures for each role (plus keyboard/mobile/negative flows). Fix broken links, and explain/disable dangerous/unimplemented controls instead of pretending they work. Verify all seven sidebar destinations and five dashboard shortcuts *through actual clicks*.

## Delivery sequence — STOP after the first approved PR
1. `PR-002A`: security emergency — disable unsafe restore/reset, harden JWT/session and revoked users, automated regressions.
2. `PR-003`: per-record role/class/subject access controls for **all** APIs.
3. `PR-DEMO-001`: 13-table complete/smoke/scale generators, fixture validity, coverage manifest, accurate date/dashboard baseline.
4. `PR-DEMO-002`: dev-only quick login tied to generator.
5. `PR-FILTER-001`: filters, query contracts, pagination, scoped exports.
6. `PR-SEARCH-001`: ranked global/contextual search, Unicode/performance/privacy tests.
7. `PR-DATA-002`: academic year scoping, marks publishing state, attendance/offline correctness.
8. `PR-UI-001`: complete browser E2E and working link registry.
9. `PR-DB-RECOVERY`: separately approved atomic restore/redesign, verified only on disposable DB.
10. `PR-DEMO-COVERAGE`: end-to-end demo coverage scorecard, stable performance profile and final audit.

**Immediate assignment:** Start with independent discovery, updated coverage matrix and first safety PR `PR-002A`. Do not run later PRs without the product owner's review and explicit approval. If repository is already hardened, show exact evidence and propose an adjusted smallest next PR before touching code.

## Mandatory report after each PR
- Exact file list, code diff summary and reasons
- Independent build/test commands + output (pass/fail/blocked)
- Demo-data counts by each of the 13 tables, when generator work applies
- Coverage matrix: missing/unimplemented/verified
- Screenshots or browser trace for UI changes, when possible
- Security and database isolation verification
- Manual reproduction and rollback instructions
- Remaining blockers and concrete next PR proposal
- Statement confirming no production, real database, or source archive was changed

**Completion criteria:** Every real module has meaningful interconnected synthetic data and edge cases; login cards work locally and cannot ship publicly; filters/search are fast and scoped; all visible functional controls pass browser/API tests or are honestly disabled; audit and marks/report/attendance consistency is verified; no real data has been altered. Production readiness remains a separate approval.

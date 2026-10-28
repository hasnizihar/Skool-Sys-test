# SkoolSys 2.0 — Complete Demo Coverage, Advanced Filters & Smart Search

**Decision:** ARCH-001 — Approved single-school-first.  
**Status:** Master engineering plan and acceptance baseline; this document does not claim implementation.  
**Basis:** Inspected `SkoolSys_2.0_Demo_Review_Package.zip` (October 18, 2026), its React pages, Express endpoints, SQLite schema, demo-generator package and independent audit.  
**Non-negotiable:** Existing development work and databases must be preserved. Never expose development logins on a production-facing installation.

## 1. Verified baseline and uncovered gaps

The repository currently has **13 application data tables**: `users`, `academic_years`, `classes`, `subjects`, `class_subjects`, `teacher_assignments`, `students`, `enrollments`, `attendance_sessions`, `attendance_records`, `examinations`, `marks`, `audit_logs`.

The current demo DB has: 21 users; 1 year; 18 classes; 17 subjects; 138 class-subjects; 42 teacher assignments; 360 students; 360 enrollments; 180 attendance sessions; 3,600 attendance records; 3 examinations; 1,420 marks; **only 1 audit event**. All 13 tables are technically non-empty; this is **not** comprehensive functional scenario coverage.

Existing UI entry points: Login, Dashboard, Students list, Student Full View, Attendance, Attendance Reports, Marks Entry, Student Report Card, Admin Settings (users/assignments/backup), and Audit Logs; plus Sidebar, Navbar, Offline Banner and offline queue behavior. Sidebar has seven destinations, as previously source-audited.

Existing Login has one-click demo actions hardcoded to `admin`, `teacher_nimali`, `teacher_samantha`, `teacher_priya`, while the new demo DB documents `admin`, `demo_class_01`, `teacher_math`, `teacher_science`. This mismatch is an actionable bug. Username and password are already prefilled in the current login page. Its demo controls must be development-only.

Existing Student search is SQL `LIKE` over admission number, full/calling name, guardian name and phone; basic grade/class/status filters. Attendance has a local status/name filter, Audit Logs supports action only, and other pages have limited selectors. There is no comprehensive global search or unified advanced filter system, and student API lacks explicit bounded pagination. Dashboard and Attendance Reports use a hardcoded October 17, 2026 date; Dashboard has misleading `92%` fallback. Navigation uses React state, not shareable URLs.

**Release blockers from prior isolated audit:** hardcoded fallback JWT secret, deactivated-token authorization gap, unauthorized student/roster exposure, out-of-class attendance acceptance, destructive failed restore, unsafe offline last-write-wins, incomplete exams publication gates. Restore/reset must remain disabled until safely redesigned. Do not deploy with school data.

## 2. Definition of “complete demo coverage”

Complete means **every currently implemented page, visible section, data table, endpoint, allowed workflow, role view and meaningful edge state has a documented, usable example**. It does *not* mean inventing fees, libraries, timetables, parent/student portals or other missing modules and pretending they function. Maintain a **feature inventory**: `feature_id`, current code location, route/API, roles, demo record/scenario IDs, default navigation path, expected UI, required assertions, test status, screenshot/E2E evidence, coverage status. New features cannot be marked done without corresponding fixtures and tests.

Demonstrate normal records, exceptions, zero-results, unauthorized results, drafts/unpublished states, and interrupted/offline states. Show honest labels: `DEMO DATA`, `Unavailable`, `Not yet implemented`, or `No records for these filters`, as applicable.

## 3. Dataset profiles and reproducibility

Implement a single **versioned, deterministic, idempotent, opt-in** fixture generator. Command shape (final name may differ):

```bash
npm run demo:generate -- --profile complete --out ./server/demo/skoolsys-complete.db
npm run demo:validate -- --db ./server/demo/skoolsys-complete.db
npm run demo:generate -- --profile scale --out ./server/demo/skoolsys-scale.db
```

- **smoke:** 2–3 classes, <50 students, minimal records for fast CI.
- **complete (default manual demo):** 2026 current school year, Grades 6–13, **24 classes (A/B/C)**, **30 current enrollees per class = 720 current students**, plus approximately 24 non-current example student records (Transferred/Graduated/Suspended as schema permits); 35–60 users including an administrator, class and subject teachers, restricted/unassigned and deactivated staff; all appropriate 17 or more subjects, class-subject links, and valid assignments; at least 80 past instructional days of daily attendance; 3+ examination samples including published/unpublished; realistic marks mix; 200–500 synthetic labeled audit events. Final counts must be computed and reported from the generated DB rather than assumed.
- **scale:** **2,400 current students across approximately 60 classes**, sufficient staff, 80+ days of attendance and examination marks, maintained independently of complete. Performance target is a measurable budget on a defined machine, not a guaranteed real-world latency.

Start with **one academic year for the complete profile** until existing queries are correctly scoped by academic year. The current student/enrollment joins do not reliably filter a designated current year; adding historical years prematurely can duplicate results. After the scoping fix, add a separate **history profile** with past years, transfers/promotions and year-specific views. Keep distinct files for each profile.

Generator safety: never infer or overwrite a live DB path; refuse existing target unless the user passes an explicit `--replace-demo-only` flag AND the target is inside an allowlisted demo directory AND contains a recognizable demo marker. Always create into a temporary output, build in transactions, run validation, then atomically publish. No direct use of `/api/admin/reset-seed` or `/api/admin/restore`. Keep `.db`, `-wal`, `-shm` and fixture archives ignored by Git. Use checked-in generator script, manifest and tests, not real database files in the repository.

Use a fixed pseudorandom seed, stable IDs/admission numbers within a profile, culturally varied **fictional** Sri Lankan-style names, optional fields with realistic mixtures, non-dialable synthetic phone markers, reserved `.test` emails, non-real NIC/address examples, clearly fake guardians, and no copied personal information. All dates respect academic year ranges and do not imply attendance recorded on future dates or non-school days.

## 4. Coverage map — all 13 existing tables

| DB entity | Minimum fixture coverage and relationships |
|---|---|
| `users` | Principal/admin (`admin` role), assigned class teachers, subject teachers spanning multiple classes, restricted/unassigned teacher, deactivated account, password hashes generated securely for disposable demo only |
| `academic_years` | Current 2026 year; separate historical profile only after year-scoping is correct |
| `classes` | All Grades 6–13, at least sections A/B/C in complete; room numbers and teacher assignments |
| `subjects` | Core and grade-specific subjects, subject codes, categories and valid grade coverage |
| `class_subjects` | Applicable subjects linked to every class; no invalid grade/subject pairing |
| `teacher_assignments` | Class teacher assignment per class; subject assignments; users with multiple assignments; users with none; negative permission cases |
| `students` | Full/calling names, admission IDs, gender mix, DOB, guardian fields, address, optional emergency contact, varied statuses; deliberate duplicate-name and multiword-name tests with unique admission IDs |
| `enrollments` | Exactly one valid current-year enrollment for each of the 720 current pupils; non-current statuses as applicable; unique roll numbers per class; historic transitions once supported |
| `attendance_sessions` | Draft/submitted when supported, recorded/unrecorded school days, different classes, late submissions and notes |
| `attendance_records` | Present/absent/late/excused distribution, notes, zero and long sequences, valid roster membership; attendance sessions with complete matching roster |
| `examinations` | Term 1/2/3, at least published and unpublished, dates, current academic year |
| `marks` | Subject/class/exam/student consistency; A/B/C/S/F ranges, exact 0/35/50/65/75/100 boundaries, absent, exempt, not-entered (no mark), draft/submitted/published where supported |
| `audit_logs` | Hundreds of clearly tagged **synthetic demo activity** events with real demo user IDs and valid entity relationships; actions matching displayed audit filters; no fabricated claims of immutable security or real operator activity |

For system behaviors not represented by database tables: **backup export** should have a valid sample/export test, and **restore** must be visibly unavailable until fully repaired; **offline queue** should have an explicit `Create Offline Demo Scenario` action only in a disposable browser profile, with queued/conflict/sync states supported by real code, not magic preseeded server rows.

## 5. Screens and workflows — no empty functional module

| Screen/sector | Demonstration coverage and expected behavior |
|---|---|
| Login | Dev-only role chooser, working credentials, invalid/deactivated login tests, logout/session expiry messaging; no bypass authentication |
| Dashboard | Accurate counts and charts from fixture DB, attendance on latest available day, school/class scoping, role-specific results, non-fabricated zero state |
| Students List | 720 current students, uncommon names and IDs, correct status filtering, add/edit/view, CSV preview/import/export, pagination, sorted/filtered counts |
| Student Full View | Guardian/emergency sections, current class, attendance trend/history, marks, correct field blanks, editable only for allowed roles |
| Attendance Register | 24 populated class rosters, multiple day statuses, save/update and offline queue states, legitimate class-only records |
| Attendance Reports | Daily cross-class breakdown, monthly register, absent follow-up, actual dates with data, printable results, no hardcoded date |
| Marks Entry | Assigned exam/class/subject sheets, all grade thresholds, absent/exempt, missing marks, permitted role views, save/update rules, meaningful statistics |
| Student Report Card | Published marks only when policy repaired, multi-subject examples, printable result, denied/unpublished state |
| Admin—Users | All roles and active/inactive accounts, create/edit/toggle, assignment-dependent views |
| Admin—Assignments | Existing teacher/class/subject pairings; create/delete, constraint errors; no unassigned class accidentally shown as assigned |
| Admin—Backup | Working safe export test, disabled unsafe restore/reset with explanatory message and no destructive action |
| Audit Logs | 200–500 examples across action types, actors, timestamps and entities, detail view, role-restricted access |
| Academic data APIs | Years, grades, classes, class rosters, subjects, class subjects, examinations; each has valid data and expected empty/invalid ID responses |
| Offline/PWA | Connectivity banner reflects real status rather than assumed LAN connection; opted-in simulated offline queue in disposable browser; service worker caching appropriately scoped |
| Shell/UI controls | Sidebar links, dashboard shortcuts, theme toggle, navigation/Back, modal close, button disabled/loading feedback, CSV export, print, keyboard access |

**Out of current scope (don't fake):** timetable, fee/billing, payroll, transport, hostel, library, inventory, parent/student portals, messaging and SMS/WhatsApp. Add these to a `future_features` registry. When an actual module is approved/implemented, its seed scenarios and tests become required *in the same PR*.

## 6. Development-only quick login

Create a tidy **Demo Accounts** area under Login with four cards:

| Card | Username | Demo password | Verifiable assignment |
|---|---|---|---|
| Principal/Admin | `admin` | `admin123` | system administration |
| Class Teacher | `demo_class_01` | `teacher123` | assigned class, attendance |
| Mathematics Teacher | `teacher_math` | `teacher123` | assigned math classes, marks |
| Science Teacher | `teacher_science` | `teacher123` | assigned science classes, marks |

Provide `Quick Login` buttons, and optionally a visibly labeled `Show credentials` toggle. The button calls the **real authentication API**; never skip authorization or inject user objects. Centralize the manifest with generator, account UI and automated tests so displayed accounts actually exist. Add another negative-test account (disabled or unassigned) in documentation/tests, not a successful quick-login card.

**Dev gating:** quick login visible **only** when server explicitly enables `DEMO_MODE`, the active DB is a positively identified demo DB, the host is bound to loopback/local development, and frontend is a dev build. If any condition fails, render a normal login without demo controls, no demo usernames/passwords prefilled. CI must verify production bundles have no embedded demo passwords, endpoints or demo account manifests. Never consider `NODE_ENV` alone a sufficient security barrier. Show a distinct `DEMO ENVIRONMENT` banner in demo mode. Do not expose the demo app directly to the public internet. No secrets in committed environment files; disposable demonstration passwords are not production secrets but still must not be shipped in production bundles.

## 7. Advanced Filter Engine (across all data lists)

Design one reusable filter system, shared UX and serializable state:

- **Filter drawer:** basic filters visible; advanced drawer with grouped checkboxes/selects, inclusive/exclusive date ranges, numeric ranges, class/grade multiselect, `Apply`, `Reset`, active chips, `Clear all`, results count.
- **Semantics:** AND across filter categories; OR within a multiselect category; null/no-value selected explicitly when relevant. Dependent selections (grade → classes, exam → subjects) clear invalid previous selections.
- **Server:** validated query schemas, allowlisted filter fields and sort columns, parameterized queries, stable sorting, bounded pagination and accurate filtered totals. Never fetch every student and filter only in the browser for scale datasets.
- **User experience:** states persisted in URL query parameters once URL routing is introduced, date presets, sorting, keyboard accessibility, mobile drawer, saved view presets with no sensitive record content, explicit no-results plus clear-filter action.
- **Export:** server export applies **identical** authorization/scope/filters as list results, states which rows are included, and uses proper CSV escaping (including formula-injection protection). Search results and aggregate facets may not reveal unauthorized records.

### Page-specific filter schema

| Page | Required advanced filters |
|---|---|
| Students | Academic year (when fixed), grade(s), class(es), status(es), gender, age/DOB range, admission date or admission ID prefix, guardian relation, with/without emergency contact; columns sortable by name/admission/class/roll/status |
| Attendance | Year, grade, class, date/date range, attendance statuses, draft/submitted, absent/late only, missing register, teacher where authorized |
| Attendance Reports | Daily/monthly/range, grade/class selection, minimum attendance percentage, chronic absences and late count, missing submissions |
| Marks | Academic year, exam/term, class/grade, subject, grade letters, score range, marked/unmarked, absent/exempt, draft/submitted/published; controls respect exam gates |
| Users & Assignments | Role(s), active state, assigned/unassigned, grade, class, subject, created date; teacher's own assignments remain scoped |
| Audit Logs | Actor, action, entity type, entity ID, date/time range, operation outcome when stored; strictly admin-only |
| Dashboard | Authorized year/date/class/grade segment, dynamically recompute indicators and summaries |

## 8. Smart Search — fast, ranked, scope-aware

**Discovery UI:** global `Ctrl+K`/`Cmd+K` command palette and contextual search in Students, Attendance, Marks, Users and Audit Logs. Group results by student/class/teacher/subject/exam; return only types the role may access. Student results show name, admission, class and permitted concise metadata; suppress/mask guardian PII in suggestions except explicitly approved staff access. Show keyboard selection, loading skeleton, typeahead, recent searches only in a safe per-session context, clear/reset and genuine no-results. Clicking any result navigates to a real screen/record and supports back/refresh as the navigation system is upgraded.

**Relevance ranking (illustrative):** exact admission number / username first; then ID prefix; then exact full/name token matches; then starts-with; then whole-word; then substring; optional typo-tolerance last. Do not fuzzy-match numeric identity or phone numbers. Handle case, extra spaces, punctuation, Unicode inputs; evaluate Tamil/Sinhala search realistically rather than promising universal transliteration. Provide safely escaped query parsing, prevent wildcard/costly searches, debounce (~200–300 ms), minimum-character thresholds for broad queries, cancel stale requests, 20 top results with total metadata and links to paginated full lists.

**Backend:** first refactor existing `LIKE` queries with allowlisted parameters, strict authorization/scoping, indexes and request pagination. Profile SQLite `FTS5` availability; if supported, evaluate FTS5 for names/subject text with maintained sync triggers and tokenized ranking; exact IDs stay indexed. Use a measured LIKE-based fallback if FTS5 unavailable. For internationalized tokenization, include explicit tests for Tamil/Sinhala/Latin; avoid promising accent/transliteration support without implementation. Never concatenate untrusted SQL identifiers or query fragments. No third-party hosted search index for the single-school MVP without an explicit decision.

**Performance/quality targets to verify, not assume:** With ~2,400 demo students and representative attendance/marks, key student list searches under 300 ms p95 on specified local reference hardware, global suggestions under 500 ms p95 on reference hardware, controlled DB query counts, no UI freeze, stable paged results. Record dataset, OS, runtime, hardware, cold/warm cache conditions and query percentiles.

## 9. End-to-end functional links and interaction testing

Build a **UI control registry**, not only a sidebar-link audit. Enumerate every visible actionable item per page: sidebar, dashboard shortcuts, search result click, student profile/detail/edit, attendance save/sync, report card print, CSV import preview/commit, CSV export, modal open/close, teacher assignment add/delete, active/inactive switch, all filters, sort headers, pagination, reset, quick-login buttons, logout, nav back, tab switch, theme switch, safe backup download.

For each item record: component + locator/accessible label, target route or action, role, seeded test record, expected API request and response, expected UI result, persistence after refresh, negative-path response, mobile/keyboard assertions, and automated Playwright test name. Fix dead links; disable unrepaired destructive actions with an explanation (don't make them appear functional). The prior source audit matched seven sidebar and five dashboard shortcut destinations; this is **not** proof of browser click behavior.

**E2E minimum paths:** admin quick-login → dashboard → student search/filter → open/edit profile; class teacher quick-login → roster → attendance submit → report; subject teacher quick-login → allowed marks sheet; unauthorized teacher search yields nothing for unassigned students; report card published/unpublished; admin staff assignment; audit search; CSV import/export; all navigation + back/refresh; demo logout/relogin; offline queue/reconnect; print styles and responsive widths; keyboard-only login and filter controls.

Run test suites on the complete fixture database (disposable copy) and performance suite on scale profile. Test forbidden response `403`/`404` where appropriate, not fake empty success. Role isolation must be verified on API directly, not only UI hidden elements.

## 10. Validation and fixture completeness gates

A machine-readable `demo-coverage.json` and generated audit report must be committed, describing each module and scenario with DB counts and representative IDs. CI should fail when a currently implemented feature has no fixture, fixture violates referential/role integrity, or a documented role demo login fails.

Validation gates:
1. `PRAGMA foreign_key_check` = no violations; `integrity_check = ok`.
2. Unique admissions, usernames and emails; correct current enrollment count and roll-number uniqueness per class; no enrollment to unknown or wrong-year class.
3. Attendance only on valid school dates, every recorded student enrolled in the correct class/year and session, no duplicates, all relevant status categories represented.
4. Marks only for same class/exam/year/subject and valid student enrollment; scores within `[0,max_score]`; absence/exemption mutually consistent; thresholds and unpublished visibility tested.
5. Actual code-allowed assignments; representative teachers with and without access; audits reference existing users where applicable.
6. Each screen/feature scenario has at least one successful and one edge/negative coverage case; demo-only screen controls absent from production build.
7. Deterministic regenerate produces same logical data/manifest; no real data is accessed or reset; all tests use disposable DB copies.
8. Search count/list/export agree for same filter+role; pagination stable; unauthorized suggestions/results/facets never leak records.
9. All visible interactive controls either work and are tested, or are explicitly disabled with a meaningful reason.
10. Build/typecheck/lint/automated API/E2E all run and results recorded honestly; live deployment not performed.

## 11. Sequenced engineering PRs and approval boundaries

1. **PR-002A — Immediate safety gate (urgent):** disable destructive restore/reset endpoints and their UI; maintain safe backups. Remove hardcoded JWT fallback, reject deactivated user tokens, improve login/session hardening, regression-test. No real user data. This MUST precede public accessibility or role-testing with sensitive student data.
2. **PR-003 — Record-level permissions:** school/class/subject/academic-year authorization for every students, roster, attendance, marks and report endpoint, filters, exports and global search. Add negative test matrix.
3. **PR-DEMO-001 — Fixture architecture:** implementation-complete feature inventory, deterministic profile generator, stable manifest, isolation checks, 13-table fixture creation, meaningful audit logs, data validation. No new product modules.
4. **PR-DEMO-002 — Dev Quick Login:** align accounts with generated fixture, gated demo cards/banner, true API login, disabled-user regression and production-bundle proof.
5. **PR-FILTER-001 — Unified filter architecture:** Students and Attendance Reports first, query validation, pagination and consistent counts; then Marks/Admin/Audit/Dashboard with full authorization.
6. **PR-SEARCH-001 — Smart search:** ranked backend/global palette, grouped results, record navigation, performance tests, Unicode/permission/fuzzy guardrails.
7. **PR-DATA-002 — Reporting correctness:** eliminate hardcoded dates/KPIs; complete year scoping; address marks lifecycle; safe offline sync conflict strategy.
8. **PR-UI-001 — Full functional link E2E:** Playwright test harness with stable fixtures, responsive and keyboard tests, verified exports/print/offline, fix broken controls.
9. **PR-DB-RECOVERY — Atomic restore redesign:** controlled destructive test only in disposable DB with rollback; no re-enable before separate approval and verified recovery drills.
10. **PR-DEMO-COVERAGE — Release candidate verification:** regenerate complete/scale, automated coverage dashboard, independent repeatability, no red regressions, signoff report. Do not deploy to a real school yet.

The ordering is adjustable where dependencies demand, but **safety and server authorization cannot be postponed behind convenience features**. The coding agent must stop after each PR for review/approval unless the owner explicitly approves an entire multi-PR execution sequence, which is **not** implied by this planning document.

## 12. Completion criteria

The requirement is met only when a new developer can clone the source, generate an isolated demo DB, start the app locally, log in as admin/class teacher/subject teachers from the login screen, explore **every existing module with convincing interconnected sample records**, filter and search across authorized data, follow every functional link, perform representative read/write workflows on a disposable DB, see correct feedback for denied and unpublished actions, and run tests proving it. No unsupported module is disguised as complete; no real data is touched; no public deployment is executed.

## 13. Explicit exclusions and future expansion contract

Current SkoolSys does **not** implement library, finance/fees, timetable, transport, parent/student portal, SMS/WhatsApp, hostel, HR/payroll or inventory. Add them only through approved product requirements. For every future module: add schema + service + UI + permissions + deterministic demo fixtures + search/filter support where needed + negative tests + E2E test **in the same feature PR**. This prevents a future module from shipping as an empty placeholder.

# Kattankudy Central College — SkoolSys 2.0
## PR-004 Engineering Specification: Attendance Integrity, Academic-Year Enrolment & Offline Synchronization

**Decision:** KCC-DEV-004 — planning approved, implementation NOT approved  
**Product:** ARCH-001, production-quality single national-school installation (Grades 6–13)  
**Planning baseline:** `SkoolSys(2).zip`, reviewed 18 October 2026  
**Status:** **PLAN ONLY — no code, migration, data import, merge, or deployment authorized**

## 1. Executive decision

The next engineering PR must close the reproduced cross-class attendance-record vulnerability, remove blind overwrites from offline sync, validate class/year/date roster membership, make every register write atomic, and preserve clear revision/audit history. Do not add new school modules in this PR. Maintain the current React/Vite, Express/TypeScript and SQLite stack. Treat the public Kattankudy Central College identity as product context; enrolment counts, school days, holidays and special periods require school confirmation.

**Release blockers PR-004 is intended to address:**
- An attendance POST currently accepts a student ID from another class and saves it under the requested class.
- The offline sync route performs unconditional upserts without concurrency/version checks.
- Session/record updates are not enclosed in one database transaction.
- Invalid status values are normalized to `present` in the online path; the offline path accepts defaults and relies on the DB to reject some values.
- Reads and reports use `enrollments.class_id` with `status='enrolled'` without consistently matching the class's academic year.
- The client starts unmarked students as `present`, and queues all failed submissions, including intentional server refusals.
- Offline cache is keyed only by class ID; lacks year, actor, date/version metadata; stores roster records including guardian phone from the API.
- IndexedDB queue functions return before transaction completion, yet UI says data is safely saved.
- Attendance reporting defaults sometimes use hardcoded dates or UTC dates, rather than a consistent school-local date.

## 2. Evidence verified in source

| File / location | Current evidence | Risk |
|---|---|---|
| `server/src/routes/attendance.ts` GET `/session` | roster query uses `e.class_id = ?` and `e.status = 'enrolled'` | stale year/student membership |
| `server/src/routes/attendance.ts` POST `/session` | loads current year, upserts arbitrary `student_id`; invalid status becomes `present` | cross-class injection, silent data corruption |
| `server/src/routes/attendance.ts` POST `/sync` | per-item mutation, no revision or durable replay receipt | partial writes, stale overwrite, replay ambiguity |
| `server/src/routes/attendance.ts` `/reports/daily`, `/reports/monthly` | year scoping inconsistent; daily UTC default | historical counts wrong, misleading dates |
| `server/src/db/database.ts` | `attendance_sessions` UNIQUE(class_id,date), no revision; `enrollments` UNIQUE(student_id,academic_year_id), no dated placement intervals | revision schema needed; true midyear transfers not representable |
| `server/src/middleware/auth.ts` | `canManageClassAttendance` checks role and class assignment; assignments lack date-effective scoping | verify right to change historical register |
| `client/src/pages/Attendance.tsx` | missing attendance values default to present; error handling queues any failure | accidental mass present and invalid offline writes |
| `client/src/api/offlineQueue.ts` | v1 IndexedDB, timestamp IDs, unsafe caching/fallback; removed queue items without durable confirmation | cross-user leakage and lost unsynced data |
| `client/src/components/OfflineBanner.tsx` | automatic sync on network-online event, no conflict UI | unsafe silent replay |
| `client/src/pages/AttendanceReports.tsx` | hardcoded date `2026-10-17` | stale reports |
| `client/src/api/client.ts` | errors flatten HTTP status into message | cannot distinguish 409 conflict from 422 validation, 403 authorization or network failure |
| `server/test/record_authorization.test.ts` | assigned class teacher can submit; lacks foreign-student negative test | critical regression undetected |

### Baseline caveat
Earlier source review reproduced cross-class POST persistence on an **isolated** SQLite test DB. This specification is source-grounded, not a claim that a new test suite or browser QA was executed in this planning turn.

## 3. In scope

1. Server-side validation of class ID, calendar date, session status, student IDs, distinctness, record counts, attendance statuses and bounded remarks.
2. Resolve canonical academic year from the selected class; check year date bounds, enrolment year, status and student eligibility **for the effective date where the model supports it**.
3. Reject foreign/stale/duplicate/unknown students as a unit; never partially persist invalid online or offline items.
4. Transactional SQLite writes (`BEGIN IMMEDIATE`, `COMMIT`, `ROLLBACK` or equivalent safe `DatabaseSync` wrapper), including accompanying audit and idempotency receipt.
5. Explicit draft vs submitted mode; no implicit `present`; submitted requires complete roster, draft may contain partial record set by explicit contract.
6. Session-level optimistic concurrency revision; mutation request must carry `baseRevision` and durable `clientMutationId` (UUID).
7. Idempotent retry semantics across online and offline paths; stable operation ID and payload fingerprint; replays return the prior outcome without changing data.
8. Bounded, clearly enumerated batch sync outcomes: accepted/replayed/conflicted/rejected, with atomicity per item.
9. Frontend stale conflict state and manual reconciliation: compare local vs server, explicit rebase/reapply, never auto-overwrite.
10. Offline cache partitioned by user+year+class+date, minimal fields; durable storage completion before a “saved” claim.
11. Date/year-aware daily/monthly reports; no made-up attendance values and no accidental draft-as-submitted counts.
12. Isolated migrations, unit/integration/browser regression tests, threat checks, and docs.

## 4. Explicitly out of scope

- KCC school's actual real-student migration or official enrolment import.
- Timetable, prefects, sports, library, guardian portal, new user roles and entire academic master-data redesign.
- PR-005 examination publication, PR-006 backup restore re-enablement, global search/filter redesign and demo-data generation across the entire school.
- Production configuration, deployment, merge to protected main, or use of live school credentials/data.
- Guessing public holidays, school schedules or exceptional attendance policy. **Do not hardcode Sunday/Friday rules or actual school closures.**
- Full midyear transfer-effective dating: current `enrollments` schema has a single per-year placement and lacks effective date ranges. A separate approved placement-history migration is required before claiming full transfer support.

## 5. Contract: attendance and class membership

### 5.1 Canonical ownership and date
- Resolve `classId` strictly as positive integer and confirm class exists.
- `classes.academic_year_id` is the authoritative year for that class; reject missing/ambiguous mappings for writes with a clear admin-remediation error; never blindly use `is_current` for historical classes.
- Validate ISO civil date `YYYY-MM-DD` strictly, rejecting calendar-impossible dates. Interpret “today” in `Asia/Colombo` at the presentation boundary; store canonical civil dates, not UTC-derived shifts.
- Validate that date falls inside the class academic-year start/end. Out-of-year requests must fail; do not infer a different class/year.
- Require the acting teacher to be authorized for the class **and relevant academic-year assignment**. Existing assignment semantics must be inspected and any ambiguous historical permission must fail closed; admin exception remains audited.
- Enrolment must match `student_id + class_id + academic_year_id` with `status='enrolled'`, and relevant student status. Deny cross-class, prior-year, transferred, graduated, suspended and nonexistent IDs as defined by school-approved policy.
- **Historical placement limitation:** a transfer occurring *within* the same year cannot be fully determined by current schema. No backdating/rewriting of transferred student membership without a separate effective-dated enrolment design. Preserve already-recorded historical entries as historical evidence; never quietly reinterpret them from today's roster.

### 5.2 Client request contract (PROPOSED V2)

```json
{
  "classId": 12,
  "date": "2026-10-15",
  "mode": "submitted",
  "baseRevision": 0,
  "clientMutationId": "b3c6d6d8-139c-4d6d-ab47-80a6215a23f0",
  "rosterFingerprint": "sha256:...",
  "notes": "Optional short note",
  "records": [
    {"student_id": 153, "status": "present", "remarks": ""},
    {"student_id": 154, "status": "absent", "remarks": "Parent informed"}
  ]
}
```

This is illustrative synthetic data, not a real student or school submission. Preserve compatible read paths where safe, but do not accept unsafe legacy mutation payloads that bypass revision/roster checks. Document any coordinated frontend/backend API breaking changes.

### 5.3 Response and error contract

| Condition | Recommended HTTP/status | Behavior |
|---|---|---|
| New/updated valid session | `200` or `201`, `applied` | complete atomic write, increment revision, return canonical revision and persisted summary |
| Exact retry, same mutation ID + payload | `200`, `replayed` | no duplicate writes; return stored prior result |
| Same mutation ID, changed content | `409`, `idempotency_key_reuse` | no writes |
| Stale base revision or roster fingerprint | `409`, `attendance_conflict` | no writes; return **authorized**, minimal server revision and conflict summary |
| Missing revision for existing register | `428` or agreed `400`, `precondition_required` | do not last-writer-win |
| Foreign student, duplicate student, invalid status, incomplete submission | `422` or `400` with stable field-level code | zero writes |
| Unauthenticated/deactivated user | `401` | zero writes |
| Valid user, unassigned class | `403` | zero writes |
| Unknown class or out-of-year date | `404/422` with stable code | zero writes |
| Unexpected failure | `500` with opaque request ID | transaction rolled back, sensitive details not exposed |

**Note:** `baseRevision=0` means the client observed no existing session. A new session created by another client before commit must conflict rather than overwrite. Require the server to guard the check and write in one transaction.

### 5.4 Submission completeness
- `draft`: valid subset of roster, unmarked students remain **unmarked**; no fake marks generated. Draft must never appear as an officially completed day.
- `submitted`: exact one record for **every** eligible roster member and no extras; should not silently mark missing students `present`. If school later authorizes exception handling, document a separate policy.
- `present`, `absent`, `late`, `excused` are the only four currently supported statuses. Invalid data must be rejected, not coerced.
- Define attendance rate denominator explicitly: completed/submitted classes and eligible students, not all unsubmitted classes magically present or absent. Show “Not submitted / Unmarked” truthfully.
- Limit payload sizes, remarks and batch size, with documented configurable bounds after validation against KCC's class sizes; avoid arbitrary production assumptions.

## 6. Database and transactional design

**Additive migration plan** (requires separate implementation approval):
- Add `attendance_sessions.revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1)` (backfill/read behavior for existing sessions must be reviewed).
- Add `attendance_sync_receipts` table with unique mutation UUID, user ID, class ID/date, canonical payload fingerprint, result revision, outcome and timestamp. Keep response cache bounded and avoid copying student/guardian PII into receipts.
- Add indexes to support year-aware enrolment lookup and date/class attendance reporting.
- Consider `attendance_session_roster` immutable snapshot table if necessary to guarantee historical attendance views after changes; decide based on evidence and migration complexity. A complete submitted register can also be a historical record set; do not claim date-effective transfers are solved by a snapshot alone.
- Use a versioned migration runner with `PRAGMA user_version` or existing project convention; migration must be transactional, backward-aware, tested against copies of both old and new schema, and rerunnable without duplicate schema changes.
- Validate `PRAGMA foreign_key_check` and run an isolated pre/post-migration invariants report.
- Keep `restore/reset` locked (PR-006).

**Atomic write unit:** validate payload and authorization; acquire write transaction; recheck canonical class/year/eligible roster plus revision and idempotency; write session + all records + audit + receipt; commit; respond. On any exception, rollback; no partial session, record, audit or receipt residue.

**Audit:** record actor, UTC audit timestamp, class/date, old/new revision, mutation ID and count summaries. Record correction reason where policy requires. Do not include guardian phone or detailed sensitive medical/disciplinary remarks in general audit logs.

## 7. Offline synchronization protocol

### 7.1 Offline entry
- When online, cache **minimal**, authorized roster data plus academic year, class, date, server revision, roster fingerprint, cache timestamp, user ID and cache-expiry policy.
- Do not cache `guardian_phone`, NIC, addresses or unrelated student profile fields. Clear or isolate cached data on account switches; never sync under a different principal identity.
- An unmarked student appears unmarked. Explicit “Mark all present” action may remain, but require unmistakable intentional user action and display counts.
- Store one durable mutation UUID per logical local submission; update local draft without creating misleading multiple queue entries.
- Complete the IndexedDB transaction and verify success before UI claims queued. If storage is disabled/full, show **not saved**, provide safe retry/manual recovery; do not falsely promise durability from a best-effort fallback.

### 7.2 Sync
- A sync attempt must send same mutation UUID, `baseRevision`, exact roster fingerprint and records first captured offline.
- Server validates each batch item identically to a direct online POST. The same service function must implement both endpoints.
- Each item is independently atomic. Return `applied`, `replayed`, `conflicted` or `rejected` per item; batch-level response alone does not imply success.
- Delete pending entries only after an explicit server `applied` or `replayed` acknowledgement **and** a completed local transaction. Keep `conflicted` and `rejected` entries with an actionable explanation.
- For conflict: show local vs current authorized server register and offer **Keep server**, **Review and reapply differences**, or **Save local work separately/export for manual help**, with a fresh revision and explicit confirmation. Never silently overwrite or auto-resolve concurrent changes.
- Unknown outcome on network interruption must be retried with the same operation ID. Server idempotency receipt ensures safe replay.
- No automatic retry for `401`, `403`, `400`, `409`, `422`; require reauthentication, resolution or editing. Online/offline signals are hints, not proof of server reachability.
- Queue remains access-restricted and cannot be silently uploaded by a different logged-in teacher. Define privacy-appropriate retention/expiry rules.

### 7.3 Browser UX language
- **Saved on server:** after confirmed 2xx acknowledged applied/replayed and returned revision.
- **Saved locally / pending sync:** after durable IndexedDB `oncomplete` and visible pending item.
- **Conflict / action required:** after 409, keep draft and show resolution flow.
- **Not saved:** after local persistence failure.
- **Rejected:** validation/permission failure; do not enqueue by default.

## 8. Exact file-level engineering tasks

| File | Planned work | Test evidence needed |
|---|---|---|
| `server/src/routes/attendance.ts` | Thin handlers for GET/POST session, sync, reports; consistent errors; no parallel dangerous mutation logic | all API test cases |
| `server/src/services/attendanceService.ts` **new** | canonical roster resolution, authorization per year, revisions, validation, transactional writes, receipts, authoritative results | unit+integration |
| `server/src/validation/attendanceValidation.ts` **new** | strict IDs, ISO date, four statuses, uniqueness, bounded lengths, payload schemas | table-driven validation tests |
| `server/src/db/migrations/004_attendance_integrity.ts` **new**, or existing migration convention | additive revision/receipt/index schema with dry-run and backfill notes | old DB copy, fresh DB, repeat migration |
| `server/src/db/database.ts` | **minimal** migration hook / transaction helper if necessary; don't disturb PR-001 isolated DB switching | all existing tests and FK checks |
| `server/src/middleware/auth.ts` | narrow year-aware assignment helper if safely supported; never relax PR-002/003 controls | teacher/year matrix |
| `server/src/utils/audit.ts` | only required amendments to record atomic auditable correction metadata | rollback + audit exactly-once checks |
| `server/test/helpers/testDb.ts` | synthetic two years, two classes, valid and foreign students, transferred/disabled users, conflicts; fixture schema aligned | deterministic tests |
| `server/test/attendance_integrity.test.ts` **new** | online class/roster/year/date validation, transaction rollback, revision changes | P0/P1 tests below |
| `server/test/attendance_sync.test.ts` **new** | replay, conflicts, partial batch independence, idempotency | sync matrix below |
| `server/test/attendance_reports.test.ts` **new** | year/history/report accuracy, missing/unmarked counts | report matrix below |
| `server/test/attendance_migration.test.ts` **new** | upgrade of copies, rollback, FK, legacy data and repeat safety | migration matrix |
| `client/src/api/client.ts` | expose structured HTTP status + stable error code + details to caller; typed V2 DTOs | client API tests |
| `client/src/api/offlineQueue.ts` | schema version upgrade, minimal cached data, year/user/date key, durable receipts, stable mutation IDs and per-item states | IndexedDB tests |
| `client/src/pages/Attendance.tsx` | unmarked default, revision binding, differentiated errors, conflict review and clear local/server success states | browser interaction tests |
| `client/src/components/OfflineBanner.tsx` | accurate pending/failed/conflicted counts, guarded sync and no false “synced” | browser interaction tests |
| `client/src/pages/AttendanceReports.tsx` | school-local defaults, year-aware proper report states; leave advanced filters for later PR | report browser tests |
| `client/src/pages/Dashboard.tsx` | remove any fake attendance percentage and stale date assumptions for attendance metrics in scope | dashboard smoke test |
| `docs/architecture/ATTENDANCE_V2.md` **new** | API contract + state transitions + authorization/roster logic | reviewer signoff |
| `docs/testing/ATTENDANCE_TEST_MATRIX.md` **new** | reproducible test steps, results, limitations | QA signoff |
| `docs/security/KNOWN_RISKS.md` | adjust RISK-04/RISK-06 only after evidence; track residual transfer limitations | security review |
| `docs/roadmap/PHASE_0.md` | PR-004 status, next PR boundaries | review |

**Scope guard:** list of files is a proposed target, not permission to modify them. The coding agent must confirm paths and layout before any subsequent implementation.

## 9. Regression test matrix (acceptance scenarios)

**Preconditions:** All tests run with synthetic users, two separate classes, two academic years, distinct school days, mock connectivity, isolated temporary DB; CI must not touch uploaded/live DB. Assertions include HTTP codes, database before/after snapshots, audit trail and queue state.

| ID | Scenario | Expected |
|---|---|---|
| ATT-001 | authorized teacher submits correct full roster | success; exact records; revision 1 |
| ATT-002 | submit Class B student within Class A payload | 422; **zero** changes anywhere |
| ATT-003 | mix 1 legitimate + 1 foreign student | 422; no partial save |
| ATT-004 | same student appears twice | 422; no writes |
| ATT-005 | non-existent/non-integer/negative ID | 400/422; no writes |
| ATT-006 | status `maybe`, null, omitted | 422; never converted to present |
| ATT-007 | empty/incomplete submitted roster | 422; no misleading completion |
| ATT-008 | partial draft roster | stored draft; remaining unmarked; not reported as complete |
| ATT-009 | stale previous-year enrolment for same class | reject; only class-year matching accepted |
| ATT-010 | class date outside academic-year bounds | reject; no writes |
| ATT-011 | impossible date `2026-02-30` | reject |
| ATT-012 | invalid/ambiguous current-year or class-year mapping | fail closed with admin-friendly code |
| ATT-013 | inactive / transferred / graduated student in submitted roster | policy-enforced rejection; no fake marks |
| ATT-014 | teacher submits unassigned class / revoked assignment | 403; no writes |
| ATT-015 | subject teacher attempts daily register write | 403; no writes |
| ATT-016 | disabled teacher token | 401; no writes |
| ATT-017 | valid change with matching revision | revision increments once; correct values |
| ATT-018 | concurrent/stale version | 409; earlier newer state unchanged |
| ATT-019 | two first-writes using `baseRevision=0` | exactly one succeeds; other conflicts |
| ATT-020 | exact same mutation retried | replay acknowledgement, no double revision/audit |
| ATT-021 | same mutation ID reused with different body | 409; no writes |
| ATT-022 | injected failure mid-write | rollback session, records, audit, receipt |
| ATT-023 | offline batch valid + invalid item | first committed; invalid item rejected without partial change |
| ATT-024 | stale offline item after server edit | conflict retained locally; server unchanged |
| ATT-025 | offline retry after timeout/ambiguous response | idempotent, one change |
| ATT-026 | wrong logged-in user attempts queue replay | no upload; queue remains private |
| ATT-027 | IDB quota/denied write | UI shows “Not saved”; queue not falsely acknowledged |
| ATT-028 | IDB successful pending save | UI shows “Saved locally / pending sync” only after commit |
| ATT-029 | online API returns 400/403/409/422 | UI shows appropriate error; does not blindly queue |
| ATT-030 | class/year/date switch while stale cache exists | never show/write wrong roster silently |
| ATT-031 | reporting: draft, missing, submitted and excused | correct counts and truthful submission statuses |
| ATT-032 | monthly reports across year boundary | class/year and historical roster correct within known model limits |
| ATT-033 | timezone boundary near midnight Colombo | civil date remains correct |
| ATT-034 | legacy schema -> new schema migration | data preserved, FK check empty, defaults valid |
| ATT-035 | rerun migration | no duplicate columns or receipts, no lost data |
| ATT-036 | existing PR-001/002/003 authentication and RBAC tests | all remain passing |
| ATT-037 | large class register (configured max) | completes with bounded latency and stable response |
| ATT-038 | several teachers editing distinct classes | no unintended locking/overwrites |
| ATT-039 | status/remarks corrections by authorized user | audited actor, reason, revision; correct result |
| ATT-040 | daily report hides restricted guardian info | teacher cannot extract unauthorized student contacts |

**Browser E2E journeys (must actually execute, not merely audit links):**
- Class teacher opens class -> roster -> explicitly marks absent/present/late/excused -> submits -> reloads same revision/records.
- Two browser contexts open same register; one submits, other receives conflict, reviews, explicitly reapplies a correction.
- Airplane/offline mode -> edited entries saved locally -> network returns -> replay or conflict -> accurately reflected banner and queue.
- Logout/login as a different teacher -> no cross-user cached roster or automatic sync.
- Admin views same register and daily/monthly reports -> consistent counts; printer/print preview does not invent data.
- Mobile viewport, keyboard, Tamil Unicode names, browser tab refresh during pending queue.

## 10. Acceptance gates — definition of done

### A. Integrity (mandatory)
- [ ] Reproduced cross-class injection is rejected with **no** session, record, audit or receipt change.
- [ ] Date, class, grade/year, subject/class-teacher permission, enrolment and status checks use canonical DB state.
- [ ] Submitted register contains all and only eligible roster IDs, each once; no implicit present.
- [ ] All mutation paths share one validated transactional service.
- [ ] Rollback tests prove no partial persistence under forced exception.
- [ ] Existing attendance/history remain readable; migration and rollback are evidenced.

### B. Concurrency and offline (mandatory)
- [ ] Existing register has an explicit server revision and API clients supply baseRevision.
- [ ] Stale and simultaneous saves produce conflict; no last-writer-wins.
- [ ] Duplicate operation ID replay is idempotent and cannot double-write.
- [ ] Offline per-item outcomes distinguish accepted, replayed, conflicted, rejected.
- [ ] Conflict stays in queue until human review; no automatic overwrite.
- [ ] Local save claims occur only after IndexedDB transaction confirmation; failed persistence is not shown as safe.
- [ ] Unauthorized/rejected server responses are not silently queued.
- [ ] Different logged-in teachers cannot see or upload each other's offline queue.

### C. Reports, privacy and usability (mandatory)
- [ ] Daily/monthly metrics reflect actual submitted/draft/unmarked state and specified academic year.
- [ ] School-local dates use `Asia/Colombo`, with no fixed 2026-10-17 defaults.
- [ ] Offline cache excludes guardian phones/NIC/address, and conflict responses are role-scoped.
- [ ] UI has clearly different server-saved/local-pending/conflict/not-saved states.
- [ ] Mobile, Tamil names and keyboard operation work in browser test evidence.

### D. Engineering and release (mandatory)
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` executed and logged; legacy warnings noted separately.
- [ ] Existing PR-001–PR-003 regression tests still pass.
- [ ] Coverage includes all ATT-001–ATT-040 or each omission is justified and blocks claimed completion as applicable.
- [ ] Migration tested against isolated copies; foreign keys validated; no real DB touched.
- [ ] Security reviewer approves changed authorization/data access logic.
- [ ] Final report includes actual changed files, test logs, API spec, DB migration/rollback plan, outstanding limitations and screenshots/logs of E2E proof.
- [ ] **No deployment or merge to production/main** without a separate explicit approval.

## 11. Delivery order after SEPARATE implementation authorization

1. Repo source baseline and threat/test reproduction; protect branch and isolated DB.
2. Document exact API/state machine/academic-year ambiguity; propose migration with rollback.
3. Apply additive schema changes to isolated DB and update fixtures.
4. Build validator + shared transactional attendance service; minimize route differences.
5. Implement online submit with strict roster/revision/idempotency behavior.
6. Reuse same service for per-item offline sync; stable result contract.
7. Implement browser queue schema migration, per-user scoping, durable local saves and conflict UI.
8. Fix date/report and no-fake-metrics issues inside attendance scope.
9. Execute unit/integration/E2E/performance/privacy checks.
10. Produce engineering report, stop; await sign-off for PR-005/006 and merge.

## 12. Risks and decisions requiring named approval before coding

- **Midyear transfers:** current schema cannot represent enrollment membership valid from date A to date B. Option for PR-004: fail closed on ambiguous edits, preserve historic records; larger enrollment-history feature later. Do not claim full historical transfer correctness until separately built and tested.
- **School closures:** no approved school calendar in existing schema. Do not invent closure rules; distinguish nonexistent dates from school holidays.
- **Register edit authority:** policy for corrections after submission, late amendments, teacher reassignments and principal sign-off needs school confirmation. Default to auditable class teacher/admin corrections only, no silent revision bypass.
- **Offline storage policy:** decide retention/expiration of pending sensitive roster data; do not infer user consent for storage on shared devices.
- **Legacy migration:** if preexisting data violate invariants, produce dry-run remediation counts and stop; do not delete or rewrite historical marks in place.

## 13. Agent reporting contract

Before any implementation authorization, deliver only:
1. Verified file list, baseline and risks.
2. Proposed file diff plan, API contract and migration procedure.
3. Detailed test plan mapping ATT-001–ATT-040 to tests.
4. Risk decisions and any material blockers.
5. Exact confirmation request: **“Approve PR-004 implementation in an isolated feature branch?”**

**Planning approval is not implementation authorization.** On implementation approval, report every step, execute tests, never touch production, and stop after PR-004 for human review. Any attempted destructive action should be stopped and escalated.

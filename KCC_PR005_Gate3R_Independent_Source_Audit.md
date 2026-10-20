# KCC SkoolSys 2.0 — PR-005 Gate 3R Independent Source Audit

**Date:** 2026-10-20  
**Branch/commit reported:** `feature/pr-005-examination-integrity` / `484519414eccd6fbc9f74f126f96a934b4aa7a3f`  
**Submitted artifact:** `SkoolSys_PR005_Gate3R_Clean_Source.zip`  
**Final verdict:** **NOT ACCEPTED for Gate 4 yet — finite Gate 3S security/data-integrity correction required.**

## Evidence quality

- Verified the uploaded ZIP SHA-256 **`d53d1babc35b46a98df51357854926f89fddc9922d879b91577708437f682312`**, matching the agent report; **125 entries**.
- Checked the archive entry listing: no active `.env` files, SQLite databases, `node_modules`, or `.git` internals.
- Inspected `server/src/services/marksWorkflowService.ts`, `server/src/routes/marks.ts`, `server/src/services/studentEnrollmentService.ts`, `server/src/services/academicAuthorizationService.ts`, and tests.
- Independently executed the uploaded *actual TypeScript service and route logic* after TypeScript transpilation against a disposable Node 22 `node:sqlite` in-memory synthetic fixture; no real school data was accessed.
- **Five negative probes reproduced unexpected behavior**; these are separate from the 221 backend, 16 workflow and 6 browser tests **reported by Antigravity**, which were not independently rerun in full because this clean archive omits installed dependencies.
- Archive checksum validates package consistency, **not independently the claimed Git commit**, because Git metadata is intentionally absent.

## Positive changes confirmed in the source

1. The legacy `POST /api/marks/sheet` uses the canonical `saveDraftMarks` / `submitMarksSheet` workflow rather than directly upserting marks.
2. Existing sheets require `baseRevision`; draft saves use transactional compare-and-swap revision updates.
3. Unpublished report-card access by ordinary class/subject teachers is blocked; provisional leadership previews carry a watermark.
4. Zero attendance records yield `attendancePercentage: null`; rank is withheld pending Gate 4.
5. Provisional grading normalizes score by `maxScore` rather than assuming a maximum of 100.
6. Subject-specific participating rosters are considered during submission.
7. Creation of a new sheet checks academic-year consistency and class-subject offering; unknown teacher remains `NULL`.
8. A revision lookup route and parsed revision-payload response exist.

## Confirmed findings

### P0-01: Stale sheet teacher ID bypasses current assignment verification

**Source:** `server/src/services/marksWorkflowService.ts:310–325, 544–556`, `server/src/routes/marks.ts` teacher authorization path.

Both `saveDraftMarks` and `submitMarksSheet` permit:

```typescript
Boolean(assignment) || (sheet.teacher_id !== null && Number(sheet.teacher_id) === user.id && user.role === 'subject_teacher')
```

The second branch treats a historical `marks_sheets.teacher_id` as a currently valid teacher assignment, even if the current `teacher_assignments` table has **no entry**. The legacy endpoint also carries this pattern. This violates the accepted active-assignment-only rule and becomes especially dangerous if assignments are revoked or transferred.

**Independent probe:** Created a synthetic draft sheet with `teacher_id=7` and **zero** teacher-assignment records. User 7 successfully saved a mark and then submitted the complete sheet. **Expected: 403 and no writes.**

**Required:** Query one currently valid class+subject+year teacher assignment inside the write transaction; do not use `marks_sheets.teacher_id` as an authorization fallback. Preserve historical teacher ID as attribution only.

### P0-02: Missing student-subject enrollment can receive marks

**Source:** `server/src/services/marksWorkflowService.ts:357–375`; similar conditional in `server/src/routes/marks.ts` prevalidation.

The draft path rejects only `elig.status === 'dropped' || elig.status === 'transferred'`. For **no subject enrollment**, `isStudentEligibleForSubject` returns `{ isEligibleForDraft: false, isOfficiallyConfirmed: false }` without `status` (`studentEnrollmentService.ts:126–146`). Because `undefined` is neither `dropped` nor `transferred`, the write passes.

**Independent probe:** Synthetic student had valid *class* enrollment but **no** `student_subject_enrollments` row. `saveDraftMarks` accepted and persisted a numeric mark. **Expected: 400/403 and no writes.**

**Required:** Require `elig.isEligibleForDraft === true` and ensure the student-subject record belongs to the same class and year. `provisional_unverified` may enter drafts; `confirmed` is mandatory for submission; missing, dropped and transferred are forbidden.

### P1-03: Revision “snapshot” does not capture complete sheet state

**Source:** `marksWorkflowService.ts:495–505` and `903–943`.

`marks_sheet_revisions.marks_payload_json` receives `JSON.stringify(validatedMarks)` — only records included in *that request*. `getMarksSheetRevisionSnapshot()` presents it as an **immutable point-in-time full sheet snapshot**. No reconstruction or full roster merge is performed.

**Independent probe:** Revision 2 saves student A, revision 3 saves student B. Database contains A+B, but revision 3’s purported full snapshot contains B only. **Expected: either full A+B sheet state or explicitly documented patch/delta semantics plus reliable reconstruction.**

**Required:** Save a full post-write sheet snapshot inside the same transaction, or rename the contract to patch history and implement a deterministic reconstruct-as-of-revision endpoint. Include absent/medical/exempt and metadata correctly.

### P1-04: Failed first legacy write can leave an empty sheet behind

**Source:** `server/src/routes/marks.ts:381–418` and `marksWorkflowService.ts:79–140`.

The legacy route calls `ensureMarksSheet()` before `saveDraftMarks()` starts its own transaction. If the save fails, first-time sheet creation has already committed.

**Independent probe:** Validly assigned teacher posted an otherwise valid draft mark with a non-string `remarks` object. SQLite rejected parameter binding and API returned **400**, yet a `marks_sheets` row for the new examination remained; no mark was inserted. **Expected: zero database changes for rejected first writes.**

**Required:** Validate payload types before mutation and move creation + save into one atomic transaction boundary (do not nest `BEGIN IMMEDIATE` naively). Also review save+submit transaction boundaries: the legacy route runs the two operations in separate commits.

### P1-05: Base administrator bypasses scoped confidentiality permission for unpublished student reports

**Source:** `server/src/routes/marks.ts:465–480`. The check accepts `user.role === 'admin' || hasAcademicStaffRole(...)`. A base admin without a Principal, VP, Section Head or Coordinator appointment may therefore preview unpublished reports. This conflicts with the institutional-scope requirement already enforced for sheet review and approval. **Source-confirmed; not separately runtime-probed.**

**Required:** Require scoped active academic appointment (or an explicitly approved, narrowly audited break-glass support permission) for unpublished report-card preview. Add a negative base-admin-only test and verify same-year/grade scope.

## Accept/stop gate for the next execution

Gate 3S is limited to these five findings, no new architecture work. Required tests:

- `EXAM-G3S-01`: revoked/missing subject teacher assignment rejects save, submit and legacy save; zero writes.
- `EXAM-G3S-02`: subject enrollment missing/dropped/transferred rejects numeric mark insert, including the legacy route; valid provisional draft still works; unconfirmed submission fails.
- `EXAM-G3S-03`: incremental draft updates produce complete reconstructable point-in-time revision states.
- `EXAM-G3S-04`: invalid initial legacy write makes **zero** changes to marks, sheet containers, revisions and audit; identify and guard other partial-commit paths.
- `EXAM-G3S-05`: unscoped admin denied unpublished report card; valid scoped leadership preview watermarked.
- Preserve existing verified security protections; run the complete backend, browser, typecheck and build suites on synthetic fixtures; provide raw logs and sanitized source ZIP with verified hash.

**Gate 4 remains unauthorized until Gate 3S is implemented and reviewed. No remote push, merge, deployment, or real school data use.**

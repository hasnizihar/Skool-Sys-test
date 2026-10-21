# KCC SkoolSys 2.0 — PR-005 Gate 3S Independent Source Audit

**Review date:** 2026-10-20  
**Review target:** Uploaded `SkoolSys_PR005_Gate3S_Clean_Source.zip`  
**Reported commit:** `88763e6914d26da9bdd0ebafae339b84da9c27b1` (cannot independently prove Git history from an archive without `.git`)  
**Archive:** 425,260 bytes, 127 entries, SHA-256 `0a922c0afb0e9760a8a32608b6fc31dc82a4180da8edc939427696e4fd27face` — **matching the agent report**.

## Verdict

**Five previously requested Gate 3S remediations are present in the actual source; however, PR-005 Gate 3S is NOT unconditionally accepted. Three additional authorization/data-integrity failures remain.** These were independently reproduced using the uploaded service code transpiled with local TypeScript and a disposable in-memory `node:sqlite` fixture. This is a focused code-level verification, not a re-run of the complete Express backend or Playwright suite.

## Previous corrections inspected

1. `saveDraftMarks`, `submitMarksSheet`, and `saveOrSubmitLegacyMarksSheet` check live `teacher_assignments` (rather than historical `marks_sheets.teacher_id`) for **write operations**.
2. Student subject eligibility is checked affirmatively before draft marks are written; official submission requires confirmed subject enrollment.
3. Revision snapshots use a participating-student roster joined to current marks, including `NOT_ASSESSED` placeholders.
4. Legacy save/submit creates sheet and performs validations inside one transaction with rollback.
5. Unpublished **student-report** endpoint denies unscoped base administrators and adds a confidential preview for scoped leadership.

The agent reports 226/226 backend, 21/21 workflow and 6/6 browser tests passed. **I did not independently execute those complete suites** in this environment; their outcomes are agent-reported.

## Unresolved findings

### G3S-AUD-01 — Critical — Legacy submission can publish an unassessed row as submitted

**Source:** `server/src/services/marksWorkflowService.ts`, around lines 1298–1312 and later lines 1350–1380.

In the legacy combined save-and-submit path, roster-completeness checking considers the existing database mark when an incoming mark is `NOT_ASSESSED`. It then upserts that incoming `NOT_ASSESSED` value and transitions the sheet to `submitted` without revalidating the *effective post-update* roster state.

**Independent reproduction:** A synthetic draft contains student #1, status `PRESENT`, score 85/100, revision 2. Invoke the **actual uploaded** `saveOrSubmitLegacyMarksSheet` function with one incoming mark for student #1, `assessmentStatus: 'NOT_ASSESSED'`, `score: null`, and target `submitted`, `baseRevision: 2`. The function returns success, revision 3, sheet status `submitted`, while the mark is now `NOT_ASSESSED` with `score: null`. This contradicts the canonical `submitMarksSheet` completeness condition.

**Required:** Evaluate each student's effective final mark (`incoming` takes precedence when provided, including `NOT_ASSESSED`, otherwise existing mark), reject an unassessed final state with `UNASSESSED_STUDENT`, and roll back *every* sheet/mark/audit/revision mutation. Prefer a single post-write submission invariant within the same transaction. Include tests for first-time and existing-sheet requests, multi-student rosters, and concurrent revisions.

### G3S-AUD-02 — High — Unscoped administrator bypass in unpublished marks detail/history/snapshot readers

**Source:** `server/src/services/marksWorkflowService.ts` lines 237, 245, 951 and 1004. Also review `server/src/routes/marks.ts` legacy `GET /sheet` (lines 24–70), which invokes middleware `canViewMarksSheet` that returns true for base administrators without academic scope.

The service accepts `user.role === 'admin'` when `canViewMarksSheet(user, sheetId)` denies access. Thus an ordinary account administrator who correctly receives HTTP 403 at the unpublished **student report** endpoint can still retrieve the unpublished sheet contents and revision history directly.

**Independent reproduction:** Inject a `canViewMarksSheet` helper that correctly returns `{ allowed: false }` for an admin without academic appointment. With the actual uploaded workflow service and synthetic database, `getMarksSheetHistory` returns revision records and `getMarksSheetRevisionSnapshot` returns a mark payload to that unscoped admin.

**Required:** Apply the same institutional scoped-authorization principle across every unpublished marks read endpoint, including legacy sheet, new sheet details, history and revision snapshots. Retain legitimate assigned-teacher access to their own draft sheet and scoped leadership access. Preserve published-data policy separately; do not unintentionally block authorized reporting. Add HTTP 403 negative tests for base admin and unrelated users and positive tests for appropriate scoped viewers.

### G3S-AUD-03 — High — Revoked subject teacher retains read access through historical sheet ownership

**Source:** `server/src/services/academicAuthorizationService.ts` lines 262–293.

`canViewMarksSheet` allows a user whenever `marks_sheets.teacher_id === user.id`, without checking a **current active `teacher_assignments`** record. The historical teacher ID is correctly retained for attribution, but must not establish current read permissions.

**Independent reproduction:** A synthetic marks sheet has `teacher_id=10`; all current teacher assignments for user 10 are deleted. Executing the actual uploaded `canViewMarksSheet` still returns `{ allowed: true }` for user 10.

**Required:** For teacher-based access, check active user, current year/class/subject-specific `teacher_assignments` with `assignment_type='subject_teacher'`. Do not grant by sheet attribution alone. Consider all other read paths that rely on legacy `getUserAssignments` and apply appropriate current-assignment checks. Negative HTTP tests must prove revoked/deactivated/unrelated teachers cannot view unpublished marks, history, or snapshots.

## Closeout criteria

- Correct only these three blockers, plus narrowly necessary shared authorization utilities/tests.
- Add end-to-end API negative and positive tests, ensuring denied/invalid write attempts produce zero changes.
- Independently demonstrate that final post-update submission roster has no `NOT_ASSESSED` participants.
- Run Gate 3S workflow, authorization, migration and full backend suites; TypeScript typecheck, build and the existing Chromium E2E suite on **synthetic isolated** data.
- Provide actual test outputs, changed-file diff, SHA-256 and sanitized updated source ZIP; then **STOP** for independent verification.
- No Gate 4–6 coding, no real pupil data, production databases, push, merge or deployment without separate explicit approval.

**Acceptance decision:** Gate 3S **conditionally complete in scope**, but **blocked from Gate 4** until these three failures are resolved and verified.

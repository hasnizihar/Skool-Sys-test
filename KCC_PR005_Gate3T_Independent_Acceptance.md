# KCC SkoolSys 2.0 — PR-005 Gate 3T Independent Acceptance

**Review date:** 21 October 2026  
**Input:** `SkoolSys_PR005_Gate3T_Clean_Source.zip`  
**ZIP SHA-256:** `8ca15d830f0e678c3520ed7063478f35fb20d790855125847c1cdd4b01beecee`  
**ZIP entries:** 119  
**Review decision:** ACCEPT **Gate 3T as isolated development baseline only** for starting Gate 4, **not** production/pilot acceptance.

## Scope and independent work

1. Calculated ZIP SHA-256, counted entries, checked for database files, active `.env` files and `node_modules`. None of those were present.
2. Diffed the Gate 3T archive against the supplied Gate 3S archive. Code changed in:
   - `server/src/middleware/auth.ts`
   - `server/src/routes/marks.ts`
   - `server/src/services/academicAuthorizationService.ts`
   - `server/src/services/marksWorkflowService.ts`
   - `server/test/examination_auth.test.ts`
   - `server/test/examination_workflow.test.ts`
   The archive has 119 rather than 127 entries because old audit/prompt Markdown files were omitted and two newer Markdown audit/prompt files were added; the prior application source files were not missing.
3. Loaded the uploaded TypeScript services themselves with a local TypeScript transpilation hook and Node's native SQLite against `:memory:`. Ran the real database initialization/migrations 004 and 005 and a synthetic one-teacher, one-student, one-subject fixture. No user database was accessed.

## Focused security probe results — 9/9 PASS

| Probe | Result |
| --- | --- |
| 1. Submit a previously assessed mark as `NOT_ASSESSED` via legacy service | HTTP-style `400 UNASSESSED_STUDENT` error; rejected |
| 2. After rejected submission, original sheet revision/status and mark score/status unchanged | PASS |
| 3. Unscoped base admin: unpublished sheet details | `403 UNPUBLISHED_RESULTS_LOCKED` |
| 4. Unscoped base admin: unpublished sheet history | `403 UNPUBLISHED_RESULTS_LOCKED` |
| 5. Unscoped base admin: unpublished revision snapshot | `403 UNPUBLISHED_RESULTS_LOCKED` |
| 6. Removed subject teacher: unpublished sheet details | `403 UNPUBLISHED_RESULTS_LOCKED` |
| 7. Removed subject teacher: unpublished sheet history | `403 UNPUBLISHED_RESULTS_LOCKED` |
| 8. Removed subject teacher: unpublished revision snapshot | `403 UNPUBLISHED_RESULTS_LOCKED` |
| 9. Current assigned teacher permitted on the three read surfaces before removal | PASS |

**Source checks:**
- `server/src/services/marksWorkflowService.ts` approx. lines 1311–1367 and 1436–1458: submission validates effective incoming marks, then post-write roster state within the same transaction.
- `server/src/services/marksWorkflowService.ts` approx. lines 235–256, 948–1054: details, audit history, and revision snapshot validate unpublished access without a blanket admin bypass.
- `server/src/services/academicAuthorizationService.ts` approx. lines 262–319: sheet view permission checks current user activity, matching teacher assignment or current scoped leadership, not historical `marks_sheets.teacher_id` alone.
- `server/src/routes/marks.ts` approx. lines 31–79: legacy sheet reads use a matching active teacher appointment or scoped leadership for unpublished marks.

## Limits and Gate 4 handoff

- Complete `npm run test` backend regression and Playwright browser E2E suites were **not independently rerun** in this environment (the sanitized ZIP excludes project dependencies). Agent-supplied earlier results are not independent evidence of Gate 3T full-suite outcomes.
- The ZIP is source-only, without `.git`; its exact local Git commit and branch cannot be cryptographically derived from the archive. The coding agent must report its actual `git rev-parse HEAD`, clean status, changed-file diff and successful full test/build logs before Gate 4 changes.
- School-specific grading, term boundaries, ranking, result publication, and correction authority are **not** approved as official KCC rules. Gate 4 must be developed with provisional/synthetic policies pending formal KCC sign-off.
- This is a **development-gate acceptance** and does not authorize a merge, remote push, release, migration on existing school databases, exposure of student data, or deployment.

**Next:** Gate 4 — versioned school-approved assessment policies, calculation and moderation invariants, controlled publication, official report confidentiality, and auditable post-publication correction workflow.

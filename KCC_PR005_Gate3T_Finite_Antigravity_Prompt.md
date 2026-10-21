# KCC-DEV-005 — Gate 3T: Finite Security and Submission-Invariant Closeout

**Authorization scope:** Apply a narrowly scoped corrective patch to the existing PR-005 isolated branch based on Gate 3S commit `88763e6914d26da9bdd0ebafae339b84da9c27b1`. **Do not start Gate 4.**

Read the attached `KCC_PR005_Gate3S_Independent_Source_Audit.md` first. Fix precisely the three independently reproduced issues:

1. **Final-state submission invariant:** In `saveOrSubmitLegacyMarksSheet`, do not fall back to an existing assessed mark when the incoming mark explicitly replaces it with `NOT_ASSESSED`. Validate the *effective final* roster after applying all requested changes, within the same transaction, before committing sheet status `submitted`. Reject and roll back with `UNASSESSED_STUDENT`, including all marks, audits, snapshots and sheet inserts. Test existing and new sheets, revision conflicts, multi-student mixed requests, and full rollback.
2. **Unpublished reads and base admin:** Eliminate unscoped `admin` bypasses from sheet-detail/history/revision reads and legacy `GET /sheet` for unpublished examinations. Apply appropriate current, year/grade-scoped academic authorization. Preserve legitimately assigned teachers' own draft access and approved published-data access per existing policies. Test that unscoped admin and unrelated users receive 403 on all confidential read surfaces; authorized scoped leaders receive expected data.
3. **Revoked teacher read access:** `canViewMarksSheet` must never rely only on historical `marks_sheets.teacher_id` to permit access. Resolve a live, active, class/subject/year-matched `teacher_assignments` record and active user. Revoked, removed or deactivated subject teachers must immediately lose access to confidential sheet details, audit history and point-in-time snapshots. Keep `teacher_id` untouched for historical attribution.

**Mandatory gates:**
- Add negative tests to the existing `examination_workflow.test.ts` (and related authorization tests if appropriate), using isolated synthetic databases, proving the three vulnerabilities cannot recur.
- Preserve the five Gate 3S corrections, CAS revision behavior, complete snapshots, write atomicity and the PR-001–004 attendance functionality.
- Run `npx tsx --test server/test/examination_workflow.test.ts`, `npx tsx --test server/test/examination_auth.test.ts`, `npx tsx --test server/test/examination_migration.test.ts`, `npm run test`, `npm run test:browser`, `npm run typecheck`, and `npm run build`. Include commands, final counts and any failures, without fabricating outputs.
- Produce a brief diff and updated **Gate 3T** sanitized ZIP, exact git commit and SHA-256. Exclude secrets, `.git`, actual `.db*` files, dependencies and real school information.

**Safety boundary:** No modifications to school or production data, no pushing, merging or deployments, no Gates 4–6, no broad redesign. After completing this finite closeout, **STOP for independent review**.

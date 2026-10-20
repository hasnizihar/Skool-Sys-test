# KCC SkoolSys 2.0 — PR-005 Gate 2R Independent Source Review
**Review date:** 2026-10-19  
**Reviewed input:** `SkoolSys_PR005_Gate2R_Clean_Source.zip`  
**Reported HEAD:** `46525cb3561ee0cabf9527707df4c9896522c879` (Git provenance is agent-attested; archive has no `.git` metadata)  
**Verified ZIP SHA-256:** `2d1eb5bf4218efd38ac71a6cd223c7e70af49ae01151853fd0a7348b1f68b06d`  
**Archive entries:** 121  
**Disposition:** Conditional acceptance of Gate 2R security direction; **not unconditional Gate 3 sign-off**. One bounded preflight patch is required before new exam workflow code depends on these helpers.

## Confirmed improvements
- Subject enrolment POST ignores client-controlled verification status (`server/src/routes/academic.ts`, 207–249), and `enrollStudentInSubject` inserts `provisional_unverified` (`studentEnrollmentService.ts`, 284–296).
- Student class membership and class-subject offering are checked before creating subject enrolments (`studentEnrollmentService.ts`, 220–242).
- Confirmed/dropped/transferred records are protected from generic create/update overwrite (`studentEnrollmentService.ts`, 245–271).
- Verify/drop leadership checks require an active year- and grade-scoped appointment (`studentEnrollmentService.ts`, 306–352).
- Final sheet approval is restricted to scoped Principal/VP, and checks teacher/entrant/reviewer identity (`academicAuthorizationService.ts`, 236–307). No blanket admin bypass.

## Blocking findings, based on the actual ZIP
1. **P0 — Invalid subject-enrolment status transitions.** `verifyStudentEnrollment()` performs an unconditional `UPDATE ... enrollment_status='confirmed' WHERE id=?` (`studentEnrollmentService.ts`, 358–387). The function does not require current status `provisional_unverified`: it can reconfirm dropped/transferred records or overwrite an already confirmed verifier. `dropStudentEnrollment()` similarly overwrites all statuses (`394–423`). Add an explicit allowed-transition state machine and conditional SQL updates (affected rows must be 1). Reject invalid transitions with HTTP 409 and zero writes. Reviving transferred/dropped records must use a separate, explicitly approved reinstatement workflow (deferred).
2. **P0 — Audit trail records the post-state as the pre-state.** `PATCH /verify` and `/drop` route logs set `previous_status: result.enrollment?.enrollment_status` (`routes/academic.ts`, 262–270, 287–295), but both service methods return the *updated* row (`studentEnrollmentService.ts`, 381–383, 417–419). A provisional -> confirmed change is logged as confirmed -> confirmed. Return both before/after status, record exact actor and reason where required, and make the mutation + audit atomic (or reliably fail closed); do not create false history.
3. **P1 — Claimed transactional authorization recheck is not implemented.** Both methods call `canManageEnrollmentAction` *before* `BEGIN IMMEDIATE` (`studentEnrollmentService.ts`, 364–371, 400–407). Recheck live, active, scoped authority and allowed transition inside the write transaction to guarantee consistency across processes; use a conditional status guard.
4. **P1 — Self-review is still allowed for a teacher with a leadership appointment.** `canReviewMarksSheet()` checks only active leadership appointment and class grade (`academicAuthorizationService.ts`, 197–220). A mark entrant / assigned teacher with a Section Head appointment can therefore pass review if the caller uses that helper. Apply separation of duties to actual review/endorsement, while retaining authorized read-only inspection if needed.
5. **Gate 3 integration guard — Draft != publication-ready.** `isStudentEligibleForSubject()` returns `eligible=true` for provisional records (`studentEnrollmentService.ts`, ~130–160). This is acceptable for draft rosters but Gate 3/4 must explicitly use `isOfficiallyConfirmed` and validate current student-to-class, academic-year and subject assignment before submission/approval/publication. Do not use generic `eligible` as official readiness.

## Required focused tests
- `provisional -> confirmed` permitted only for scoped authorized leadership; `confirmed -> confirmed`, `dropped -> confirmed`, `transferred -> confirmed` must fail 409 without changing status, verifier, timestamp or audit rows.
- `confirmed -> dropped` only when institutionally permitted, and `transferred -> dropped`, `dropped -> dropped` reject 409; no unapproved reinstatement through generic endpoints.
- Mutation and audit are atomic; previous status in audit is accurate and no audit entry exists on rejected operation.
- Revoked/inactive/out-of-year/out-of-grade leader returns 403 and zero writes under transaction; cross-class student records cannot be confirmed as legitimate by legacy/stale enrolment.
- A subject teacher who is also Section Head cannot independently endorse their own sheet; independent reviewer may endorse; Principal/VP final approval remains independent.
- Run Gate 1R migration tests and full backend/browser/typecheck/build suites in isolated synthetic fixtures; deliver fresh unedited logs, exact diff, and sanitised ZIP.

## Verification limits
The ZIP checksum and source were independently verified. Antigravity reports 25/25 authorization, 17/17 migration, 197/197 backend and 6/6 browser tests passing. Those suites were not rerun independently here because runtime dependencies were not supplied in the clean ZIP; source inspection establishes the specific missing safeguards above. No production data was accessed or modified.

## Decision
Do not start marks workflow operations using the existing enrolment transition methods as-is. **Avoid further planning documents.** Treat the four defects as a small Gate 3 entry preflight (3A), verify negative tests, then proceed with authorized isolated Gate 3 workflow implementation (3B). No push, merge, deployment or real data use.

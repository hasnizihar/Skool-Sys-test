# KCC SkoolSys 2.0 — PR-005 Gate 3S Finite Corrective Prompt

**Authorization requested:** Gate 3S fixes only, on the isolated `feature/pr-005-examination-integrity` branch. **Do not begin Gate 4.**

Read the companion `KCC_PR005_Gate3R_Independent_Source_Audit.md` in full. The submitted Gate 3R source archive was checksum-verified and independently tested with disposable Node SQLite fixtures. Five concrete regressions/boundary errors remain.

## Implement, in this order

1. **Active teacher assignment only:** Remove any `sheet.teacher_id` fallback from actual marks-write/submit authorization in the canonical workflow and legacy route. Re-verify current class, subject, academic year, assignment type, active user, and appropriate role *inside* the write transaction. Historical sheet teacher IDs remain attribution metadata, not permissions.
2. **Positive student-subject eligibility:** Demand a valid `student_subject_enrollments` record with `isEligibleForDraft` true, linked to the intended class/year. Never infer eligibility from a missing `status`. `provisional_unverified` may save drafts but cannot submit, review, approve or publish; dropped/transferred/not-enrolled cannot receive new marks.
3. **Actual revision history:** Make each advertised point-in-time snapshot a full, immutable post-write sheet state; alternatively implement honest delta terminology and a tested reliable full-state reconstruction API. Ensure partial multi-student saves and return/resubmit sequences preserve correct historical state, including metadata and nonnumeric statuses.
4. **Atomic failure behavior:** Validate `remarks` and all payload types before mutation. Ensure an invalid first-time legacy write cannot leave a new `marks_sheets` row behind. Ensure combined legacy save+submit cannot partially commit when it responds with an error. Use one well-defined transaction boundary, without unsafe nested transactions.
5. **Report-preview privacy:** Remove unscoped base-admin bypass for unpublished student reports. Scope access by active academic appointment, student/exam academic year and grade band; produce 403/zero data leakage for unscoped administrators and teachers. Explicitly watermark valid leadership previews.

## Nonnegotiable regression evidence

Add negative end-to-end API or service tests `EXAM-G3S-01` through `EXAM-G3S-05` matching the audit acceptance gate, asserting response codes and **before/after database-state equivalence on denials/errors**. Keep all earlier Gate 1R, 2R, 3R test cases passing. Run full backend regression, Chromium browser E2E, TypeScript typecheck and client/server builds on synthetic disposable databases only. Confirm grade normalization (80/200 is S under the provisional scale, not A).

Return (1) exact commit and parent, (2) changed-file list, (3) full unedited test outputs, (4) new sanitized `SkoolSys_PR005_Gate3S_Clean_Source.zip` and SHA-256, and (5) a short change/evidence matrix. **Stop for independent review.** No Gate 4, no real data, no seeding live DB, no remote push, merge or deployment.

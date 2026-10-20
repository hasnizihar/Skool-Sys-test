# KCC-DEV-005 — Gate 3 Conditional Execution Prompt

**Status: proposed instruction — owner must explicitly authorize sending/execution.**

I have reviewed the actual PR-005 Gate 2R source archive, SHA-256 `2d1eb5bf4218efd38ac71a6cd223c7e70af49ae01151853fd0a7348b1f68b06d`, agent-reported commit `46525cb3561ee0cabf9527707df4c9896522c879`.

I approve a **strictly isolated Gate 3 implementation**, conditioned on completing **Gate 3A security preflight FIRST**. Read `KCC_PR005_Gate2R_Independent_Source_Review.md`; preserve Gate 0–2R behavior.

## Gate 3A — non-negotiable preflight
1. Implement allowed enrolment-status transitions; specifically block `dropped/transferred -> confirmed` via ordinary verify, and same-state stamp rewrites.
2. Move scoped live authorization/record/transition checks inside the transaction; use conditional UPDATE with rowcount checks and rollback.
3. Fix audit pre/post state, actor, and atomicity; rejected operations must leave no audit rows.
4. Prevent self-review/endorsement by assigned sheet teacher or actual marks entrant; independent read-only viewing may remain according to scope.
5. Add real HTTP integration tests covering unauthorized/revoked/cross-year/cross-grade and prohibited status transitions, unchanged DB and no false audit history.
6. Run migration, authorization and baseline regressions. **If any Gate 3A test fails, STOP—do not implement Gate 3B.** Record a distinct Gate 3A commit.

## Gate 3B — marks workflow, revision control and legacy route containment
Only after Gate 3A passes, implement Gate 3 from the accepted master prompt:
- Teacher-assigned, academic-year-aware, student/subject-eligible draft mark entry; provisional entries only as explicitly tagged drafts, never official eligibility.
- Canonical `score`, `max_score`, `assessment_status`, accurate persisted author/revision history; zero silent clamping/rounding.
- Legal transitions draft -> submitted -> reviewed/returned -> approved with appropriate independent officers and provenance, status and revision preconditions.
- Atomic `baseRevision` compare-and-swap saving; 409 on stale changes with zero writes.
- Contain **all** legacy marks write/read routes; reject privilege/status injection, prevent direct writes to submitted/approved/published sheets, and enforce unpublished-result confidentiality.
- One trustworthy marks-author history used for segregation of duties over the entire sheet lifetime (not just latest entrant).
- Positive and negative synthetic integration tests and genuine Express/browser E2E where Gate 3 scope requires it.

**Boundaries:** Do not execute any migration or tests against school/live/dev databases; use temporary synthetic SQLite fixtures. No production or real student records, no Gate 4/5/6, no remote push, merge, deploy, or unrelated changes. School policy defaults remain provisional. Keep former attendance functionality intact. Report exact branch/commit, changed files, test commands and unedited outputs, sanitized source ZIP plus SHA-256. STOP for independent review after Gate 3B.

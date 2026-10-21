# KCC SkoolSys 2.0 — PR-005 Gate 4 Isolated Development Execution Brief

**Authorization:** Gate 4 work only if the project owner separately approves its execution. Gate 3T source ZIP was independently accepted as the isolated development baseline; no deployment or use with real school data is authorized.

## PRE-FLIGHT — mandatory before any code change

1. On the existing `feature/pr-005-examination-integrity` branch, verify the exact `git rev-parse HEAD`, that Gate 3T fixes exist, and that the working tree is clean. Report the commit ID. Do not invent one from the ZIP.
2. Run current server tests, browser E2E, TypeScript typecheck, and full build using disposable synthetic test environments. Stop if the baseline fails, and report which test failed rather than fixing unrelated functionality.
3. Inspect `assessment_policy_profiles`, `academic_terms`, `marks_sheets`, `marks_corrections`, `marks_audit_history`, `marks_sheet_revisions`, `examinations`, and related routes/services before changing their contracts.
4. Preserve Gates 1–3T behavior and existing attendance, auth and student-enrolment protections.

## Gate 4 implementation scope

### Gate 4A: versioned policy and calculation engine
- Implement versioned, validated grade-band/subject/assessment policy records with explicit provenance, effective dates and formal school approval state. Policy mutations must not rewrite historical published calculations.
- Leave the KCC grading scale, term calendar, weights, rankings, special-assessment statuses, and publication policy **provisional** until formally approved by KCC leadership. Do not substitute sample thresholds for official policy.
- Validate normalization by each assessment's `max_score`, weighted aggregation, absent/medical/exempt/not-assessed handling, eligible student-subject rosters, ties, ranks and minimum completeness constraints. Decline official results when policy or enrolments are unverified.
- Distinguish draft previews from official results everywhere. Add deterministic test fixtures and policy-edge tests.

### Gate 4B: secure examination-wide publication
- Only active year- and grade-scoped Principal/VP Academic appointment may authorize publication; no plain-admin role bypass.
- Require every applicable marks sheet to be approved by a separate authorized approver, reconciled with all confirmed participating students, and have no unresolved quarantine, unauthorized changes, missing required assessment data or unapproved policy configuration.
- Validate within a single SQLite write transaction, using concurrency-safe revision or equivalent compare-and-set protection. In one atomic step, write exact publication version, actor, timestamp, the approved policy version and immutable publication/audit snapshot. Ensure `examinations.status`, `is_published`, related sheet status and report visibility cannot disagree.
- Enforce that repeated/stale/double publication cannot publish incompatible states or duplicate official records. No publication via older endpoints.
- Do not permit public/student/parent access until the real school's approvals and identity/access rules have been confirmed.

### Gate 4C: controlled post-publication correction
- Forbid normal mark editing after publication, including legacy/API bypasses.
- Implement corrections as request -> independent review/approval -> atomic application, with a mandatory reason, actor, original value, corrected value, revision and audit provenance. Enforce no self-approval, no stale-request application and no silent deletion of earlier published facts.
- Define the institutional authorized roles; policy is provisional until KCC signs off. Preserve previous report snapshots; mark corrected/reissued reports clearly, with version and change history.

## Required tests and acceptance criteria

- Negative and positive tests for unapproved/missing policy, mismatched academic year/grade/subject, mixed provisional vs confirmed enrolments, all non-present assessment statuses, wrong max-score, tied marks, empty class/term and inconsistent dates.
- Block unauthorized or out-of-scope publish/correction actions and verify **zero data changes** on rejection, including plain administrator without academic appointment, teacher, Section Head and deactivated/revoked leader.
- Concurrent and stale publish/correction requests cannot overwrite approved or published results.
- Historical report snapshots remain recoverable and contain correct grading/ranking provenance.
- Full PR-001–005 backend regression, genuine Playwright browser tests, typecheck and client/server builds must all pass. Include test logs with commands and outcomes.

## Restrictions and handoff

- Use only synthetic ephemeral SQLite, isolated development branch. NEVER use, migrate, import, reset or alter real school records or a shared database.
- **No Gate 5 frontend UI**, Gate 6 final-release work, unapproved changes to school grading rules, remote push, PR merge, or deployment.
- Provide exact commit hash, diff from Gate 3T, updated sanitized source ZIP, SHA-256, complete test evidence, risk register and unresolved questions requiring school leadership approval.
- STOP for independent Gate 4 review.

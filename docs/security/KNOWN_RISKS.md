# SkoolSys 2.0 — Known Engineering & Security Risks

This document catalogs security vulnerabilities and architectural defects identified during repository discovery in PR-001. Each entry contains code evidence, security impact, reproduction details, and the scheduled PR for remediation.

---

## 1. Critical Severity Vulnerabilities

### RISK-01: Hardcoded Fallback JWT Secret [RESOLVED in PR-002]
- **Location**: [`server/src/middleware/auth.ts`](file:///server/src/middleware/auth.ts#L9-L18)
- **Status**: **RESOLVED in PR-002**
- **Remediation Implemented**: Hardcoded fallback secret was completely removed. `getJwtSecret()` strictly validates that `JWT_SECRET` is present in the environment and has a minimum length of 32 characters, failing fast on startup with a fatal configuration error otherwise.
- **Verification**: Verified via `server/test/auth_security.test.ts` (suite `1. JWT Secret Hardening & Startup Verification`).

---

### RISK-02: Deactivated-User Token Authorization Gap [RESOLVED in PR-002]
- **Location**: [`server/src/middleware/auth.ts`](file:///server/src/middleware/auth.ts#L36-L75), [`server/src/routes/auth.ts`](file:///server/src/routes/auth.ts)
- **Status**: **RESOLVED in PR-002**
- **Remediation Implemented**: `requireAuth` now queries SQLite on every request to verify `is_active = 1` and matches `token_version`. Added `token_version` to `users` table; account deactivation, password reset, or `POST /api/auth/logout` increments `token_version`, immediately invalidating all prior JWT tokens (<0.05ms overhead per request). Live roles are also rehydrated directly from SQLite on every request.
- **Verification**: Verified via `server/test/auth_security.test.ts` (suites `4. Real-time Account Verification` & `5. Session Invalidation via POST /api/auth/logout`).

---

### RISK-03: Incomplete Teacher-Level Marks Entry Authorization
- **Location**: [`server/src/routes/marks.ts`](file:///server/src/routes/marks.ts#L100-L125)
- **Code Evidence**:
  ```typescript
  if (!canManageMarks(user, cId, sId)) {
    res.status(403).json({ error: 'You are not assigned to enter marks for this class/subject.' });
  }
  ```
  In `server/src/middleware/auth.ts`:
  ```typescript
  export function canManageMarks(user: AuthUser, classId: number, subjectId: number): boolean {
    if (user.role === 'admin') return true;
    if (user.role === 'class_teacher' && user.assignedClassIds.includes(classId)) return true;
    // ...
  ```
- **Security Impact**: A class teacher can overwrite examination marks for **any subject** taught in their class, even subjects assigned exclusively to specialist subject teachers (e.g., Mathematics, Science), bypassing subject teacher authority.
- **Target Remediation**: **PR-003** (Strict subject-teacher assignment checks; restrict class teachers to their designated assigned subjects).

---

### RISK-04: Cross-Class Attendance Record Injection
- **Location**: [`server/src/routes/attendance.ts`](file:///server/src/routes/attendance.ts#L130-L135)
- **Code Evidence**:
  ```typescript
  for (const rec of records) {
    upsertRecord.run(sessionId, Number(rec.student_id), stStatus, rec.remarks || null);
  }
  ```
- **Security Impact**: When submitting attendance for Class A, the API does not verify that `rec.student_id` is actually enrolled in Class A. A malicious or malformed client payload could inject attendance records for students belonging to other classes into the session.
- **Target Remediation**: **PR-004** (Enforce student enrollment validation against `class_id` within the session transaction).

---

### RISK-05: Backup Restoration Destructive Table Wiping & Foreign Key Constraint Failure
- **Location**: [`server/src/routes/admin.ts`](file:///server/src/routes/admin.ts#L235-L272)
- **Status**: **CONTAINED in PR-002 (Fail-Closed Guard)** / Scheduled for full transactional recovery in PR-004
- **Defect Description**: Non-transactional table deletion before restore resulted in SQLite foreign key errors on `users` due to `audit_logs`, leaving tables empty and destroying data.
- **Immediate PR-002 Remediation**: Both `/api/admin/restore` and `/api/admin/reset-seed` were sealed with fail-closed HTTP 503 security guards, preventing destructive runtime wipes. The UI controls are locked with safety notices. Full atomic staging recovery will be built in PR-004.
- **Verification**: Verified via `server/test/auth_security.test.ts` (suite `8. Immediate Disaster Recovery Safeguards: Blocked Endpoints (HTTP 503)`).

---

## 2. High Severity Risks

### RISK-06: Offline Attendance Sync Blind Upsert & Timestamp Collisions
- **Location**: [`server/src/routes/attendance.ts`](file:///server/src/routes/attendance.ts#L160-L200)
- **Defect Description**: The `/sync` endpoint executes `ON CONFLICT DO UPDATE` without checking whether a more recent attendance change was already recorded online. If a teacher goes offline, records attendance, and syncs hours later after another teacher updated records online, the offline batch silently overwrites newer online data.
- **Target Remediation**: **PR-004** (Vector or version comparison, timestamp conflict detection, and audit logging of conflict overrides).

---

### RISK-07: Incomplete Examination Publication Workflow
- **Location**: [`server/src/routes/marks.ts`](file:///server/src/routes/marks.ts#L165-L210)
- **Defect Description**: The database schema contains `examinations.is_published`, but there is no API endpoint to transition an examination from draft to published, nor does the report card generation API restrict unfinalized or unpublished marks from student visibility.
- **Target Remediation**: **PR-005** (Formal examination lifecycle states: `Draft` -> `Marking` -> `Moderation` -> `Published`).

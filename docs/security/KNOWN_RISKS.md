# SkoolSys 2.0 — Known Engineering & Security Risks

This document catalogs security vulnerabilities and architectural defects identified during repository discovery in PR-001. Each entry contains code evidence, security impact, reproduction details, and the scheduled PR for remediation.

---

## 1. Critical Severity Vulnerabilities

### RISK-01: Hardcoded Fallback JWT Secret
- **Location**: [`server/src/middleware/auth.ts`](file:///server/src/middleware/auth.ts#L10)
- **Code Evidence**:
  ```typescript
  const JWT_SECRET = process.env.JWT_SECRET || 'skoolsys-super-secret-key-2026';
  ```
- **Security Impact**: If `JWT_SECRET` is unset in production, an attacker who inspects the public repository can forge an arbitrary JWT token with `role: "admin"` and assume full administrative privileges over the school.
- **Target Remediation**: **PR-002** (Fail fast on startup if `JWT_SECRET` is missing or shorter than 32 characters in production; eliminate hardcoded default).

---

### RISK-02: Deactivated-User Token Authorization Gap
- **Location**: [`server/src/middleware/auth.ts`](file:///server/src/middleware/auth.ts#L22-L35)
- **Code Evidence**:
  ```typescript
  const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
  req.user = decoded;
  next();
  ```
- **Security Impact**: Once issued, a JWT is valid for 24 hours. If an administrator deactivates a compromised or terminated teacher account (`is_active = 0`), the token remains valid until expiration because `requireAuth` does not check the user's active status against the database.
- **Target Remediation**: **PR-002** (Add database active status check or token revocation blacklist).

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

### RISK-05: Backup Restoration Foreign Key Constraint Failure
- **Location**: [`server/src/routes/admin.ts`](file:///server/src/routes/admin.ts#L190-L240)
- **Code Evidence**:
  ```typescript
  db.exec('PRAGMA foreign_keys = OFF;');
  // restores tables ...
  db.exec('PRAGMA foreign_keys = ON;');
  ```
- **Defect Description**: If the backup archive contains circular dependencies or truncated user keys (such as `audit_logs.user_id` pointing to an un-restored user), enabling foreign keys immediately crashes the restore sequence, leaving the database in an inconsistent or partially populated state.
- **Target Remediation**: **PR-006** (Transactional atomic restore, staging table validation, and foreign key verification before commit).

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

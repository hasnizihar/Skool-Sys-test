# SkoolSys 2.0 — Feature & Security Coverage Matrix

**Date**: 2026-10-18  
**Architecture**: ARCH-001 (Option A) — Single School Engine (Grades 6–13)  
**Baseline Milestone**: PR-003 (Record-Level Permissions & Scoped Authorization)

---

## 1. Application Database Entities (13 Existing Tables)

| Table | Primary Role in System | Key Foreign Keys / Constraints | Scope & Isolation Enforcement |
| :--- | :--- | :--- | :--- |
| `users` | Staff credentials & roles | `role IN ('admin', 'class_teacher', 'subject_teacher')` | `is_active` checked live on every request; `token_version` tracking |
| `academic_years` | School academic calendar | `is_current` flag | Scopes enrollments and examinations to active year |
| `classes` | School divisions (Grades 6–13) | `class_teacher_id REFERENCES users(id)` | Teacher class assignment boundary |
| `subjects` | Curriculum catalog | Unique `code` | Core, Elective, Basket categorization |
| `class_subjects` | Subjects assigned to class | `UNIQUE(class_id, subject_id)` | Grade-level curriculum linkage |
| `teacher_assignments` | Teaching assignments | `assignment_type IN ('class_teacher', 'subject_teacher')` | Core record-level authorization source |
| `students` | Student demographic records | Unique `admission_no` | Access restricted to teachers of assigned classes |
| `enrollments` | Student class placement | `UNIQUE(student_id, academic_year_id)` | Maps student to current class and roll number |
| `attendance_sessions` | Daily class register session | `UNIQUE(class_id, date)` | Editable only by assigned class teacher or admin |
| `attendance_records` | Individual attendance status | `status IN ('present', 'absent', 'late', 'excused')` | Child of attendance session; enrollment validated |
| `examinations` | School term examinations | `term IN (1, 2, 3)` | Published / draft state lifecycle |
| `marks` | Examination marks & grades | `UNIQUE(examination_id, subject_id, student_id)` | Scoped strictly to assigned subject teacher or admin |
| `audit_logs` | Security & operational logs | `user_id REFERENCES users(id)` | Admin-only access; logs auth, modifications, containment |

---

## 2. Feature & Screen Coverage Matrix

| Feature ID | Screen / UI Component | Route / API | Permitted Roles | Authorization Enforcement Rule | Test Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `FEAT-AUTH-01` | Login Page | `POST /api/auth/login` | Anonymous | Rate limited (5 attempts / 15m); generic anti-enumeration error | `server/test/auth_security.test.ts` |
| `FEAT-AUTH-02` | Session Verification | `GET /api/auth/me` | All authenticated | Live `is_active` and `token_version` checked in SQLite | `server/test/auth_security.test.ts` |
| `FEAT-AUTH-03` | User Logout | `POST /api/auth/logout` | All authenticated | Increments `token_version` to invalidate session token | `server/test/auth_security.test.ts` |
| `FEAT-DASH-01` | Dashboard | Client UI | All authenticated | Metrics scoped by role and live database aggregations | UI visual verification |
| `FEAT-STUD-01` | Students List | `GET /api/students` | All authenticated | Admin: all students; Teachers: strictly students in assigned classes | `server/test/record_authorization.test.ts` |
| `FEAT-STUD-02` | Student Full View | `GET /api/students/:id` | All authenticated | Non-admin: 403 Forbidden if student not in teacher's assigned classes | `server/test/record_authorization.test.ts` |
| `FEAT-STUD-03` | Create Student | `POST /api/students` | Admin | Role required: `admin` | `server/test/security_matrix.test.ts` |
| `FEAT-STUD-04` | Update Student | `PUT /api/students/:id` | Admin | Role required: `admin` | `server/test/security_matrix.test.ts` |
| `FEAT-STUD-05` | CSV Import | `POST /api/students/import-csv` | Admin | Role required: `admin` | `server/test/security_matrix.test.ts` |
| `FEAT-ACAD-01` | Class Roster | `GET /api/academic/classes/:id/roster` | All authenticated | Non-admin: 403 Forbidden if class not assigned to teacher | `server/test/record_authorization.test.ts` |
| `FEAT-ATTN-01` | Attendance Register | `GET /api/attendance/session` | All authenticated | Non-admin: 403 Forbidden if class not assigned to teacher | `server/test/record_authorization.test.ts` |
| `FEAT-ATTN-02` | Take Daily Attendance | `POST /api/attendance/session` | Class Teacher, Admin | 403 Forbidden for subject teachers or unassigned class teachers | `server/test/record_authorization.test.ts` |
| `FEAT-ATTN-03` | Offline Sync | `POST /api/attendance/sync` | Class Teacher, Admin | Queue items validated against teacher's class assignment | `server/test/record_authorization.test.ts` |
| `FEAT-ATTN-04` | Daily Attendance Report | `GET /api/attendance/reports/daily` | All authenticated | Scoped to teacher's assigned classes; absent contacts masked for unassigned | `server/test/record_authorization.test.ts` |
| `FEAT-ATTN-05` | Monthly Attendance Grid | `GET /api/attendance/reports/monthly` | All authenticated | Non-admin: 403 Forbidden if class not assigned to teacher | `server/test/record_authorization.test.ts` |
| `FEAT-MARK-01` | Marks Sheet View | `GET /api/marks/sheet` | All authenticated | Non-admin: 403 Forbidden if teacher not assigned to class or subject | `server/test/record_authorization.test.ts` |
| `FEAT-MARK-02` | Marks Entry & Submit | `POST /api/marks/sheet` | Subject Teacher, Admin | Restricted to assigned subject teacher; class teacher blocked if specialist assigned | `server/test/record_authorization.test.ts` |
| `FEAT-MARK-03` | Student Report Card | `GET /api/marks/student-report/:studentId/:examId` | All authenticated | Non-admin: 403 Forbidden if student not in teacher's assigned classes | `server/test/record_authorization.test.ts` |
| `FEAT-ADMN-01` | User Management | `GET /api/admin/users` | Admin | Role required: `admin` | `server/test/security_matrix.test.ts` |
| `FEAT-ADMN-02` | User Creation & Password Policy | `POST /api/admin/users` | Admin | Role required: `admin`; password policy validated (>=8 chars, alphanumeric) | `server/test/auth_security.test.ts` |
| `FEAT-ADMN-03` | User Deactivation / Update | `PUT /api/admin/users/:id` | Admin | Role required: `admin`; increments `token_version` on modify | `server/test/auth_security.test.ts` |
| `FEAT-ADMN-04` | Teacher Assignments | `GET, POST, DELETE /api/admin/assignments` | Admin | Role required: `admin` | `server/test/security_matrix.test.ts` |
| `FEAT-ADMN-05` | Backup Export | `GET /api/admin/backup` | Admin | Role required: `admin`; exports JSON snapshot safely | `server/test/security_matrix.test.ts` |
| `FEAT-ADMN-06` | Backup Restore Guard | `POST /api/admin/restore` | Admin | Fail-closed HTTP 503 guard; blocks destructive non-transactional wipe | `server/test/auth_security.test.ts` |
| `FEAT-ADMN-07` | Database Re-seed Guard | `POST /api/admin/reset-seed` | Admin | Fail-closed HTTP 503 guard; blocks runtime database wipe | `server/test/auth_security.test.ts` |
| `FEAT-AUDT-01` | Audit Trail View | `GET /api/admin/audit-logs` | Admin | Role required: `admin` | `server/test/security_matrix.test.ts` |

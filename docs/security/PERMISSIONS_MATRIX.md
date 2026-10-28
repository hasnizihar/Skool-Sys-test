# SkoolSys 2.0 — Role Permissions & Authorization Matrix

This document defines the Role-Based Access Control (RBAC) boundaries for SkoolSys 2.0.

---

## 1. System Roles

| Role Key | Display Name | Intended User | Scope of Authority |
| :--- | :--- | :--- | :--- |
| `admin` | Administrator | School Principal / Head of School | Unrestricted access across all school configuration, student data, grades, and security settings. |
| `class_teacher` | Class Teacher | Class Tutor / Homeroom Teacher | Primary authority over designated class(es): student roster view, daily attendance taking, student behavior notes. |
| `subject_teacher` | Subject Teacher | Subject Specialist (e.g. Science, Maths) | Authority over designated subjects in assigned classes: marks entry and academic progress tracking. |

---

## 2. API Endpoint Permissions Matrix

| Module | Endpoint | Method | Admin | Class Teacher | Subject Teacher | Current Enforcement Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **Auth** | `/api/auth/login` | `POST` | ✔ | ✔ | ✔ | Public (authenticates credentials) |
| **Auth** | `/api/auth/me` | `GET` | ✔ | ✔ | ✔ | Enforced (`requireAuth`) |
| **Users** | `/api/admin/users` | `GET` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Users** | `/api/admin/users` | `POST` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Users** | `/api/admin/users/:id/toggle` | `PATCH` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Classes** | `/api/admin/classes` | `GET` | ✔ | ✔ (Assigned) | ✔ (Assigned) | Partial (filters on frontend) |
| **Classes** | `/api/admin/classes` | `POST` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Subjects** | `/api/admin/subjects` | `GET` | ✔ | ✔ | ✔ | Enforced (`requireAuth`) |
| **Subjects** | `/api/admin/subjects` | `POST` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Assignments** | `/api/admin/assign` | `POST` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Students** | `/api/students` | `GET` | ✔ | ✔ (Assigned) | ✔ (Assigned) | Partial (filters on query params) |
| **Students** | `/api/students` | `POST` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Students** | `/api/students/:id` | `GET` | ✔ | ✔ | ✔ | Enforced (`requireAuth`) |
| **Students** | `/api/students/:id` | `PUT` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Students** | `/api/students/import` | `POST` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Attendance** | `/api/attendance/session` | `GET` | ✔ | ✔ (Assigned) | ❌ | Enforced (`canManageAttendance`) |
| **Attendance** | `/api/attendance/session` | `POST` | ✔ | ✔ (Assigned) | ❌ | Enforced (`canManageAttendance`) |
| **Attendance** | `/api/attendance/sync` | `POST` | ✔ | ✔ (Assigned) | ❌ | Enforced (`canManageAttendance`) |
| **Attendance** | `/api/attendance/today-summary` | `GET` | ✔ | ✔ | ✔ | Enforced (`requireAuth`) |
| **Attendance** | `/api/attendance/monthly-report`| `GET` | ✔ | ✔ (Assigned) | ❌ | Enforced (`requireAuth`) |
| **Marks** | `/api/marks/sheet` | `GET` | ✔ | ✔ (Assigned) | ✔ (Assigned) | Enforced (`canManageMarks`) |
| **Marks** | `/api/marks/submit` | `POST` | ✔ | ✔ (Assigned) | ✔ (Assigned) | **Gap: CT can enter non-assigned subjects** |
| **Marks** | `/api/marks/student-report` | `GET` | ✔ | ✔ (Assigned) | ❌ | Enforced (`requireAuth`) |
| **Audit Logs** | `/api/admin/audit-logs` | `GET` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Backup** | `/api/admin/backup` | `GET` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |
| **Restore** | `/api/admin/restore` | `POST` | ✔ | ❌ | ❌ | Enforced (`requireRole('admin')`) |

---

## 3. Negative Authorization Test Cases Documented for PR-002 / PR-003

The test suite in [`server/test/security_matrix.test.ts`](file:///server/test/security_matrix.test.ts) already executes the following negative test cases:

1. **Unauthenticated Access Block**:
   - `GET /api/admin/users` returns `401 Unauthorized` without a token.
   - `GET /api/students` returns `401 Unauthorized` without a token.
   - `GET /api/marks/sheet` returns `401 Unauthorized` without a token.
   - `GET /api/attendance/session` returns `401 Unauthorized` without a token.

2. **Role Elevation Block**:
   - `class_teacher` accessing `/api/admin/users` returns `403 Forbidden`.
   - `subject_teacher` accessing `/api/admin/users` returns `403 Forbidden`.
   - `subject_teacher` attempting `POST /api/admin/users` returns `403 Forbidden`.

3. **Cross-Class Attendance Block**:
   - `class_teacher` submitting attendance for a class other than their assigned class returns `403 Forbidden`.

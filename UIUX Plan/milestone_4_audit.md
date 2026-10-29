# Milestone 4 Pre-Implementation Audit: Student Directory & Dossier Redesign

**Project**: SkoolSys 2.0 UI/UX Redesign  
**Document**: Pre-Implementation Audit & Dependency Analysis  
**Branch**: `feature/ui-ux-v2-redesign`  
**Date**: October 28, 2026  
**Auditor**: Antigravity Pair Programmer  

---

## 1. Current Architecture & Data Flow

### 1.1 Route & View Architecture
- **Route Guard**: In [`client/src/App.tsx`](file:///d:/Skool%20Sys%20test/client/src/App.tsx), `currentTab === 'students'` renders `<Students user={user} />`.
- **Primary Component**: [`client/src/pages/Students.tsx`](file:///d:/Skool%20Sys%20test/client/src/pages/Students.tsx) manages student list fetching, filtering, CSV export/import, and inline switching to `<StudentFullView />`.
- **Dossier Component**: [`client/src/pages/StudentFullView.tsx`](file:///d:/Skool%20Sys%20test/client/src/pages/StudentFullView.tsx) fetches comprehensive student profile data and renders demographics, guardian contacts, academic placement, attendance stats/history, examination marks, and links to `<StudentReportCard />`.

### 1.2 Backend API Contracts
- `GET /api/students`:
  - **Query Params**: `q` (search string), `grade` (integer), `classId` (integer), `status` (string).
  - **Server Implementation**: Located in [`server/src/routes/students.ts`](file:///d:/Skool%20Sys%20test/server/src/routes/students.ts).
  - **Authorization**: Scoped strictly by role. Teachers only receive students enrolled in their assigned classes; administrators receive all students.
  - **Response Payload**: `{ students: StudentDTO[], count: number }`.
- `GET /api/students/:id`:
  - **Server Implementation**: Located in [`server/src/routes/students.ts`](file:///d:/Skool%20Sys%20test/server/src/routes/students.ts).
  - **Authorization**: Validates that teachers teach the requested student's class (returns 403 Forbidden if unassigned). Administrators can inspect any student.
  - **Response Payload**: `{ student: StudentDetailDTO, attendance: { total_days, present_days, absent_days, late_days, excused_days, attendanceRate, history: AttendanceHistoryDTO[] }, marks: MarkDTO[] }`.
- `POST /api/students`: Create student (Admin only).
- `PUT /api/students/:id`: Update student (Admin only).
- `POST /api/students/import-csv`: Bulk import with validation preview (Admin only).
- `GET /api/academic/grades`: Returns distinct grade levels `[6, 7, 8, 9, 10, 11, 12, 13]`.
- `GET /api/academic/classes`: Returns list of classes with `id`, `name`, `grade`, `class_teacher_name`.

---

## 2. Dependencies & Test Selectors

The real browser Playwright suite ([`server/test/principal_walkthrough_browser_real.test.ts`](file:///d:/Skool%20Sys%20test/server/test/principal_walkthrough_browser_real.test.ts)) asserts exact DOM fixtures that MUST be preserved:
1. **Navigation Item**: Text `'Student Records'`.
2. **Data Table**: `.data-table` table element.
3. **Search Input**: `input[placeholder*="Search"]` (searching for `'Kasun'` and `'SCH-2024-001'`).
4. **Student Row Matching**: Rows matching student full names (e.g. `'Kasun Malinda Ranasinghe'`).
5. **Dossier Full View Button**: `button:has-text("Full View")`.
6. **Report Card Action Button**: `button:has-text("View Full Report Card")`.
7. **Profile Content Matches**: Text content containing `'Grade 8-A'`, `'Mathematics'`, `'Science'`.
8. **Navigation Back**: `button:has-text("Back to Student Directory")`.

---

## 3. Planned UI/UX Redesign Scope

### 3.1 Student Directory (`Students.tsx` + `students.css`)
- **Header & Metric KPI Cards**: Add summary cards based on loaded student data:
  - Total Enrolled Students
  - Active Pupils
  - Gender Breakdown (Male / Female)
  - Classes Represented
- **Prominent Search & Filter Toolbar**:
  - Full-width search bar with clear button (`X`).
  - Grade selector, Class selector (filtered by selected grade), and Status filter.
  - **Active Filter Badges**: Color-coded chips showing active filter criteria with one-click remove and "Reset All" button.
- **Responsive Display**:
  - **Desktop**: Clean table with student avatar, admission number, calling name, full name, class badge, guardian contact pill, and action buttons (`Full View`, `Quick Preview`).
  - **Mobile (< 768px)**: Ergonomic cards featuring calling name, admission number, roll badge, calling tap-to-call link, and 48px touch targets.
- **Empty & Error States**: Clear illustrations/messages when zero students match search or filters.

### 3.2 Student Dossier View (`StudentFullView.tsx` + `studentFullView.css`)
- **Hero Header**:
  - Elevated card with student avatar, calling name, full name, permanent admission ID, status badge, class pill, and attendance rate meter.
  - Action buttons: Back to Directory, Print Dossier, Terminal Report Card, and Edit Student (admin only).
- **Tabbed / Sectional Layout**:
  - **Personal & Demographics**: Official registry data, DOB, age, address, and gender.
  - **Guardian & Emergency Contacts**: Primary guardian, relationship, tap-to-call phone number, email, and emergency contact.
  - **Academic Placement**: Assigned class, grade level, room number, class teacher, and roll number.
  - **Attendance Record**: Rate meter, present/absent/late/excused breakdown, and interactive recent attendance history table.
  - **Examination Marks**: Examination title, term, subject code, subject name, marks, and grade chip (`A`, `B`, `C`, `S`, `F`), with quick link to terminal report card.
- **Privacy & Role Scoping**: Protect sensitive guardian NICs and emergency details according to user permissions.

---

## 4. Strict Non-Regression Mandate
- **Zero changes** to Express routes, database schemas, or offline synchronization.
- **Zero modifications** to `server/` or `client/src/api/offlineQueue.ts`.
- **100% preservation** of automated Playwright test selectors.

# SkoolSys 2.0 — Information Architecture & Navigation Specification

**Project:** SkoolSys — School Management System  
**Document:** Information Architecture (IA) Specification  
**Version:** 2.0  

---

## 1. Global Sitemap & Hierarchy

```
SkoolSys Application Root
│
├── 🔑 Authentication
│   ├── Login Screen (`/login` or initial unauthenticated state)
│   └── Demo Credentials Selector (Controlled by VITE_ENABLE_DEMO_LOGIN)
│
├── 🏛️ Main Workspace (Role-Aware Shell)
│   │
│   ├── 📊 Dashboard (`#/dashboard`)
│   │   ├── Teacher View: My Classes Today, Quick Register CTA, Pending Marks
│   │   ├── Section Head View: Grade Band Attendance & Moderation Pipeline
│   │   └── Principal / Admin View: Whole-School KPI Grid, Absentee Registry, Audit Feed
│   │
│   ├── 👥 Students (`#/students`)
│   │   ├── Student Directory (Search, Grade/Class/Status Filter)
│   │   ├── Add Student Modal
│   │   ├── 4-Step CSV Import Stepper
│   │   └── Student Dossier (`#/students/:id` or inline full view)
│   │       ├── Tab 1: Overview & Attendance KPI Ring
│   │       ├── Tab 2: Daily Attendance History
│   │       ├── Tab 3: Terminal Examination Records
│   │       ├── Tab 4: Guardian & Contact Details
│   │       └── Action: Print Official Report Card Modal
│   │
│   ├── 📅 Daily Attendance (`#/attendance`)
│   │   ├── Register Selector (Assigned Class & Date Picker)
│   │   ├── Sticky Summary Bar (Enrolled, P, A, L, E, %)
│   │   ├── Interactive Student Grid / Card List
│   │   ├── Bulk Actions ("Mark All Present", "Clear All") with Undo
│   │   ├── Student Remarks Drawer
│   │   ├── Save Draft (Local Device) vs Submit Register (Server)
│   │   └── Side-by-Side Conflict Diff Reconciliation Modal
│   │
│   ├── 📑 Attendance Reports (`#/attendance-reports`)
│   │   ├── Tab 1: Daily School-Wide Class Summary & Absentee Follow-Up Phone List
│   │   └── Tab 2: Monthly Attendance Matrix (Student × Day Grid with Export)
│   │
│   ├── 🎓 Marks & Examinations (`#/marks`)
│   │   ├── Tab 1: Examination Overview (Lifecycle Status: Draft, Scheduled, Published)
│   │   ├── Tab 2: Examination Timetables & Schedules Workspace
│   │   ├── Tab 3: Marks Entry Grid (Excel-like keyboard navigation + Mobile Single Card)
│   │   ├── Tab 4: Moderation & Section Head Review
│   │   ├── Tab 5: Assessment Policies & Dynamic Max Score Rules
│   │   ├── Tab 6: Executive Publication & SHA-256 Audit Watermark
│   │   └── Tab 7: Post-Publication Corrections & Re-issue Workflow
│   │
│   └── ⚙️ Administration & Security (`#/admin` — Admin Role Only)
│       ├── Section 1: Staff & User Management (Role assignment, password reset)
│       ├── Section 2: Academic Structure (Grades 6–13 Classes & Subject allocation)
│       ├── Section 3: Data Safety & Disaster Recovery (JSON backup, Typed-confirm restore)
│       └── Section 4: Audit Trail (`#/audit` — Tamper-evident action inspector)
```

---

## 2. Role-Based Navigation & Access Matrix

Permissions are strictly enforced by the backend API. The UI menu dynamically reflects the user's role:

| Module / Screen | Principal (`admin`) | VP Academic | Section Head | Class Teacher | Subject Teacher |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Dashboard** | Full School View | Academic View | Grade Band View | Class View | Subject View |
| **Student Directory** | Full (Read/Write) | Full (Read/Write) | Full (Read/Write) | Assigned Class | Read Only |
| **Add / Edit Student** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Daily Attendance Register** | ✅ All Classes | ✅ All Classes | ✅ Grade Band | ✅ Assigned Class | ❌ |
| **Attendance Reports** | ✅ All Classes | ✅ All Classes | ✅ Grade Band | ✅ Own Class | ❌ |
| **Marks Entry (Spreadsheet)** | ✅ | ✅ | ✅ | ✅ (Own Subjects) | ✅ (Assigned Subjects) |
| **Marks Review & Moderation** | ✅ Approve | ✅ Moderation | ✅ Section Endorse | ❌ | ❌ |
| **Exam Publication** | ✅ Publish/Watermark| ✅ Approve | ❌ | ❌ | ❌ |
| **Report Card Batch Print** | ✅ | ✅ | ✅ | ✅ Own Class | ❌ |
| **User Administration** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Database Backup / Restore** | ✅ High Security | ❌ | ❌ | ❌ | ❌ |
| **System Audit Logs** | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Navigation Paradigms by Viewport

### 3.1 Desktop Navigation (>= 1024px)
- **Collapsible Sidebar (Left):**
  - Expanded Width: `240px`
  - Collapsed Width: `68px` (Icon-only with tooltip hovers)
  - Sections:
    1. Institutional Brand Header (Crest, English/Tamil Title)
    2. Primary Section: Dashboard, Student Records
    3. Attendance Section: Take Attendance, Reports
    4. Academics Section: Marks Management
    5. Administration Section (Admin only): School Administration, Audit Trail
    6. Footer: User Profile Card, Theme Switcher, Sign Out
- **Top Bar (Navbar):**
  - Hamburger toggle for sidebar collapse/expand.
  - Current view title and breadcrumb trail.
  - Active Academic Year and Current Term status pill.
  - Global Sync Status Chip (Online, Offline, "X Pending", Syncing).
  - Quick Search / Command Palette shortcut (`Ctrl+K`).
  - Date and localized clock (Colombo Civil Time).

### 3.2 Tablet Navigation (768px – 1023px)
- Sidebar defaults to collapsed (`68px`) or slide-over drawer with backdrop overlay.
- Top bar remains sticky with full sync chip and search bar.
- Tables display responsive overflow shadows.

### 3.3 Mobile Navigation (< 768px)
- **Top Bar:** Compact header with brand emblem, current page title, persistent Sync Chip, and Theme toggle.
- **Bottom Navigation Tab Bar (Sticky Bottom, 60px height, 48px touch targets):**
  1. 🏠 **Home** (`#/dashboard`)
  2. 📅 **Attendance** (`#/attendance` for class teachers / `#/attendance-reports` for others)
  3. 🎓 **Marks** (`#/marks`)
  4. 👥 **Students** (`#/students`)
  5. ☰ **More** (Opens slide-up drawer for Admin, Settings, Audit, and Profile)
- No horizontal swipe conflicts; native touch feel with subtle active haptics/tints.

---

## 4. Global Command Palette (`Ctrl + K` / `Cmd + K`)

To support power users, teachers, and administrators, a global command modal allows instant navigation without mouse interaction:
- **Instant Student Lookup:** Type any student name or admission number (e.g. `2024-001`) -> jumps straight to Student Dossier.
- **Instant Class Register:** Type `8-A` or `Grade 11` -> opens Daily Attendance for that class.
- **Quick Actions:**
  - `> Take Attendance`
  - `> Enter Marks`
  - `> Print Report Cards`
  - `> Toggle Dark Mode`
  - `> Sync Pending Records`
- **Keyboard Shortcut:** `Ctrl+K` on Windows/Linux, `Cmd+K` on macOS, or tap the search icon in the top navbar.

---

## 5. Breadcrumb & Hash-Route Mapping

All views maintain bookmarkable, sharable hash routes:

| URL Hash Route | Page Component | Active Nav Item | Breadcrumbs |
| :--- | :--- | :--- | :--- |
| `#/dashboard` | `Dashboard` | Dashboard | Home / Operations Dashboard |
| `#/students` | `Students` | Student Records | Home / Students / Directory |
| `#/students?grade=8&class=8-A` | `Students` | Student Records | Home / Students / Grade 8 / Class 8-A |
| `#/attendance` | `Attendance` | Take Attendance | Home / Attendance / Daily Register |
| `#/attendance?class=1&date=2026-10-28` | `Attendance` | Take Attendance | Home / Attendance / Grade 8-A / 2026-10-28 |
| `#/attendance-reports` | `AttendanceReports` | Attendance Reports | Home / Attendance / Reports |
| `#/marks` | `MarksEntry` | Marks Management | Home / Academics / Marks Management |
| `#/marks?tab=entry&exam=1&class=1` | `MarksEntry` | Marks Management | Home / Marks / Term 1 Exam / Grade 8-A |
| `#/admin` | `AdminSettings` | Administration | Home / Administration / Settings |
| `#/audit` | `AuditLogs` | Audit Trail | Home / Administration / Audit Trail |

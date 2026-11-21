# SkoolSys — School Management System (MVP)

A modern, responsive, pilot-ready School Management System designed for Grade 6–13 schools (1,500–3,000 students), featuring offline attendance synchronization, student record management, live classroom monitoring, section head delegation, and terminal examination marks reporting.

---

## 🌟 Architecture & Stack

- **Frontend**: React 19 + TypeScript + Vite + Mantine v9 Component Architecture (Refined Blue institutional palette `#2563eb`, Inter / Outfit typography, dark/light theme, micro-animations, touch-friendly UI, PWA manifest & Service Worker).
- **Backend API**: Node.js + Express + TypeScript with JWT authentication, fine-grained role-based access control, dual-role support (Teacher + Section Head), and tamper-evident audit logging.
- **Database**: Native SQLite (`node:sqlite`) with WAL mode, foreign key enforcement, safe deletion business rules, and zero external binary dependencies.
- **Offline Subsystem**: Browser IndexedDB (`skoolsys_offline_db`) caching assigned class rosters and queuing offline attendance registers with auto-sync, conflict resolution, and duplicate prevention.

---

## 🚀 Live Local Dev Servers

| Service | Local URL | Port |
| :--- | :--- | :--- |
| **Frontend Web App (PWA)** | [http://localhost:5173/](http://localhost:5173/) | `5173` |
| **Backend API Server** | [http://localhost:5000/api/](http://localhost:5000/api/) | `5000` |
| **Health Check** | [http://localhost:5000/api/health](http://localhost:5000/api/health) | `5000` |

---

## 🔑 Demo Faculty & Admin Accounts

The login screen features **1-Click Demo Buttons** for fast role switching:

| Role | Username | Password | Assigned Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator / Principal** | `admin` | `admin123` | School-wide access to all sections, classes, students, marks, user accounts, audit trail, live classroom monitoring, and backup/restore. |
| **Section Head** (Senior School) | `head_senior` | `head123` | Section-level oversight, live period-by-period classroom reporting, student roster, and attendance analytics for assigned sections. |
| **Class Teacher** (Grade 8-A) | `teacher_nimali` | `teacher123` | Daily attendance register & student roster for Grade 8-A, English marks entry, mobile roll call. |
| **Subject Teacher** (Math) | `teacher_samantha` | `teacher123` | Mathematics marks entry for Grade 8-A, 8-B, and 11-A. |
| **Subject Teacher** (Science) | `teacher_priya` | `teacher123` | Science marks entry for Grade 8-A and 8-B. |

---

## 📋 Implemented & Modernized Modules

### Module 1: Student Management & Directory
- Permanent student admission numbers (`SCH-2024-001`...)
- Student personal profile: full name, calling name, gender, DOB, home address
- Guardian details: name, relation, telephone, email, emergency contact
- Grade (6–13), section mapping, and enrollment status (`Active`, `Transferred`, `Graduated`)
- Instant search and multi-criteria filters (Grade, Class, Status)
- Modernized Mantine Student Profile with attendance percentage ring and historical exam performance
- Bulk CSV import with column schema validation, preview table, error reporting, and duplicate detection
- Filtered roster CSV export

### Module 2: Daily Attendance (Highest Priority)
- One register per class per school day (with strict database duplicate prevention)
- 4-way touch segmented buttons: **[P] Present**, **[A] Absent**, **[L] Late**, **[E] Excused**
- Quick bulk actions: "Mark All Present" & "Mark All Absent"
- Mobile Sequential Roll Call interface optimized for one-thumb smartphone input
- Real-time statistics: total enrolled, present count, absent count, late count, and attendance %
- Per-student remarks/notes input (e.g., medical leave, official competition, transport delay)
- **Offline Recording & Synchronization**:
  - Automatically caches assigned class rosters in IndexedDB
  - When offline or disconnected from school network, registers are saved to the browser queue
  - Visual offline notification banner displays pending queue items
  - Automatically synchronizes when network connection returns, plus manual "Sync Now" trigger
  - Server-side conflict resolution and duplicate prevention
- **Attendance Reports**:
  - Daily attendance summary table across all school classes (Grades 6–13)
  - Dedicated absent student telephone directory for immediate guardian follow-up calls
  - Monthly attendance register: Student × Day matrix with monthly presence percentage

### Module 3: Classroom Status & Live Tracking
- **Principal Bird's-Eye Dashboard**:
  - Real-time school-wide period grid across all sections
  - Status indicators: In Progress, Unattended / Substitute Required, Study Hall, Free Period
  - Alert filters to instantly isolate unstaffed or delayed classrooms
- **Section Head Walkthrough Interface**:
  - Mobile-first period status reporting per classroom in assigned sections
  - Fast status updates with teacher substitute assignment notes
  - Historical status logs with timestamps and reporter attribution

### Module 4: Examinations & Marks Workspace
- Term and examination definitions (Term 1 Assessment 2026, Mid-Year, Year-End)
- Subjects assigned to each class across Grades 6 to 13
- Spreadsheet-style marks entry grid with keyboard navigation (0–100 score bounds)
- Absent (`AB`) and Medical Exempt handling
- Auto-calculated distinction grades (`A`: &ge;75, `B`: &ge;65, `C`: &ge;50, `S`: &ge;35, `F`: &lt;35)
- Class-wide statistics: subject average, highest, lowest, pass rate %, and grade distribution badges
- Marks verification workflow: Draft &rarr; Submitted for Review &rarr; Published
- **Printable Student Terminal Report Card**:
  - Official school letterhead and Ministry of Education standard A4 layout
  - Bio details & permanent admission number
  - Subject scores table with grades and instructor names
  - Term total, GPA average, class rank (e.g. "1st of 20"), and attendance percentage
  - Grading legend and signature lines for Class Teacher and Principal

### Module 5: Academic Administration & Security
- **Sections & Structure**: Configure school sections (Primary, Junior, Senior) with assigned heads
- **Class Management**: Grade level breakdown, room allocations, student counts, and safe deletion guards
  - Deletion blocked if active enrollments or historical attendance exists
- **Faculty & Teacher Directory**: Workload breakdown, qualifications, subject specializations, and direct assignments
- **User Accounts & RBAC**: Create faculty accounts, change roles, assign dual-role section heads, reset passwords
- **Teacher Assignments**: Map teachers to classes and subjects with separation of duties
- **Database Backup & Restore**: One-click JSON snapshot export, file restore validation, and pilot re-seed
- **Tamper-Evident System Audit Trail**: Filterable log of student admissions, marks submissions, and system changes with detailed JSON payload diff inspection

---

## 🛠️ CLI Commands & Verification Suites

```powershell
# Start Backend API Server
npm run dev:server

# Start Frontend Vite Dev Server
npm run dev:client

# Re-seed Database Demo Data
npm run seed

# Build Full Project (Backend tsc + Frontend Vite)
npm run build

# Run All Backend Unit & Integration Tests (486 tests in 32 suites)
npm test

# Run Playwright Browser E2E Tests (28 tests)
npm run test:browser:walkthrough   # 12 Principal & Navigation tests
npm run test:browser:attendance    # 6 Attendance & Offline Sync tests
npm run test:browser:exam          # 10 Examination Lifecycle tests

# Full TypeScript Typecheck (0 errors)
npm run typecheck

# Full Client Linting (0 errors)
npm run lint
```

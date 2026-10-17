# SkoolSys — School Management System (MVP)

A modern, responsive, pilot-ready School Management System designed for Grade 6–13 schools (1,500–3,000 students), featuring offline attendance synchronization, student record management, and terminal marks reporting.

---

## 🌟 Architecture & Stack

- **Frontend**: React 19 + TypeScript + Vite + Vanilla CSS Design System (Inter / Outfit typography, dark/light theme, micro-animations, touch-friendly UI, PWA manifest & Service Worker).
- **Backend API**: Node.js + Express + TypeScript with JWT authentication, role authorization, and audit logging.
- **Database**: Native SQLite (`node:sqlite`) with WAL mode, foreign key enforcement, and zero external binary dependencies.
- **Offline Subsystem**: Browser IndexedDB (`skoolsys_offline_db`) caching assigned class rosters and queuing offline attendance registers with auto-sync and conflict resolution.

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
| **Administrator / Principal** | `admin` | `admin123` | Full access to all classes, students, marks, user accounts, audit trail, and backup/restore. |
| **Class Teacher** (Grade 8-A) | `teacher_nimali` | `teacher123` | Daily attendance register & student roster for Grade 8-A, English marks. |
| **Subject Teacher** (Math) | `teacher_samantha` | `teacher123` | Mathematics marks entry for Grade 8-A, 8-B, and 11-A. |
| **Subject Teacher** (Science) | `teacher_priya` | `teacher123` | Science marks entry for Grade 8-A and 8-B. |

---

## 📋 Implemented MVP Modules

### Module 1: Student Management
- Permanent student admission numbers (`SCH-2024-001`...)
- Student personal profile: full name, calling name, gender, DOB, home address
- Guardian details: name, relation, telephone, email, emergency contact
- Grade (6–13), class enrollment status (`Active`, `Transferred`, `Graduated`)
- Instant search and multi-criteria filters (Grade, Class, Status)
- Student profile view with attendance percentage ring and examination marks history
- Bulk CSV import with column schema validation, preview table, and duplicate detection
- Filtered roster CSV export

### Module 2: Daily Attendance (Highest Priority)
- One register per class per school day (with duplicate register prevention)
- 4-way touch segmented buttons: **[P] Present**, **[A] Absent**, **[L] Late**, **[E] Excused**
- Quick bulk actions: "Mark All Present" & "Mark All Absent"
- Real-time statistics: total enrolled, present count, absent count, late count, and attendance %
- Remarks/notes input per student (e.g. sick leave, competition, transport delay)
- **Offline Recording & Synchronization**:
  - Automatically caches assigned class rosters in IndexedDB
  - When offline or disconnected from school network, registers are saved to the browser queue
  - Visual offline notification banner displays pending queue items
  - Automatically synchronizes when network connection returns, plus manual "Sync Now" trigger
- **Attendance Reports**:
  - Daily attendance summary table across all school classes (Grades 6–13)
  - Dedicated absent student telephone directory for immediate guardian follow-up calls
  - Monthly attendance register: Student × Day matrix with monthly presence percentage

### Module 3: Marks Management
- Term and examination definitions (Term 1 Assessment 2026, Mid-Year, Year-End)
- Subjects assigned to each class across Grades 6 to 13
- Spreadsheet-style marks entry grid with keyboard navigation (0–100 score bounds)
- Absent (`AB`) and Medical Exempt handling
- Auto-calculated distinction grades (`A`: &ge;75, `B`: &ge;65, `C`: &ge;50, `S`: &ge;35, `F`: &lt;35)
- Class-wide statistics: subject average, highest, lowest, pass rate %, and grade distribution badges
- **Printable Student Terminal Report Card**:
  - Official school letterhead
  - Bio details & permanent admission number
  - Subject scores table with grades and instructor names
  - Term total, GPA average, class rank (e.g. "1st of 20"), and attendance percentage
  - Grading legend and signature lines for Class Teacher and Principal

### Module 4: Administration & Security
- Role-based server authorization (Administrator, Class Teacher, Subject Teacher)
- User account management: create faculty accounts, change roles, reset passwords
- Teacher-to-class and teacher-to-subject assignments
- System database backup: one-click full JSON dump export
- System database restore: validate and restore snapshot
- Demo seed reset button to return to the verified pilot state
- Tamper-evident Audit Trail: filterable log of student additions, marks submissions, and system modifications

---

## 🛠️ CLI Commands

```powershell
# Start Backend API Server
npm run dev:server

# Start Frontend Vite Dev Server
npm run dev:client

# Re-seed Database Demo Data
npm run seed

# Build Production Client Bundle
npm run build:client
```

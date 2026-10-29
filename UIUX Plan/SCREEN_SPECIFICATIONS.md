# SkoolSys 2.0 — Screen-by-Screen Layout & Interaction Specifications

**Project:** SkoolSys — School Management System  
**Document:** Screen Specifications (Wireframe & Interaction Rules)  
**Version:** 2.0  

---

## Screen 01: Login & Authentication

### Layout Structure
- **Left Panel (Desktop, 45% width):** Institutional brand showcase. Deep green (`#026536`) canvas featuring Kattankudy Central College emblem, bilingual gold typography, motto, and system architecture badge ("Offline-Ready National School PWA").
- **Right Panel (Desktop, 55% width):** Authentication container.
  - School Title & Portal Name.
  - Username & Password inputs with floating labels, lock icons, and eye toggle.
  - Primary CTA: `Sign In to Portal`.
  - Development Demo Mode Panel: Collapsible accordion strictly guarded by `VITE_ENABLE_DEMO_LOGIN === 'true'`. Displays role pills (Principal, VP Academic, Junior Section Head, Senior Section Head, Class Teacher, Subject Teacher).

### Mobile Adaptation (< 768px)
- Single column layout.
- Compact crest at top, standard login form centered.
- Demo mode appears at bottom as a compact, collapsed drawer.

---

## Screen 02: Administrator / Principal Dashboard

### Layout Structure
1. **Header Bar:** "School Operations Overview", active term banner, Colombo Civil Date, Quick Actions (`+ Add Student`, `View Pending Registers`).
2. **Top Metric KPI Cards (4 Cards Grid):**
   - Total Enrolled Students (with gender & grade breakdown)
   - Today's Attendance Rate (with colored progress ring & comparison vs yesterday)
   - Registers Submitted Today (e.g. `14 / 18 Classes Completed`)
   - Teaching Staff on Duty
3. **Primary Operations Grid (2 Columns, 65% / 35%):**
   - **Left Column (Class Attendance Status Matrix):** Table listing all 18 classes (Grades 6 to 13) showing Class Name, Class Teacher, Submission Status (`Completed`, `Pending`, `Draft Saved`), Present/Absent counts, and one-click "View Register" or "Nudge Teacher" action.
   - **Right Column (Priorities & Alerts):**
     - Absentee Follow-Up Alert: List of students with unexcused absence requiring guardian calls.
     - Unsynced Queues: Shows device sync status across the local network.
     - Recent Tamper-Evident Audit Feed: Last 5 security actions.

---

## Screen 03: Teacher Dashboard

### Layout Structure
1. **Welcome Header:** Teacher's name, assigned class (e.g., "Grade 8-A Class Teacher"), and today's schedule.
2. **Primary Daily Task Card (Hero Action):**
   - Class: **Grade 8-A Daily Register**
   - Status: `Not Yet Marked` (Red) or `Draft Saved on Device` (Amber) or `Submitted & Verified` (Green).
   - Primary CTA:
     - If unmarked: Large green button `👉 Take Morning Register`.
     - If draft: Amber button `📝 Resume Register Draft`.
     - If submitted: Ghost button `👁️ View Submitted Register`.
3. **Secondary Cards:**
   - Pending Marks Entry: Subjects assigned to teacher with submission deadlines.
   - My Class Attendance KPI: 7-day attendance trend line for Grade 8-A.

---

## Screen 04: Student Directory

### Layout Structure
1. **Page Header:** Page title "Student Information Records", student count pill, and action buttons (`+ Add Student`, `📥 Bulk Import CSV`, `📤 Export Roster`).
2. **Search & Filter Bar (Sticky):**
   - Search input (Instant filter by Admission No, Full Name, or Calling Name).
   - Grade Dropdown (All, Grades 6 to 13).
   - Class Dropdown (Dynamically populated based on selected grade).
   - Status Dropdown (Active, Inactive, Transferred).
   - Active filter tags with single-click remove (`x`).
3. **Data Display:**
   - **Desktop Table:**
     - Columns: Photo/Avatar, Admission No, Full Name, Calling Name, Grade-Class, Gender, Guardian Contact, Status, Actions.
     - Hover highlight, sortable headers.
     - Actions: `👁️ Dossier`, `✏️ Edit`, `📄 Report Card`.
   - **Mobile Cards (< 768px):**
     - Touch cards with student avatar, admission number chip, class badge, calling name, and quick phone call icon.
4. **Pagination Bar:** Page numbers, rows per page selector (25, 50, 100), total record counter.

---

## Screen 05: Student Dossier (Full Profile View)

### Layout Structure
1. **Hero Header:**
   - Back button (`← Back to Directory`).
   - Avatar with initials, Full Name, Calling Name, Admission Number, Class Badge, Status Badge.
   - Action buttons: `Print Report Card`, `Edit Profile`.
2. **Tabbed Navigation:**
   - **Tab 1: Overview:**
     - Key Metrics: Year Attendance Rate (Circular ring meter), Terminal Exam Rank, Guardian Quick Call.
     - Demographics Card: Date of Birth, Age, National Identity / Birth Certificate No, Address.
     - Guardian Details Card: Father/Mother/Guardian Name, Relationship, Primary Phone (tap-to-call), Email.
   - **Tab 2: Attendance History:**
     - Monthly attendance calendar visualization.
     - Total Days Present, Absent, Late, Excused.
   - **Tab 3: Examination Transcript:**
     - Historical table across terms and grades.
     - Subject, Marks, Grade Chip (`A`, `B`, `C`, `S`, `F`), Class Average, Teacher Remarks.
   - **Tab 4: Audit & Record History:**
     - Enrolment date, class progression history, last updated timestamp.

---

## Screen 06: Daily Attendance Register (Flagship UX)

### Layout Structure
1. **Sticky Header & Control Bar:**
   - Class Selector (Defaults to assigned class) & Date Picker (Defaults to today in Colombo time).
   - Session State Badge: `[Unsaved Changes]`, `[Saved Locally - Pending Sync]`, `[Submitted to Server]`.
   - **Sticky Real-Time Tally Counter:**
     - `Enrolled: 40` | `Present: 36 (90%)` | `Absent: 3` | `Late: 1` | `Excused: 0` | `Unmarked: 0`
   - Actions:
     - `⚡ Mark All Present` (Triggers 5-second undo toast).
     - `💾 Save Draft` (Persists to IndexedDB).
     - `🚀 Submit Register` (Commits to server or sync queue).
2. **Student Roster Area:**
   - Search within class roster input.
   - **Roster Item (Row on Desktop, Card on Mobile):**
     - Roll No & Avatar.
     - Calling Name (Bold) and Admission No (Subtle).
     - **4-Way Segmented Control:**
       - `[P]` (Present - Green)
       - `[A]` (Absent - Red)
       - `[L]` (Late - Amber)
       - `[E]` (Excused - Blue)
       - *Minimum 48×48px touch target on mobile!*
     - Remarks Button: Opens inline micro-input or sheet for notes (e.g. "Sent to sickbay at 10 AM").
3. **Conflict Resolution Modal (Side-by-Side):**
   - Triggers when server revision conflicts with local offline draft.
   - Displays clear diff table comparing local marking vs server marking student-by-student with "Keep Mine" or "Accept Server".

---

## Screen 07: Marks Management & Spreadsheet Grid

### Layout Structure
1. **Workspace Tabs:**
   - Overview | Timetables | **Marks Entry** | Moderation & Review | Assessment Policies | Publication | Corrections
2. **Selector Breadcrumbs:**
   - `Exam: 2026 Term 1 Final` → `Class: Grade 11-A` → `Subject: Mathematics`
3. **Spreadsheet Grid (Desktop):**
   - **Frozen Left Column:** Roll No, Admission No, Student Calling Name.
   - **Component Columns:** Component 1 (e.g. Theory 80), Component 2 (e.g. Practical 20), Final Score (`/100`), Grade Chip (`A`), Absent/Exempt Flag, Remarks.
   - **Keyboard Navigation:** Native Arrow keys move focus across cells; Enter commits and moves down; Tab moves right.
   - **Instant Validation:** Input > `max_score` flashes red error tooltip immediately.
4. **Mobile Marks Entry Mode (< 768px):**
   - Switches automatically to **Single Student Stepper Card**:
     - Large Student Name & Roll No.
     - Large numeric keypad input for score.
     - Instant grade badge preview.
     - Big `Previous` and `Next Student` buttons.
5. **Class Performance Summary Drawer:**
   - Class Average, Highest Score, Lowest Score, Pass Percentage (>= 35), Grade Distribution bar chart (Counts of A, B, C, S, F).

---

## Screen 08: Examination Setup & Publication

### Layout Structure
1. **Lifecycle Progress Stepper:**
   `Draft Plan` → `Schedule Approved` → `Marks Entry Open` → `Under Moderation` → `Published & Sealed`
2. **Moderation & Endorsement Panel:**
   - Section Head review checklist.
   - Teacher submission completeness check.
   - Audit trail of score alterations.
3. **Executive Publication Ceremony:**
   - Available exclusively to Principal / Executive Head.
   - Pre-publication integrity verification (zero missing marks, policy compliance).
   - "Publish Examination" action generates an immutable snapshot with a cryptographic **SHA-256 publication fingerprint**.

---

## Screen 09: Printable Terminal Report Card

### Layout Structure (Strict A4 Print Specification)
1. **Header Section:**
   - Institutional Emblem / Crest.
   - Formal bilingual title: "Kattankudy Central College (National School) — காத்தான்குடி மத்திய கல்லூரி".
   - Document Title: "Student Terminal Progress Report — 2026".
2. **Student & Examination Summary Box:**
   - Name, Admission No, Grade & Class, Term, Position/Rank in Class.
   - Attendance Summary (Days Present, Days Absent, Attendance %).
3. **Academic Results Table:**
   - Columns: Subject, Maximum Marks, Marks Obtained, Grade, Class Average, Subject Teacher Signature / Initials.
4. **Grading Legend Table:**
   - Standard scale: A (75–100), B (65–74), C (50–64), S (35–49), F (0–34).
5. **Conduct, Remarks & Signatures:**
   - Class Teacher's Evaluation remarks.
   - Date of Issue & Official School Seal placeholder.
   - Principal's Signature Line.
   - SHA-256 authentic verification hash rendered in small monospace footer.

---

## Screen 10: Administration, Danger Zone & Audit Logs

### Layout Structure
1. **Tabs:** User Management | Class & Subject Assignments | Data Safety & Backup | System Audit Trail
2. **User Management:** Table of staff users, roles (`class_teacher`, `subject_teacher`, `vp_academic`, `admin`), reset password button, add new user modal.
3. **Data Safety / Danger Zone:**
   - Styled with red border and warning banner.
   - Actions:
     - `📥 Download Encrypted JSON Database Backup`
     - `⚠️ Restore Database from Backup File` (Requires user to type `RESTORE` into a confirmation field before executing).
     - `🔄 Reset to Clean Seed Data` (Only visible in development/demo environments).
4. **Audit Trail Inspector:**
   - Filters: By User, By Action (`CREATE_STUDENT`, `SUBMIT_MARKS`, `PUBLISH_EXAM`), Date Range.
   - Expandable rows showing timestamp, IP address, user role, and formatted JSON diff of changed values.

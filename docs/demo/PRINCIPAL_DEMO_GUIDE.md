# KCC SkoolSys 2.0 — Principal Demonstration Guide

**School:** Kattankudy Central College (National School)  
**Target Audience:** Principal (Mr. A.L.M. Mukthar), Vice Principal Academic (Mr. M.I.M. Nawas), Section Heads, and Academic Leadership  
**System Version:** SkoolSys 2.0 MVP  
**Demo Environment:** Protected Local Synthetic Demo (Grades 6–13)  
**Demo URL:** `http://localhost:5173` (Backend API: `http://localhost:5000`)

---

## 1. Executive Summary & Demonstration Objectives

The objective of this presentation is to demonstrate the core working modules of **SkoolSys 2.0** to school leadership. All data presented is realistic, culturally appropriate synthetic fixture data representing Kattankudy Central College students and faculty across Junior Secondary (Grades 6–9), Senior Secondary (Grades 10–11 O/L), and Collegiate (Grades 12–13 A/L).

### Key Demonstration Themes
1. **Administrative Efficiency:** Unified digital attendance and student profile management.
2. **Academic Integrity:** Multi-tier examination moderation (Teacher Entry → Section Head Endorsement → Principal Approval & Publication).
3. **Professional Reporting:** Instant generation of official Sri Lankan Terminal Report Cards with aggregate scoring and rankings.
4. **Data Security & Privacy:** Strict role-based scoping ensuring staff only see data authorized for their classes and grade bands.

---

## 2. Demonstration Accounts & Roles

| Role | Username | Password | Demo Persona | Key Responsibilities in Demo |
| :--- | :--- | :--- | :--- | :--- |
| **Principal / Admin** | `admin` | `admin123` | **Mr. A.L.M. Mukthar** | Full school visibility, policy approvals, exam publishing, final report cards |
| **VP Academic** | `vp_academic` | `teacher123` | **Mr. M.I.M. Nawas** | Academic governance, cross-grade supervision, curriculum review |
| **Section Head (Junior)** | `section_head_junior` | `teacher123` | **Mr. K.L.M. Farook** | Grades 6–9 moderation, marks review queue endorsement |
| **Section Head (Senior)** | `section_head_senior` | `teacher123` | **Mr. S.H.M. Jameel** | Grades 10–13 O/L and A/L examination supervision and endorsement |
| **Class Teacher (Grade 8-A)** | `teacher_nimali` | `teacher123` | **Mrs. Nimali Perera** | Daily attendance register, English marks entry, Grade 8 report cards |
| **Subject Teacher (Math)** | `teacher_samantha` | `teacher123` | **Mr. Samantha Silva** | Mathematics marks compilation, post-publication correction requests |
| **Subject Teacher (Science)** | `teacher_priya` | `teacher123` | **Ms. Priyanthi Wickramasinghe** | Science theory and practical marks compilation |

---

## 3. Step-by-Step Demonstration Journey

### Step 1: Principal Executive Login & Dashboard Overview
- **Action:** Open `http://localhost:5173` and click the **Principal (Admin)** quick-login card or enter `admin` / `admin123`.
- **Talking Points for Principal:**
  - *"Welcome to SkoolSys 2.0. This unified dashboard gives you an instant bird's-eye view of Kattankudy Central College."*
  - Point out the active Academic Year (2026), total student enrollments across Grades 6–13, active classes, and subject offerings.
  - Highlight the clean, modern visual hierarchy adhering to Sri Lankan national school administration standards.

### Step 2: Student Information & Academic Profiles
- **Action:** Click **Students** in the main navigation.
- **Demo Highlights:**
  - Show the 62 seeded students spanning Grade 6-A, Grade 8-A, Grade 11-A (O/L), and Grade 12-Science (A/L).
  - Search for `"Kasun"` or `"Ashfaq"` in the search bar — demonstrate real-time filtering.
  - Click **View Profile** for `Kasun Malinda Ranasinghe (SCH-2024-001)`.
  - Show comprehensive student record: Calling name, Date of Birth, National ID / Admission number, Class, Guardian Information, Verified Phone Numbers (`077...`), and Address.
  - Click **Terminal Report Card** directly from the student view to preview his latest performance.

### Step 3: Daily Attendance Tracking & Absentee Action
- **Action:** Click **Attendance** in the navigation, then switch to the **Reports** tab.
- **Select Date:** `2026-10-15` (or any recent date in October 2026).
- **Talking Points for Principal:**
  - *"Every morning, class teachers mark attendance on their tablets, laptops, or smartphones."*
  - Review the Daily Attendance Summary across all classes (Grade 6-A, Grade 8-A, Grade 11-A, Grade 12-Science).
  - Notice the **Absentee Follow-Up Roster**: Lists students marked absent along with their parent/guardian names and contact numbers.
  - Demonstrate how the school office can immediately contact parents without pulling physical paper registers from classrooms.

### Step 4: Teacher Scoped Experience (Separation of Duties)
- **Action:** Log out of Principal account. Log in as **Mrs. Nimali Perera** (`teacher_nimali` / `teacher123`).
- **Talking Points for Leadership:**
  - *"Notice that Mrs. Nimali does not see the entire school roster. She is restricted strictly to her assigned classes (Grade 8-A and Grade 11-A English)."*
  - Show the **Attendance Register**: She can mark attendance for Grade 8-A with One-Click Present/Absent and note remarks (e.g. sick leave, school chess team).
  - Show the **Marks Workspace**: She can view and edit only the marks sheets for subjects she is authorized to teach.

### Step 5: Examination Management & Multi-Tier Moderation
- **Action:** Navigate to **Examinations** (or log in as `section_head_junior` / `admin`).
- **Talking Points on Integrity (PR-005 Baseline):**
  - Explain the 5-stage examination lifecycle:
    1. **Draft:** Teacher enters provisional scores.
    2. **Submitted:** Teacher locks marks and forwards to Section Head.
    3. **Reviewed:** Section Head checks for clerical anomalies and endorses.
    4. **Approved:** Principal authorizes marks for publication.
    5. **Published:** Official report cards generated; scores become immutable.
  - Show the **Term 1 Assessment 2026** overview with published status.
  - Demonstrate the **Marks Moderation Queue**: Shows pending sheets awaiting endorsement.

### Step 6: Official Terminal Report Cards (Junior, O/L, A/L)
- **Action:** Log in as `admin`. Go to **Examinations** → **Term 1 Assessment 2026** → View Student Report Cards.
- **Select Students to Showcase:**
  1. **Junior Secondary (Grade 8-A):** `Kasun Malinda Ranasinghe (SCH-2024-001)`
     - Point out the **"REISSUED"** audit watermark indicating an approved post-publication correction.
     - Show subject-wise marks, grades (A/B/C/S/F), aggregate total, and class rank.
  2. **G.C.E. O/L Candidate (Grade 11-A):** `Mohamed Akram Ilham (SCH-2021-001)`
     - Show core subjects (Mathematics, Science, English, Commerce) with O/L grade letters.
  3. **G.C.E. A/L Physical Science (Grade 12-Science):** `Mohamed Irfan Shakaf (SCH-2020-001)`
     - Show stream subjects (Physics, Chemistry, Combined Mathematics).
- **Print Preview:** Click **Print Report Card** to demonstrate the A4 print-ready layout with Kattankudy Central College crest, Principal signature block, and teacher remarks.

### Step 7: Post-Publication Integrity & Audit Trail
- **Action:** In Examinations workspace, open the **Corrections Log** or Audit Trail.
- **Explain the Security Rule:**
  - Once an examination is published, no teacher or administrator can silently change a mark.
  - Demonstrate the formal appeal process:
    - Teacher submits correction request with detailed justification.
    - Principal reviews and approves or rejects.
    - Approved changes create an immutable revision snapshot and automatically mark the report card as **REISSUED** with revision date.

---

## 4. Summary of Value Delivered to KCC

1. **Elimination of Paper Marks Registers:** No manual calculation of totals, averages, or ranks.
2. **Zero Tampering Risk:** Cryptographic audit trail and multi-tier sign-off.
3. **Rapid Report Card Issuance:** Complete terminal reports ready within hours of exam approval instead of weeks.
4. **Parent Transparency:** Instant tracking of chronic absentees and academic performance.

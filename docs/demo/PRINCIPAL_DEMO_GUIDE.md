# KCC SkoolSys 2.0 — Principal Demonstration Guide

**School:** Kattankudy Central College (National School)  
**Target Audience:** Principal (Mr. A.L.M. Mukthar), Vice Principal Academic (Mr. M.I.M. Nawas), Section Heads, and Academic Leadership  
**System Version:** SkoolSys 2.0 MVP  
**Branch:** `feature/mvp-delivery`  
**Demo Environment:** Isolated Local Demonstration Target (`skoolsys_demo.db`)  
**Demo URL:** `http://localhost:5173` (Backend API: `http://localhost:5000`)  
**Safety Notice:** *All student records, parent contact details, staff personas, policies, and examination marks are synthetic demo fixtures. Demonstration approvals do not represent real-world KCC institutional authorization.*

---

## 1. Executive Summary & Demonstration Objectives

The objective of this walkthrough is to demonstrate the operational capabilities of **SkoolSys 2.0 MVP** to school leadership. All demonstration data is culturally authentic, realistic synthetic fixture data representing Kattankudy Central College students and staff across Junior Secondary (Grades 6–9), Senior Secondary (Grades 10–11 G.C.E. O/L), and Collegiate (Grades 12–13 G.C.E. A/L).

### Key Demonstration Themes
1. **Administrative Velocity:** Instant search, unified student dossier profiles, and class allocations.
2. **Attendance Truthfulness:** Daily period registers with real-time absentee contact follow-up.
3. **Academic Integrity:** Multi-tier moderation workflow (Teacher Entry → Section Head Endorsement → Principal Approval & Publication).
4. **Official Certification:** Terminal Report Cards computed deterministically with Sri Lankan grading rules (A/B/C/S/F), aggregate scoring, and class ranks.
5. **Demonstration Safety & Confidentiality:** Strict role-based scoping; unpublished examination marks remain confidential to authorized personnel.

---

## 2. Working Demonstration Accounts

All accounts are available via the quick-login cards on the login screen or by entering credentials manually.

| Role | Username | Password | Demo Persona | Key Responsibilities in Demo |
| :--- | :--- | :--- | :--- | :--- |
| **Principal / Admin** | `admin` | `admin123` | **Mr. A.L.M. Mukthar (Synthetic)** | Full school visibility, policy approvals, exam publishing, report card oversight |
| **VP Academic** | `vp_academic` | `teacher123` | **Mr. M.I.M. Nawas (Synthetic)** | Academic governance, cross-grade supervision, post-pub correction approvals |
| **Section Head (Junior)** | `section_head_junior` | `teacher123` | **Mr. K.L.M. Farook (Synthetic)** | Grades 6–9 moderation, marks review queue endorsement |
| **Section Head (Senior)** | `section_head_senior` | `teacher123` | **Mr. S.H.M. Jameel (Synthetic)** | Grades 10–13 O/L and A/L examination supervision and endorsement |
| **Class Teacher (Grade 8-A)** | `teacher_nimali` | `teacher123` | **Mrs. Nimali Perera (Synthetic)** | Daily attendance register, English marks entry, Grade 8 report cards |
| **Subject Teacher (Math)** | `teacher_samantha` | `teacher123` | **Mr. Samantha Silva (Synthetic)** | Mathematics marks compilation, post-publication correction requests |
| **Subject Teacher (Science)** | `teacher_priya` | `teacher123` | **Ms. Priyanthi Wickramasinghe (Synthetic)** | Science theory and practical marks compilation |
| **Subject Teacher (Commerce)** | `teacher_mansoor` | `teacher123` | **Mr. M.A. Mansoor (Synthetic)** | Grade 11-A Commerce marks compilation |
| **Subject Teacher (A/L Science)** | `teacher_kamal` | `teacher123` | **Mr. Kamal Wickremesooriya (Synthetic)** | Grade 12 Physics & Chemistry marks compilation |

---

## 3. The 10-Step Principal Walkthrough

Follow this step-by-step browser journey to demonstrate the complete MVP:

### Step 1: Login & Executive Dashboard Overview
1. Navigate to `http://localhost:5173/#/login`.
2. Click the **Administrator / Principal** card (`admin` / `admin123`) from the quick-login panel, or enter the credentials manually.
3. Observe the unified dashboard:
   - Active Academic Year: `2026`
   - Total enrolled students across Grades 6, 8, 11 (O/L), and 12 (A/L)
   - 18 Classes and 19 Subjects
   - Quick operational navigation and visual indicators.

### Step 2: Student Search & Real-Time Filtering
1. Click **Student Records** in the navigation bar.
2. In the search box, type `"Kasun"` or `"Akram"` or `"Irfan"`.
3. Notice instantaneous client-side filtering.
4. Filter by grade (e.g., Grade 8 or Grade 11) to demonstrate multi-grade roster organization.

### Step 3: Student Academic & Demographic Profile
1. From the filtered student list, click **Full View** for `Kasun Malinda Ranasinghe (SCH-2024-001)`.
2. Walk through the comprehensive student dossier:
   - Full name, Calling name, Admission number, Class, Roll number
   - Guardian name, relationship, contact telephone numbers (`077...`), and residential address
   - Confirmed subject enrollment badges and attendance statistics.

### Step 4: Classes & Teacher Allocations
1. Click **School Administration** or view class allocations in the navigation menu.
2. Review class listings:
   - Junior Secondary: Grade 6-A, 6-B, 7-A, 7-B, 8-A (Class Teacher: Mrs. Nimali Perera), 8-B, 9-A, 9-B
   - Senior Secondary: Grade 10-A, 10-B, 11-A (Class Teacher: Mr. M.A. Mansoor), 11-B
   - Collegiate Streams: Grade 12-Science (Class Teacher: Mr. Kamal Wickremesooriya), 12-Commerce, 12-Arts
3. Show assigned subject specialist teachers and curriculum offerings.

### Step 5: Daily Attendance Register & Single-Click Recording
1. Click **Attendance** (or **Take Attendance** / **Attendance Reports**) in the navigation bar.
2. Select **Grade 8-A** and choose a date.
3. Demonstrate single-click attendance status toggle: `Present`, `Absent`, `Late`, `Excused`.
4. Point out quick-reason chips (e.g., `Sick leave`, `Bus delayed`, `Chess competition`).
5. Click **Submit Attendance Session** — note instantaneous local update and database recording.

### Step 6: Real-Time Absentee Report & Guardian Follow-Up
1. In the Attendance module, click **Attendance Reports**.
2. Select **Daily Summary** report for a recent date.
3. Review the **Absentee Follow-Up Roster**:
   - Lists all absent students with their parent/guardian names and contact telephone numbers.
   - Enables immediate clerical or administrative follow-up without manual register sorting.

### Step 7: Teacher Marks Entry & Draft Saving (Mid-Year Examination)
1. Log out or switch persona to **Mr. Samantha Silva** (`teacher_samantha` / `teacher123`).
2. Navigate to **Marks Management** → **Marks Entry**.
3. Select **Mid-Year Examination 2026** (Unpublished demonstration), **Grade 8-A**, and **Mathematics**.
4. Enter marks for student rows (e.g. `88` for Present, or click `Medical` for medical exemption).
5. Click **Save Draft** — confirm non-destructive draft save notification and revision increment.

### Step 8: Multi-Tier Moderation & Approval Screens
1. In **Marks Entry**, click **Submit for Review** — note confirmation prompt and transition to `submitted` status.
2. Log out and log in as **Mr. K.L.M. Farook** (`section_head_junior` / `teacher123`).
3. Open **Marks Management** → **Review & Approvals**.
4. Point out the separate unpublished demonstrations in Mid-Year:
   - **History:** `draft` (Teacher Samantha)
   - **English:** `submitted` (Teacher Nimali — ready for section head review)
   - **Science:** `reviewed` (Endorsed by Junior Section Head — awaiting Principal approval)
   - **HPE:** `approved` (Fully signed-off)
5. Review the marks sheet revision audit trail showing tamper-proof provenance.

### Step 9: Official Published Report Cards (Junior, O/L, and A/L)
1. Log in as **Principal / Admin** (`admin` / `admin123`).
2. Navigate to **Student Records** → click **Full View** on `Kasun Malinda Ranasinghe (SCH-2024-001)`.
3. Click **View Full Report Card** to open the terminal report card modal.
4. Point out key elements:
   - **Official Status:** `Official Student Terminal Report Card` (published under Term 1 Assessment 2026).
   - **Policy Scale:** Evaluates under the shared canonical Sri Lankan secondary grading policy (`KCC-SEC-STD-2026-V1`: A: 75+, B: 65+, C: 50+, S: 35+, F: <35).
   - **Post-Publication Provenance:** Notice the **"REISSUED"** audit badge and correction history showing Kasun's Mathematics mark revised from 82 to 85, requested by Teacher Samantha and approved by VP Academic Mr. Nawas via canonical `marksCorrectionService`.
   - **Multi-Grade Verification:** Similar published report cards are available for O/L (`Mohamed Akram Ilham` in Grade 11-A) and A/L (`Mohamed Irfan Shakaf` in Grade 12-Science) with aggregate marks, averages, and class ranks.

### Step 10: Printable A4 Report Card Layout
1. In the open report card modal, click **Print (A4)**.
2. Review the printable layout:
   - Official Kattankudy Central College header
   - Academic Year 2026, Term 1 Official Assessment
   - Student particulars and confirmed subjects table
   - Performance summary: Total Marks, Average Percentage, Class Rank
   - Official sign-off blocks: Class Teacher Signature, Section Head Signature, Principal Signature & School Stamp Block.
3. Demonstrate clean print-optimized layout (`@media print` CSS formatting).

---

## 4. Academic Grading Policy Reference

The system applies the canonical Sri Lankan national assessment grading scale:

| Mark Range | Grade Letter | Label / National Standard |
| :---: | :---: | :--- |
| **75.0 – 100.0%** | **A** | Distinction |
| **65.0 – 74.9%** | **B** | Very Good Pass |
| **50.0 – 64.9%** | **C** | Credit Pass |
| **35.0 – 49.9%** | **S** | Ordinary Pass |
| **0.0 – 34.9%** | **F** | Fail |
| *Absent* | **AB** | Zero mark / Excluded per policy |
| *Medical* | **MED** | Score null; excluded from competition rank |
| *Exempt* | **EX** | Score null; excluded from competition rank |

*Policy Provenance Note:* In the current examination model, policy profiles are associated per examination container (`examinations.assessment_policy_id`). Term 1 Assessment 2026 is published under the approved shared policy profile `KCC-SEC-STD-2026-V1`. Additional profiles (`KCC-OL-STD-2026-V1`, `KCC-AL-STD-2026-V1`, and provisional `KCC-PILOT-2026-V2`) demonstrate policy profile catalog management, versioning, and approval controls.

---

## 5. Safe Demonstration Database Setup & Reset

The system uses an isolated demonstration database (`skoolsys_demo.db`) identified by a positive disposable marker (`_skoolsys_disposable_marker`). **Never manually delete or stamp unknown populated databases.**

To initialize or reset the demonstration data safely:

```powershell
# In PowerShell (at project root):
cd "c:\Users\Mr Zerbug\OneDrive\Apps\Skool Sys\Skool-Sys-test"

# Run safe seed with explicit disposable confirmation flags:
npm --prefix server run seed -- --confirm-seed --allow-disposable-seed

# Start backend (Port 5000) and frontend (Port 5173) if not already active:
npm run dev:server
npm run dev:client
```

---

## 6. Technical Verification & Integrity Summary

- **Automated Browser Walkthrough Rehearsal:** 6/6 steps passing (`demo_principal_walkthrough_rehearsal.test.ts` verifies Login, Student Search, Attendance, Marks, Grade 8 Report Card, and A4 Print button).
- **Automated Regression Suite:** 9/9 regression tests passing (`demo_policy_regression.test.ts` validates 85->A, 67->B, 45->S, and SHA-256 publication audit hash).
- **Automated Examination Browser E2E:** 10/10 browser tests passing (`examination_browser_real.test.ts`).
- **Automated Attendance Browser E2E:** 6/6 browser tests passing (`attendance_browser_real.test.ts`).
- **Automated Backend Test Suite:** 397 unit and integration tests passing across 79 test suites with zero failures.
- **TypeScript Typecheck:** 0 compilation errors across backend and client (`tsc --noEmit`).
- **Production Bundle:** Clean build with `tsc` and `vite build`.
- **Publication Audit:** Authentic SHA-256 digest calculated over immutable snapshot; zero placeholder hashes.
- **Safety Safeguard:** Positive disposable marker protection prevents accidental overwrite of non-demo databases.

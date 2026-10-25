# KCC SkoolSys 2.0 — Principal Demonstration Guide

**School:** Kattankudy Central College (National School)  
**Target Audience:** Principal (Mr. A.L.M. Mukthar), Vice Principal Academic (Mr. M.I.M. Nawas), Section Heads, and Academic Leadership  
**System Version:** SkoolSys 2.0 MVP  
**Branch:** `feature/mvp-delivery`  
**Demo Environment:** Isolated Local Demonstration Target (`skoolsys.db`)  
**Demo URL:** `http://localhost:5173` (Backend API: `http://localhost:5000`)  
**Safety Notice:** *All student records, parent phone numbers, staff appointments, policies, and examination marks are synthetic demo fixtures. Demonstration approvals do not represent real-world KCC institutional authorization.*

---

## 1. Executive Summary & Demonstration Objectives

The objective of this walkthrough is to demonstrate the operational capabilities of **SkoolSys 2.0 MVP** to school leadership. All demonstration data is culturally authentic, realistic synthetic fixture data representing Kattankudy Central College students and staff across Junior Secondary (Grades 6–9), Senior Secondary (Grades 10–11 G.C.E. O/L), and Collegiate (Grades 12–13 G.C.E. A/L).

### Key Demonstration Themes
1. **Administrative Velocity:** Instant search, unified profiles, and class allocations.
2. **Attendance Truthfulness:** Daily period registers with real-time absentee contact follow-up.
3. **Academic Integrity:** Multi-tier moderation workflow (Teacher Entry → Section Head Endorsement → Principal Approval & Publication).
4. **Official Certification:** Terminal Report Cards computed deterministically with Sri Lankan grading rules (A/B/C/S/F), aggregate scoring, and competition rankings.
5. **Demonstration Safety & Confidentiality:** Strict role-based scoping; unpublished examination marks remain confidential to authorized personnel.

---

## 2. Working Demonstration Accounts

All accounts use the local development quick-login panel or manual credentials.

| Role | Username | Password | Demo Persona | Key Responsibilities in Demo |
| :--- | :--- | :--- | :--- | :--- |
| **Principal / Admin** | `admin` | `admin123` | **Mr. A.L.M. Mukthar (Synthetic)** | Full school visibility, policy approvals, exam publishing, final report cards |
| **VP Academic** | `vp_academic` | `teacher123` | **Mr. M.I.M. Nawas (Synthetic)** | Academic governance, cross-grade supervision, curriculum review |
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
1. Navigate to `http://localhost:5173`.
2. Click **Principal / Admin** (`admin` / `admin123`) from the quick-login cards, or type the credentials manually.
3. Observe the unified dashboard:
   - Active Academic Year: `2026`
   - Total enrolled students across Grades 6, 8, 11 (O/L), and 12 (A/L)
   - 18 Classes and 19 Subjects
   - Quick operational navigation and visual indicators.

### Step 2: Student Search & Real-Time Filtering
1. Click **Students** in the navigation bar.
2. In the search box, type `"Kasun"` or `"Akram"` or `"Irfan"`.
3. Notice instantaneous client-side filtering with zero latency.
4. Filter by grade (e.g., select Grade 8 or Grade 11) to demonstrate multi-grade roster organization.

### Step 3: Student Academic & Demographic Profile
1. From the filtered student list, click **View Profile** for `Kasun Malinda Ranasinghe (SCH-2024-001)`.
2. Walk through the student profile:
   - Full name, Calling name, Admission number, Class, Roll number
   - Guardian name, relationship, contact numbers (`077...`), and residential address
   - Positive confirmed subject enrollment badges.

### Step 4: Classes & Teacher Allocations
1. Click **Classes** or **Academic Year Setup** in the navigation menu.
2. Review class listings:
   - Junior Secondary: Grade 6-A, 6-B, 7-A, 7-B, 8-A (Class Teacher: Mrs. Nimali Perera), 8-B, 9-A, 9-B
   - Senior Secondary: Grade 10-A, 10-B, 11-A (Class Teacher: Mr. M.A. Mansoor), 11-B
   - Collegiate Streams: Grade 12-Science (Class Teacher: Mr. Kamal Wickremesooriya), 12-Commerce, 12-Arts
3. Show assigned subject specialist teachers and curriculum offerings in `class_subjects`.

### Step 5: Daily Attendance Register & Single-Click Recording
1. Click **Attendance** in the navigation bar.
2. Select **Grade 8-A** and choose a date (e.g. today or recent October date).
3. Demonstrate single-click attendance status toggle: `Present`, `Absent`, `Late`, `Excused`.
4. Point out quick-reason chips (e.g., `Sick leave`, `Bus delayed`, `Chess competition`).
5. Click **Submit Attendance Session** — note instantaneous local cache and database synchronization.

### Step 6: Real-Time Absentee Report & Guardian Follow-Up
1. In the Attendance module, click the **Reports** tab.
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
5. Review the marks sheet revision audit trail to show tamper-proof provenance.

### Step 9: Official Published Report Cards for Junior, O/L, and A/L
1. Log in as **Principal / Admin** (`admin` / `admin123`).
2. Navigate to **Marks Management** → **Overview & Exams**.
3. Select **Term 1 Assessment 2026** (Officially Published with authentic SHA-256 audit hash).
4. View Student Report Cards across all three national school tiers:
   - **Junior Secondary (Grade 8-A):** `Kasun Malinda Ranasinghe (SCH-2024-001)`
     - Verified subjects: Mathematics (85 - A), Science (72 - B), English (82 - A).
     - Notice the **"REISSUED"** audit watermark reflecting the approved post-publication correction.
   - **G.C.E. O/L Candidate (Grade 11-A):** `Mohamed Akram Ilham (SCH-2021-001)`
     - Verified subjects: Mathematics, Science, English, Commerce.
     - Accurate letter grades (A/B/C/S/F), aggregate score, and class rank.
   - **G.C.E. A/L Physical Science (Grade 12-Science):** `Mohamed Irfan Shakaf (SCH-2020-001)`
     - Verified stream subjects: Physics, Chemistry, Combined Mathematics.
     - Competition rank calculated deterministically under collegiate standard policy.

### Step 10: Printable A4 Report Card Layout
1. On any open report card modal, click **Print Report Card**.
2. Review the printable layout:
   - Kattankudy Central College official header and crest placeholder
   - Academic Year 2026, Term 1 Official Assessment
   - Student particulars and confirmed subjects
   - Performance table: Marks, Percentage, Grade, and Term Rank
   - Official sign-off blocks: Class Teacher Signature, Section Head Signature, Principal Signature & School Stamp Block.
3. Demonstrate clean browser print dialog formatting (`@media print` CSS optimization).

---

## 4. Academic Grading Policy Reference

The system applies canonical Sri Lankan school assessment thresholds:

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

---

## 5. Technical Verification & Integrity Summary

- **Automated Regression Suite:** 397 backend tests passing (`demo_policy_regression.test.ts` validates 85->A, 67->B, 45->S).
- **Automated Browser E2E:** 16 browser tests passing (10 examination workflow + 6 offline attendance tests).
- **TypeScript Typecheck:** Zero errors across backend and client.
- **Production Bundle:** Clean build with `tsc` and `vite build`.
- **Publication Audit:** Authentic SHA-256 digest calculated over immutable snapshot; zero placeholder hashes.
- **Safety Safeguard:** Positive disposable marker protection prevents accidental overwrite of non-demo databases.

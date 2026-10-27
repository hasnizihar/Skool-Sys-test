# KCC SkoolSys 2.0 — Principal Demonstration Guide

**School:** Kattankudy Central College (காத்தான்குடி மத்திய கல்லூரி)  
**Institution Type:** National School, 1AB  
**Census Number:** 14145  
**Address:** No. 322, Beach Road, New Kattankudy 06, Batticaloa District, Eastern Province, Sri Lanka  
**Target Audience:** Principal (Mr. A. L. M. Sabry), Vice Principal Academic (Mr. M.I.M. Nawas), Section Heads, and Academic Leadership  
**System Version:** SkoolSys 2.0 MVP  
**Branch:** `feature/mvp-delivery`  
**Demo Environment:** Isolated Local Demonstration Target (`server/skoolsys_demo.db`)  
**Demo URL:** `http://localhost:5173` (Backend API: `http://localhost:5000`)  
**Implementation Contacts:** Amanullah and Hasni Zihar — SkoolSys Development Team (*Software developers, not appointed school personnel*)

> [!IMPORTANT]
> **Principal Identity & Spelling Confirmation Note:**  
> The project owner has provided the Principal's name as **Mr. A. L. M. Sabry**. Public administrative and zonal records exhibit slight variations in initials and romanization (e.g., *"A. L. Sabry"*, *"L. M. Sabri"*). The exact formal spelling must be confirmed directly with school leadership prior to printing official stationery, certificates, or external correspondence.  
> The demonstration login is designated as **Principal — Demo Account**, and the Principal's name is rendered as institutional profile information rather than claiming the real Principal personally authored synthetic marks.

> [!NOTE]
> **Demonstration Data Disclaimer:**  
> All student records, admission numbers, parent contact details, marks, and staff personas are 100% synthetic demonstration fixtures. All demonstration students are boys, consistent with the school's classification as a Boys' school in Ministry of Education national-school records. No genuine student, guardian, or faculty PII has been collected or loaded.

---

## 1. Executive Summary & Demonstration Objectives

The objective of this walkthrough is to demonstrate the operational capabilities of **SkoolSys 2.0 MVP** to school leadership. The demonstration data represents **220 synthetic boy students** distributed across Junior Secondary (Grades 6–9), Senior Secondary (Grades 10–11 G.C.E. O/L), and Collegiate (Grades 12–13 G.C.E. A/L Science, Commerce, and Arts streams).

### Key Demonstration Themes
1. **Institutional Alignment:** Grounded Kattankudy Central College branding, Tamil font rendering, and census metadata.
2. **Administrative Velocity:** Instant search, unified student dossier profiles, and class allocations across 18 classes.
3. **Attendance Truthfulness:** Period attendance registers with real-time absentee contact follow-up rosters.
4. **Academic Integrity:** Multi-tier moderation workflow (Teacher Entry → Section Head Endorsement → Principal Approval & Publication).
5. **Segregation of Duties:** IT Administrators maintain system operations but possess no academic examination authority.
6. **Official Certification:** Terminal Report Cards computed deterministically with Sri Lankan grading rules (A/B/C/S/F), aggregate scoring, and class ranks, stamped with demonstration watermarks.

---

## 2. Working Demonstration Accounts

All accounts can be accessed via the quick-login cards on the login screen (in dev/demo mode) or by entering credentials manually.

| Role | Username | Password | Demo Persona | Key Responsibilities in Demo |
| :--- | :--- | :--- | :--- | :--- |
| **Principal — Demo Account** | `admin` | `admin123` | **Mr. A. L. M. Sabry (Profile Info)** | Executive dashboard, school overview, exam publishing, report card oversight |
| **VP Academic** | `vp_academic` | `teacher123` | **Mr. M.I.M. Nawas (Synthetic)** | Academic governance, cross-grade supervision, post-pub correction approvals |
| **Section Head (Junior 6–9)** | `section_head_junior` | `teacher123` | **Mr. K.L.M. Farook (Synthetic)** | Grades 6–9 moderation, marks review queue endorsement |
| **Section Head (Senior 10–13)** | `section_head_senior` | `teacher123` | **Mr. S.H.M. Jameel (Synthetic)** | Grades 10–13 O/L and A/L examination supervision and endorsement |
| **IT Administrator** | `it_admin` | `admin123` | **Demo IT Admin (Synthetic)** | System administration and audit log monitoring; **No academic mark permissions** |
| **Class Teacher (Grade 8-A)** | `teacher_nimali` | `teacher123` | **Mrs. Nimali Perera (Synthetic)** | Daily attendance register, English marks entry, Grade 8 report cards |
| **Subject Teacher (Math)** | `teacher_samantha` | `teacher123` | **Mr. Samantha Silva (Synthetic)** | Mathematics marks compilation, post-publication correction requests |
| **Subject Teacher (Science & ICT)** | `teacher_priya` | `teacher123` | **Ms. Priyanthi Wickramasinghe (Synthetic)** | Science theory and practical marks compilation |
| **Subject Teacher (Commerce)** | `teacher_mansoor` | `teacher123` | **Mr. M.A. Mansoor (Synthetic)** | Grade 11-A Commerce marks compilation |
| **Subject Teacher (A/L Science)** | `teacher_kamal` | `teacher123` | **Mr. Kamal Wickremesooriya (Synthetic)** | Grade 12 Physics & Chemistry marks compilation |

---

## 3. The 14-Step Principal Walkthrough

Follow this step-by-step browser journey to demonstrate the complete MVP:

### Step 1: Institutional Login & Branding Verification
1. Navigate to `http://localhost:5173/#/login`.
2. Verify the institutional branding:
   - School English Name: **Kattankudy Central College**
   - Tamil Name: **காத்தான்குடி மத்திய கல்லூரி**
   - Census Number: **14145**
   - System Identifier: **SkoolSys 2.0 — School Management System**

### Step 2: Authenticate as Principal
1. Log in using `admin` / `admin123` (or click **Principal — Demo Account** on the quick-login panel).
2. Confirm session creation and transition to the executive workspace.

### Step 3: Executive Dashboard & School Overview KPIs
1. Observe the top KPI summary cards:
   - **Total Enrolled Students:** 220 active students across Grades 6–13
   - **Active School Classes:** 18 classes (Junior 6-9, O/L 10-11, Collegiate 12-13)
   - **Daily Attendance Register Status:** Today's register submission progress
   - **Active Academic Year:** Current Year `2026` • Term 1 Assessment Period (grounded from backend)
   - **Connection State:** Grounded health check (`/api/health`)

### Step 4: Student Records Search & Real-Time Filtering
1. Click **Student Records** in the sidebar navigation.
2. In the search box, type `"Kasun"`. Verify that `Kasun Malinda Ranasinghe` in Grade 8-A appears immediately.
3. Clear search and type admission number `"SCH-2024-001"`. Verify exact matching.
4. Filter by grade (e.g., Grade 8, Grade 11, or Grade 12) to inspect multi-grade roster organization.

### Step 5: Full Student Dossier & Profile View
1. Click **Full View** on `Kasun Malinda Ranasinghe (SCH-2024-001)`.
2. Inspect the student dossier:
   - Calling name, date of birth, gender (Male), admission date
   - Residential address (e.g., Beach Road, New Kattankudy 06)
   - Guardian details: Sunil Ranasinghe (Father), telephone (`0771234567`), emergency contact.

### Step 6: Class & Subject Allocations
1. Within the student profile, observe confirmed subject enrollment badges:
   - Core subjects (Mathematics, Science, English, Tamil Language, History)
   - Religion (Islam / Buddhism) and Aesthetic / Practical modules.
2. Verify class homeroom allocation (Grade 8-A, Class Teacher: Mrs. Nimali Perera).

### Step 7: Daily Attendance Register
1. Click **Attendance** in the sidebar navigation.
2. Select **Grade 8-A** and choose a date.
3. Review the register status: `Present`, `Absent`, `Late`, `Excused`.
4. Point out quick-reason chips (e.g., `Medical`, `Family Emergency`, `School Activity`).

### Step 8: Absentee Report & Guardian Follow-Up
1. In the Attendance module, click **Attendance Reports**.
2. Select **Daily Summary** report.
3. Review the **Absentee Follow-Up Directory**:
   - Lists all absent students with parent/guardian names and contact telephone numbers (`077...`).
   - Demonstrates instant telephone reachability for morning attendance inquiries.

### Step 9: Examination Workspace & Lifecycle
1. Click **Examinations** in the sidebar navigation.
2. Review the 3 seeded examinations across lifecycle stages:
   - **Term 1 Assessment 2026:** Fully approved, canonically published, with authentic SHA-256 snapshot digest.
   - **Mid-Year Examination 2026:** Scheduled / active in moderation.
   - **Year-End Examination 2026:** Draft stage.

### Step 10: Multi-Tier Moderation States
1. Inspect the marks sheets under **Mid-Year Examination 2026**:
   - `draft` (Mathematics — assigned teacher editing)
   - `submitted` (English — submitted by teacher, awaiting section head)
   - `reviewed` (Science — endorsed by Section Head, ready for Principal)
   - `approved` (Health & Physical Education — signed off)
2. Note that unpublished marks remain strictly confidential and cannot be viewed by unauthorized staff.

### Step 11: Published Terminal Report Card
1. Navigate back to **Student Records** → **Kasun Malinda Ranasinghe**.
2. Click **View Full Report Card** (Term 1 Assessment 2026).
3. Verify report card components:
   - Prominent watermark: `⚠️ DEMONSTRATION — NOT AN OFFICIAL SCHOOL RESULT`
   - Kattankudy Central College Tamil and English header
   - Subject breakdown: Score, Max Score, Grade Letter (A/B/C/S/F), and Teacher Remarks
   - Summary statistics: Aggregate marks, percentage average, and class rank.

### Step 12: Auditable Post-Publication Correction (REISSUED)
1. Point out the **"REISSUED"** audit badge on Kasun's report card.
2. Review the correction history:
   - Mathematics mark revised from `82.0` to `85.0` (Distinction A)
   - Reason: Clerical tabulation error in paper 2
   - Authorized by VP Academic Mr. Nawas via canonical `marksCorrectionService`.

### Step 13: Printable A4 Report Card Layout
1. In the report card modal, click **Print (A4)**.
2. Verify that the printable sheet renders with standard A4 margins, crisp typography, official sign-off signatures (`Mr. A. L. M. Sabry / Principal`), and school seal block.

### Step 14: Sign Out & Session Security Protection
1. Click the **Sign Out** button in the top navigation bar.
2. Confirm session termination: browser token is purged from `localStorage`.
3. Attempting to navigate directly to `/#/attendance` or `/#/marks` redirects cleanly to `/#/login`.

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

*Policy Provenance Note:* Assessment policy profiles are configured per examination (`examinations.assessment_policy_id`). Term 1 Assessment 2026 is published under the approved shared policy profile `KCC-SEC-STD-2026-V1`. Additional profiles (`KCC-OL-STD-2026-V1`, `KCC-AL-STD-2026-V1`, and provisional `KCC-PILOT-2026-V2`) demonstrate policy versioning and catalog controls.

---

## 5. Safe Demonstration Database Setup & Relaunch

The system uses an isolated demonstration database target (`server/skoolsys_demo.db`) identified by a positive disposable marker table (`_skoolsys_disposable_marker`). Non-disposable databases and production targets are strictly protected from accidental overwrite.

To safely initialize or reset the demonstration data:

```powershell
# In PowerShell (at project root):
cd "c:\Users\Mr Zerbug\OneDrive\Apps\Skool Sys\Skool-Sys-test"

# Run safe seed with explicit disposable confirmation flags:
npm --prefix server run seed -- --confirm-seed --allow-disposable-seed

# Start backend server (Port 5000):
npm run dev:server

# In a separate terminal, start frontend dev server (Port 5173):
npm run dev:client
```

---

## 6. Technical Verification Summary

- **Automated Principal Browser Rehearsal:** 12/12 steps passing (`principal_walkthrough_browser_real.test.ts` validates Login, Dashboard, Student Search, Dossier, Attendance, Reports, Exam Moderation, Report Card, A4 Print layout, Sign Out, and Mobile Responsive 375px).
- **Automated Backend Regression Suite:** 397/397 unit & integration tests passing across 79 test suites (`npm test`).
- **Policy Regression Suite:** 9/9 tests passing (`demo_policy_regression.test.ts` validates grading thresholds, publication SHA-256 hash, and correction integrity).
- **TypeScript Typecheck:** 0 errors (`npm --prefix server run typecheck`).
- **Production Bundle:** Clean Vite build (`npm --prefix client run build`).
- **Disposable Guard:** Multi-check validation prevents accidental resets against any unverified database.

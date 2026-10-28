# Pre-Implementation Audit: Milestone 5 — Marks Management & Grading Workspace

**Project:** SkoolSys 2.0 UI/UX Modernization  
**Milestone:** 5 — Marks Management & Grading Workspace  
**Branch:** `feature/ui-ux-v2-redesign`  
**Date:** 2026-10-28  
**Scope:** Client-side only. Non-destructive modernization of `client/src/pages/MarksEntry.tsx` accompanied by dedicated stylesheet `client/src/pages/marksEntry.css`. Zero backend API changes, zero database schema modifications.

---

## 1. Executive Summary & Objective

Milestone 5 focuses on transforming the **Examination Management & Marks Grading Workspace** into a high-productivity, keyboard-driven desktop spreadsheet grid and touch-optimized mobile experience, while preserving:
- All 7 workspace tabs (`Overview & Exams`, `Schedules`, `Marks Entry`, `Review & Approvals`, `Assessment Policies`, `Publication & Release`, `Post-Publication Corrections`).
- The Sri Lankan Ministry of Education separation-of-duties lifecycle (`Draft` &rarr; `Submitted for Review` &rarr; `Approved by Leadership` &rarr; `Published & Cryptographically Sealed`).
- All 10 Playwright E2E browser tests in `server/test/examination_browser_real.test.ts` and all 397 backend unit tests.

---

## 2. Playwright E2E Test Invariants & Critical Selectors

From auditing `server/test/examination_browser_real.test.ts`, the following selectors, texts, attributes, and behaviors are strictly asserted and **must never be altered or broken**:

| Test Phase | Required Element / Selector / Text | Purpose / Assertion |
| :--- | :--- | :--- |
| **Workspace Navigation** | `h2:has-text("Examination Management Workspace")` | Confirms landing on the marks management workspace |
| **Appointment Badges** | `.badge` containing `Administrator` or `Principal` | Confirms user role and permissions badges |
| **Workspace Tabs** | Exactly 7 buttons matching `.workspace-tab-btn` | Tab buttons: `Overview & Exams`, `Schedules`, `Marks Entry`, `Review & Approvals`, `Assessment Policies`, `Publication & Release`, `Post-Publication Corrections` |
| **Overview & Filters** | `.data-table`, `input[placeholder*="Search title"]` | Renders exams like `Term 1 Assessment 2026` and `Mid-Year Examination 2026`; search filters table live |
| **Schedules** | `button:has-text("Add Subject Offering")` | Adds a class-subject offering to an exam schedule |
| **Marks Selectors** | `#marks-exam-select`, `#marks-class-select`, `#marks-subject-select` | Exact element IDs for exam, class, and subject dropdowns |
| **Marks Spreadsheet** | `.data-table tbody tr` | Renders enrolled student rows (e.g. `Kasun Malinda Ranasinghe`, `SCH-2024-001`) |
| **Score Input** | `input[placeholder="0–100"]` (or matching `placeholder*="100"`) | Raw score numeric input for each student row |
| **Assessment Status** | `button:has-text("Medical"), button:has-text("Med")`, `button:has-text("Present")` | Status buttons. Medical clears/disables score (null in SQLite). Must carry active class when selected |
| **Report Card Modal** | `button:has-text("Report Card")` | Opens `.side-panel-right` containing `.print-report-card` |
| **Sheet Actions** | `button:has-text("Save Draft")`, `button:has-text("Submit for Review")` | Triggers draft save and lifecycle submission to server |
| **Lifecycle Badge** | `.badge:has-text("submitted"), .badge:has-text("SUBMITTED")` | Confirms transition to submitted state |
| **Review Queue** | `text: "Independent Marks Review & Approval Queue"` | Header on the review tab |
| **Revision Audit** | `.data-table button[title="View Revision Audit Trail"]` | Opens `.modal-content` showing `Marks Sheet Revision History & Provenance` |
| **Corrections Target** | `select.form-select` with option `Term 1` | Published exam selection |
| **Request Correction** | `button:has-text("Request Mark Correction")` | Opens modal |
| **Authoritative Mark** | `:has-text("Authoritative Published Mark (Verified)")` | Live verification card before correction request |
| **Correction Submit** | `modal-footer button[type="submit"]` or `button:has-text("Submit Correction Request")` | Submits correction request |

---

## 3. UI/UX Shortcomings in Current `MarksEntry.tsx`

1. **Spreadsheet Productivity & Keyboard Support:**
   - Entering marks for 35–45 students currently requires manual mouse clicks between table rows.
   - Teachers cannot use `ArrowDown` or `Enter` to rapidly tab down the score column.
   - Arrow keys (`ArrowLeft` / `ArrowRight`) do not switch between assessment statuses (`Present`, `Absent`, `Medical`, `Exempt`).
2. **Mobile Usability (< 768px):**
   - The desktop table horizontally overflows on mobile screens with scroll fatigue.
   - Teachers grading on smartphones need a dedicated **Single-Student Stepper Card** mode (large name, admission badge, big numeric score input, large status tap targets, and Previous/Next buttons).
3. **Visual Hierarchy & State Clarity:**
   - Workspace tabs use plain borders with insufficient active contrast.
   - Summary cards lack dynamic grade distribution bars (counts of `A`, `B`, `C`, `S`, `F`).
   - Examination lifecycle progress lacks an interactive phase stepper (`Draft` &rarr; `Scheduled` &rarr; `Marking Open` &rarr; `Under Moderation` &rarr; `Published`).
4. **Validation Feedback:**
   - If an entered score exceeds `sheetMaxScore`, validation is not visually immediate on the cell; an inline tooltip or border highlight is needed.

---

## 4. Planned Modernization Architecture

### 4.1. Dedicated Stylesheet: `client/src/pages/marksEntry.css`
A modular CSS file containing:
- `.marks-workspace`: Container layout with consistent spacing and responsive paddings.
- `.workspace-tab-nav`: Modern tab bar with scrollable pills, active indicator line, and counter badges.
- `.exam-lifecycle-stepper`: 5-step visual progress trail (`Plan` &rarr; `Schedules` &rarr; `Marking` &rarr; `Review` &rarr; `Published`).
- `.marks-spreadsheet-container`: Sticky table headers, frozen column styling for Roll/Admission/Name, cell focus rings, and grade badge colors (`.grade-pill-a`, `.grade-pill-b`, etc.).
- `.mobile-stepper-card`: Full-width touch card for viewports `< 768px` with 48px touch targets, quick score increment/decrement, and swipe or button navigation between students.
- `.stats-drawer`: Grade distribution visualization and pass/fail summary metrics.

### 4.2. Keyboard Navigation Engine in `MarksEntry.tsx`
- `ref` map for score input elements indexed by `student_id`.
- `onKeyDown` handler:
  - `ArrowDown` or `Enter`: Focuses next student row's score input.
  - `ArrowUp`: Focuses previous student row's score input.
  - `Alt+P` / `Alt+A` / `Alt+M` / `Alt+E`: Sets status to Present, Absent, Medical, Exempt for focused student.
- Immediate boundary validation: If `score > sheetMaxScore`, marks input with `.input-error` class and shows immediate tooltip.

### 4.3. Mobile Stepper Mode (< 768px)
- Detect viewport `< 768px` or provide an explicit toggle `[Grid View | Stepper View]`.
- Stepper view shows current student index (e.g., `Student 5 of 38`), student details, large numeric input, 4 big status buttons, live grade pill, and prominent `Previous` / `Next` buttons.

---

## 5. Verification & Safety Safeguards
- Zero changes to backend files (`server/src/**`).
- Verification checklist:
  1. `npm.cmd --prefix client run lint` &rarr; 0 errors.
  2. `npm.cmd --prefix client run build` &rarr; Clean build.
  3. `npm.cmd --prefix server run test` &rarr; 397/397 tests pass.
  4. `npm.cmd --prefix server run test:browser` &rarr; 28/28 Playwright tests pass (including PR-005 Gate 5 tests 1–10).
  5. 4 Visual screenshots captured via Playwright:
     - `milestone5_marks_spreadsheet_desktop.png`
     - `milestone5_marks_mobile_stepper.png`
     - `milestone5_review_queue.png`
     - `milestone5_publication_ceremony.png`


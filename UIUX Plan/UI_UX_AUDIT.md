# SkoolSys 2.0 — Comprehensive UI/UX Audit Report

**Project:** SkoolSys School Management System (Kattankudy Central College MVP)  
**Audit Date:** October 2026  
**Auditor:** Antigravity UI/UX & Architecture Team  
**Scope:** Complete Frontend Codebase (`client/src/`), Design System (`design-system/skoolsys/`), API Contracts & Storage Subsystems.

---

## 1. Executive Summary

SkoolSys has a remarkably robust, feature-complete frontend and offline-capable backend covering attendance, student demographics, examinations, moderation policies, and administrative audits. However, the existing user interface suffers from:
1. **Visual System Mismatch:** The current CSS uses deep indigo (`#4338ca`) and amber (`#d97706`), whereas the school's actual identity and approved redesign brief specifies an institutional green (`#026536`) and school gold/yellow (`#F1EF22`) with clean neutral canvas surfaces (`#F8FAF9`).
2. **Monolithic CSS Architecture:** Styles are packed into a single 1,218-line `index.css` file with ad-hoc page-specific classes, making modular upgrades and isolation difficult.
3. **Information Density & Clutter:** Desktop screens are data-dense without sufficient visual breathing room. Mobile viewports suffer from compressed table layouts and overcrowded action bars.
4. **Attendance Mobile Ergonomics:** The attendance register is functional but requires horizontal scrolling or small touch buttons on mobile viewports (< 400px), violating the under-90-seconds target.
5. **Component Duplication:** Modal dialogs, tables, filter bars, and status badges are repeatedly reimplemented across `Students.tsx`, `Attendance.tsx`, `MarksEntry.tsx`, and `AdminSettings.tsx`.

---

## 2. Frontend Architecture Inventory

### 2.1 Technology Stack
- **Framework:** React 19.2.8 (`react`, `react-dom`)
- **Language:** TypeScript 6.0.2 / 5.7.2
- **Build Tool:** Vite 8.3.4 (with `@vitejs/plugin-react`)
- **Icons:** `lucide-react` (v1.59.0)
- **Styling:** Vanilla CSS Custom Properties (CSS variables) in `index.css` and `App.css`
- **State & Routing:** Hash-based routing (`window.location.hash`) inside `App.tsx`; component-level state via `useState`/`useEffect`.
- **Client Storage:** Browser IndexedDB (`skoolsys_offline_db`) via custom transaction wrapper in `api/offlineQueue.ts`.

### 2.2 Screen & Page Inventory

| File Path | Lines | Size (Bytes) | Role Access | Primary Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `src/pages/Login.tsx` | 613 | 22.2 KB | Public / All | Authentication, role switching (demo mode), institutional badge |
| `src/pages/Dashboard.tsx` | 541 | 21.8 KB | All Roles | Overview KPIs, attendance progress, recent activity |
| `src/pages/Attendance.tsx` | 1,411 | 58.4 KB | Class Teacher, Admin | Daily register marking, P/A/L/E buttons, offline queueing, conflict diffs |
| `src/pages/AttendanceReports.tsx` | 501 | 20.2 KB | All Teachers, Admin | Daily class-by-class summary, Absentee phone directory, Monthly matrix |
| `src/pages/Students.tsx` | 931 | 36.8 KB | All Roles (Read), Admin (Write) | Student directory, search/filters, CSV bulk import, Add student modal |
| `src/pages/StudentFullView.tsx` | 893 | 37.8 KB | All Roles | Comprehensive dossier: Demographics, Guardian, Attendance, Exam History |
| `src/pages/MarksEntry.tsx` | 3,239 | 146.7 KB | Teachers, VP, Principal, Admin | 7 workspaces: Overview, Schedules, Entry grid, Review, Policies, Publication, Corrections |
| `src/pages/StudentReportCard.tsx` | 620 | 26.3 KB | All Roles | Official printable A4 terminal report card with seal and SHA-256 audit watermark |
| `src/pages/AdminSettings.tsx` | 653 | 26.4 KB | Admin only | User accounts, class/subject assignments, database backup/restore, demo reset |
| `src/pages/AuditLogs.tsx` | 179 | 6.9 KB | Admin only | Tamper-evident system activity log viewer |

### 2.3 Shared Layout Components
- `src/components/Sidebar.tsx` (200 lines): Desktop sidebar + mobile backdrop overlay. Contains brand header, sectioned links, theme toggle, user avatar, logout.
- `src/components/Navbar.tsx` (261 lines): Breadcrumb title, server connectivity pill (`/api/health`), academic year/term indicator, date display.
- `src/components/OfflineBanner.tsx` (785 lines): Sync queue counter, manual "Sync Now" button, quarantine manager, conflict resolution and stale-entry modal.

---

## 3. Screen-by-Screen Detailed UX Audit

### 3.1 Login Screen (`src/pages/Login.tsx`)
- **Current Strengths:** Rich demo credentials switcher with roles (Principal, VP, Section Heads, Teachers); password visibility toggle; institutional Tamil and English subtitle.
- **Identified Issues:**
  1. *Demo accounts dominate the layout:* Demo tiles take up > 60% of vertical height, pushing standard login below the fold on mobile.
  2. *Production Leak Risk:* `DEMO_ACCOUNTS` must be strictly conditional on `import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true'`.
  3. *Form Visual Polish:* Inputs lack floating labels or clean icon adornments; error messages appear as harsh plain blocks rather than friendly inline banners.

### 3.2 Navigation & Application Shell (`Sidebar.tsx`, `Navbar.tsx`, `App.tsx`)
- **Current Strengths:** Smooth hash-based routing (`#/attendance`, `#/marks`); responsive sidebar with overlay backdrop; live `/api/health` heartbeat check.
- **Identified Issues:**
  1. *No Persistent Sync Pill in Navbar:* While `Navbar.tsx` checks server connectivity, the actual sync queue status (e.g., "3 pending records") is buried in `OfflineBanner.tsx` below the navbar. A global sync chip in the navbar header is needed.
  2. *Sidebar Collapse:* Desktop sidebar does not support an icon-only collapsed state (64px width); it is either 250px full width or hidden behind a toggle.
  3. *Mobile Tab Bar Missing:* On mobile (< 768px), navigation relies entirely on opening the hamburger drawer. Teachers taking attendance with one hand need a bottom tab bar (Home, Attendance, Marks, Directory, More).

### 3.3 Daily Attendance Register (`src/pages/Attendance.tsx`)
- **Current Strengths:** Outstanding offline architecture, optimistic UI, Colombo timezone consistency, per-student remarks, and detailed conflict diffing.
- **Identified Issues:**
  1. *Segmented Button Touch Targets:* The four buttons `[P] [A] [L] [E]` are placed inline on each student row. On screens < 380px, they shrink below 36px width, causing mis-taps.
  2. *Sticky Header Visibility:* The summary counter bar (Enrolled, Present, Absent, Late, Excused) scrolls off-screen on mobile, leaving the teacher without real-time tally visibility.
  3. *Unsaved vs. Saved vs. Synced State Confusion:* When a teacher marks a student, the register marks the session dirty, but teachers often wonder: *"Is this saved on my phone? Is it submitted to the principal?"* Visual status chips must be crystal clear.
  4. *Quick Bulk Actions:* "Mark All Present" requires clicking a dropdown or secondary button; it should be prominent with an instant 5-second undo toast.

### 3.4 Student Directory & Profile (`Students.tsx`, `StudentFullView.tsx`)
- **Current Strengths:** Filter by grade, class, and status; modal for adding students with guardian details; comprehensive full profile view with attendance ring and marks list.
- **Identified Issues:**
  1. *Wide Table Overflow on Mobile:* The student table has 8 columns (Admission No, Name, Calling Name, Grade, Class, Gender, Status, Actions) forcing wide horizontal scroll on phones. Mobile needs responsive student cards.
  2. *CSV Import Stepper Absence:* CSV import is currently a raw textarea paste. A structured 4-step wizard (Upload CSV -> Map Columns -> Validation Preview -> Confirm) is required for usability.
  3. *Modal Stacking:* Opening "Full View" from "Students" opens a full-screen overlay, inside which opening "Edit" or "Report Card" opens a third modal layer.

### 3.5 Marks Management (`src/pages/MarksEntry.tsx`)
- **Current Strengths:** Industry-grade exam lifecycle (Schedules, Policies, Moderation, Publication SHA-256 fingerprint, Corrections). Handles Grade 6-13 policy variations, dynamic max scores, and automated grading.
- **Identified Issues:**
  1. *Desktop Keyboard Navigation:* Excel-like navigation (Arrow Up/Down/Left/Right, Enter to advance) is partially implemented but cell focus management is fragile when typing quickly.
  2. *Mobile Experience:* The marks spreadsheet table is completely unusable on phones (< 500px). Mobile needs a "One Student Card at a Time" stepper mode with a numeric keypad.
  3. *Horizontal Scroll Pinning:* Student admission numbers and calling names should stay frozen (sticky `left: 0`) while scrolling through exam components.

### 3.6 Printable Report Cards (`src/pages/StudentReportCard.tsx`)
- **Current Strengths:** Authentic Sri Lankan National School terminal report card layout; Tamil & English bilingual crest; official grading scale; principal signature section.
- **Identified Issues:**
  1. *Print Stylesheet Gaps:* `@media print` rules occasionally trigger unwanted page breaks between marks table and signature box on certain printer drivers.
  2. *Batch Printing:* Teachers must open student profiles individually to print; a batch "Print Entire Class Register" workflow is needed.

### 3.7 Administration & Audit (`AdminSettings.tsx`, `AuditLogs.tsx`)
- **Current Strengths:** Role-based access enforcement, teacher class/subject assignment, database backup/restore.
- **Identified Issues:**
  1. *Destructive Actions Proximity:* "Restore Database" and "Reset Demo Data" are close to routine actions. They must be moved to an isolated "Danger Zone" requiring typed confirmation.
  2. *Audit Log Inspection:* Long JSON payload strings wrap awkwardly in table cells; need an expandable drawer or syntax-highlighted inspector modal.

---

## 4. Accessibility & Responsiveness Assessment

### 4.1 WCAG 2.2 AA Compliance
- **Contrast Ratios:** Main text on canvas achieves > 9:1. However, muted text (`#64748b`) on subtle gray backgrounds (`#f1f5f9`) dips to 3.8:1 in some secondary labels.
- **Keyboard Navigation:** Tab order is mostly logical, but custom segmented controls in the attendance register lack complete `aria-pressed`, `role="group"`, and arrow-key focus management.
- **Focus Rings:** Browser default focus outlines are suppressed in some CSS reset blocks without being consistently replaced by high-contrast `--border-focus` rings.
- **Motion:** `prefers-reduced-motion` media queries are missing for modal animations and slide transitions.

### 4.2 Responsive Breakpoint Gaps
- **320px–375px (Small Mobile):** Tables cause horizontal layout blowout. Segmented attendance buttons wrap awkwardly.
- **768px (Tablet Portrait):** Sidebar overlay appears, but table columns are too tight.
- **1024px (Laptop):** Optimum layout today.
- **1440px+ (Ultra-wide Desktop):** Content stretches without max-width containers, leaving excessive white space in dashboard cards.

---

## 5. Offline Queue & Synchronization Diagnostics

The offline subsystem in `client/src/api/offlineQueue.ts` is technologically sound:
- Dedicated IndexedDB stores (`attendance_mutations`, `roster_cache`).
- SHA-256 client mutation idempotency keys.
- Server-side optimistic locking with `base_revision`.
- Stale mutation detection (> 7 days).

**UX Deficiencies:**
- When a user is offline and submits a register, the notification says *"Saved to offline queue"*, but the register itself doesn't show a persistent watermark or header badge indicating that the session is in a *locally stored* state awaiting server confirmation.
- Conflict diff modal (`buildStudentDiffList`) is text-heavy and intimidating to non-technical teachers. It needs a clear side-by-side card visualizer ("Your Phone vs. School Server").

---

## 6. Actionable Audit Recommendations

1. **Adopt School-Inspired Green & Gold Palette:** Re-anchor `--primary` to `#026536` and `--accent` to `#F1EF22` with `#F8FAF9` neutral background.
2. **Modularize Design System:** Extract `index.css` into atomic CSS components (`ui/buttons.css`, `ui/inputs.css`, `ui/tables.css`, `ui/attendance.css`, `ui/modals.css`).
3. **Build Persistent Sync Header Pill:** Move sync status into the global `Navbar` with instant drawer expansion.
4. **Implement Mobile Tab Navigation:** Introduce a bottom navigation bar for screens under 768px.
5. **Mobile-First Attendance Register:** Redesign attendance row into high-contrast 48px touch targets, sticky progress bar, and instant undo toast.
6. **Card-Based Mobile Marks Entry:** Provide an alternate single-student card view for marks entry on mobile devices.
7. **Batch Report Card Printing:** Provide one-click class-wide PDF/print generation.
8. **Isolate Administration Danger Zone:** Require explicit text confirmation (e.g. `CONFIRM`) before any database wipe or restore.

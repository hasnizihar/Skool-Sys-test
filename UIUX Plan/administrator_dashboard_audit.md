# Administrator Dashboard Audit & Improvement Plan

**Project:** SkoolSys 2.0 UI/UX Modernization  
**Scope:** Administrator Dashboard Only  
**Branch:** `feature/ui-ux-v2-redesign`  
**Date:** 2026-10-28  
**Author:** Antigravity Full-Stack & QA Engineering  

---

## 1. Executive Summary & Baseline Status

This audit evaluates the **Administrator Dashboard** within `client/src/pages/Dashboard.tsx` and `client/src/pages/dashboard.css` against:
- `UIUX Plan/SCREEN_SPECIFICATIONS.md` (Screen 02: Administrator / Principal Dashboard)
- `UIUX Plan/DESIGN_SYSTEM.md` (WCAG 2.2 AA Contrast, Green `#026536`, Gold `#F1EF22`)
- Existing backend API contracts and database schema (`server/src/routes/admin.ts`, `attendance.ts`, `academic.ts`)
- The verified baseline established at commit `1507de7`:
  - Frontend Lint: `oxlint` 0 errors, 71 warnings (all existing in other modules)
  - Frontend Build: `tsc -b && vite build` passing (0 errors, 206ms build time)
  - Backend Unit Tests: **397 / 397 passing** across 27 suites
  - Browser E2E Tests: **28 / 28 passing** across 3 suites, including Step 3 of `principal_walkthrough_browser_real.test.ts`

The objective is to refine the Administrator Dashboard into a mission-critical, high-density institutional operations surface with zero backend mutations, zero data fabrication, and complete adherence to authorized data sources.

---

## 2. Comprehensive Audit Matrix

| Area | Existing Implementation | Gap or Defect | Evidence | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **Header & Framing** | Greets faculty member by name; displays academic year, civil date, school census info, and preview switcher. | Greeting pushes high-priority school information below the fold; lacks explicit data freshness indicator and administrative status descriptor. | `Dashboard.tsx` lines 270–305 | Restructure header into an authoritative "School Operations Overview", retain civil date and school profile, add data freshness indicator, and streamline administrative quick action buttons. |
| **KPI Cards** | 4 Bento cards: Total Enrolled Students, Today's Attendance Rate, Active School Classes, Registers Submitted Today. | Missing Teaching Staff on Duty metric specified in Screen 02; lacks breakdown by gender/stream for enrollment; active classes card lacks division breakdown. | `Dashboard.tsx` lines 390–475; `SCREEN_SPECIFICATIONS.md` Section 2 | Integrate `api.getUsers()` to surface real Teaching Staff on Duty; enrich Enrolled Students card with active census breakdown; preserve `.stat-card`, `Total Enrolled Students`, and `Active School Classes` invariants. |
| **Attendance Overview** | Summarizes present/absent numbers in KPI 2 trend pill; shows submission count in KPI 4. | Lacks an aggregated institutional roll-call breakdown (Present, Absent, Late, Excused) before diving into individual classes. | `attendance.ts` lines 224–243 (`dailyReport` returns `present_count`, `absent_count`, `late_count`, `excused_count`) | Add an institutional attendance breakdown bar summarizing total Present, Absent, Late, and Excused counts across all recorded sessions today. |
| **Class Monitoring Matrix** | Dynamic table listing all configured classes with enrolled count, present/absent counts, progress bar, and status badge. | Relies primarily on color for status; lacks visual stream groupings (Junior 6–9 vs O/L 10–11 vs A/L 12–13); action buttons are minimal. | `Dashboard.tsx` lines 490–690; `dashboard.css` lines 180–260 | Add textual status indicators alongside badges; add stream/grade filter tags; maintain sticky headers and full responsive scrolling. |
| **Absentee Follow-Up** | Right column card listing up to 10 absent students with student name, class, guardian name, and `tel:` link. | Good start, but lacks quick calling status notes and one-click copy number option; directory should gracefully truncate long guardian names. | `Dashboard.tsx` lines 705–775 | Enhance absentee card with copy-to-clipboard button alongside `tel:`; provide distinct class badge styling; ensure zero PII leakage. |
| **Administrative Actions** | 3 buttons in header (`+ Add Student`, `Take Attendance`, `Enter Marks`). | Missing dedicated Administrative Workflows grid on the dashboard for frequent daily operations (Student Directory, Marks Workspace, Monthly Reports, Audit Logs, Staff Assignments). | `SCREEN_SPECIFICATIONS.md` Section 2; `REDESIGN_PRD.md` Section 4.5 | Introduce a structured Quick Administrative Actions panel with direct 1-click navigation to core faculty modules. |
| **Activity & Audit Feed** | Displays last 5 audit logs in a compact table if user is admin. | Table headers and cells have minimal padding; timestamps show raw ISO time; details field truncates abruptly without hover tooltip. | `Dashboard.tsx` lines 860–920; `server/src/routes/admin.ts` line 311 | Format relative timestamps ("15m ago", "08:15 AM"); add action chip colors (`USER_LOGIN` = blue, `ATTENDANCE_SUBMIT` = green, `EXAM_APPROVE` = purple); provide accessible tooltips for details. |
| **Offline & Sync Status** | Real IndexedDB accounting widget showing pending, conflicted, quarantined counts via `getUnsyncedWorkSummary(user.id)`. | Shows only user-scoped counts; does not clarify device-level isolation; lacks visual indication of network connection state. | `offlineQueue.ts` lines 434–455; `Dashboard.tsx` lines 780–845 | Add network connectivity indicator (`navigator.onLine` listener); clarify that IndexedDB v2 storage is isolated to this client workstation. |
| **Loading / Error / Empty States** | Basic text spinner and error banner with Retry button; matrix empty state. | Loading indicator is plain text; KPI cards do not display skeleton loaders during initial fetch; error banner lacks error diagnostics. | `Dashboard.tsx` lines 370–388 | Implement clean pulse skeleton placeholders for KPI cards during `loading`; provide informative error state with retry. |
| **Responsive Layout** | Dual-column grid collapses to 1-column at 1024px; stats grid collapses at 768px. | Tablet viewport (768px–1024px) has slightly cramped matrix columns; horizontal overflow on small mobile tables. | `dashboard.css` lines 590–660 | Optimize tablet grid layout (2x2 KPI cards); ensure class matrix table has smooth horizontal scroll container with visual scroll indicator on mobile. |
| **Accessibility (WCAG 2.2 AA)** | High contrast colors used; interactive buttons have aria-labels. | Search input needs clear aria-label and accessible clear button; table needs explicit column scopes (`scope="col"`). | `Dashboard.tsx` lines 500–560 | Add `scope="col"` to `<th>` elements; ensure all interactive links have distinct focus rings and minimum 44px touch targets. |

---

## 3. Prioritized Implementation Plan

### Priority 0 (P0) — Test Invariants & Data Integrity
- Preserve all string and selector invariants required by `principal_walkthrough_browser_real.test.ts` (Step 3):
  - `.stat-card` must exist
  - `Kattankudy Central College`
  - `Total Enrolled Students`
  - `Active School Classes`
  - `Daily Attendance Register Status`
- Zero changes to backend routes (`server/src/**`) or SQLite schema.

### Priority 1 (P1) — Core Administrator Enhancements
- **Teaching Staff on Duty KPI Card:** Query `api.getUsers()` for active teaching staff count (`is_active === 1 && (role === 'class_teacher' || role === 'subject_teacher')`).
- **Institutional Attendance Roll-Call Breakdown:** Aggregated bar summarizing Total Present, Absent, Late, and Excused counts from today's active sessions.
- **Enhanced Administrative Quick Actions Bento Panel:** 4-card quick-access cluster for Student Directory, Class Roll-Call, Examination Marks, and Audit Logs.
- **Dynamic Class Matrix Polish:** Add grade-band filter pills (All, Junior 6–9, O/L 10–11, A/L 12–13), textual status labels alongside badges, and accessible table headers.

### Priority 2 (P2) — Absentee Follow-Up & Audit Provenance
- **Absentee Directory Improvements:** Direct `tel:` link, student admission number, guardian name, and copy-number button.
- **Audit Feed Polish:** Formatted timestamps, semantic action chips with distinct colors, and full detail tooltips.
- **Device Sync & Storage Monitor:** Network online/offline listener with IndexedDB v2 integrity indicators.

### Priority 3 (P3) — Usability, Responsiveness & Accessibility
- Clean skeleton loading states for KPI cards during initial fetch.
- Tablet (768px–1024px) and mobile (<768px) layout optimizations.
- WCAG 2.2 AA improvements: `scope="col"`, visible `:focus-visible` rings, and 44px+ touch targets.

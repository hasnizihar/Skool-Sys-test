# Pre-Implementation Audit: Milestone 6 — Role-Based Dashboards (Screens 02 & 03)

**Project:** SkoolSys 2.0 UI/UX Modernization  
**Milestone:** 6 — Role-Based Dashboards (Screens 02 & 03)  
**Branch:** `feature/ui-ux-v2-redesign`  
**Date:** 2026-10-28  
**Scope:** Client-side only. Architecture-aligned modernization of `client/src/pages/Dashboard.tsx` supported by dedicated stylesheet `client/src/pages/dashboard.css`. Strictly zero backend API changes, zero database schema modifications, and 100% adherence to real data from existing endpoints.

---

## 1. Executive Summary & Objective

The dashboard is the primary mission-control surface for all user archetypes at Kattankudy Central College. Currently, `client/src/pages/Dashboard.tsx` serves a generic, administrator-centric interface to all users regardless of role, leaving teachers without an adaptive daily register workflow and administrators without actionable absentee follow-up workflows or device synchronization health metrics.

Milestone 6 redesigns the dashboard into two distinct, role-tailored views:
1. **Screen 02: Administrator / Principal Dashboard**: Executive institutional command center providing school-wide KPIs, a dynamic class attendance submission matrix (handling all configured classes dynamically without hard-coding), an actionable absentee follow-up phone call registry with `tel:` links, honest device synchronization and IndexedDB queue accounting, and a recent tamper-evident audit log feed.
2. **Screen 03: Teacher Dashboard**: Faculty-centric morning cockpit centered on a prominent, state-adaptive Daily Register Hero Action Card (`Take Morning Register` / `Resume Register Draft` / `View Submitted Register`), today's assigned teaching schedule, ongoing examination grading deadlines, and a 7-day class attendance trend visualization.

---

## 2. Playwright E2E Invariants & Test Guarantees

An exhaustive review of `server/test/principal_walkthrough_browser_real.test.ts` (specifically Step 3, lines 197–208) identifies four mandatory string assertions and one structural selector on `.app-container`:

```typescript
it('Step 3: Executive Dashboard & School Overview KPIs', async (t) => {
  await page.waitForSelector('.stat-card', { timeout: 10000 });
  const dashboardText = await page.textContent('.app-container');

  // Asserts active school operations
  assert.ok(dashboardText?.includes('Kattankudy Central College'), 'Dashboard must display school name');
  assert.ok(dashboardText?.includes('Total Enrolled Students'), 'Dashboard must display student enrollment card');
  assert.ok(dashboardText?.includes('Active School Classes'), 'Dashboard must display classes count');
  assert.ok(dashboardText?.includes('Daily Attendance Register Status'), 'Dashboard must display attendance progress');
});
```

### Invariant Preservation Matrix:
| Invariant Target | Element / Type | Location in Screen 02 (Admin) | Location in Screen 03 (Teacher) | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `.stat-card` | CSS Selector | KPI Bento Grid cards | Metric summary cards | Establishes uniform metric card card styling |
| `Kattankudy Central College` | Text Content | Header school profile banner | Header school profile banner | Displays authoritative institutional identity |
| `Total Enrolled Students` | Text Content | Primary KPI Card 1 label | Class / School KPI Card label | Confirms institutional student census |
| `Active School Classes` | Text Content | Primary KPI Card 3 label | Teaching assignments & active classes card | Displays verified class allocation count |
| `Daily Attendance Register Status` | Text Content | Attendance matrix card title | Hero register task card subtitle/header | Verifies class roll-call completion status |

---

## 3. Shortcomings in Current `Dashboard.tsx`

1. **One-Size-Fits-All Monolith**: Class teachers and subject teachers are presented with the same administrative dashboard as the Principal. They lack an unmistakable, contextual call-to-action to mark their morning register.
2. **Static Slice & Rigid Matrix**: The current attendance overview arbitrarily slices to only 8 classes (`slice(0, 8)`), lacking search, filter, or dynamic pagination for schools with 18 or more classes.
3. **Passive Absentee Numbers**: The absentee count is displayed as a plain metric rather than an actionable directory with student names, guardian names, and clickable telephone links (`tel:`).
4. **Invisible Device Sync Status**: While the system features an advanced IndexedDB v2 offline storage engine (`offlineQueue.ts`), teachers and administrators have zero visibility on the dashboard regarding pending offline mutations, sync conflicts, or quarantined records.
5. **Lack of Examination Deadlines**: Teachers cannot view their pending examination marks sheets or grading deadlines directly from their home dashboard.

---

## 4. Planned Screen Architecture

### 4.1. Screen 02: Administrator / Principal Dashboard

```
+----------------------------------------------------------------------------------------------------+
| Institutional Header Banner: Kattankudy Central College (Tamil/Census) • Term 1 2026 • Civil Date  |
| Quick Actions: [+ Add Student] [Take Attendance] [Enter Marks] [Switch to Teacher View Preview]    |
+----------------------------------------------------------------------------------------------------+
| 4-Card Bento KPI Grid:                                                                             |
| [ Total Enrolled Students ] [ Today's Attendance Rate ] [ Active School Classes ] [ Registers Done]|
+----------------------------------------------------------------------------------------------------+
| Primary 2-Column Grid (65% / 35%):                                                                 |
|                                                                                                    |
| LEFT COLUMN (Daily Attendance Register Status):     | RIGHT COLUMN (Priorities & Alerts):          |
| - Filter Tabs: All (18) | Pending (4) | Done (14)   | 1. Absentee Follow-Up Call Registry:         |
| - Search classes filter                             |    - Student, Class, Guardian, [Call tel:]   |
| - Dynamic Class Matrix:                             | 2. Device Sync & Storage Monitor:            |
|   * Class Name, Teacher Name                        |    - IndexedDB status, Pending items, Sync   |
|   * Present / Enrolled progress bar                 | 3. Tamper-Evident Recent Audit Feed:         |
|   * Status Badge (Completed / Pending / Draft)      |    - Timestamp, User, Action, Details        |
|   * Action: [View Register] / [Take Register]       |                                              |
+----------------------------------------------------------------------------------------------------+
```

### 4.2. Screen 03: Teacher Dashboard

```
+----------------------------------------------------------------------------------------------------+
| Welcome Banner: Good morning, Faculty • Assigned: Grade 8-A Class Teacher • Kattankudy Central     |
+----------------------------------------------------------------------------------------------------+
| HERO ACTION CARD: Grade 8-A Daily Attendance Register                                              |
| - Dynamic Status Badge: [🔴 Not Yet Marked] | [🟡 Draft Saved on Device] | [🟢 Submitted & Verified] |
| - Primary CTA:                                                                                     |
|   * If unmarked: [👉 Take Morning Register] (Large green button, 48px target)                      |
|   * If draft:    [📝 Resume Register Draft] (Amber button with timestamp)                          |
|   * If submitted:[👁️ View Submitted Register] (Secondary button with presence rate)                |
| - Summary stats: 38 Enrolled • 36 Present • 2 Absent                                                |
+----------------------------------------------------------------------------------------------------+
| Teacher Metric Summary Cards (.stat-card):                                                         |
| [ My Class Enrolled ] [ Today's Presence Rate ] [ Absentees in My Class ] [ Active School Classes ]|
+----------------------------------------------------------------------------------------------------+
| Secondary Bento Grid:                                                                              |
| - Today's Classes & Teaching Assignments (user.assignments roster)                                 |
| - Pending Marks Entry & Exam Deadlines (ongoing examination grading sheets)                        |
| - 7-Day Attendance Trend & Today's Absentee Call List (with direct phone links)                     |
| - Teacher Device Sync & Storage Status (IndexedDB queue accounting)                                |
+----------------------------------------------------------------------------------------------------+
```

---

## 5. Dedicated Stylesheet: `client/src/pages/dashboard.css`

A dedicated stylesheet will be established to cleanly decouple presentation from business logic:
- `.dashboard-hero-banner`: Sleek gradient container with responsive metadata pills.
- `.dashboard-stats-grid`: Responsive CSS Grid implementing Bento-box proportions.
- `.daily-register-hero`: Prominent visual callout for teachers with state-driven pulsing accents.
- `.class-matrix-table`: Dynamic table with sticky headers, colored percentage bars, and touch targets.
- `.absentee-call-registry`: List of absentee cards with avatar, class badge, and high-visibility telephone action buttons (`tel:`).
- `.sync-monitor-card`: Real-time offline storage status widget with badge indicators (`Synced`, `Pending Mutations`, `Conflict Alert`).
- `.audit-feed-table`: Clean security log table with monospace timestamps and semantic action badges.

---

## 6. Implementation & Verification Roadmap

1. **Establish Stylesheet**: Create `client/src/pages/dashboard.css` with dark-mode and light-mode tokens.
2. **Refactor `Dashboard.tsx`**:
   - Determine role mode (`isAdminOrLeadership` vs `isTeacher`).
   - Query real data: `getStudents()`, `getClasses()`, `getDailyAttendanceReport(today)`, `getExaminations()`, `getAuditLogs()`, `getUnsyncedWorkSummary()`, `getPendingAttendanceQueue()`.
   - Render Screen 02 for Administrator/Principal (with view toggle preview).
   - Render Screen 03 for Class and Subject Teachers.
3. **Automated Verification**:
   - Frontend lint: `npm.cmd --prefix client run lint` (0 errors).
   - Frontend build: `npm.cmd --prefix client run build` (0 errors).
   - Backend unit suite: `npm.cmd --prefix server run test` (397 passing tests).
   - Browser E2E suite: `npm.cmd --prefix server run test:browser` (28 passing tests).
4. **Visual Evidence Capture**:
   - Run `scripts/capture_milestone6.mjs` to capture:
     1. `milestone6_admin_dashboard_desktop.png` (Screen 02 desktop).
     2. `milestone6_attendance_matrix_desktop.png` (Screen 02 dynamic matrix).
     3. `milestone6_teacher_dashboard_desktop.png` (Screen 03 teacher desktop).
     4. `milestone6_teacher_dashboard_mobile.png` (Screen 03 teacher mobile).
5. **Final Report & Delivery**:
   - Deliver `milestone_6_report.md` artifact and stop for user review.

# SkoolSys 2.0 — UI/UX Redesign Product Requirements Document (PRD)

**Product:** SkoolSys — School Management System (Kattankudy Central College MVP)  
**Version:** 2.0 (Institutional UI/UX Redesign)  
**Status:** Approved for Implementation  
**Target Delivery:** Phased Rollout across P0, P1, P2, P3 Modules

---

## 1. Product Vision & Principles

SkoolSys 2.0 is designed as an institutional, fast, distraction-free school operations workspace built around everyday teacher and administrator tasks. It prioritizes clarity, speed on patchy school networks, and reliable offline operations over flashy analytics.

### Core Principles
1. **Speed on Daily Paths:** Routine tasks (taking morning attendance, entering exam marks) must be completed with the minimum number of clicks/taps.
2. **Unshakable Trust & Provenance:** Users must always know the precise status of their work: *Draft, Saved on Device, Syncing, Synced to School Server, Conflicted*.
3. **Role-Aware Simplicity:** Principals, Section Heads, Class Teachers, and Subject Teachers see exactly what they need with zero cognitive clutter.
4. **Resilience & Offline First:** Complete support for unstable school Wi-Fi, low-cost Android phones, and power interruptions without data loss.
5. **Institutional Dignity:** A professional, authoritative aesthetic reflecting Kattankudy Central College's heritage (Green `#026536`, School Gold `#F1EF22`, Crisp Canvas `#F8FAF9`, Tamil/English bilingual typography).

---

## 2. User Personas & Key Jobs to be Done (JTBD)

| Persona | Role in System | Primary Hardware | Critical Jobs to be Done | Primary Frustrations |
| :--- | :--- | :--- | :--- | :--- |
| **Mr. Thahir**<br>Class Teacher (Grade 8-A) | `class_teacher` | 6.1" Android Phone / Tablet | 1. Mark morning attendance within 90 seconds.<br>2. Add student remarks without leaving the register.<br>3. Check attendance percentage of roster. | Small touch targets; uncertainty about whether offline records actually synced. |
| **Mrs. Fathima**<br>Subject Teacher (Science Gr 10–11) | `subject_teacher` | Laptop / School Desktop | 1. Rapidly enter term test marks across 4 classes.<br>2. Navigate with arrow and Enter keys.<br>3. Submit marks for Section Head review. | Clunky mouse-only entry; losing work when connection drops; accidental score entry > 100. |
| **Mr. Rilwan**<br>Vice Principal Academic | `vp_academic` | Desktop (1080p monitor) | 1. Moderation and endorsement of marks sheets.<br>2. Review assessment policy adherence.<br>3. Track morning attendance completion by class. | Crowded dashboards; lack of batch report card generation; confusing audit histories. |
| **Dr. Principal**<br>Executive Head | `admin` / Principal | Desktop / Tablet | 1. Authorize and publish official examinations.<br>2. Generate official printed report cards with seal.<br>3. Oversight of school statistics and staff assignments. | Complex menus; fear of accidentally wiping data during administrative maintenance. |

---

## 3. Success Metrics & Usability Targets

| Metric | Baseline (v1.0) | Target (v2.0 Redesign) | Verification Method |
| :--- | :--- | :--- | :--- |
| **Attendance Register Completion** | ~3 min 45 sec | **< 90 seconds for 40 students** | Timed test on mobile phone (375px) |
| **Touch Target Size** | 32–36px in register | **Minimum 48×48px for P/A/L/E buttons** | CSS token audit & Playwright tests |
| **Data Loss on Offline-Online Transition** | Occasional confusion | **0% data loss guaranteed** | Simulated network drop & reconnection test |
| **Marks Entry Speed** | ~8 sec per student | **< 3 sec per student (keyboard-only)** | Timed numeric keypad & Arrow/Enter test |
| **Accessibility Score** | Lighthouse ~82 | **Lighthouse >= 95 (WCAG 2.2 AA)** | Automated axe-core & Lighthouse audit |
| **Mobile Table Usability** | Horizontal scroll on phone | **0% horizontal scroll on mobile viewports** | Mobile responsive card layout switch |
| **Report Card Print Fidelity** | Minor page breaks | **100% clean A4 single-page or two-page lock** | Headless Chrome print-to-PDF test |

---

## 4. Functional Scope by Module

### 4.1 Foundation & Application Shell (P0)
- **Global Design Tokens:** Clean migration to `#026536` (Primary Green), `#F1EF22` (Accent Gold), `#F8FAF9` (Canvas), `#FFFFFF` (Surface), `#172B22` (Text).
- **Navigation:**
  - Desktop: Collapsible sidebar (240px expanded, 68px icon-only collapsed).
  - Mobile: Bottom navigation tab bar (Dashboard, Attendance, Marks, Students, More) with 48px touch targets.
- **Global Header (Navbar):**
  - Institutional crest and bilingual school title.
  - Persistent **Sync Status Chip** (Online, Offline, "X Pending Sync", Syncing...) with click-to-open drawer.
  - Quick theme toggle (Light / Dark mode).

### 4.2 Daily Attendance Register (P1 — Flagship UX)
- **Sticky Summary Header:** Real-time tally bar (Enrolled, Present, Absent, Late, Excused, Percentage) locked to top during scroll.
- **High-Affordance Segmented Buttons:** High-contrast `[P] [A] [L] [E]` with explicit colors, letters, and icons.
- **Instant Bulk Action:** Single-tap "Mark All Present" with instant 5-second undo toast.
- **Row-Level Remarks Drawer:** Tap to add remark without leaving the register flow.
- **Unsaved State Transparency:** Prominent pill badge: *Unsaved Draft*, *Saved on Phone (Pending Sync)*, or *Synced to School Server*.
- **Interactive Conflict Resolver:** Human-friendly side-by-side card comparing local changes vs server changes with clear "Keep Local", "Accept Server", or "Merge" buttons.

### 4.3 Student Directory & Profiles (P1)
- **Responsive List/Card Switch:** Dense data table on desktop; touch cards with avatar, calling name, and quick actions on mobile.
- **Search & Filter Bar:** Instant search by name or admission number, persistent filter chips for Grade, Class, and Status.
- **4-Step CSV Import Stepper:**
  1. *Upload:* Drag-and-drop CSV file.
  2. *Map:* Match CSV headers to Student schema columns.
  3. *Preview:* Interactive table flagging errors, duplicate admission numbers, or invalid dates.
  4. *Commit:* Atomic import with progress meter.
- **Student Profile Dossier:** Tabbed interface (Overview with attendance ring & KPI cards, Attendance history, Examination transcript, Guardian info).

### 4.4 Marks Management & Report Cards (P1 / P2)
- **Desktop Spreadsheet Grid:**
  - Frozen student column (`position: sticky; left: 0`).
  - Native Arrow/Enter keyboard navigation.
  - Instant score validation (0 to `max_score`), with red error border and tooltip.
  - Quick keys for Absent (`AB`) and Medical Exemption (`ME`).
  - Real-time grade chip (`A`, `B`, `C`, `S`, `F`) calculation upon typing.
- **Mobile Marks Mode:** Single-student card view with large numeric keypad, current rank, and Next/Previous navigation buttons.
- **Stats Summary Panel:** Class average, highest/lowest scores, pass rate, and grade distribution bar chart.
- **Official Printable Report Card:**
  - Dedicated `@media print` layout locked to A4 dimensions.
  - School seal, Tamil/English headers, student metrics, principal & class teacher signature blocks.
  - SHA-256 authentic publication hash watermark.
  - Batch printing option for entire class.

### 4.5 Administration & Dashboards (P2 / P3)
- **Role-Based Dashboards:**
  - *Teacher Dashboard:* "My Classes Today", "Take Register" CTA, Pending Marks deadlines.
  - *Admin Dashboard:* School-wide attendance grid across Grades 6–13, Absentee follow-up phone directory, Audit alert feed.
- **Safe Administration Zone:**
  - User accounts and teacher assignments with clear role chips.
  - Dedicated "Data Safety & Disaster Recovery" section with high-friction confirmation (type `CONFIRM RESTORE` to overwrite database).
- **Expandable Audit Trail:** Expandable rows with formatted JSON payload comparison.

---

## 5. Engineering Constraints & Non-Functional Requirements

1. **Preserve Backend Contracts:** Zero breaking changes to existing Express routes or SQLite database tables.
2. **Zero Loss of Offline Capabilities:** Full preservation of IndexedDB `attendance_mutations` and `roster_cache`.
3. **No Unnecessary Dependencies:** Keep bundle lightweight; rely on React 19, Vite, Lucide icons, and Vanilla CSS custom properties.
4. **WCAG 2.2 AA Compliance:**
   - Text contrast >= 4.5:1 (>= 7:1 for headers).
   - Interactive control contrast >= 3:1.
   - Visible keyboard focus ring (`3px solid var(--border-focus)`).
   - Full keyboard accessibility (Tab, Enter, Space, Escape, Arrows).
   - Motion sensitivity (`prefers-reduced-motion` respected).
5. **Cross-Browser & Device Support:**
   - Chrome/Edge (Chromium 100+)
   - Firefox (v100+)
   - Safari / iOS Mobile Safari (iOS 15+)
   - Android Chrome (Android 9+)

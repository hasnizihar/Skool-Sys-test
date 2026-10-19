# SkoolSys Design System — Master File

> **LOGIC:** When building or modifying a specific page, first check `design-system/skoolsys/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** SkoolSys — School Management System (Grades 6–13)  
**Category:** LMS & Educational Management / Academic Operations Dashboard  
**Primary Pattern:** Education Analytics Dashboard + Data-Dense Register  
**Primary Style:** Flat Design + Accessible & Ethical with Swiss Grid Discipline  
**Design Dials:** Variance 5/10 (Balanced / Modern) | Motion 4/10 (Subtle & Responsive) | Density 8/10 (Dense / Dashboard Scale)  
**Target Viewports:** 375px (Mobile Phone), 768px (Tablet / iPad), 1024px (Laptop), 1440px+ (Desktop)  

---

## 🎨 Global Color Tokens — Modern Academic Minimalism (Kattankudy Central College)

High-contrast, semantic tokens designed for accessibility (WCAG AA 4.5:1 minimum on all text, 3:1 on controls and meaningful icons).

| Role | Hex Light | Hex Dark | CSS Variable | Semantic Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Primary (Institutional Green)** | `#026536` | `#10b981` | `--primary` | Sidebar, primary buttons, active navigation |
| **Primary Hover** | `#014d29` | `#059669` | `--primary-hover` | Button hover and pressed states |
| **Primary Pale / Light** | `#e8f4ec` | `rgba(16, 185, 129, 0.16)` | `--primary-light` | Soft highlights and selected backgrounds |
| **Academic Yellow (Accent)** | `#F1EF22` | `#F1EF22` | `--accent` | Highlights, active indicators, small decorative accents |
| **App Background / Canvas** | `#F5F7F6` | `#0c1410` | `--bg-app` | Canvas background for the entire application |
| **Card / Surface (White)** | `#FFFFFF` | `#131f19` | `--bg-surface` | Elevated containers, data cards, drawers, modals |
| **Subtle Background** | `#EDF2EF` | `#192720` | `--bg-subtle` | Table headers, muted button backgrounds |
| **Border / Divider** | `#E2E9E4` | `#23372d` | `--border-color` | Subtle component boundaries |
| **Focus Ring** | `#026536` | `#10b981` | `--border-focus` | Keyboard accessibility focus ring |
| **Text Primary (Main)** | `#172B22` | `#f0fdf4` | `--text-main` | Headings and content (contrast >= 9:1) |
| **Text Muted** | `#66766D` | `#8ba195` | `--text-muted` | Descriptions and metadata |

### Attendance & State Semantic Colors

| Status | Active Hex | Background Light | Background Dark | CSS Variable | Meaning |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[P] Present** | `#026536` | `#E8F4EC` | `rgba(16, 185, 129, 0.16)` | `--present` | Student in class |
| **[A] Absent** | `#dc2626` | `#fef2f2` | `rgba(239, 68, 68, 0.16)` | `--absent` | Unexcused absence (triggers telephone follow-up) |
| **[L] Late** | `#d97706` | `#fffbeb` | `rgba(245, 158, 11, 0.16)` | `--late` | Arrived after morning bell |
| **[E] Excused** | `#2563eb` | `#eff6ff` | `rgba(59, 130, 246, 0.16)` | `--excused` | Medical or official school permission |

---

## 🔤 Typography System

- **Display & Headings:** `'Outfit', sans-serif` — Clean, modern geometric sans with confident letterforms.
- **Body & Data Tables:** `'Inter', -apple-system, sans-serif` — World-class legibility for dense numbers, spreadsheets, and rosters.
- **Scale:**
  - `H1` (Page Title): `1.5rem` / `24px`, font-weight 700, line-height 1.2
  - `H2` (Section Heading): `1.25rem` / `20px`, font-weight 700, line-height 1.3
  - `H3` (Card Title): `1.05rem` / `17px`, font-weight 600, line-height 1.4
  - `Body`: `0.875rem` / `14px`, font-weight 400-500, line-height 1.5
  - `Caption / Micro`: `0.75rem` / `12px`, font-weight 500-600, line-height 1.4

---

## 📐 Spacing Scale (Density 8/10 — Dashboard Optimized)

| Token | Pixels | Rem | Typical Usage |
| :--- | :--- | :--- | :--- |
| `--space-xs` | `4px` | `0.25rem` | Tight tag gaps, badge padding, icon spacing |
| `--space-sm` | `8px` | `0.5rem` | Button icon gaps, input padding, list spacing |
| `--space-md` | `14px` | `0.875rem` | Standard card internal padding, table cell vertical insets |
| `--space-lg` | `20px` | `1.25rem` | Page margins, grid gaps between widgets |
| `--space-xl` | `28px` | `1.75rem` | Section headers to content |
| `--space-2xl` | `40px` | `2.5rem` | Major dashboard segment breaks |

---

## 🔘 Components Guidelines

1. **Touch-Friendly Buttons:** Minimum target size `44×44px` on all mobile/tablet touchpoints.
2. **Attendance Register Segment:** 4 buttons per student row with instant toggle feedback, visible active ring, and high visual contrast.
3. **Data Grids & Tables:**
   - Sticky table headers with subtle bottom border.
   - Alternating hover row highlights (`background-color: var(--bg-subtle)`).
   - Numeric alignment: Right-aligned for scores/percentages, left-aligned for names, centered for status badges.
4. **Offline Indicators:**
   - Subtle persistent connection pill in top navigation.
   - Non-intrusive alert banner with pending sync queue count and manual "Sync Now" button.
5. **No Emojis as Structural Icons:** Only vector icons from Lucide React (`<Users />`, `<CalendarCheck />`, `<GraduationCap />`, etc.).

---

## 🚫 Anti-Patterns (Forbidden)

- ❌ Do NOT use plain emojis as UI icons.
- ❌ Do NOT use low-contrast gray text on gray backgrounds (< 4.5:1).
- ❌ Do NOT use instant state changes without CSS transitions (150ms–250ms cubic-bezier).
- ❌ Do NOT allow horizontal scroll on mobile viewport (all tables must be wrapped in `.table-responsive`).
- ❌ Do NOT use arbitrary one-off colors; always use semantic CSS custom properties.

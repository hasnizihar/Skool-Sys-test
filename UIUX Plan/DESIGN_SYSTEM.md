# SkoolSys 2.0 — Design System Specification

**Project:** SkoolSys — School Management System (Kattankudy Central College)  
**Document:** Design System & CSS Token Architecture  
**Version:** 2.0  
**Design Lead:** Antigravity UI/UX Architecture  

---

## 1. Visual Identity & Palette Rationale

The visual identity is grounded in the proud educational heritage of **Kattankudy Central College (National School)**. The color system replaces generic SaaS blue/indigo with authoritative institutional green, crisp white/cream surfaces, school gold accents, and deep charcoal-forest text.

### 1.1 Core Brand & Semantic Colors

| Role | Light Theme Hex | Dark Theme Hex | CSS Variable | Usage & Contrast |
| :--- | :--- | :--- | :--- | :--- |
| **Primary (Brand Green)** | `#026536` | `#10b981` | `--primary` | Main CTAs, active nav items, brand identity (Contrast 8.4:1 on white) |
| **Primary Hover / Active**| `#014d29` | `#059669` | `--primary-hover` | Button hover and pressed states |
| **Primary Subtle / Glow** | `#e8f5ee` | `rgba(16, 185, 129, 0.15)` | `--primary-light` | Active background pills, subtle badge backgrounds |
| **On Primary (Text)**     | `#ffffff` | `#0f172a` | `--on-primary` | Text rendered on top of `--primary` buttons |
| **Accent (School Gold)**  | `#D4C500` (text) / `#F1EF22` (bg)| `#facc15` | `--accent` | Distinction highlights, high-priority star metrics, gold tags |
| **Accent Subtle**         | `#fffde6` | `rgba(250, 204, 21, 0.12)` | `--accent-light` | Highlight backgrounds, warnings, distinction flags |
| **App Canvas / Background**| `#f8faf9` | `#0b130e` | `--bg-app` | Master application canvas background |
| **Surface / Card**        | `#ffffff` | `#121e17` | `--bg-surface` | Elevated card containers, modals, table bodies |
| **Surface Elevated**      | `#ffffff` | `#18281f` | `--bg-surface-elevated` | Dropdown menus, tooltips, flyout drawers |
| **Subtle Background**     | `#edf3f0` | `#1c2e24` | `--bg-subtle` | Table headers, muted buttons, disabled fields |
| **Border / Divider**      | `#d8e4dc` | `#22382c` | `--border-color` | Card borders, table dividers, input borders |
| **Focus Ring**            | `#026536` | `#34d399` | `--border-focus` | 3px accessibility focus ring for keyboard users |
| **Text Primary (Main)**   | `#172b22` | `#f0fdf4` | `--text-main` | Headers, table values, body text (Contrast >= 11:1) |
| **Text Muted**            | `#526e60` | `#8fa89b` | `--text-muted` | Field labels, captions, metadata (Contrast >= 4.8:1) |

---

### 1.2 Attendance Status Color Semantics

Never rely on color alone: every status must pair an unambiguous letter (`P`, `A`, `L`, `E`) and a distinct vector icon (`Check`, `X`, `Clock`, `Shield`).

| Status | Code | Active Solid | Light Bg | Dark Bg | Border Hex | CSS Variable | Meaning |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **Present** | `P` | `#059669` | `#ecfdf5` | `rgba(16, 185, 129, 0.18)` | `#a7f3d0` | `--status-present` | In attendance |
| **Absent** | `A` | `#dc2626` | `#fef2f2` | `rgba(239, 68, 68, 0.18)` | `#fecaca` | `--status-absent` | Unexcused absence |
| **Late** | `L` | `#d97706` | `#fffbeb` | `rgba(245, 158, 11, 0.18)` | `#fde68a` | `--status-late` | Tardy / after bell |
| **Excused** | `E` | `#2563eb` | `#eff6ff` | `rgba(59, 130, 246, 0.18)` | `#bfdbfe` | `--status-excused` | Medical / Official |

---

### 1.3 Examination Grade Chips

| Grade | Description | Minimum Score | Solid Badge Hex | Subtle Bg Hex | CSS Variable |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **A** | Distinction | 75 | `#059669` | `#ecfdf5` | `--grade-a` |
| **B** | Very Good Pass | 65 | `#0284c7` | `#f0f9ff` | `--grade-b` |
| **C** | Credit Pass | 50 | `#2563eb` | `#eff6ff` | `--grade-c` |
| **S** | Ordinary Pass | 35 | `#d97706` | `#fffbeb` | `--grade-s` |
| **F** | Fail | 0 | `#dc2626` | `#fef2f2` | `--grade-f` |

---

## 2. Typography System

- **Primary UI & Tables:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  - High legibility for dense numerical data, tables, inputs, and form controls.
  - Numbers use `font-variant-numeric: tabular-nums` to prevent jitter during updates.
- **Display & Headings:** `'Outfit', 'Inter', sans-serif`
  - Confident, clean geometric sans for page titles and institutional branding.
- **Institutional Script (Tamil):** `'Noto Sans Tamil', 'Latha', 'Vijaya', sans-serif`

### Type Scale

| Level | Size (px / rem) | Weight | Line Height | Tracking | Usage |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **H1 (Page Title)** | `26px / 1.625rem` | 700 | 1.25 | `-0.02em` | Main screen titles |
| **H2 (Section Header)** | `20px / 1.25rem` | 650 | 1.3 | `-0.01em` | Major module headings |
| **H3 (Card Header)** | `16px / 1.0rem` | 600 | 1.4 | `0` | Card titles, modal headers |
| **Body (Default)** | `14px / 0.875rem` | 400–500 | 1.5 | `0` | Form labels, descriptions |
| **Table Data** | `13px / 0.8125rem` | 400–600 | 1.4 | `0` | Spreadsheet cells, lists |
| **Caption / Helper** | `12px / 0.75rem` | 500 | 1.4 | `0.01em` | Field hints, timestamps, badges |
| **KPI Metric Number** | `32px / 2.0rem` | 700 | 1.1 | `-0.02em` | Big numbers in stat cards |

---

## 3. Spacing, Elevation & Radius Tokens

### Spacing Scale (4px Base Grid)
```css
--space-2xs: 2px;
--space-xs:  4px;
--space-sm:  8px;
--space-md:  12px;
--space-lg:  16px;
--space-xl:  24px;
--space-2xl: 32px;
--space-3xl: 48px;
```

### Radius Scale
```css
--radius-xs:   4px;   /* Small badges, micro tags */
--radius-sm:   6px;   /* Form inputs, buttons */
--radius-md:   10px;  /* Cards, table containers */
--radius-lg:   14px;  /* Modals, bottom sheets */
--radius-full: 9999px;/* Avatars, pill chips */
```

### Elevation Shadows
```css
--shadow-xs: 0 1px 2px 0 rgba(23, 43, 34, 0.05);
--shadow-sm: 0 1px 3px 0 rgba(23, 43, 34, 0.08), 0 1px 2px -1px rgba(23, 43, 34, 0.05);
--shadow-md: 0 4px 6px -1px rgba(23, 43, 34, 0.08), 0 2px 4px -2px rgba(23, 43, 34, 0.05);
--shadow-lg: 0 10px 15px -3px rgba(23, 43, 34, 0.08), 0 4px 6px -4px rgba(23, 43, 34, 0.04);
--shadow-xl: 0 20px 25px -5px rgba(23, 43, 34, 0.10);
```

---

## 4. Core UI Component Specifications

### 4.1 Buttons (`.btn`)
- **Minimum Touch Target:** `44×44px` on mobile/tablet.
- **Variants:**
  - `.btn-primary`: Solid `#026536` with white text.
  - `.btn-secondary`: Neutral surface with border `--border-color`.
  - `.btn-accent`: Gold accent for high-priority actions.
  - `.btn-danger`: Solid `#dc2626` with white text.
  - `.btn-ghost`: Borderless, subtle hover tint.
- **States:** Hover (darken 10%), Active/Pressed (scale 0.98), Focus-visible (3px ring), Disabled (opacity 0.5, cursor not-allowed).

### 4.2 Form Inputs (`.form-input`, `.form-select`)
- **Height:** Desktop `40px`, Mobile `44px`.
- **Borders:** `1px solid var(--border-color)`, `radius-sm` (6px).
- **Focus:** `border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light)`.
- **Validation:** `.is-invalid` gets `border-color: var(--status-absent)` with inline error message below.

### 4.3 Attendance Segmented Control (`.attendance-segment`)
- 4 interactive segments per student: `[P] [A] [L] [E]`.
- **Touch Target:** Minimum `48×48px` on mobile.
- **Active State:** Solid fill matching status color, contrasting bold letter, and SVG icon.
- **Unmarked State:** Neutral subtle background with muted outline.

### 4.4 Data Tables (`.data-table`)
- **Sticky Headers:** Header cells lock to top during vertical scroll.
- **Row Hover:** Alternating subtle tint (`var(--bg-subtle)`).
- **Alignment:** Numbers right-aligned, text left-aligned, status badges centered.
- **Mobile Fallback:** Below 768px, tables transform into stacked responsive `.data-card` elements.

### 4.5 Global Sync Chip (`.sync-status-chip`)
- Located in Navbar at all times.
- **States:**
  - `online-synced`: Green dot, "Online • Synced"
  - `pending`: Amber dot, "3 Pending Sync" (blinking sync icon)
  - `offline`: Gray/Red dot, "Offline (Local Mode)"
  - `conflicted`: Red badge, "Conflict Detected — Review"

---

## 5. Accessibility Mandates (WCAG 2.2 AA)

1. **Color Contrast:** All body text strictly maintains >= 4.5:1 against its background. Headers >= 7:1.
2. **Keyboard Focus:** Every interactive control has an unmistakable focus indicator:
   ```css
   :focus-visible {
     outline: 3px solid var(--border-focus);
     outline-offset: 2px;
   }
   ```
3. **Motion Sensitivity:**
   ```css
   @media (prefers-reduced-motion: reduce) {
     * {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```
4. **ARIA Roles:** Segmented attendance buttons require `role="group"` and `aria-pressed="true|false"`. Modals require `role="dialog"` and `aria-modal="true"`.

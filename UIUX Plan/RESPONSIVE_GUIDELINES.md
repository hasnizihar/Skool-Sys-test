# SkoolSys 2.0 — Responsive Design Guidelines

**Project:** SkoolSys — School Management System  
**Document:** Viewport Breakpoints & Responsive Adaptations  
**Version:** 2.0  

---

## 1. Breakpoint Grid Specification

| Breakpoint Token | Viewport Range | Primary Device Type | Primary Navigation | Layout Container |
| :--- | :--- | :--- | :--- | :--- |
| **`--bp-mobile`** | `320px – 767px` | Android & iOS Smartphones | Sticky Bottom Tab Bar (60px) + Header | Full width, `16px` padding |
| **`--bp-tablet`** | `768px – 1023px` | iPads, Android Tablets | Collapsed Sidebar (68px) or Drawer | Fluid, `20px` padding |
| **`--bp-laptop`** | `1024px – 1439px` | School Laptops, Standard Desktops | Full Left Sidebar (240px) + Top Bar | Grid container, `24px` padding |
| **`--bp-desktop`**| `1440px and above` | Large Administrative Monitors | Full Left Sidebar (240px) | Max-width `1600px` centered, `32px` padding |

---

## 2. Adaptive Behavior by Module

### 2.1 Navigation & Chrome

```css
/* Mobile Bottom Bar */
@media (max-width: 767px) {
  .sidebar {
    display: none;
  }
  .mobile-bottom-nav {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border-color);
    z-index: 1000;
  }
  .page-container {
    padding-bottom: 76px; /* Avoid bottom nav overlap */
  }
}

/* Tablet & Desktop */
@media (min-width: 768px) {
  .mobile-bottom-nav {
    display: none;
  }
  .sidebar {
    display: flex;
  }
}
```

---

### 2.2 Attendance Register Adaptation

- **Desktop (>= 1024px):**
  - Roster renders as an efficient, compact list with student photo/avatar, admission number, calling name, and the 4 segmented buttons `[P] [A] [L] [E]` grouped on the right.
  - Height of row: `52px`.
  - Button width: `42px` each.
- **Mobile (< 768px):**
  - Segmented buttons expand to a 4-button horizontal strip spanning the full width of each student card.
  - Minimum button dimensions: **`48px` height × `25%` width**.
  - High tactile feedback: 120ms active press depression (`transform: scale(0.96)`).
  - Tapping a button instantly highlights the student card with the status background tint (e.g. soft green for Present, soft red for Absent).

---

### 2.3 Data Tables vs. Responsive Cards

**Forbidden Anti-Pattern:** Allowing wide data tables to create uncontrollable horizontal body scroll on smartphones.

**Pattern: Table-to-Card Morphing:**
- On screens `< 768px`, data tables (`.data-table`) hide table headers and collapse rows into structured cards:
  ```css
  @media (max-width: 767px) {
    .data-table, .data-table tbody, .data-table tr, .data-table td {
      display: block;
      width: 100%;
    }
    .data-table thead {
      display: none; /* Hide header row */
    }
    .data-table tr {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-md);
      padding: var(--space-md);
      box-shadow: var(--shadow-sm);
    }
  }
  ```

---

### 2.4 Marks Spreadsheet vs. Mobile Stepper Mode

- **Desktop (>= 768px):**
  - Multi-column spreadsheet grid with frozen student column (`position: sticky; left: 0`).
  - Native keyboard Arrow/Enter navigation.
- **Mobile (< 768px):**
  - Spreadsheets with 6+ columns are physically unusable on phone screens.
  - The UI automatically toggles to **Single-Student Focus Mode**:
    1. Card showing Student Photo, Roll No, and Name.
    2. Large numerical keypad input (`inputmode="decimal"`).
    3. Prominent `[AB] Absent` and `[ME] Medical` quick toggle pills.
    4. Two large thumb-friendly navigation buttons at bottom: `← Previous Student` and `Next Student →`.

---

## 3. Touch Targets & Ergonomic Safe Areas

1. **Minimum Touch Target:** `44×44px` on all mobile controls; **`48×48px`** for the core Attendance `[P] [A] [L] [E]` buttons.
2. **Spacing between Interactive Elements:** Minimum `8px` gap between adjacent touch targets to prevent accidental mis-taps.
3. **Safe Area Insets:** Support modern mobile notch and home-indicator safe areas:
   ```css
   .mobile-bottom-nav {
     padding-bottom: env(safe-area-inset-bottom, 0px);
     height: calc(60px + env(safe-area-inset-bottom, 0px));
   }
   ```
4. **Form Inputs:** Form input heights on mobile must be at least `44px` to prevent iOS/Android automatic zoom when focusing.

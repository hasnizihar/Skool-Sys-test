# Dashboard Page Overrides

> **PROJECT:** SkoolSys  
> **Page Type:** Analytics & School Operations Executive Dashboard  
> ⚠️ **IMPORTANT:** Rules in this file **override** `design-system/skoolsys/MASTER.md`.

---

## Page-Specific Rules

### Layout
- Bento grid organization: 4 primary KPI statistic cards along top, followed by 2-column layout (60% daily attendance breakdown, 40% quick shortcuts & recent audit feed).
- Minimum card height with responsive reflow from 4-columns (desktop) to 2-columns (tablet) to 1-column (mobile).

### Key Metrics
- **Total Students** (with grade distribution preview)
- **Today's Attendance Rate** (with circular radial meter or high-contrast percentage badge)
- **Present Today** (emerald green badge)
- **Absent Today** (rose red badge with 1-click jump to absentee phone follow-up directory)

### Micro-Interactions
- Subtle card hover lift: `transform: translateY(-2px); box-shadow: var(--shadow-md)`.
- KPI numbers formatted with tabular figures for aligned visual clarity.
- Interactive status bars with tooltip / details hover.

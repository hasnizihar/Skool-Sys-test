# Attendance Register Page Overrides

> **PROJECT:** SkoolSys  
> **Page Type:** Daily Class Attendance Register & Offline Queue  
> ⚠️ **IMPORTANT:** Rules in this file **override** `design-system/skoolsys/MASTER.md`.

---

## Page-Specific Rules

### Register Segment Buttons
- Segmented 4-state buttons per student:
  - `[P] Present`: Emerald `#059669`, high contrast, check icon cue
  - `[A] Absent`: Crimson `#dc2626`, alert cue
  - `[L] Late`: Amber `#d97706`, clock cue
  - `[E] Excused`: Sapphire `#2563eb`, info cue
- **Touch Target Requirement**: Every button has a minimum tap footprint of `44×44px` on mobile/tablet to ensure zero mis-taps during fast morning roll call.
- Selected button has clear elevation, border ring, and distinct contrast against inactive sibling buttons.

### Bulk Action Toolbar
- Prominent top action row:
  - "Mark All Present" (Emerald accent button)
  - "Mark All Absent" (Muted danger button with prompt)
  - Date Picker with Today shortcut
  - Class selector with assigned teacher badges

### Real-Time Live Statistics Strip
- Real-time tally updates synchronously without page refresh as each student is tapped.
- Visual summary pill: Enrolled, Present, Absent, Late, Excused, and Attendance Percentage.

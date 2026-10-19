# SkoolSys UI/UX Design Plan

Kattankudy Central College | School Management System

Since the MVP is already functional, the next phase should focus on transforming SkoolSys into a polished, consistent, easy-to-use school administration platform, without rebuilding the existing features.

The design direction I recommend is Modern Academic Minimalism: clean white surfaces, deep institutional green, carefully controlled yellow accents, and subtle references to the college's identity.

## 1. Brand theme and color system

## Kattankudy Central College

SkoolSys • Management Portal

Primary

\#026536

Accent

\#F1EF22

Surface

\#FFFFFF

Canvas

\#F5F7F6

| Role            | Color     | Usage                                                     |
| --------------- | --------- | --------------------------------------------------------- |
| Primary green   | `#026536` | Sidebar, primary buttons, active navigation               |
| Academic yellow | `#F1EF22` | Highlights, selected indicators, small decorative accents |
| White           | `#FFFFFF` | Cards, forms, tables, dialogs                             |
| Canvas          | `#F5F7F6` | Main application background                               |
| Main text       | `#172B22` | Headings and content                                      |
| Muted text      | `#66766D` | Descriptions and metadata                                 |
| Border          | `#E2E9E4` | Subtle component boundaries                               |
| Pale green      | `#E8F4EC` | Soft highlights and selected backgrounds                  |

Important: Yellow should not be used for large backgrounds or normal body text. It works best as a small accent against green or with dark text. Keep green as the dominant brand color.

## 2. College logo treatment

The official Kattankudy Central College logo should remain unchanged in its original proportions and colors. Use it in the sidebar, login page, report-card header, and printable documents.

The logo should sit inside a white container when placed on a green background, with enough padding to preserve its details. Avoid adding shadows, gradients, or recoloring the actual emblem.

## 3. Application layout

The entire system should share one consistent layout: a fixed navigation sidebar, compact top bar, and spacious content area.

SkoolSys

Dashboard

Students

Attendance

Marks

Reports

Settings

Academic Year 2026

### Dashboard

Students

## 2,450

Teachers

## 126

Attendance

## 94.6%

Classes

## 68

Attendance Overview

This week

Conceptual dashboard preview with illustrative data, not live school records

On desktop, use a 240–260px sidebar. On tablets, collapse it to an icon rail. On phones, use a slide-out navigation drawer, while keeping attendance entry and student search easy to access.

## 4. UI/UX plan by module

| Module             | UI design direction                                                           |
| ------------------ | ----------------------------------------------------------------------------- |
| Login              | College logo, white login card, green branding panel, simple credentials form |
| Dashboard          | Summary cards, attendance trends, alerts, quick actions                       |
| Students           | Searchable table, grade/class filters, profile drawer, CSV import wizard      |
| Attendance         | Class selector, clear student roster, large status controls, sticky save bar  |
| Attendance Reports | Date filters, summary statistics, charts, export controls                     |
| Marks Entry        | Spreadsheet-style grid, keyboard navigation, autosave indicators              |
| Report Cards       | Clean A4 printable design with official college logo and signatures           |
| Admin Settings     | Organized settings categories, teacher assignments, user permissions          |
| Audit Logs         | Searchable chronological activity log with filters and detail panels          |

### Attendance screen: highest UX priority

Teachers should be able to finish marking a class in minutes. Prioritize large tap targets, bulk "Mark All Present", individual status changes, and a clearly visible count of unmarked students.

### Daily Attendance

Grade 10A • Monday, 19 October

Synced

28 / 30 Present

2 students absent

A. Mohamed Rizwan

Admission #1001

Present

F. Ayesha

Admission #1002

Present

M. Ibrahim

Admission #1003

Absent

Save Attendance

Illustrative layout. Actual attendance controls should also support Late and Excused.

## 5. Component design rules

- Typography: Inter for English UI, with a Tamil-compatible font such as Noto Sans Tamil where needed.
- Corners: 12px cards, 8px inputs/buttons, 16px larger panels.
- Spacing: Consistent 8px-based spacing system.
- Buttons: Green primary, white outlined secondary, red only for destructive actions.
- Tables: Compact but readable, sticky column headers, clear row hover states, pagination.
- Forms: Labels above fields, helpful validation messages, required indicators.
- Icons: Lucide icons with consistent stroke weight.
- Feedback: Toasts for successful actions, inline errors, confirmation dialogs for destructive actions.
- Accessibility: Visible keyboard focus, readable contrast, never communicate status by color alone.
- Offline status: Persistent but unobtrusive sync indicator showing Saved, Pending Sync, Offline, or Sync Failed.

## 6. UI implementation phases

Phase 1: Design system

Define color tokens, typography, buttons, inputs, cards, badges, tables, modals, and responsive breakpoints. Create reusable React components.

Phase 2: App shell and login

Redesign sidebar, top navigation, user menu, authentication screens, and dashboard.

Phase 3: Core teacher workflows

Students, attendance, marks entry, and report cards. Optimize for fast repetitive data entry.

Phase 4: Administration and polish

Reports, settings, audit logs, loading states, empty states, responsive layouts, and accessibility.

Phase 5: QA and rollout

Test actual teacher workflows on desktop and mobile, verify printing, offline behavior, role-specific navigation, and ensure existing API functionality remains unchanged.

## 7. Technical approach

For the existing React + TypeScript + Vite MVP, keep the current backend and business logic. Introduce a centralized design-token system and a reusable UI component layer, potentially using Tailwind CSS and shadcn/ui if they fit the existing project.

The redesign should be frontend-first, incremental, and non-destructive. Preserve authentication, RBAC, API contracts, attendance sync, marks calculations, and existing data workflows.

I couldn't verify an official high-quality college crest from the available search results, so the previews above use a temporary academic icon. The actual crest should be supplied as a transparent PNG or SVG rather than substituted with another school's logo.

Recommended final direction: white-first content area, deep green sidebar, yellow active navigation, restrained cards, and exceptionally practical attendance and marks screens. This will make SkoolSys feel like a professional institutional product rather than a generic admin dashboard.
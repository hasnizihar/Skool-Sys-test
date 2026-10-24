# KCC SkoolSys 2.0 — MVP Functionality Checklist

**Project:** Kattankudy Central College — SkoolSys 2.0  
**Baseline Acceptance:** PR-001 through PR-005 Accepted  
**Branch:** `feature/mvp-delivery`  
**Evaluation Date:** October 2026  
**Status:** MVP Fully Operational for Protected Demonstration

---

## 1. Core Modules Audit & Operational Status

| Module | Core Capability | Demonstration Status | Verification Method |
| :--- | :--- | :--- | :--- |
| **Authentication & Authorization** | Multi-role JWT authentication (`admin`, `class_teacher`, `subject_teacher`). Scoped access control via academic staff leadership authorizations (`principal`, `vice_principal_academic`, `section_head`). | **WORKING** | Automated unit tests (75 suites) & browser login verification. |
| **Student Management** | Student registry with admission numbering, full demographics, calling names, guardian relationship & contacts, and class enrollments across Grades 6–13. | **WORKING** | Verified via API endpoints (`GET /api/students`), real-time search, and profile page. |
| **Staff & Teacher Management** | Faculty directory, role assignments, subject specialization mapping, and class teacher designations. | **WORKING** | Verified via `GET /api/admin/users`, user management UI, and scoped access checks. |
| **Academic Years & Classes** | Active academic year (2026) with 3 terms, 18 classes (Grades 6 to 13), division allocations (A/B), and assigned homeroom teachers. | **WORKING** | Verified via `GET /api/academic/classes` and class roster endpoints. |
| **Subjects & Curriculum** | National curriculum subject catalogue (19 subjects) spanning Core, Religion, Aesthetics, Commerce, and Advanced Level Physical Science / Commerce streams. | **WORKING** | Verified via subject catalogue and `class_subjects` associations. |
| **Attendance Management** | Daily attendance registers, one-click present/absent/late/excused marking, offline IndexedDB caching with conflict resolution, and daily absentee follow-up rosters. | **WORKING** | Verified via 6 Chromium E2E browser tests and live attendance reports. |
| **Examination Management** | Lifecycle management for examinations (Draft → Scheduled → Approved → Published), term scheduling, and grade-band assessment policy profiles. | **WORKING** | Verified via 10 Chromium E2E browser tests and live examination workspace. |
| **Marks Moderation & Approvals** | Multi-tier moderation workflow: Teacher marks entry → Section Head review & endorsement → Principal final approval & publishing. | **WORKING** | Verified through end-to-end UI mutation tests and API state checks. |
| **Terminal Report Cards** | Automated calculation of student totals, averages, positions/ranks, subject grade letters (A/B/C/S/F), printable A4 report cards, and "REISSUED" post-publication tracking. | **WORKING** | Verified for Junior (Grade 8), O/L (Grade 11), and A/L (Grade 12) students. |
| **School Dashboard & Reporting** | Executive dashboard with total student counts, class distributions, attendance percentage trends, and system audit logs. | **WORKING** | Verified on live web application (`http://localhost:5173`). |
| **Audit Trail & Integrity** | Immutable audit logs for all security-sensitive events (login, attendance submission, marks modification, examination publication, corrections). | **WORKING** | Verified in SQLite `audit_logs` table and admin audit viewer. |

---

## 2. Tested Workflows Matrix

| # | User Story / Workflow | Actor | Expected Outcome | Verified Result |
| :---: | :--- | :--- | :--- | :---: |
| **W1** | Principal logs in and views school summary | Principal (`admin`) | Executive dashboard displays 62 students, 18 classes, 19 subjects, 3 exams. | **PASS** |
| **W2** | Office staff searches student by name/admission | Any authorized staff | Instant search returns matching students with demographic details. | **PASS** |
| **W3** | Class teacher marks daily attendance | Class Teacher (`teacher_nimali`) | Attendance register records student presence/absence; generates daily summary. | **PASS** |
| **W4** | Absentee follow-up phone call roster | Admin / Principal | Daily report generates list of absentees with guardian phone numbers (`077...`). | **PASS** |
| **W5** | Teacher enters marks for assigned subject | Subject Teacher (`teacher_samantha`) | Saves draft scores; validates min/max 0–100; calculates grade letters. | **PASS** |
| **W6** | Teacher submits marks sheet for review | Subject Teacher | Sheet locks from editing and advances to `submitted` status. | **PASS** |
| **W7** | Section Head reviews and endorses sheet | Section Head (`section_head_junior`) | Validates scores; leaves endorsement remarks; advances to `reviewed`. | **PASS** |
| **W8** | Principal approves and publishes exam | Principal (`admin`) | Exam status transitions to `published`; marks become immutable. | **PASS** |
| **W9** | Terminal report card generated | Student / Parent / Staff | Comprehensive A4 report card displays marks, grades, rank, and principal seal. | **PASS** |
| **W10** | Post-publication clerical correction | Subject Teacher & Principal | Formal correction workflow; updates marks; watermarks card as **REISSUED**. | **PASS** |

---

## 3. Deliberately Deferred Scope (Out of Scope for MVP)

The following items are intentionally deferred and are **NOT** part of the MVP demonstration:
- **PR-006: Automated Cloud Backup & Disaster Recovery:** Deferred to post-pilot phase upon formal infrastructure sign-off. Basic manual database backup/export is fully operational.
- **Automated SMS/WhatsApp Gateway:** Direct telecom SMS dispatch requires institutional aggregator contracts (Dialog/Mobitel/SLT). The MVP provides the exact phone roster for phone contact.
- **Online Parent Portal:** Public student/parent logins will be rolled out following the controlled on-premises pilot.
- **Online Fee / Finance Collection:** Out of scope for academic management baseline.

# Kattankudy Central College — SkoolSys 2.0
## PR-005 Gate 6: School-Readiness & Institutional Governance Checklist

**Document Version:** 2.0 (Post-Audit Closeout)  
**Date:** October 24, 2026  
**System:** KCC SkoolSys 2.0 (School Management System)  
**Target Pull Request:** PR-005 — Examination Management & Academic Integrity  
**Branch:** `feature/pr-005-examination-integrity`  
**Base Commit:** `19da58e4145c7e9a730c4abbe34fe2a04191be19`  
**Institutional Authority:** Principal / Academic Board of Kattankudy Central College  

---

### Executive Institutional Notice

Technical engineering and automated security verification of PR-005 (Automated Backend, Dynamic Authoritative Max Marks, Separation of Duties, Browser E2E, Optimistic Concurrency Control, and Disposable Seed Protection) are **100% complete and verified against 362 test assertions across 64 suites**.

**Critical Institutional Distinction:**
*Technical readiness does not constitute institutional policy approval.* Synthetic policy profiles stamped as "approved" during automated test fixture generation are strictly disposable testing fixtures and **must not be construed as genuine KCC leadership authorization**.

Prior to deploying SkoolSys 2.0 PR-005 into a live pilot or importing genuine KCC student records, the **Principal, Deputy Principal (Academics), Section Heads, and School Management Board** must review, calibrate, and formally approve the institutional parameters specified below.

---

### Four-Tier Classification Framework

Every checklist item in this institutional readiness review is strictly categorized into one of four states:

1. **[1] Implemented & Verified:** Fully built, schema-backed, covered by automated backend regression and Playwright Chromium browser tests.
2. **[2] Implemented but Awaiting Institutional Policy Approval:** Functional capabilities active in code, but requiring genuine KCC leadership calibration and formal ratification rather than synthetic defaults.
3. **[3] Proposed / Not Implemented:** Documented architectural options or desired future features that are *not* currently implemented in PR-005.
4. **[4] Required Before Controlled Pilot:** Mandatory governance, physical allocation, or operational prerequisites that must be satisfied before enrolling genuine students or teachers in a controlled pilot.

---

### Section 1: Academic Policies & Grading Standards Approval

| Item # | Governance Item | Implementation Reality in PR-005 Codebase | Institutional Decision Required | Classification | Authority Sign-Off |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **POL-01** | **National Grading Scale Nomenclature** | **Actual Implemented Scale:** 5-tier standard scale using letter `F` for failing mark:<br>• **A:** 75 – 100% (Distinction)<br>• **B:** 65 – 74% (Very Good)<br>• **C:** 50 – 64% (Credit)<br>• **S:** 35 – 49% (Ordinary Pass)<br>• **F:** 0 – 34% (Fail / Unsatisfactory)<br>*(Note: Proposed `W` nomenclature is **not implemented**; code enforces `F`).* | Confirm whether standard 5-tier A/B/C/S/F applies uniformly across all secondary grades (6–11) or if streaming-specific scales apply to Advanced Level (Grades 12–13). | **[2] Implemented (Awaiting Policy Approval)** | [ ] Principal<br>[ ] Academic Board |
| **POL-02** | **Authoritative Max Marks Calibration (FIX C)** | Persistent, schema-backed `max_score` defined at `examinations`, `examination_schedules`, and `marks_sheets` tables. Supports 50, 100, 200, and single-decimal precision scores. Teacher mark entry cannot override official maximum score. Normalizes to 100% for results & grade letters. | Establish standardized maximum score rules per assessment type:<br>• Monthly / Unit Assessments: 50 marks<br>• Standard Term Papers: 100 marks<br>• Combined Practical / Theory Papers: 200 marks | **[2] Implemented (Awaiting Policy Approval)** | [ ] Section Heads<br>[ ] Subject Coordinators |
| **POL-03** | **Assessment Policy Profiles (`assessment_policy_profiles`)** | Actual table: `assessment_policy_profiles`. Unapproved policies (`is_approved_by_school = 0`) trigger provisional warning notices `(Prov.)` on student report cards and marks listings. Stamping a synthetic approved profile in test scripts does not represent genuine KCC approval. | Principal must formally review and calibrate official JSON policy parameters (`grading_scale_json`, `absence_rules_json`, `ranking_rules_json`) for each grade band (`junior_6_9`, `ol_10_11`, `al_12_13`). | **[4] Required Before Controlled Pilot** | [ ] Principal |
| **POL-04** | **Minimum Passing Benchmark** | Implemented threshold is 35.0% normalized (`score >= (35.0 / 100.0) * max_score`). Scores strictly below 35.0% receive grade `F`. | Formally ratify 35% as the institution-wide passing benchmark across all secondary and collegiate streams. | **[2] Implemented (Awaiting Policy Approval)** | [ ] Academic Board |
| **POL-05** | **Absenteeism & Medical Exemption Protocols** | Supports `PRESENT`, `ABSENT`, `MEDICAL`, and `EXEMPT`. `ABSENT` awards 0 marks; `MEDICAL` and `EXEMPT` yield null scores without penalizing student GPA or rank averages. Prohibits numeric marks on non-present statuses. | Formalize institutional criteria for medical certificate submission and validation prior to teachers recording `MEDICAL` vs `ABSENT`. | **[2] Implemented (Awaiting Policy Approval)** | [ ] Vice Principal (Academic) |

---

### Section 2: Staff Appointments, Teaching Allocations & Separation of Duties

| Item # | Governance Item | Implementation Reality in PR-005 Codebase | Institutional Decision Required | Classification | Authority Sign-Off |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AUTH-01** | **Academic Leadership Appointments (`academic_staff_authorizations`)** | Actual table: `academic_staff_authorizations`. Enforces strict grade-band scoping:<br>• `junior_6_9`: Grades 6–9 (Junior Secondary)<br>• `ol_10_11`: Grades 10–11 (O-Level)<br>• `al_12_13`: Grades 12–13 (A-Level / Collegiate)<br>• `all`: Principal / Vice Principal School-Wide Scope | Appoint specific staff members to leadership roles (`principal`, `vice_principal_academic`, `section_head`, `exam_coordinator`) for active academic year `2026`. | **[4] Required Before Controlled Pilot** | [ ] Principal |
| **AUTH-02** | **Subject Teacher Allocations (`teacher_assignments`)** | Actual table: `teacher_assignments`. Enforces least privilege: only verified actively assigned subject teachers can save draft marks or submit sheets. Unassigned staff, cross-class teachers, and deactivated accounts receive `403 Forbidden`. | Complete master timetable allocations in `teacher_assignments` for all subjects across all classes before marks entry begins. | **[4] Required Before Controlled Pilot** | [ ] Timetable Committee<br>[ ] Section Heads |
| **AUTH-03** | **Administrative Access Guardrails (FIX B Verified)** | Plain IT administrators (`role = 'admin'`) **cannot** access unpublished marks sheets, published marks sheets, or student report cards without holding a valid, in-scope academic appointment in `academic_staff_authorizations`. | Acknowledge and affirm institutional segregation of duties between IT technical administration and Academic Leadership supervision. | **[1] Implemented & Verified** | [ ] Principal |
| **AUTH-04** | **Anti-Self-Review Enforcement** | Implemented segregation: A teacher who enters or edits marks for a subject is permanently blocked from endorsing or approving their own marks sheet (`SELF_REVIEW_TEACHER` / `SELF_REVIEW_ENTRANT`), even if they hold Section Head authorization. | Establish peer-review protocols for classes directly taught by Section Heads (reviewed by Vice Principal or Principal). | **[1] Implemented & Verified** | [ ] Vice Principal (Academic) |

---

### Section 3: Examination Operations, Timetables & Post-Publication Appeal

| Item # | Governance Item | Implementation Reality in PR-005 Codebase | Institutional Decision Required | Classification | Authority Sign-Off |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **EXAM-01** | **Examination Assessment Schedules (`examination_schedules`)** | Actual table: `examination_schedules`. Implemented fields:<br>• `examination_id`, `class_id`, `subject_id`<br>• `max_score` (authoritative per assessed subject)<br>• `is_required` (compulsory vs optional)<br>• `status` (`draft`, `approved`), `approved_by_user_id`, `approved_at`<br>*(Note: Detailed timetable fields like exam date, start time, and duration are **proposed / not implemented**).* | Finalize list of assessed subjects per class and approve schedules prior to marks sheet generation. | **[1] Implemented & Verified** | [ ] Examination Committee |
| **EXAM-02** | **Detailed Timetable Operational Fields (Date, Time, Duration)** | **Not implemented in PR-005.** Master exam timetable schedule management currently operates outside SkoolSys (via physical notices or administrative timetable sheets). | Decide whether operational examination timetable scheduling should be added in a future enhancement (PR-007+). | **[3] Proposed / Not Implemented** | [ ] Examination Committee |
| **EXAM-03** | **Marks Entry Window & Deadline Enforcement** | **Not implemented in PR-005.** The system enforces workflow status gates (`draft` -> `submitted` -> `reviewed` -> `approved` -> `published`), but does *not* automatically lock sheets based on a calendar deadline timestamp. | Define school administrative policy for marks entry cutoffs (e.g. 10 school days after examination conclusion) enforced administratively. | **[3] Proposed / Not Implemented** | [ ] Academic Board |
| **EXAM-04** | **Post-Publication Mark Correction Window (`correction_window_days`)** | Implemented default: **21 calendar days** in `assessment_policy_profiles.correction_window_days` from official publication date (`e.published_at`). Requires authoritative lookup, difference calculation, and change category. *(Note: Proposed 30-day window was an inaccurate proposal; 21 days is the implemented default).* | Confirm whether the 21-calendar-day appeal window is acceptable or if a custom window (e.g., 14 or 30 days) should be configured in policy profiles. | **[2] Implemented (Awaiting Policy Approval)** | [ ] Principal |
| **EXAM-05** | **Correction Approval Workflow** | Implemented workflow: **Single-tier direct leadership approval**. Any in-scope academic leader (`principal`, `vice_principal_academic`, `section_head`, `exam_coordinator`) can review, approve, or reject pending corrections with atomic ledger updates and audit logging. *(Note: Proposed mandatory sequential 2-tier review requiring Section Head review prior to Principal approval is **not implemented**).* | Ratify single-tier academic leadership approval workflow and establish internal school guidelines on who reviews specific correction categories. | **[1] Implemented & Verified** | [ ] Principal |

---

### Section 4: Data Integrity, Roster Verification & Infrastructure Safeguards

| Item # | Governance Item | Implementation Reality in PR-005 Codebase | Institutional Decision Required | Classification | Authority Sign-Off |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DATA-01** | **Student Master Registry Verification** | Active student records with unique Admission Numbers, Full Names, Gender, Date of Birth, Guardian Information. Strict enrollment validation blocks alien student marks entry. | Reconcile student master roster against physical school admission registers prior to importing into live database. | **[4] Required Before Controlled Pilot** | [ ] Administrative Officer<br>[ ] Class Teachers |
| **DATA-02** | **Student Subject Enrollments (`student_subject_enrollments`)** | Positive eligibility required: participating students must have confirmed subject enrollments (`confirmed`). Non-enrolled, dropped, or transferred students are prevented from receiving marks. | Complete subject basket option allocations for Grades 10–11 (O/L baskets 1, 2, 3) and Grades 12–13 (A/L streams) in `student_subject_enrollments`. | **[4] Required Before Controlled Pilot** | [ ] Section Heads |
| **DATA-03** | **Seed Safety & Existing Data Protection (FIX A Verified)** | System scans all user tables in `sqlite_master` (excluding SQLite internals and markers). If any application table contains data, seed operations are strictly blocked unless a positive, verified disposable fixture marker (`_skoolsys_disposable_marker`) is present. Production/staging databases (`skoolsys.db`) cannot be overwritten. | Maintain rigorous environment segregation; ensure production host environment variable `NODE_ENV=production` is set. | **[1] Implemented & Verified** | [ ] Systems Administrator |
| **DATA-04** | **Database Backup & Disaster Recovery Mechanism** | **Implemented:** Pre-migration atomic backup with timestamped snapshot generation (`createSafeDatabaseBackup`) and WAL checkpointing.<br>**Awaiting Infrastructure Setup:** Automated recurring cron backup execution and encrypted offsite replica rotation. | Provision server backup cron job to execute daily snapshots during active examination marking windows; establish offsite storage protocol. | **[4] Required Before Controlled Pilot** | [ ] Systems Administrator |

---

### Institutional Sign-Off Register (Prior to Pilot Deployment)

```
================================================================================
KATTANKUDY CENTRAL COLLEGE — SKOOLSYS 2.0 ACADEMIC GOVERNANCE SIGN-OFF
================================================================================

1. Principal Sign-Off:
   Name: _____________________________________   Signature: ___________________
   Date: _____________________________________   Status:    [ ] Approved  [ ] Conditional

2. Deputy Principal (Academics):
   Name: _____________________________________   Signature: ___________________
   Date: _____________________________________   Status:    [ ] Approved  [ ] Conditional

3. Examination Committee Chairperson:
   Name: _____________________________________   Signature: ___________________
   Date: _____________________________________   Status:    [ ] Approved  [ ] Conditional

4. Systems Administrator / Infrastructure Lead:
   Name: _____________________________________   Signature: ___________________
   Date: _____________________________________   Status:    [ ] Approved  [ ] Conditional

================================================================================
```

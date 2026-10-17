# MVP Plan: School Management System

For your Grade 6–13 school with 1,500–3,000 students, the MVP should deliver one reliable outcome: manage student records, take daily attendance, and maintain examination marks through a modern interface, even when the internet temporarily goes down.

The goal is not to build every feature a school might eventually need. It is to launch a secure, usable system that a small group of teachers can test, then expand to the whole school.

## 1. MVP scope

Module 1: Student management

MVP essential

- Student admission number and personal profile
- Guardian and contact details
- Grade, class and enrollment status
- Search, filter, edit and view student records
- CSV import and validation

Module 2: Daily attendance

Highest priority

- One register per class per school day
- Present, absent, late and excused statuses
- Bulk marking and individual corrections
- Save confirmation and duplicate prevention
- Daily and monthly attendance reports
- Offline recording and synchronization

Module 3: Marks management

Essential

- Subjects assigned to each class
- Terms and examinations
- Marks entry and validation
- Subject-wise results and class summaries
- Student result history and printable report

Module 4: Administration and security

Required

- Admin and teacher accounts
- Teacher-to-class assignments
- Role-based permissions
- Audit log for sensitive changes
- Backup and restore procedures

## 2. What to exclude from the MVP

Do not delay the first release by building these features yet:

- Parent and student portals
- SMS or WhatsApp notifications
- Fee collection, accounting and payroll
- Library, transport and inventory
- Biometric or facial-recognition attendance
- Mobile apps distributed through app stores
- Advanced analytics and AI predictions

A responsive, installable web app is sufficient for the initial release.

## 3. User roles and permissions

The MVP should have three roles, with the third restricted to system configuration and support.

| Capability                  | Administrator | Class teacher       | Subject teacher        |
| --------------------------- | ------------- | ------------------- | ---------------------- |
| Manage student records      | Full          | View assigned class | View assigned students |
| Manage classes and subjects | Full          | No                  | No                     |
| Take daily attendance       | All classes   | Assigned class      | No                     |
| Enter examination marks     | All subjects  | If assigned         | Assigned subjects      |
| View reports                | All           | Assigned class      | Assigned subjects      |
| Manage user accounts        | Full          | No                  | No                     |
| View audit history          | Full          | No                  | No                     |

For a small pilot, one teacher may hold both teacher roles. Permissions should be determined by the server, not merely by hiding buttons in the interface.

## 4. Recommended application structure

Use a modular monolith with one backend and one primary database.

React + TypeScript PWA

Dashboard · Students · Attendance · Marks · Reports

Django REST API

Authentication · Validation · Permissions · Audit · Sync

PostgreSQL

Students · Classes · Attendance · Exams · Marks

Offline component: the PWA stores a minimal assigned-class roster and pending attendance changes in IndexedDB. During a school-wide internet outage, teachers connect to a local school server that runs the same application backend and a local PostgreSQL database for attendance. When connectivity returns, queued changes synchronize with the cloud.

For the MVP, keep student administration and marks online-only. Offline attendance is the only feature that needs synchronization. This substantially reduces complexity.

Important: the local server must have its own durable queue, authenticated teacher access, duplicate detection and explicit conflict handling. A browser cache alone is not sufficient for the school-wide fallback.

## 5. Core database design

These are the primary entities to implement first.

| Table                 | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `users`               | Teacher and administrator accounts        |
| `students`            | Personal and guardian information         |
| `academic_years`      | School years and enrollment periods       |
| `classes`             | Grade and class division, e.g. Grade 8-A  |
| `enrollments`         | Student-to-class membership by year       |
| `teacher_assignments` | Teachers assigned to classes and subjects |
| `subjects`            | School subjects                           |
| `attendance_sessions` | One register per class per date           |
| `attendance_records`  | Each student's attendance status          |
| `examinations`        | Term and examination definitions          |
| `marks`               | Student marks per examination and subject |
| `audit_logs`          | Traceable record of sensitive changes     |

Use a permanent admission number for each student. Attendance records should be unique for each student within an attendance session, and the database should enforce this rule.

For marks, enforce valid score ranges and uniqueness for the applicable student, examination and subject combination. Preserve historical enrollment and marks when students progress from Grade 6 to Grade 13.

## 6. Six-week MVP development roadmap

Target: a pilot-ready release in approximately six weeks with a focused development team using AI coding tools. The offline LAN component is the main schedule risk.

## W1

Foundation

Project setup and UI foundation

- Create the Git repository, React frontend and Django API.
- Configure PostgreSQL, Docker and environment variables.
- Design navigation, typography, colors, forms, tables and responsive layouts.
- Implement login, logout and role-based access.
- Set up automated tests and development environments.

## W2

Students

Student database and school structure

- Build grade, class, subject and academic-year configuration.
- Implement student creation, editing, search and profile pages.
- Import student data through a validated CSV workflow.
- Add duplicate detection and enrollment history.

## W3

Attendance

Daily attendance workflow

- Build class selection and fast roster-based attendance.
- Implement bulk status changes, corrections and save confirmation.
- Prevent duplicate registers and attendance records.
- Create daily totals, absent-student lists and monthly reports.

## W4

Marks

Examinations and academic results

- Configure terms, exams, subjects and maximum marks.
- Implement teacher-authorized marks entry and validation.
- Generate subject summaries and individual result reports.
- Record changes to submitted or published marks.

## W5

Offline

Offline attendance and LAN fallback

- Add PWA installation and browser-side attendance queues.
- Deploy the school-local attendance service.
- Implement authenticated synchronization and duplicate prevention.
- Test internet outages, device disconnections, repeated submissions and conflicts.

## W6

Release

Security testing and pilot launch

- Test role permissions, input validation and API security.
- Verify backup restoration and audit trails.
- Import a small, verified set of school data.
- Train pilot teachers and run a parallel attendance process.
- Fix issues before expanding to all classes.

## 7. MVP acceptance criteria

The system is ready for a pilot when all of these are true:

### Release checklist

0/10

Admin can configure Grades 6–13, classes, subjects and academic years.

Student records can be imported, searched, edited and exported securely.

Teachers can access only their assigned classes and subjects.

Each class can complete one attendance register per school day.

Attendance totals and monthly percentages match verified test cases.

Marks can be entered, validated, and reported without unauthorized access.

Attendance can be recorded during an internet outage through the school LAN.

Queued attendance synchronizes without duplicate records or silent data loss.

Backups can be restored, and sensitive changes appear in audit logs.

The system passes a load test using the expected peak number of concurrent users.

## 8. What comes after the MVP?

Once the core system is stable, the next release can add:

- Parent and student portals with carefully restricted access.
- Automated absence notifications.
- Sinhala and Tamil interface translations.
- Bulk report-card PDF generation.
- More advanced attendance analytics.
- Better offline support for other workflows, if teachers need it.

## My final recommendation

Build the MVP with React + TypeScript + Django REST Framework + PostgreSQL, with the PWA and LAN attendance fallback treated as a specific, independently tested subsystem.

Start with the student database and attendance workflow. Introduce marks management next, then complete the offline synchronization and security work before the pilot launch.

One final design decision is worth settling before development: Will teachers use their own phones, school-provided computers, or both? That determines the attendance screen layout, device-management requirements and how offline data should be protected.
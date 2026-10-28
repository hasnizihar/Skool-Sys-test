# SkoolSys 2.0 — Regression Test & Verification Plan

**Project:** SkoolSys — School Management System  
**Document:** Regression Test Plan & Quality Assurance Gates  
**Version:** 2.0  

---

## 1. Quality Objectives & Regression Floor

The UI/UX redesign must enhance usability, aesthetics, and accessibility without compromising any established backend contracts, security boundaries, or offline persistence rules.

### Quality Floor Mandates:
1. **Zero Breaking Backend Changes:** Express routes, SQL queries, migration scripts, and seed files must remain untouched.
2. **Zero Loss of Offline Work:** Teachers' offline registers in IndexedDB must persist seamlessly through the visual update.
3. **Strict Role-Based Security:** Client-side visual enhancements must not expose unauthorized data or operations.
4. **100% Pass on Existing Verification Suites:** All backend unit tests, browser Playwright tests, and build checks must pass without errors.

---

## 2. Regression Test Matrix

| Subsystem | Test Case ID | Test Description | Expected Behavior | Verification Command / Method |
| :--- | :--- | :--- | :--- | :--- |
| **Auth & Roles** | `REG-AUTH-01` | Role-based navigation filtering | Teachers cannot see Admin or Audit tabs in navigation. | Automated test & manual inspection |
| **Auth & Roles** | `REG-AUTH-02` | Session expiry & invalidation | Invalid or expired token triggers clean redirect to login without crashing. | `npm.cmd --prefix server run test` |
| **Attendance** | `REG-ATT-01` | Rapid single-class register entry | Marking 40 students with "Mark All Present" + 2 exceptions completes in < 90s. | Manual & Playwright timer |
| **Attendance** | `REG-ATT-02` | Offline IndexedDB queueing | When network is severed, submit stores record into `attendance_mutations`. | IndexedDB inspection in DevTools |
| **Attendance** | `REG-ATT-03` | Reconnection auto-sync | Restoring network triggers `/api/attendance/sessions/bulk-sync` automatically. | Playwright offline toggle test |
| **Attendance** | `REG-ATT-04` | Concurrency conflict handling | Modifying a session from 2 devices triggers HTTP 409 and opens Diff Resolver. | `test/attendance_concurrency.test.ts` |
| **Students** | `REG-STU-01` | Student search & filter | Filtering by Grade 8 and Class 8-A displays exactly enrolled students. | Client UI verification |
| **Students** | `REG-STU-02` | Duplicate admission number block | Adding a student with existing admission number throws clear validation error. | Form submission test |
| **Marks** | `REG-MRK-01` | Dynamic max score validation | Entering 55 on a 50-mark exam triggers instant red validation error. | Client grid keyboard input |
| **Marks** | `REG-MRK-02` | Automated grade calculation | Entering score calculates correct grade (A/B/C/S/F) dynamically without refresh. | UI calculation assertion |
| **Marks** | `REG-MRK-03` | Exam publication & SHA-256 seal | Principal publishing exam seals snapshot with authentic SHA-256 hash. | `test/examination_workflow.test.ts` |
| **Report Card** | `REG-RPT-01` | Official A4 print layout | Printing report card fits cleanly on A4 without unwanted page breaks. | Headless Chrome print test |
| **Admin** | `REG-ADM-01` | Danger Zone confirmation guard | Restoring database requires typing exact confirmation string before execution. | UI modal test |

---

## 3. Test Suites & Execution Commands

Before and after every frontend milestone, the following commands must be run and pass with zero failures:

### 3.1 Client Build & Lint Verification
```powershell
npm.cmd --prefix client run lint
npm.cmd --prefix client run build
```

### 3.2 Backend Unit & Integration Tests
```powershell
npm.cmd --prefix server run test
```

### 3.3 End-to-End Real Browser Playwright Tests
```powershell
npm.cmd --prefix server run test:browser
```

### 3.4 Specific Domain Regression Tests
- **Attendance Integrity:**
  ```powershell
  npx.cmd tsx server/test/attendance_integrity.test.ts
  ```
- **Examination Lifecycle & Security Matrix:**
  ```powershell
  npx.cmd tsx server/test/examination_workflow.test.ts
  npx.cmd tsx server/test/security_matrix.test.ts
  ```
- **Principal Real Browser Walkthrough:**
  ```powershell
  npx.cmd tsx server/test/principal_walkthrough_browser_real.test.ts
  ```

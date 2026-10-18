# SkoolSys 2.0 — DEMO ONLY Quick Start

**Not for production. Entire database consists of synthetic fictional student data and insecure demonstration passwords.** The provided database is deliberately separate from `server/skoolsys.db`.

## What is included

- 1 academic year, 18 classes (Grades 6–13), 360 students (20 per class)
- 21 users: 1 principal, 18 class teachers, 2 subject teachers
- 17 subjects, 138 class-subject links, 42 teacher assignments
- 10 school days (2026-10-05 through 2026-10-16): 180 attendance sessions, 3,600 attendance records
- 3 examinations, 1,420 marks entries (published Term 1 samples plus unpublished Term 2 samples)
- Dummy contact information, fake `.test` emails, and `DEMO` admission numbers
- SQLite `PRAGMA foreign_key_check` returns no violations

## Demo accounts (local-only)

| Role | Username | Password |
|---|---|---|
| Principal/Admin | `admin` | `admin123` |
| Class Teacher | `demo_class_01` | `teacher123` |
| Subject Teacher | `teacher_math` | `teacher123` |
| Subject Teacher | `teacher_science` | `teacher123` |

> Do not put this database on any public server. Existing SkoolSys authentication has serious vulnerabilities and the app itself may prefill example credentials.

## Open in Windows PowerShell (two terminals)

**Terminal 1** (from project root):

```powershell
cd server
npm ci
$env:DB_PATH = (Resolve-Path '.\demo\skoolsys-demo.db').Path
$env:JWT_SECRET = 'local-demo-only-secret-change-me-2026-abcdef'
npm run dev
```

**Terminal 2** (from project root):

```powershell
cd client
npm ci
npm run dev
```

Visit `http://localhost:5173` and log in with one of the local demo accounts.

These commands require Node.js >=22 with `node:sqlite` support; the supplied ZIP does not include platform-specific `node_modules` or compiled builds. Dependencies must be installed on your own machine.

To examine populated daily attendance on the current unpatched client, select **2026-10-16** in Attendance Reports / the attendance date picker. The dashboard is still hardcoded to 2026-10-17 (a known defect); its default attendance percentage is not trustworthy.

## Generate a new demo database

```powershell
cd server
npm ci
npm run demo:create
```

The generator **refuses to overwrite** an existing `server/demo/skoolsys-demo.db`. It never targets `server/skoolsys.db` and does not need a production DB or any credentials. If you intentionally want to regenerate, separately archive/delete ONLY the explicitly named `server/demo/skoolsys-demo.db` after verifying its path, then rerun. Do not point `DB_PATH` to a real school database.

## Safety warnings

- Never click the admin **Reset/Re-seed Database** button while connected to a real school database. `npm run seed` and `/api/admin/reset-seed` are destructive.
- Never test Restore on real data. It currently fails after partially deleting tables.
- The 2026-10-16 attendance is demo data, not a prediction or actual record.
- School production rollout is blocked until auth, per-record permissions, backup atomicity, offline sync conflicts, and exam publishing are fixed and independently tested.

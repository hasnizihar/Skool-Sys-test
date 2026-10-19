# SkoolSys 2.0 — Testing & Quality Assurance Architecture

This document outlines the testing strategy, test harness architecture, and execution procedures for SkoolSys 2.0.

---

## 1. Testing Philosophy & Safety Rules

1. **Strict Data Isolation**: Automated tests must **never** connect to, read from, or write to a real school database, staging database, or local development `skoolsys.db`.
2. **Deterministic Synthetic Fixtures**: All tests run against strictly synthetic user, student, teacher, and class records created in `os.tmpdir()`.
3. **Zero Leaks**: Secrets, passwords, hashes, and student data are never logged or exported in test assertions.
4. **Deterministic Teardown**: Each test suite tears down its temporary database and deletes all associated SQLite WAL (`-wal`) and shared memory (`-shm`) files.
5. **Zero-Dependency Native Harness**: Tests use Node.js built-in `node:test`, `node:assert/strict`, and native `fetch`, eliminating fragile heavy test framework dependencies.

---

## 2. Test Architecture & Harness

```
server/
  ├── test/
  │   ├── helpers/
  │   │   ├── testDb.ts       # Temp DB creation, schema sync, synthetic seeding & cleanup
  │   │   └── testServer.ts   # Port-0 ephemeral HTTP server launcher with native fetch client
  │   ├── health.test.ts      # Health endpoint smoke test
  │   ├── auth.test.ts        # Authentication & token verification tests
  │   ├── isolation.test.ts   # Database isolation & workspace immunity verification
  │   └── security_matrix.test.ts # Negative authorization & role boundary matrix
```

### 2.1. Ephemeral Server Pattern (`testServer.ts`)
To prevent port collisions during parallel or sequential test runs, `startTestServer()` spins up an Express server on port `0`. The operating system dynamically assigns an available ephemeral port. Requests are executed using standard Web `fetch`.

### 2.2. Dynamic Database Rebinding (`database.ts`)
The server's SQLite instance is wrapped in a transparent `Proxy`. Calling `switchDatabase(fixtures.dbPath)` rebinds all internal route queries directly to the temporary test database without altering route handler code.

---

## 3. Test Suites Implemented in PR-001

### Suite 1: API Health Smoke Test (`health.test.ts`)
- Verifies `GET /api/health` returns `200 OK`.
- Verifies system status (`healthy`), database connectivity (`connected`), and version metadata.

### Suite 2: Authentication Baseline (`auth.test.ts`)
- `POST /api/auth/login`: Authenticates valid synthetic credentials and returns valid JWT.
- `POST /api/auth/login`: Rejects invalid passwords with `401 Unauthorized`.
- `POST /api/auth/login`: Rejects non-existent users with `401 Unauthorized`.
- `POST /api/auth/login`: Rejects missing credentials with `400 Bad Request`.
- `POST /api/auth/login`: Rejects deactivated accounts (`is_active = 0`) with `401 Unauthorized`.
- `GET /api/auth/me`: Rejects unauthenticated calls without token (`401 Unauthorized`).
- `GET /api/auth/me`: Rejects forged or corrupted JWT tokens (`401 Unauthorized`).
- `GET /api/auth/me`: Accepts valid Bearer token and returns authenticated teacher profile and class assignments.

### Suite 3: Database Isolation Verification (`isolation.test.ts`)
- Verifies the test database is created strictly within `os.tmpdir()`.
- Verifies that inserting, updating, or deleting records in the test DB does not alter `skoolsys.db` in the workspace.
- Verifies synthetic fixture entity counts and referential integrity.

### Suite 4: Security Baseline & Negative Authorization Matrix (`security_matrix.test.ts`)
- Unauthenticated access rejection across `/api/admin/users`, `/api/students`, `/api/marks/sheet`, and `/api/attendance/session`.
- Role-based boundary enforcement:
  - Class Teacher cannot access user administration (`403 Forbidden`).
  - Subject Teacher cannot access user administration (`403 Forbidden`).
  - Non-admin cannot create users (`403 Forbidden`).
  - Administrator can access user administration (`200 OK`).
  - Teacher cannot submit attendance for an unassigned class (`403 Forbidden`).

---

## 4. Running Tests

### Running All Tests
```bash
# From repository root:
npm test

# Or within server directory:
cd server
npm test
```

### Running a Specific Test File
```bash
cd server
npx tsx --test test/auth.test.ts
```

---

## 5. Adding New Test Suites

When writing new tests for upcoming PRs (e.g., PR-002, PR-003):

1. Import `setupIsolatedTestDb` and `teardownIsolatedTestDb` from `./helpers/testDb.js`.
2. Import `startTestServer` from `./helpers/testServer.js`.
3. In `before()`, instantiate fixtures, set `process.env.DB_PATH`, and launch the test server.
4. In `after()`, close the server, close the database connection via `closeDatabase()`, and clean up via `teardownIsolatedTestDb(fixtures.dbPath)`.
5. Keep each test file fully independent and self-contained.

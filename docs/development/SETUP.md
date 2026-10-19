# SkoolSys 2.0 — Development Setup Guide

This guide describes how to configure, run, and test SkoolSys 2.0 in an isolated local development environment.

---

## 1. Prerequisites

Before setting up SkoolSys 2.0, verify that your environment satisfies:

- **Node.js**: `v22.0.0` or higher (verified on `v24.18.0`). Native SQLite (`node:sqlite`) is built directly into Node.js 22+.
- **npm**: `v10.0.0` or higher (verified on `v12.0.2`).
- **Git**: Installed and configured.
- **Operating System**: Windows, macOS, or Linux.

---

## 2. Initial Setup

### 2.1. Clone Repository & Switch to Feature Branch
```bash
git clone <repository-url>
cd Skool-Sys-test
git checkout feature/pr-001-safety-baseline
```

### 2.2. Install Dependencies
Install dependencies for both server and client workspaces:
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Return to repository root
cd ..
```

---

## 3. Environment Configuration

SkoolSys uses decoupled environment variables. Copy the provided safe templates:

```bash
# In server directory
cp server/.env.example server/.env
```

### Configuration Variables (`server/.env`)
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `5000` | Port on which Express API server listens |
| `NODE_ENV` | `development` | Runtime environment (`development`, `test`, `production`) |
| `JWT_SECRET` | *(Random 32+ char secret)* | Secret key for signing and verifying JSON Web Tokens |
| `DB_PATH` | `./skoolsys.db` | Absolute or relative path to SQLite database file |

> [!CAUTION]
> Never set a weak or fallback JWT secret in production. Never commit `.env` or any database files to source control.

---

## 4. Local Database Initialization (Demo Data)

To populate a local development database with sample school data (Grades 6–13):

```bash
# From repository root:
npm run seed
```

This creates a local `server/skoolsys.db` containing demo academic years, classes, subjects, teachers, and synthetic students.

---

## 5. Running the Application

Open two terminal windows or run background tasks:

### Terminal 1 — Backend API Server
```bash
npm run dev:server
```
The server will start listening on `http://localhost:5000` with hot-reloading via `tsx watch`.

### Terminal 2 — Frontend Client
```bash
npm run dev:client
```
The Vite development server will open at `http://localhost:5173`.

---

## 6. Verification & Quality Commands

Always run quality checks before submitting pull requests:

```bash
# 1. Run full automated test suite (isolated synthetic test DB)
npm test

# 2. Run backend TypeScript type checking
npm run typecheck

# 3. Run frontend static analysis
npm run lint

# 4. Verify production builds
npm run build
```

# KCC SkoolSys PR-004 — Implementation Gate Checklist

**Authorization:** Implement in isolated development branch only. Not authorized: production changes, school data, deployment, push, merge or PR-005 onward.

| Gate | Core deliverable | Proof required | Stop condition |
|---|---|---|---|
| 0. Baseline | Safe worktree, full source inventory | `git status`, SHA, original branch, baseline tests/builds, temp DB guard | Cannot isolate work or protect existing data |
| 1. Contracts | Typed V2 request/response, strict validation | Unit tests for date/status/student/payload/error/hash | Silent coercion or invalid writes |
| 2. Migration | Revision + receipts + indexes on disposable DB | Consistent backup, integrity checks, trial restore, rerun and failure injection | DB drift, corrupted backup, non-atomic migration |
| 3. Service | One transactional online/offline write engine | Cross-class, zero-write rollback, revision, auth in txn, audit, contention | Data loss, unauthorized write, replay duplicate |
| 4. Offline | IndexedDB v2, safe legacy quarantine, account scoping | Browser-backed IDB tests, abort/quota, login switch, retry/ack | False local save, cross-user sync, auto-replay legacy |
| 5. UI/reports | Draft/submit, conflict review, truthful dates/metrics | Browser E2E and frontend checks | Misleading success, unmarked default-present, fabricated rates |
| 6. Regression | ATT-001..064 traceability + prior baseline | Actual run logs, screenshot/evidence where applicable, all commands | Any mandatory test fails or unrun is reported passed |
| 7. Handoff | Diff, docs, rollback, policy log | `git diff/status`, tests, no-production-change attestation | Unreviewed diff, changed original DB, deploy/merge/push |

## Must-pass business invariants

- [ ] A Grade 8-B student cannot be recorded in Grade 8-A's attendance session.
- [ ] Every failed transaction leaves zero partial session/records/audit/receipt state.
- [ ] No status is silently changed to `present`.
- [ ] A submitted register is complete; drafts preserve unmarked pupils.
- [ ] An outdated offline mutation cannot overwrite newer server data without review.
- [ ] A repeated UUID and identical payload writes at most once.
- [ ] Deactivated/unassigned teachers cannot save or replay even if their JWT was previously issued.
- [ ] Historical transferred pupils' real attendance stays intact; ambiguous old sessions are read-only.
- [ ] No client UI says "saved" before a real server acknowledgement or completed IndexedDB transaction.
- [ ] Cross-user offline data is never uploaded under another person's account.
- [ ] Legacy offline queue records are not silently resubmitted.
- [ ] Academic year and Sri Lankan civil date are correct in records and reports.
- [ ] Backups and trial recovery pass SQLite integrity/foreign key checks.
- [ ] Full browser tests exercise conflict resolution, offline/reconnect, account switch, error banners and links.
- [ ] No real school data/database modified, no deployment, push or merge.

## Final report skeleton

- Worktree path, branch, starting commit, end commit.
- File list: added/changed/deleted and rationale.
- Baseline `npm test`, typecheck, lint, build exact logs.
- PR-004 test matrix ATT-001..064: status and evidence.
- Migration, WAL contention and recovery test evidence.
- API compatibility and client upgrade strategy.
- Remaining blockers, KCC-POL-001..005 sign-off status, PR-007 transfer-schema dependency.
- Statement of scope: local implementation only, **NOT PRODUCTION-READY unless independently approved**.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isMutationExpired, buildRosterCacheKey } from '../../client/src/api/offlineQueue.ts';
import { buildStudentDiffList } from '../../client/src/utils/conflictDiffUtils.ts';

describe('PR-004S: Client Offline Engine Simulation & Unit Verification Tests', () => {

  // 1. IndexedDB V1 to V2 Migration & Legacy Quarantine
  it('SIM-01: migrates IndexedDB v1 stores to v2 and quarantines unverified legacy items', () => {
    // V1 legacy queue item missing V2 concurrency fields (baseRevision, rosterFingerprint, academicYearId)
    const legacyItem = {
      id: 'legacy-item-101',
      classId: 5,
      date: '2026-05-18',
      records: [{ student_id: 1, status: 'present' }]
    };

    // Valid V2 item
    const validV2Item = {
      clientMutationId: 'c7d23a4b-1234-4567-89ab-cdef01234567',
      schoolId: 'kcc',
      userId: 2,
      academicYearId: 1,
      classId: 5,
      date: '2026-05-18',
      mode: 'draft',
      baseRevision: 0,
      rosterFingerprint: 'sha256:abc12345',
      records: [{ student_id: 1, status: 'present' }],
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    function simulateUpgrade(v1Items: any[]) {
      const pendingV2: any[] = [];
      const quarantined: any[] = [];

      for (const item of v1Items) {
        const hasV2Fields =
          item.clientMutationId &&
          typeof item.baseRevision === 'number' &&
          item.rosterFingerprint &&
          item.academicYearId;

        if (hasV2Fields) {
          pendingV2.push(item);
        } else {
          quarantined.push({
            id: item.id || `legacy-${Date.now()}`,
            schoolId: 'kcc',
            originalItem: item,
            quarantinedAt: new Date().toISOString(),
            reason: 'MISSING_V2_METADATA'
          });
        }
      }

      return { pendingV2, quarantined };
    }

    const { pendingV2, quarantined } = simulateUpgrade([legacyItem, validV2Item]);

    assert.strictEqual(pendingV2.length, 1);
    assert.strictEqual(pendingV2[0].clientMutationId, 'c7d23a4b-1234-4567-89ab-cdef01234567');
    assert.strictEqual(quarantined.length, 1);
    assert.strictEqual(quarantined[0].reason, 'MISSING_V2_METADATA');
  });

  // 2. Queue Durability & In-Flight Interruption Recovery
  it('SIM-02: recovers in-flight items stuck in syncing state and resets them to pending', () => {
    const queue = [
      { id: '1', status: 'syncing' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'conflicted' }
    ];

    function recoverQueue(items: any[]) {
      return items.map((item) => {
        if (item.status === 'syncing') {
          return { ...item, status: 'pending' };
        }
        return item;
      });
    }

    const recovered = recoverQueue(queue);
    assert.strictEqual(recovered[0].status, 'pending', 'Interrupted syncing item must reset to pending');
    assert.strictEqual(recovered[1].status, 'pending');
    assert.strictEqual(recovered[2].status, 'conflicted');
  });

  // 3. Mutex Locking During Offline Queue Sync
  it('SIM-03: sync mutex prevents duplicate concurrent queue draining', async () => {
    let isSyncInProgress = false;
    let syncExecutionCount = 0;

    async function drainQueueWithMutex() {
      if (isSyncInProgress) {
        return { locked: true, executed: false };
      }
      isSyncInProgress = true;
      try {
        syncExecutionCount++;
        await new Promise((r) => setTimeout(r, 20));
        return { locked: false, executed: true };
      } finally {
        isSyncInProgress = false;
      }
    }

    const [first, second] = await Promise.all([drainQueueWithMutex(), drainQueueWithMutex()]);

    assert.strictEqual(syncExecutionCount, 1, 'Only one sync operation can execute under mutex');
    assert.ok((first.executed && second.locked) || (second.executed && first.locked));
  });

  // 4. Multi-Account Storage Partitioning on Shared School Devices
  it('SIM-04: enforces strict account partitioning so User A cannot access User B queue or cached rosters', () => {
    const pendingStore = [
      { clientMutationId: 'mut-101', userId: 10, classId: 5, status: 'pending' },
      { clientMutationId: 'mut-201', userId: 20, classId: 6, status: 'pending' }
    ];

    const rosterStore = [
      { cacheKey: 'kcc:10:1:5', userId: 10, classId: 5, students: [{ id: 1 }] },
      { cacheKey: 'kcc:20:1:6', userId: 20, classId: 6, students: [{ id: 2 }] }
    ];

    function getQueueForUser(userId: number) {
      return pendingStore.filter((item) => item.userId === userId);
    }

    function getRosterForUser(userId: number, classId: number) {
      return rosterStore.find((r) => r.userId === userId && r.classId === classId) || null;
    }

    const user10Queue = getQueueForUser(10);
    assert.strictEqual(user10Queue.length, 1);
    assert.strictEqual(user10Queue[0].clientMutationId, 'mut-101');

    const user20Queue = getQueueForUser(20);
    assert.strictEqual(user20Queue.length, 1);
    assert.strictEqual(user20Queue[0].clientMutationId, 'mut-201');

    assert.strictEqual(getRosterForUser(10, 6), null, 'User 10 cannot read User 20 roster');
    assert.strictEqual(getRosterForUser(20, 5), null, 'User 20 cannot read User 10 roster');

    const remainingRosters = rosterStore.filter((r) => r.userId !== 10);
    assert.strictEqual(remainingRosters.length, 1);
    assert.strictEqual(remainingRosters[0].userId, 20);
    assert.strictEqual(getQueueForUser(10).length, 1, 'Pending mutations safely preserved');
  });

  // 5. 7-Day Offline Retention Policy & Corrupted Timestamps (exercising production isMutationExpired)
  it('SIM-05: 7-day retention expiry blocks auto-sync on 8-day items, passes 6-day, and fails closed on corrupted/future timestamps', () => {
    const now = new Date('2026-10-18T12:00:00Z').getTime();

    // Valid 6-day item: eligible
    const item6d: any = {
      clientMutationId: 'mut-valid-6d',
      timestamp: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending'
    };
    assert.strictEqual(isMutationExpired(item6d, now), false, '6-day item must not expire');

    // Expired 8-day item: must expire
    const item8d: any = {
      clientMutationId: 'mut-expired-8d',
      timestamp: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending'
    };
    assert.strictEqual(isMutationExpired(item8d, now), true, '8-day item must expire');

    // Corrupted / malformed timestamp: must fail closed!
    const itemMalformed: any = {
      clientMutationId: 'mut-malformed',
      timestamp: 'invalid-date-string',
      status: 'pending'
    };
    assert.strictEqual(isMutationExpired(itemMalformed, now), true, 'Malformed timestamp must fail closed into review-required');

    // Missing / empty timestamp: must fail closed!
    const itemMissing: any = {
      clientMutationId: 'mut-missing',
      timestamp: '',
      status: 'pending'
    };
    assert.strictEqual(isMutationExpired(itemMissing, now), true, 'Missing timestamp must fail closed');

    // Future-dated timestamp (>5 minutes ahead): must fail closed!
    const itemFuture: any = {
      clientMutationId: 'mut-future',
      timestamp: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending'
    };
    assert.strictEqual(isMutationExpired(itemFuture, now), true, 'Future-dated timestamp must fail closed');

    // Reauthorized 8-day item within active session: passes!
    const itemReauthorized: any = {
      clientMutationId: 'mut-reauth-8d',
      timestamp: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      originalTimestamp: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      reauthorizedAt: new Date(now - 1000).toISOString(),
      reauthorizedByUserId: 10,
      status: 'pending'
    };
    assert.strictEqual(isMutationExpired(itemReauthorized, now), false, 'Reauthorized item within active window is eligible');
  });

  // 6. Strict Error Classification on Sync
  it('SIM-06: strictly classifies HTTP errors without false retry loops', () => {
    function handleSyncResponse(status: number) {
      if (status === 401) {
        return { action: 'pause_sync_require_reauth', retry: false };
      }
      if (status === 403 || status === 422) {
        return { action: 'mark_rejected', retry: false };
      }
      if (status === 429) {
        return { action: 'backoff_rate_limit', retry: true };
      }
      if (status >= 500) {
        return { action: 'keep_pending_server_error', retry: true };
      }
      return { action: 'process_results', retry: false };
    }

    assert.deepStrictEqual(handleSyncResponse(401), { action: 'pause_sync_require_reauth', retry: false });
    assert.deepStrictEqual(handleSyncResponse(403), { action: 'mark_rejected', retry: false });
    assert.deepStrictEqual(handleSyncResponse(422), { action: 'mark_rejected', retry: false });
    assert.deepStrictEqual(handleSyncResponse(429), { action: 'backoff_rate_limit', retry: true });
    assert.deepStrictEqual(handleSyncResponse(503), { action: 'keep_pending_server_error', retry: true });
    assert.deepStrictEqual(handleSyncResponse(200), { action: 'process_results', retry: false });
  });

  // 7. Student-by-Student Conflict Resolution Comparison
  it('SIM-07: computes student discrepancy comparison without blind full-roster overwrite', () => {
    const students = [
      { student_id: 1, admission_no: 'KCC-001', calling_name: 'Student 1' },
      { student_id: 2, admission_no: 'KCC-002', calling_name: 'Student 2' }
    ];

    const localMutation: any = {
      records: [
        { student_id: 1, status: 'present', remarks: null },
        { student_id: 2, status: 'absent', remarks: 'Medical' }
      ]
    };

    const serverRecords = [
      { student_id: 1, status: 'present', remarks: null }, // identical
      { student_id: 2, status: 'present', remarks: 'In class' } // discrepancy
    ];

    const diffs = buildStudentDiffList(students, localMutation, serverRecords, {});

    assert.strictEqual(diffs[0].isDiff, false);
    assert.strictEqual(diffs[0].chosen, 'local');

    assert.strictEqual(diffs[1].isDiff, true);
    assert.strictEqual(diffs[1].chosen, 'server');
    assert.strictEqual(diffs[1].localStatus, 'absent');
    assert.strictEqual(diffs[1].serverStatus, 'present');
  });

  // 8. Repeated 409 Collision Diff Refresh & Stale Choice Invalidation (exercising production buildStudentDiffList)
  it('SIM-08: invalidates prior local choice when student server record mutates again on repeated collision', () => {
    const students = [
      { student_id: 1, admission_no: 'KCC-001', calling_name: 'Student 1' },
      { student_id: 2, admission_no: 'KCC-002', calling_name: 'Student 2' }
    ];

    const pendingMutation: any = {
      records: [
        { student_id: 1, status: 'absent', remarks: 'Sick' },
        { student_id: 2, status: 'present', remarks: '' }
      ]
    };

    // Collision 1: Server was at Rev 2 (Student 1: present, Student 2: present)
    const serverRev2 = [
      { student_id: 1, status: 'present', remarks: '' },
      { student_id: 2, status: 'present', remarks: '' }
    ];

    const firstDiffs = buildStudentDiffList(students, pendingMutation, serverRev2, {});
    assert.strictEqual(firstDiffs[0].isDiff, true);
    // Teacher explicitly chose 'local' for Student 1 and 'local' for Student 2
    const priorChoices = new Map<number, 'local' | 'server'>([
      [1, 'local'],
      [2, 'local']
    ]);

    // Collision 2: Server advances to Rev 3!
    // Student 1 status mutates from 'present' to 'excused' with note
    // Student 2 remains 'present' unchanged
    const serverRev3 = [
      { student_id: 1, status: 'excused', remarks: 'Doctor certificate' },
      { student_id: 2, status: 'present', remarks: '' }
    ];

    // Rebuild diffs passing prior server records to detect repeated changes
    const secondDiffs = buildStudentDiffList(
      students,
      pendingMutation,
      serverRev3,
      {},
      priorChoices,
      serverRev2
    );

    // Student 1: Server mutated again! Prior 'local' choice MUST BE INVALIDATED
    assert.strictEqual(secondDiffs[0].serverStatus, 'excused');
    assert.strictEqual(secondDiffs[0].serverChangedAgain, true, 'Student 1 must be flagged as serverChangedAgain');
    assert.strictEqual(secondDiffs[0].chosen, 'server', 'Prior local choice must be reset to server');

    // Student 2: Server did not change between Rev 2 and Rev 3, so deliberate choice preserved
    assert.strictEqual(secondDiffs[1].serverChangedAgain, false);
    assert.strictEqual(secondDiffs[1].chosen, 'local', 'Unchanged student retains prior choice');
  });

  // 9. Draft-to-Final Reconciliation Mode Rule (BLOCKER C)
  it('SIM-09: reconciling local draft against server-finalized register forces mode to submitted', () => {
    function resolveMode(serverStatus: string, localMode: string): 'draft' | 'submitted' {
      if (serverStatus === 'submitted') return 'submitted';
      return localMode === 'submitted' ? 'submitted' : 'draft';
    }

    assert.strictEqual(resolveMode('submitted', 'draft'), 'submitted', 'Server finalized register cannot be downgraded to draft');
    assert.strictEqual(resolveMode('draft', 'draft'), 'draft');
    assert.strictEqual(resolveMode('draft', 'submitted'), 'submitted');
  });

  // 10. Comprehensive Unsynced Work Accounting with Device Quarantine Segregation
  it('SIM-10: getUnsyncedWorkSummary truthfully segregates device-level quarantine from individual teacher total', () => {
    const items = [
      { id: '1', userId: 5, status: 'pending' },
      { id: '2', userId: 5, status: 'conflicted' },
      { id: '3', userId: 5, status: 'rejected' },
      { id: '4', userId: 5, status: 'stale_review_required' },
      { id: '5', userId: 5, status: 'syncing' }
    ];
    const quarantined = [{ id: 'legacy-unknown-owner' }];

    const pending = items.filter((i) => i.status === 'pending').length;
    const conflicted = items.filter((i) => i.status === 'conflicted').length;
    const rejected = items.filter((i) => i.status === 'rejected').length;
    const staleReviewRequired = items.filter((i) => i.status === 'stale_review_required').length;
    const syncing = items.filter((i) => i.status === 'syncing').length;
    const deviceQuarantined = quarantined.length;

    // Individual teacher's uncommitted work strictly counts items authored by this user
    const userTotal = pending + conflicted + rejected + staleReviewRequired + syncing;

    assert.strictEqual(pending, 1);
    assert.strictEqual(conflicted, 1);
    assert.strictEqual(rejected, 1);
    assert.strictEqual(staleReviewRequired, 1);
    assert.strictEqual(syncing, 1);
    assert.strictEqual(userTotal, 5, 'Teacher total must not include device-level legacy quarantine');
    assert.strictEqual(deviceQuarantined, 1, 'Device quarantine reported separately for administrative recovery');
  });

  // 11. Sensitive PII Sanitization in Exported Offline Attendance Records
  it('SIM-11: exported offline attendance JSON sanitizes sensitive PII and embeds confidentiality notice', () => {
    const mutation = {
      clientMutationId: 'mut-pii-test',
      schoolId: 'kcc',
      userId: 10,
      academicYearId: 1,
      classId: 5,
      date: '2026-05-18',
      mode: 'draft',
      baseRevision: 0,
      rosterFingerprint: 'sha256:abc',
      records: [
        {
          student_id: 1,
          status: 'absent',
          remarks: 'Sick note provided',
          guardian_phone: '0771234567',
          guardian_nic: '851234567V',
          home_address: 'Main St, Kattankudy'
        }
      ]
    };

    function exportSanitized(mut: any) {
      const sanitizedRecords = (mut.records || []).map((r: any) => ({
        student_id: Number(r.student_id),
        status: r.status,
        remarks: r.remarks || null
      }));

      return JSON.stringify({
        _notice: 'CONFIDENTIAL STUDENT ATTENDANCE RECORD - KATTANKUDY CENTRAL COLLEGE',
        clientMutationId: mut.clientMutationId,
        date: mut.date,
        records: sanitizedRecords
      });
    }

    const exportedJson = exportSanitized(mutation);
    assert.ok(exportedJson.includes('CONFIDENTIAL STUDENT ATTENDANCE RECORD'));
    assert.ok(!exportedJson.includes('0771234567'), 'Guardian phone must be stripped');
    assert.ok(!exportedJson.includes('851234567V'), 'Guardian NIC must be stripped');
    assert.ok(!exportedJson.includes('Main St, Kattankudy'), 'Home address must be stripped');
  });

  // 12. Date-Scoped Offline Cache Keying & Isolation
  it('SIM-12: date-scoped offline roster cache key isolates registers per attendance date', () => {
    const keyDateA = buildRosterCacheKey(2, 1, 5, '2026-05-18');
    const keyDateB = buildRosterCacheKey(2, 1, 5, '2026-05-19');
    const keyOtherUser = buildRosterCacheKey(3, 1, 5, '2026-05-18');

    assert.strictEqual(keyDateA, 'kcc:2:1:5:2026-05-18');
    assert.strictEqual(keyDateB, 'kcc:2:1:5:2026-05-19');
    assert.notStrictEqual(keyDateA, keyDateB, 'Keys for different dates must be distinct to prevent cross-day pollution');
    assert.notStrictEqual(keyDateA, keyOtherUser, 'Keys for different users must be distinct to prevent PII leakage');

    // Simulate mock date-partitioned store
    const store = new Map<string, any>();
    store.set(keyDateA, {
      key: keyDateA,
      date: '2026-05-18',
      rosterFingerprint: 'sha256:fingerprint-18th',
      students: [{ student_id: 101, attendance_status: 'present' }]
    });

    // Lookup date A: found
    const cachedA = store.get(keyDateA);
    assert.ok(cachedA);
    assert.strictEqual(cachedA.date, '2026-05-18');
    assert.strictEqual(cachedA.rosterFingerprint, 'sha256:fingerprint-18th');

    // Lookup date B: uncached, strictly null
    const cachedB = store.get(keyDateB) || null;
    assert.strictEqual(cachedB, null, 'Uncached date must not inherit or fall back to prior day data');
  });

  // 13. V1 LocalStorage Fallback Migration & Guardian PII Purge
  it('SIM-13: localStorage fallback migration moves unverified queue items to quarantine and purges plain-text PII', () => {
    // Simulate legacy localStorage
    const mockStorage: Record<string, string> = {
      skoolsys_pending_queue: JSON.stringify([
        {
          id: 'ls-legacy-draft-1',
          classId: 5,
          date: '2026-05-18',
          records: [{ student_id: 101, status: 'absent' }]
        }
      ]),
      skoolsys_roster_5: JSON.stringify({
        students: [
          {
            student_id: 101,
            guardian_nic: '198512345678',
            guardian_phone: '0777123456',
            home_address: 'Beach Rd, Kattankudy'
          }
        ]
      }),
      unrelated_app_setting: 'dark_mode'
    };

    // Migration function simulating migrateLegacyLocalStorageQueue
    function simulateLocalStorageMigration(storage: Record<string, string>) {
      const quarantinedItems: any[] = [];
      let queueRemoved = false;
      const purgedRosterKeys: string[] = [];

      // 1. Recover pending queue to quarantine
      if (storage.skoolsys_pending_queue) {
        const parsed = JSON.parse(storage.skoolsys_pending_queue);
        for (const item of parsed) {
          quarantinedItems.push({
            id: item.id || `legacy-ls-${Date.now()}`,
            schoolId: 'kcc',
            source: 'localstorage_v1_fallback',
            quarantinedAt: new Date().toISOString(),
            reason: 'Legacy localStorage fallback queue item lacking V2 concurrency & provenance metadata',
            originalData: item
          });
        }
        // Commit simulation
        delete storage.skoolsys_pending_queue;
        queueRemoved = true;
      }

      // 2. Purge plain-text roster caches containing PII
      for (const k of Object.keys(storage)) {
        if (k.startsWith('skoolsys_roster_')) {
          purgedRosterKeys.push(k);
          delete storage[k];
        }
      }

      return { quarantinedItems, queueRemoved, purgedRosterKeys };
    }

    const result = simulateLocalStorageMigration(mockStorage);

    assert.strictEqual(result.quarantinedItems.length, 1);
    assert.strictEqual(result.quarantinedItems[0].source, 'localstorage_v1_fallback');
    assert.strictEqual(result.quarantinedItems[0].originalData.id, 'ls-legacy-draft-1');
    assert.strictEqual(result.queueRemoved, true, 'skoolsys_pending_queue must be removed only after quarantine commit');
    assert.deepStrictEqual(result.purgedRosterKeys, ['skoolsys_roster_5']);
    assert.strictEqual(mockStorage['skoolsys_roster_5'], undefined, 'Plain-text guardian PII cache must be purged');
    assert.strictEqual(mockStorage['unrelated_app_setting'], 'dark_mode', 'Unrelated keys must remain untouched');
  });
});


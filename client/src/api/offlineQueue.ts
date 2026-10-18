// ============================================================================
// SkoolSys 2.0 — Offline Attendance Storage & Sync Engine (IndexedDB V2)
// Kattankudy Central College National School (Grades 6–13)
//
// Compliant with PR-004 Architecture v1.2:
// - IndexedDB Schema Version 2
// - Account-partitioned isolation: strictly scoped by schoolId, userId, academicYearId, classId
// - PII minimization: omits guardian NIC, guardian phone, home address, and emergency contact
// - Guaranteed transaction completion: all writes resolve on tx.oncomplete (never on req.onsuccess)
// - Legacy queue quarantine: unverified v1 items quarantined as 'legacy_review_required'
// - Non-destructive logout: cached rosters purged on logout, pending unsynced work safely retained
// - Side-by-side conflict handling: auto-sync paused on 409 conflict awaiting manual resolution
// ============================================================================

export const OFFLINE_DB_NAME = 'skoolsys_offline_db';
export const OFFLINE_DB_VERSION = 2;
export const SCHOOL_ID = 'kcc';

export interface MinimalStudent {
  student_id: number;
  admission_no: string;
  full_name: string;
  calling_name: string;
  gender: string;
  roll_number: number | null;
  is_currently_enrolled?: number;
  attendance_status?: 'present' | 'absent' | 'late' | 'excused' | null;
  attendance_remarks?: string | null;
  record_id?: number | null;
}

export interface CachedRoster {
  key: string; // Composite key: `${SCHOOL_ID}:${userId}:${academicYearId}:${classId}`
  schoolId: typeof SCHOOL_ID;
  userId: number;
  academicYearId: number;
  classId: number;
  className?: string;
  date: string;
  serverRevision: number;
  rosterFingerprint: string;
  students: MinimalStudent[];
  cachedAt: string;
}

export interface OfflineAttendanceMutation {
  clientMutationId: string; // UUID v4
  schoolId: typeof SCHOOL_ID;
  userId: number;
  academicYearId: number;
  classId: number;
  className?: string;
  date: string;
  mode: 'draft' | 'submitted';
  baseRevision: number;
  rosterFingerprint: string;
  records: Array<{
    student_id: number;
    status: 'present' | 'absent' | 'late' | 'excused';
    remarks?: string | null;
  }>;
  notes?: string | null;
  timestamp: string;
  status: 'pending' | 'syncing' | 'conflicted' | 'legacy_review_required' | 'rejected';
  conflictDetails?: {
    code: string;
    detail: string;
    serverRevision?: number;
    receivedAt: string;
  } | null;
}

export interface QuarantinedAttendanceItem {
  id: string;
  schoolId: string;
  originalData: any;
  quarantinedAt: string;
  reason: string;
}

/**
 * Strips sensitive PII before saving to client browser storage.
 * Retains only minimal identification needed for daily roll-call.
 */
export function minimizeStudentForOffline(st: any): MinimalStudent {
  return {
    student_id: Number(st.student_id || st.id),
    admission_no: String(st.admission_no || ''),
    full_name: String(st.full_name || ''),
    calling_name: String(st.calling_name || st.full_name || ''),
    gender: String(st.gender || 'Other'),
    roll_number: st.roll_number !== undefined && st.roll_number !== null ? Number(st.roll_number) : null,
    is_currently_enrolled: st.is_currently_enrolled !== undefined ? Number(st.is_currently_enrolled) : 1,
    attendance_status: st.attendance_status || null,
    attendance_remarks: st.attendance_remarks || null,
    record_id: st.record_id ? Number(st.record_id) : null
  };
}

/**
 * Opens or upgrades the IndexedDB to Version 2.
 * Migrates legacy v1 stores and quarantines unverified legacy queue entries.
 */
export function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this browser environment.'));
      return;
    }

    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // 1. Cached Rosters Store
      if (oldVersion < 2 && db.objectStoreNames.contains('cached_rosters')) {
        // Old v1 store used keyPath: 'classId' which lacked user & year partitioning
        db.deleteObjectStore('cached_rosters');
      }
      if (!db.objectStoreNames.contains('cached_rosters')) {
        const rosterStore = db.createObjectStore('cached_rosters', { keyPath: 'key' });
        rosterStore.createIndex('by_user', 'userId', { unique: false });
        rosterStore.createIndex('by_class', 'classId', { unique: false });
      }

      // 2. Quarantined Store for unverified legacy queue entries
      if (!db.objectStoreNames.contains('quarantined_attendance')) {
        db.createObjectStore('quarantined_attendance', { keyPath: 'id' });
      }

      // 3. Pending Attendance Mutations Store
      if (oldVersion < 2 && db.objectStoreNames.contains('pending_attendance')) {
        // In v1, pending_attendance had keyPath: 'id'. We must migrate to 'clientMutationId'.
        // Any legacy entries missing v2 fields will be moved to quarantined_attendance.
        const tx = (event.target as any).transaction as IDBTransaction;
        const oldStore = tx.objectStore('pending_attendance');
        const qStore = tx.objectStore('quarantined_attendance');

        const getAllReq = oldStore.getAll();
        getAllReq.onsuccess = () => {
          const items = getAllReq.result || [];
          for (const item of items) {
            // Quarantine legacy item lacking required revision / fingerprint
            qStore.put({
              id: item.id || `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              schoolId: SCHOOL_ID,
              originalData: item,
              quarantinedAt: new Date().toISOString(),
              reason: 'Legacy V1 entry lacking required revision, mode, or roster fingerprint.'
            });
          }
        };

        db.deleteObjectStore('pending_attendance');
      }

      if (!db.objectStoreNames.contains('pending_attendance')) {
        const pendingStore = db.createObjectStore('pending_attendance', { keyPath: 'clientMutationId' });
        pendingStore.createIndex('by_user', 'userId', { unique: false });
        pendingStore.createIndex('by_status', 'status', { unique: false });
        pendingStore.createIndex('by_user_class_date', ['userId', 'classId', 'date'], { unique: false });
      }
    };

    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
}

/**
 * Builds a canonical partitioned cache key.
 */
export function buildRosterCacheKey(userId: number, academicYearId: number, classId: number): string {
  return `${SCHOOL_ID}:${userId}:${academicYearId}:${classId}`;
}

/**
 * Caches a class roster for offline roll-call.
 * Enforces PII minimization and resolves ONLY after transaction commit.
 */
export async function cacheClassRoster(
  userId: number,
  academicYearId: number,
  classId: number,
  date: string,
  serverRevision: number,
  rosterFingerprint: string,
  rawStudents: any[],
  className?: string
): Promise<void> {
  const db = await openOfflineDB();
  const minimized = rawStudents.map(minimizeStudentForOffline);
  const key = buildRosterCacheKey(userId, academicYearId, classId);

  const entry: CachedRoster = {
    key,
    schoolId: SCHOOL_ID,
    userId,
    academicYearId,
    classId,
    className,
    date,
    serverRevision,
    rosterFingerprint,
    students: minimized,
    cachedAt: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached_rosters', 'readwrite');
    const store = tx.objectStore('cached_rosters');
    store.put(entry);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
  });
}

/**
 * Retrieves the cached class roster for a given user, academic year, and class.
 * Never leaks rosters across user accounts.
 */
export async function getCachedClassRoster(
  userId: number,
  academicYearId: number,
  classId: number
): Promise<CachedRoster | null> {
  try {
    const db = await openOfflineDB();
    const key = buildRosterCacheKey(userId, academicYearId, classId);

    return new Promise((resolve, reject) => {
      const tx = db.transaction('cached_rosters', 'readonly');
      const store = tx.objectStore('cached_rosters');
      const req = store.get(key);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to retrieve cached roster:', err);
    return null;
  }
}

/**
 * Enqueues an offline attendance mutation.
 * Resolves ONLY after tx.oncomplete fires to guarantee durability against quota/abort failures.
 */
export async function queueOfflineAttendance(
  mutation: OfflineAttendanceMutation
): Promise<OfflineAttendanceMutation> {
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_attendance', 'readwrite');
    const store = tx.objectStore('pending_attendance');
    store.put(mutation);

    tx.oncomplete = () => resolve(mutation);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Storage transaction aborted'));
  });
}

/**
 * Retrieves all pending attendance mutations strictly partitioned for the authenticated user.
 * Items belonging to other users on this shared device are completely hidden.
 */
export async function getPendingAttendanceQueue(
  userId: number
): Promise<OfflineAttendanceMutation[]> {
  try {
    await recoverInterruptedSyncingItems();
    const db = await openOfflineDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_attendance', 'readonly');
      const store = tx.objectStore('pending_attendance');
      const index = store.index('by_user');
      const req = index.getAll(userId);

      req.onsuccess = () => {
        const items: OfflineAttendanceMutation[] = req.result || [];
        // Sort by timestamp ascending
        items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to get pending attendance queue:', err);
    return [];
  }
}

/**
 * Counts total unsynced items for a user. Used to warn on logout.
 */
export async function getUnsyncedCountForUser(userId: number): Promise<number> {
  const queue = await getPendingAttendanceQueue(userId);
  return queue.filter((item) => item.status === 'pending' || item.status === 'conflicted').length;
}

/**
 * Removes a mutation from the pending queue after successful sync or discard.
 * Waits for tx.oncomplete.
 */
export async function removePendingItem(clientMutationId: string): Promise<void> {
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_attendance', 'readwrite');
    const store = tx.objectStore('pending_attendance');
    store.delete(clientMutationId);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Delete transaction aborted'));
  });
}

/**
 * Updates the status or conflict details of a mutation in the pending queue.
 */
export async function updatePendingItemStatus(
  clientMutationId: string,
  status: OfflineAttendanceMutation['status'],
  conflictDetails?: OfflineAttendanceMutation['conflictDetails']
): Promise<void> {
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_attendance', 'readwrite');
    const store = tx.objectStore('pending_attendance');
    const getReq = store.get(clientMutationId);

    getReq.onsuccess = () => {
      const item = getReq.result as OfflineAttendanceMutation | undefined;
      if (!item) {
        resolve();
        return;
      }
      item.status = status;
      if (conflictDetails !== undefined) {
        item.conflictDetails = conflictDetails;
      }
      store.put(item);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Update transaction aborted'));
  });
}

/**
 * Purges cached rosters for the specified user upon logout.
 * Note: Unsynced pending mutations are PRESERVED safely in IDB.
 */
export async function clearCachedRostersForUser(userId: number): Promise<void> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('cached_rosters', 'readwrite');
    const store = tx.objectStore('cached_rosters');
    const index = store.index('by_user');
    const req = index.getAll(userId);

    req.onsuccess = () => {
      const items: CachedRoster[] = req.result || [];
      for (const item of items) {
        store.delete(item.key);
      }
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to clear cached rosters on logout:', err);
  }
}

/**
 * Recovers any mutations stuck in 'syncing' status (e.g. following browser close,
 * crash, or interrupted network) and resets them back to 'pending'.
 */
export async function recoverInterruptedSyncingItems(): Promise<number> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_attendance', 'readwrite');
      const store = tx.objectStore('pending_attendance');
      const req = store.getAll();

      req.onsuccess = () => {
        const items: OfflineAttendanceMutation[] = req.result || [];
        let count = 0;
        for (const item of items) {
          if (item.status === 'syncing') {
            item.status = 'pending';
            store.put(item);
            count++;
          }
        }
        tx.oncomplete = () => resolve(count);
      };
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to recover interrupted syncing items:', err);
    return 0;
  }
}

// Module-level concurrency guard to prevent simultaneous sync executions
let isSyncInProgress = false;

/**
 * Synchronizes pending attendance mutations to the backend.
 * Strict rules:
 * - Mutex guard ensures no double sync for the same account/session
 * - Automatically recovers interrupted 'syncing' items before evaluating queue
 * - Only syncs items belonging to the active logged-in userId
 * - Differentiates 401, 403, 409, 422, 429, 5xx and network transport errors
 * - 401 pauses sync and signals re-authentication without infinite retry loops
 * - 403 and 422 mark items as rejected and never retry automatically
 * - Conflicted items (409) require deliberate student-level resolution
 */
export async function syncPendingQueue(
  token: string,
  userId: number
): Promise<{
  synced: number;
  conflicted: number;
  rejected: number;
  results: any[];
  authRequired?: boolean;
  rateLimited?: boolean;
  inProgress?: boolean;
}> {
  if (isSyncInProgress) {
    console.warn('Sync is already in progress. Skipping duplicate concurrent sync trigger.');
    return { synced: 0, conflicted: 0, rejected: 0, results: [], inProgress: true };
  }

  isSyncInProgress = true;
  try {
    // 1. Recover any prior in-flight items left in 'syncing' state
    await recoverInterruptedSyncingItems();

    const queue = await getPendingAttendanceQueue(userId);
    const eligible = queue.filter((item) => item.status === 'pending');

    if (eligible.length === 0) {
      return { synced: 0, conflicted: 0, rejected: 0, results: [] };
    }

    // 2. Mark in-flight as syncing
    for (const item of eligible) {
      await updatePendingItemStatus(item.clientMutationId, 'syncing');
    }

    let response: Response;
    try {
      const payloadQueue = eligible.map((item) => ({
        classId: item.classId,
        date: item.date,
        mode: item.mode,
        baseRevision: item.baseRevision,
        clientMutationId: item.clientMutationId,
        rosterFingerprint: item.rosterFingerprint,
        notes: item.notes || null,
        records: item.records
      }));

      response = await fetch('/api/attendance/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ queue: payloadQueue })
      });
    } catch (networkErr: any) {
      // True network transport failure: revert items back to pending for future retry
      for (const item of eligible) {
        await updatePendingItemStatus(item.clientMutationId, 'pending');
      }
      throw new Error(`Network transport error during sync: ${networkErr.message}`);
    }

    // 3. Differentiate HTTP error statuses
    if (response.status === 401) {
      // Session expired / invalid token: Revert to pending, pause sync, signal auth renewal
      for (const item of eligible) {
        await updatePendingItemStatus(item.clientMutationId, 'pending');
      }
      window.dispatchEvent(new CustomEvent('auth-sync-expired'));
      return {
        synced: 0,
        conflicted: 0,
        rejected: 0,
        results: [],
        authRequired: true
      };
    }

    if (response.status === 403) {
      // Scoped permission denied
      for (const item of eligible) {
        await updatePendingItemStatus(item.clientMutationId, 'rejected', {
          code: 'FORBIDDEN_SYNC_AUTHORITY',
          detail: 'Unauthorized: User is not authorized to submit attendance for one or more classes.',
          receivedAt: new Date().toISOString()
        });
      }
      return { synced: 0, conflicted: 0, rejected: eligible.length, results: [] };
    }

    if (response.status === 400 || response.status === 422) {
      // Batch-level validation rejection
      const errData = await response.json().catch(() => ({}));
      for (const item of eligible) {
        await updatePendingItemStatus(item.clientMutationId, 'rejected', {
          code: errData.code || 'BATCH_VALIDATION_REJECTED',
          detail: errData.detail || errData.error || 'Batch submission rejected by server validation.',
          receivedAt: new Date().toISOString()
        });
      }
      return { synced: 0, conflicted: 0, rejected: eligible.length, results: [] };
    }

    if (response.status === 429) {
      // Rate limited: revert to pending
      for (const item of eligible) {
        await updatePendingItemStatus(item.clientMutationId, 'pending');
      }
      return { synced: 0, conflicted: 0, rejected: 0, results: [], rateLimited: true };
    }

    if (response.status >= 500) {
      // Server error: revert to pending
      for (const item of eligible) {
        await updatePendingItemStatus(item.clientMutationId, 'pending');
      }
      throw new Error(`Server returned HTTP ${response.status} during batch sync.`);
    }

    // 4. Process processed batch response (200 OK)
    const data = await response.json();
    const results = data.results || [];
    let synced = 0;
    let conflicted = 0;
    let rejected = 0;

    for (const res of results) {
      const mutationId = res.clientMutationId;
      if (res.status === 'applied' || res.status === 'replayed') {
        synced++;
        await removePendingItem(mutationId);
      } else if (res.status === 'conflicted') {
        conflicted++;
        await updatePendingItemStatus(mutationId, 'conflicted', {
          code: res.code || 'ATTENDANCE_CONCURRENCY_CONFLICT',
          detail: res.error || 'Server register was updated by another teacher.',
          serverRevision: res.serverRevision,
          receivedAt: new Date().toISOString()
        });
      } else if (res.status === 'rejected') {
        rejected++;
        await updatePendingItemStatus(mutationId, 'rejected', {
          code: res.code || 'VALIDATION_REJECTED',
          detail: res.error || 'Submission was rejected by the server.',
          receivedAt: new Date().toISOString()
        });
      } else {
        await updatePendingItemStatus(mutationId, 'pending');
      }
    }

    return { synced, conflicted, rejected, results };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Discards local draft in conflict and accepts server state.
 */
export async function resolveConflictKeepServer(clientMutationId: string): Promise<void> {
  await removePendingItem(clientMutationId);
}

/**
 * Re-applies local changes on top of updated server revision and fresh fingerprint.
 */
export async function resolveConflictReapply(
  clientMutationId: string,
  newBaseRevision: number,
  newRosterFingerprint: string
): Promise<void> {
  const db = await openOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_attendance', 'readwrite');
    const store = tx.objectStore('pending_attendance');
    const getReq = store.get(clientMutationId);

    getReq.onsuccess = () => {
      const item = getReq.result as OfflineAttendanceMutation | undefined;
      if (!item) {
        resolve();
        return;
      }
      item.baseRevision = newBaseRevision;
      item.rosterFingerprint = newRosterFingerprint;
      item.status = 'pending';
      item.conflictDetails = null;
      store.put(item);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Maximum offline queue retention period (7 days) matching JWT token lifetime.
 * Reconciled under KCC-POL-004: records older than 7 days require re-authentication.
 */
export const MAX_OFFLINE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function isMutationExpired(mutation: OfflineAttendanceMutation): boolean {
  const mutationTime = new Date(mutation.timestamp).getTime();
  if (isNaN(mutationTime)) return false;
  return (Date.now() - mutationTime) > MAX_OFFLINE_RETENTION_MS;
}

/**
 * Exports a local pending/conflicted mutation as formatted JSON text for backup.
 * Enforces Student Data Privacy Controls:
 * - Omits guardian phone, NIC, home address, and personal identifiers
 * - Restricts data to minimal student IDs, attendance statuses, and teacher remarks
 * - Prepends confidential school data banner and export metadata
 */
export function exportMutationJson(mutation: OfflineAttendanceMutation): string {
  // Strip any unexpected sensitive properties and retain only authorized roll-call data
  const sanitizedRecords = (mutation.records || []).map((r) => ({
    student_id: Number(r.student_id),
    status: r.status,
    remarks: r.remarks ? String(r.remarks).slice(0, 255) : null
  }));

  return JSON.stringify(
    {
      confidentialityNotice:
        'CONFIDENTIAL ATTENDANCE RECORD — KATTANKUDY CENTRAL COLLEGE NATIONAL SCHOOL. ' +
        'Authorized administrative recovery only. PII minimized: Contains no guardian NIC, phone, or home address.',
      exportedAt: new Date().toISOString(),
      institution: 'Kattankudy Central College National School',
      academicYearId: mutation.academicYearId,
      classId: mutation.classId,
      className: mutation.className || null,
      date: mutation.date,
      mode: mutation.mode,
      baseRevision: mutation.baseRevision,
      clientMutationId: mutation.clientMutationId,
      recordsCount: sanitizedRecords.length,
      records: sanitizedRecords
    },
    null,
    2
  );
}

// IndexedDB wrapper for Offline Attendance Storage & Sync Queue

const DB_NAME = 'skoolsys_offline_db';
const DB_VERSION = 1;

export interface OfflineAttendanceItem {
  id: string; // uuid
  classId: number;
  className?: string;
  date: string;
  records: Array<{ student_id: number; status: string; remarks?: string }>;
  notes?: string;
  timestamp: string;
}

export function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('cached_rosters')) {
        db.createObjectStore('cached_rosters', { keyPath: 'classId' });
      }
      if (!db.objectStoreNames.contains('pending_attendance')) {
        db.createObjectStore('pending_attendance', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
}

// Cache class roster for offline access
export async function cacheClassRoster(classId: number, data: any): Promise<void> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('cached_rosters', 'readwrite');
    const store = tx.objectStore('cached_rosters');
    store.put({ classId, data, cachedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('Failed to cache roster in IndexedDB, using localStorage:', err);
    localStorage.setItem(`skoolsys_roster_${classId}`, JSON.stringify(data));
  }
}

// Retrieve cached class roster
export async function getCachedClassRoster(classId: number): Promise<any | null> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction('cached_rosters', 'readonly');
      const store = tx.objectStore('cached_rosters');
      const request = store.get(classId);
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    const local = localStorage.getItem(`skoolsys_roster_${classId}`);
    return local ? JSON.parse(local) : null;
  }
}

// Enqueue offline attendance register
export async function queueOfflineAttendance(
  classId: number,
  className: string,
  date: string,
  records: any[],
  notes?: string
): Promise<OfflineAttendanceItem> {
  const item: OfflineAttendanceItem = {
    id: `offline-${classId}-${date}-${Date.now()}`,
    classId,
    className,
    date,
    records,
    notes,
    timestamp: new Date().toISOString()
  };

  try {
    const db = await openOfflineDB();
    const tx = db.transaction('pending_attendance', 'readwrite');
    const store = tx.objectStore('pending_attendance');
    store.put(item);
  } catch (err) {
    console.warn('IndexedDB queue failed, using localStorage:', err);
    const existing = JSON.parse(localStorage.getItem('skoolsys_pending_queue') || '[]');
    existing.push(item);
    localStorage.setItem('skoolsys_pending_queue', JSON.stringify(existing));
  }

  return item;
}

// Get all pending attendance items
export async function getPendingAttendanceQueue(): Promise<OfflineAttendanceItem[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_attendance', 'readonly');
      const store = tx.objectStore('pending_attendance');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return JSON.parse(localStorage.getItem('skoolsys_pending_queue') || '[]');
  }
}

// Remove synced item
export async function removePendingItem(id: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('pending_attendance', 'readwrite');
    const store = tx.objectStore('pending_attendance');
    store.delete(id);
  } catch {
    let existing: OfflineAttendanceItem[] = JSON.parse(localStorage.getItem('skoolsys_pending_queue') || '[]');
    existing = existing.filter((item) => item.id !== id);
    localStorage.setItem('skoolsys_pending_queue', JSON.stringify(existing));
  }
}

// Synchronize pending queue to backend
export async function syncPendingQueue(token: string): Promise<{ synced: number; failed: number }> {
  const queue = await getPendingAttendanceQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  try {
    const response = await fetch('/api/attendance/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ queue })
    });

    if (!response.ok) {
      throw new Error(`Sync request failed with status: ${response.status}`);
    }

    const data = await response.json();
    if (data.syncedSessions) {
      for (const synced of data.syncedSessions) {
        await removePendingItem(synced.id);
      }
    }

    return {
      synced: data.syncedCount || 0,
      failed: data.errors?.length || 0
    };
  } catch (err) {
    console.error('Offline sync failed:', err);
    throw err;
  }
}

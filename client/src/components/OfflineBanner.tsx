import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, AlertTriangle, AlertCircle } from 'lucide-react';
import {
  getPendingAttendanceQueue,
  syncPendingQueue,
  OfflineAttendanceMutation
} from '../api/offlineQueue';
import { getAuthToken, getCurrentUser } from '../api/client';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingQueue, setPendingQueue] = useState<OfflineAttendanceMutation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState<string | null>(null);

  const currentUser = getCurrentUser();

  const checkQueue = async () => {
    if (!currentUser?.id) {
      setPendingQueue([]);
      return;
    }
    const queue = await getPendingAttendanceQueue(currentUser.id);
    setPendingQueue(queue);
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      handleAutoSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    checkQueue();

    const interval = setInterval(checkQueue, 4000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [currentUser?.id]);

  const handleAutoSync = async () => {
    const token = getAuthToken();
    if (!token || !currentUser?.id) return;
    try {
      setIsSyncing(true);
      const res = await syncPendingQueue(token, currentUser.id);
      if (res.synced > 0) {
        setLastSyncMsg(`Synchronized ${res.synced} offline register(s)!`);
        setTimeout(() => setLastSyncMsg(null), 5000);
      }
      checkQueue();
    } catch {
      // Keep in queue for retry
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSync = async () => {
    const token = getAuthToken();
    if (!token || !currentUser?.id) {
      alert('Please log in to synchronize offline attendance.');
      return;
    }
    try {
      setIsSyncing(true);
      const res = await syncPendingQueue(token, currentUser.id);
      let msg = `Sync complete: ${res.synced} applied`;
      if (res.conflicted > 0) msg += `, ${res.conflicted} conflicted (manual review required)`;
      if (res.rejected > 0) msg += `, ${res.rejected} rejected`;
      setLastSyncMsg(msg);
      setTimeout(() => setLastSyncMsg(null), 6000);
      checkQueue();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!currentUser) return null;

  const pendingCount = pendingQueue.filter((i) => i.status === 'pending').length;
  const conflictedCount = pendingQueue.filter((i) => i.status === 'conflicted').length;
  const rejectedCount = pendingQueue.filter((i) => i.status === 'rejected').length;
  const staleCount = pendingQueue.filter((i) => i.status === 'stale_review_required').length;

  if (isOnline && pendingQueue.length === 0 && !lastSyncMsg) {
    return null;
  }

  const isConflictState = conflictedCount > 0;
  const isRejectedState = rejectedCount > 0;
  const isStaleState = staleCount > 0;

  return (
    <div
      className={`offline-banner ${isOnline && pendingQueue.length === 0 ? 'synced' : ''}`}
      style={{
        background: isConflictState ? '#fef3c7' : isRejectedState ? '#fee2e2' : isStaleState ? '#e0e7ff' : undefined,
        color: isConflictState ? '#92400e' : isRejectedState ? '#991b1b' : isStaleState ? '#3730a3' : undefined,
        borderBottom: isConflictState ? '1px solid #f59e0b' : isRejectedState ? '1px solid #ef4444' : isStaleState ? '1px solid #6366f1' : undefined
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {!isOnline ? (
          <WifiOff size={18} />
        ) : isConflictState ? (
          <AlertTriangle size={18} color="#d97706" />
        ) : isRejectedState ? (
          <AlertCircle size={18} color="#dc2626" />
        ) : isStaleState ? (
          <AlertTriangle size={18} color="#4f46e5" />
        ) : (
          <Wifi size={18} />
        )}

        <span>
          {!isOnline
            ? `Offline Mode Active — ${pendingQueue.length} attendance register(s) safely stored on device for ${currentUser.username}.`
            : isConflictState
            ? `⚠️ Concurrency Conflict: ${conflictedCount} register(s) modified on server. Please resolve in the Attendance Register view.`
            : isRejectedState
            ? `❌ Submission Rejected: ${rejectedCount} register(s) failed server authorization or academic-year validation.`
            : isStaleState
            ? `⏳ Retention Expired: ${staleCount} register(s) older than 7 days require teacher re-verification before synchronization.`
            : lastSyncMsg || `Online — ${pendingCount} pending register(s) ready to sync.`}
        </span>
      </div>

      {pendingCount > 0 && isOnline && (
        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className="btn btn-sm"
          style={{ background: 'white', color: '#1e293b' }}
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing...' : `Sync Now (${pendingCount})`}
        </button>
      )}
    </div>
  );
};

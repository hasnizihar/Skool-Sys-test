import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { getPendingAttendanceQueue, syncPendingQueue, OfflineAttendanceItem } from '../api/offlineQueue';
import { getAuthToken } from '../api/client';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingQueue, setPendingQueue] = useState<OfflineAttendanceItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState<string | null>(null);

  const checkQueue = async () => {
    const queue = await getPendingAttendanceQueue();
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
  }, []);

  const handleAutoSync = async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      setIsSyncing(true);
      const res = await syncPendingQueue(token);
      if (res.synced > 0) {
        setLastSyncMsg(`Synchronized ${res.synced} offline registers!`);
        setTimeout(() => setLastSyncMsg(null), 5000);
      }
      checkQueue();
    } catch {
      // Keep in queue
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSync = async () => {
    const token = getAuthToken();
    if (!token) {
      alert('Please log in to synchronize offline data.');
      return;
    }
    try {
      setIsSyncing(true);
      const res = await syncPendingQueue(token);
      setLastSyncMsg(`Synchronized ${res.synced} records (${res.failed} errors).`);
      setTimeout(() => setLastSyncMsg(null), 5000);
      checkQueue();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isOnline && pendingQueue.length === 0 && !lastSyncMsg) {
    return null;
  }

  return (
    <div className={`offline-banner ${isOnline && pendingQueue.length === 0 ? 'synced' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {!isOnline ? <WifiOff size={18} /> : <Wifi size={18} />}
        <span>
          {!isOnline
            ? `Offline Mode Active — ${pendingQueue.length} attendance session(s) safely queued in browser storage.`
            : lastSyncMsg || `Online — ${pendingQueue.length} pending register(s) ready to sync.`}
        </span>
      </div>

      {pendingQueue.length > 0 && isOnline && (
        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className="btn btn-sm"
          style={{ background: 'white', color: '#1e293b' }}
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing...' : `Sync Now (${pendingQueue.length})`}
        </button>
      )}
    </div>
  );
};

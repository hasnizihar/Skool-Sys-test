import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, AlertTriangle, AlertCircle, CheckCircle, Trash2, X } from 'lucide-react';
import {
  getPendingAttendanceQueue,
  syncPendingQueue,
  reauthorizeStaleItem,
  removePendingItem,
  OfflineAttendanceMutation
} from '../api/offlineQueue';
import { getAuthToken, getCurrentUser, api } from '../api/client';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingQueue, setPendingQueue] = useState<OfflineAttendanceMutation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState<string | null>(null);
  const [showStaleModal, setShowStaleModal] = useState(false);
  const [reauthorizingId, setReauthorizingId] = useState<string | null>(null);
  const [staleError, setStaleError] = useState<string | null>(null);

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

  const handleReconcileStale = async (item: OfflineAttendanceMutation) => {
    if (!currentUser?.id) return;
    setStaleError(null);
    setReauthorizingId(item.clientMutationId);
    try {
      // 1. Fetch fresh server session to reconcile current revision and fingerprint
      const freshSession = await api.getAttendanceSession(item.classId, item.date);

      // 2. Reauthorize stale item under the authenticated user's ID
      await reauthorizeStaleItem(
        item.clientMutationId,
        currentUser.id,
        freshSession.serverRevision,
        freshSession.rosterFingerprint
      );

      // 3. Immediately attempt synchronization
      const token = getAuthToken();
      if (token) {
        await syncPendingQueue(token, currentUser.id);
      }

      await checkQueue();
      setLastSyncMsg(`Re-authorized and queued register for ${item.date} successfully.`);
      setTimeout(() => setLastSyncMsg(null), 5000);
    } catch (err: any) {
      setStaleError(`Failed to re-authorize item: ${err.message}`);
    } finally {
      setReauthorizingId(null);
    }
  };

  const handleDiscardStale = async (clientMutationId: string) => {
    if (confirm('Are you sure you want to discard this aged offline register? This cannot be undone.')) {
      await removePendingItem(clientMutationId);
      await checkQueue();
    }
  };

  if (!currentUser) return null;

  const pendingCount = pendingQueue.filter((i) => i.status === 'pending').length;
  const conflictedCount = pendingQueue.filter((i) => i.status === 'conflicted').length;
  const rejectedCount = pendingQueue.filter((i) => i.status === 'rejected').length;
  const staleItems = pendingQueue.filter(
    (i) => i.status === 'stale_review_required' || i.status === 'legacy_review_required'
  );
  const staleCount = staleItems.length;

  if (isOnline && pendingQueue.length === 0 && !lastSyncMsg) {
    return null;
  }

  const isConflictState = conflictedCount > 0;
  const isRejectedState = rejectedCount > 0;
  const isStaleState = staleCount > 0;

  return (
    <>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {staleCount > 0 && (
            <button
              onClick={() => setShowStaleModal(true)}
              className="btn btn-sm"
              style={{ background: '#4f46e5', color: '#ffffff', fontWeight: 600, border: 'none' }}
              title="Review aged offline registers"
            >
              Review Stale ({staleCount})
            </button>
          )}

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
      </div>

      {/* Stale Offline Queue Review & Re-authorization Modal */}
      {showStaleModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(3px)'
          }}
        >
          <div
            className="card stale-review-modal"
            style={{
              maxWidth: '680px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.75rem',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
              border: '2px solid #6366f1',
              backgroundColor: 'var(--bg-card, #ffffff)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <AlertTriangle size={24} color="#4f46e5" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#312e81' }}>
                  Aged Offline Attendance Review (7-Day Retention Expiry)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowStaleModal(false)}
                className="btn btn-icon"
                style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.4 }}>
              In accordance with institutional policy <strong>KCC-POL-004</strong>, offline mutations older than 7 days require deliberate re-verification by the recording teacher before synchronization is allowed.
            </p>

            {staleError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem', marginBottom: '0.75rem' }}>
                ⚠️ {staleError}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {staleItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                  All aged items have been reconciled or removed.
                </div>
              ) : (
                staleItems.map((item) => (
                  <div
                    key={item.clientMutationId}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem',
                      background: 'var(--bg-subtle)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div>
                        <strong>{item.className || `Class ID ${item.classId}`}</strong> — Date: <strong>{item.date}</strong>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          Recorded on: {new Date(item.originalTimestamp || item.timestamp).toLocaleString()} ({item.records?.length || 0} students, {item.mode} mode)
                        </div>
                      </div>
                      <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', fontSize: '0.725rem' }}>
                        Author: {currentUser.username}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        onClick={() => handleDiscardStale(item.clientMutationId)}
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', color: '#dc2626' }}
                      >
                        <Trash2 size={13} style={{ marginRight: '0.35rem' }} />
                        Discard
                      </button>

                      <button
                        type="button"
                        onClick={() => handleReconcileStale(item)}
                        disabled={reauthorizingId === item.clientMutationId}
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                      >
                        <CheckCircle size={13} style={{ marginRight: '0.35rem' }} />
                        {reauthorizingId === item.clientMutationId ? 'Reconciling...' : 'Reconcile & Queue for Sync'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowStaleModal(false)}
                className="btn btn-secondary"
                style={{ padding: '0.45rem 1rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, AlertTriangle, AlertCircle, CheckCircle, Trash2, X, ArrowLeft } from 'lucide-react';
import {
  getPendingAttendanceQueue,
  syncPendingQueue,
  removePendingItem,
  OfflineAttendanceMutation,
  getDeviceQuarantineSummary,
  removeQuarantinedItem,
  QuarantinedAttendanceItem
} from '../api/offlineQueue';
import { getAuthToken, getCurrentUser, api, HttpError } from '../api/client';
import { buildStudentDiffList, ConflictStudentDiff } from '../utils/conflictDiffUtils';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingQueue, setPendingQueue] = useState<OfflineAttendanceMutation[]>([]);
  const [quarantinedItems, setQuarantinedItems] = useState<QuarantinedAttendanceItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState<string | null>(null);
  const [showStaleModal, setShowStaleModal] = useState(false);
  const [reauthorizingId, setReauthorizingId] = useState<string | null>(null);
  const [staleError, setStaleError] = useState<string | null>(null);

  // Active per-student discrepancy review state for aged/stale mutations
  const [activeStaleReview, setActiveStaleReview] = useState<{
    item: OfflineAttendanceMutation;
    freshSession: any;
    diffs: ConflictStudentDiff[];
    targetMode: 'draft' | 'submitted';
    saving: boolean;
    error: string | null;
  } | null>(null);

  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const checkQueue = async () => {
    if (!currentUser?.id) {
      setPendingQueue([]);
      setQuarantinedItems([]);
      return;
    }
    const queue = await getPendingAttendanceQueue(currentUser.id);
    setPendingQueue(queue);
    try {
      const qSummary = await getDeviceQuarantineSummary();
      setQuarantinedItems(qSummary.items || []);
    } catch {
      // Ignore IDB errors during early boot
    }
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

  // Step 1: Start per-student discrepancy review comparing stale offline draft against live server
  const handleStartStaleReview = async (item: OfflineAttendanceMutation) => {
    if (!currentUser?.id) return;
    setStaleError(null);
    setReauthorizingId(item.clientMutationId);
    try {
      // 1. Fetch fresh server session and roster
      const freshSession = await api.getAttendanceSession(item.classId, item.date);
      const students = freshSession.students || [];
      const serverRecords = freshSession.records || [];

      // 2. Build student-by-student diff list.
      // Deliberate Safety: by default, any student with discrepancy defaults to chosen = 'server'
      // to strictly prevent blind overwriting of newer server decisions.
      const diffs = buildStudentDiffList(
        students,
        item,
        serverRecords,
        {}
      );

      // Rule ATT-014: If server is already submitted, target mode MUST be submitted.
      const isServerSubmitted = freshSession.session?.status === 'submitted';
      const isLocalSubmitted = item.mode === 'submitted';
      const targetMode: 'draft' | 'submitted' = (isServerSubmitted || isLocalSubmitted) ? 'submitted' : 'draft';

      setActiveStaleReview({
        item,
        freshSession,
        diffs,
        targetMode,
        saving: false,
        error: null
      });
    } catch (err: any) {
      setStaleError(`Failed to fetch live server session for review: ${err.message}`);
    } finally {
      setReauthorizingId(null);
    }
  };

  // Step 2: Toggle teacher's deliberate choice for a specific pupil
  const handleToggleStaleChoice = (studentId: number, chosen: 'local' | 'server') => {
    setActiveStaleReview((prev) => {
      if (!prev) return null;
      const updatedDiffs = prev.diffs.map((d) => (d.student_id === studentId ? { ...d, chosen } : d));
      return { ...prev, diffs: updatedDiffs };
    });
  };

  // Step 3: Apply deliberate reconciliation with atomic revision verification and new mutation ID
  const handleApplyStaleReconciliation = async () => {
    if (!activeStaleReview) return;
    const { item, freshSession, diffs, targetMode } = activeStaleReview;

    // Build resolved records from explicit choices
    const resolvedRecords = diffs
      .map((d) => {
        let status = d.chosen === 'server' ? d.serverStatus : d.localStatus;
        if (targetMode === 'submitted' && (!status || status === 'unmarked')) {
          if (d.serverStatus && d.serverStatus !== 'unmarked') {
            status = d.serverStatus;
          } else if (d.localStatus && d.localStatus !== 'unmarked') {
            status = d.localStatus;
          }
        }
        const remarks = d.chosen === 'server' ? d.serverRemarks : d.localRemarks;
        return {
          student_id: d.student_id,
          status: status as any,
          remarks: remarks || null
        };
      })
      .filter((r) => r.status && r.status !== 'unmarked');

    // Rule ATT-015: Submitted register requires 100% complete roster marking
    const totalStudents = freshSession.students?.length || 0;
    if (targetMode === 'submitted' && resolvedRecords.length < totalStudents) {
      setActiveStaleReview((prev) =>
        prev
          ? {
              ...prev,
              error: `Finalized register requires complete attendance. ${totalStudents - resolvedRecords.length} pupil(s) remain unmarked. Please choose a status for every pupil before submitting.`
            }
          : null
      );
      return;
    }

    setActiveStaleReview((prev) => (prev ? { ...prev, saving: true, error: null } : null));

    try {
      // Generate a BRAND NEW RFC 4122 UUID v4 mutation ID
      const newMutationId = crypto.randomUUID();

      const res = await api.saveAttendanceSession({
        classId: item.classId,
        date: item.date,
        mode: targetMode,
        baseRevision: freshSession.serverRevision,
        clientMutationId: newMutationId,
        rosterFingerprint: freshSession.rosterFingerprint,
        notes: `Reconciled from aged offline register (original ${item.clientMutationId})`,
        records: resolvedRecords
      });

      // Atomic write succeeded on server -> remove stale draft from IndexedDB
      await removePendingItem(item.clientMutationId);
      setActiveStaleReview(null);
      setShowStaleModal(false);
      await checkQueue();
      setLastSyncMsg(`Reconciled attendance for ${item.date} successfully saved at Revision ${res.revision}!`);
      setTimeout(() => setLastSyncMsg(null), 6000);
    } catch (err: any) {
      if (err instanceof HttpError && err.status === 409) {
        // Concurrency conflict occurred while teacher was reviewing!
        // Immediately fetch the fresh server session and update diffs, invalidating choices for modified pupils.
        try {
          const reFresh = await api.getAttendanceSession(item.classId, item.date);
          const priorChoices = new Map<number, 'local' | 'server'>();
          diffs.forEach((d) => priorChoices.set(d.student_id, d.chosen));

          const reDiffs = buildStudentDiffList(
            reFresh.students || [],
            item,
            reFresh.records || [],
            {},
            priorChoices,
            freshSession.records || []
          );

          setActiveStaleReview((prev) =>
            prev
              ? {
                  ...prev,
                  saving: false,
                  freshSession: reFresh,
                  diffs: reDiffs,
                  error: `Collision recurred! Another user submitted an update while you were reviewing. Server advanced to Revision ${reFresh.serverRevision}. Comparison refreshed; please re-verify choices.`
                }
              : null
          );
        } catch (fetchErr: any) {
          setActiveStaleReview((prev) =>
            prev
              ? {
                  ...prev,
                  saving: false,
                  error: `Collision occurred and failed to re-fetch server state: ${fetchErr.message}`
                }
              : null
          );
        }
      } else {
        // Validation, authorization, or network error: DO NOT delete local draft. Preserve in IndexedDB!
        setActiveStaleReview((prev) =>
          prev
            ? {
                ...prev,
                saving: false,
                error: `Submission rejected (${err.message}). Stale draft is safely preserved on device.`
              }
            : null
        );
      }
    }
  };

  const handleDiscardStale = async (clientMutationId: string) => {
    if (confirm('Are you sure you want to discard this aged offline register? This cannot be undone.')) {
      await removePendingItem(clientMutationId);
      if (activeStaleReview?.item.clientMutationId === clientMutationId) {
        setActiveStaleReview(null);
      }
      await checkQueue();
    }
  };

  const handleExportQuarantined = (item: QuarantinedAttendanceItem) => {
    if (!isAdmin) {
      alert('Access Denied: Only administrators are authorized to export unverified pupil attendance records.');
      return;
    }
    const confirmed = confirm(
      `ADMINISTRATOR DATA EXPORT CONFIRMATION\n\nYou are exporting unverified legacy attendance data (ID: ${item.id}).\nExported records may contain pupil identification data.\n\nThis export is logged and must comply with KCC Student Data Protection Policy.\n\nProceed with export?`
    );
    if (!confirmed) return;

    console.info(`[AUDIT] Administrator ${currentUser?.username} (ID: ${currentUser?.id}) exported quarantined attendance record ${item.id} at ${new Date().toISOString()}`);

    const exportPayload = {
      notice: 'KATTANKUDY CENTRAL COLLEGE NATIONAL SCHOOL — RESTRICTED AUDIT EXPORT',
      confidentiality: 'STRICTLY CONFIDENTIAL — CONTAINS UNVERIFIED LEGACY ATTENDANCE DATA',
      exportedBy: {
        id: currentUser?.id,
        username: currentUser?.username,
        role: currentUser?.role
      },
      exportedAt: new Date().toISOString(),
      quarantinedRecord: item
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quarantined-attendance-${item.id}-admin-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDiscardQuarantined = async (id: string) => {
    if (!isAdmin) {
      alert('Access Denied: Only administrators are authorized to discard quarantined pupil records.');
      return;
    }
    const confirmed = confirm(
      `ADMINISTRATOR DATA DISPOSAL CONFIRMATION\n\nPermanently discard quarantined record ID: ${id}?\n\nThis action cannot be undone and will be recorded in the audit trail.\n\nConfirm permanent disposal?`
    );
    if (!confirmed) return;

    console.info(`[AUDIT] Administrator ${currentUser?.username} (ID: ${currentUser?.id}) permanently discarded quarantined record ${id} at ${new Date().toISOString()}`);

    await removeQuarantinedItem(id);
    await checkQueue();
  };

  if (!currentUser) return null;

  const pendingCount = pendingQueue.filter((i) => i.status === 'pending').length;
  const conflictedCount = pendingQueue.filter((i) => i.status === 'conflicted').length;
  const rejectedCount = pendingQueue.filter((i) => i.status === 'rejected').length;
  const staleItems = pendingQueue.filter(
    (i) => i.status === 'stale_review_required' || i.status === 'legacy_review_required'
  );
  // Restrict quarantined review count to administrators only; teachers only review their own mutations
  const staleCount = staleItems.length + (isAdmin ? quarantinedItems.length : 0);

  if (isOnline && pendingQueue.length === 0 && quarantinedItems.length === 0 && !lastSyncMsg) {
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
            <AlertTriangle size={18} color="var(--late)" />
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
              ? (staleItems.length > 0
                  ? `⏳ Retention Expired: ${staleItems.length} register(s) older than 7 days require teacher re-verification before synchronization.`
                  : `🛡️ Device Quarantine: ${quarantinedItems.length} legacy record(s) on this device require administrator review.`)
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
            {activeStaleReview ? (
              // -------------------------------------------------------------
              // SUB-VIEW: Per-Student Discrepancy & Deliberate Resolution
              // -------------------------------------------------------------
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setActiveStaleReview(null)}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.25rem 0.5rem' }}
                      title="Back to list"
                    >
                      <ArrowLeft size={14} style={{ marginRight: '0.25rem' }} /> Back
                    </button>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#312e81' }}>
                      Reconcile {activeStaleReview.item.className || `Class ${activeStaleReview.item.classId}`} — {activeStaleReview.item.date}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveStaleReview(null);
                      setShowStaleModal(false);
                    }}
                    className="btn btn-icon"
                    style={{ padding: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                  <strong>Institutional Policy KCC-POL-004 Enforcement:</strong> Aged offline records cannot automatically overwrite live server data. Review discrepancies below. Deliberate per-pupil choices are required before saving against Server Revision {activeStaleReview.freshSession.serverRevision}.
                </div>

                {activeStaleReview.error && (
                  <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem', marginBottom: '0.75rem' }}>
                    ⚠️ {activeStaleReview.error}
                  </div>
                )}

                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Pupil</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Stale Offline Entry</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Live Server Record</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Deliberate Choice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeStaleReview.diffs.map((d) => (
                        <tr
                          key={d.student_id}
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            background: d.serverChangedAgain ? '#fef2f2' : d.isDiff ? '#fffbeb' : undefined
                          }}
                        >
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            <div style={{ fontWeight: 600 }}>{d.calling_name}</div>
                            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>{d.admission_no}</div>
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            <span className="badge" style={{ textTransform: 'capitalize', background: '#e0e7ff', color: '#3730a3' }}>
                              {d.localStatus || 'unmarked'}
                            </span>
                            {d.localRemarks && <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>{d.localRemarks}</div>}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>
                            <span className="badge" style={{ textTransform: 'capitalize', background: '#dcfce7', color: '#166534' }}>
                              {d.serverStatus || 'unmarked'}
                            </span>
                            {d.serverRemarks && <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>{d.serverRemarks}</div>}
                            {d.serverChangedAgain && (
                              <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600, marginTop: '0.2rem' }}>
                                ⚠️ Server Changed Again
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                            {d.isDiff ? (
                              <div style={{ display: 'inline-flex', gap: '0.25rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.15rem' }}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleStaleChoice(d.student_id, 'server')}
                                  className="btn btn-sm"
                                  style={{
                                    padding: '0.2rem 0.45rem',
                                    fontSize: '0.725rem',
                                    background: d.chosen === 'server' ? '#166534' : 'transparent',
                                    color: d.chosen === 'server' ? '#ffffff' : 'inherit',
                                    border: 'none',
                                    fontWeight: d.chosen === 'server' ? 700 : 400
                                  }}
                                >
                                  Keep Server
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleStaleChoice(d.student_id, 'local')}
                                  className="btn btn-sm"
                                  style={{
                                    padding: '0.2rem 0.45rem',
                                    fontSize: '0.725rem',
                                    background: d.chosen === 'local' ? '#4f46e5' : 'transparent',
                                    color: d.chosen === 'local' ? '#ffffff' : 'inherit',
                                    border: 'none',
                                    fontWeight: d.chosen === 'local' ? 700 : 400
                                  }}
                                >
                                  Keep Stale
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>✓ Match</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                    Mode: <strong>{activeStaleReview.targetMode.toUpperCase()}</strong> | Reconciling at Rev {activeStaleReview.freshSession.serverRevision}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => handleDiscardStale(activeStaleReview.item.clientMutationId)}
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', color: '#dc2626' }}
                    >
                      <Trash2 size={13} style={{ marginRight: '0.35rem' }} />
                      Discard Draft
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyStaleReconciliation}
                      disabled={activeStaleReview.saving}
                      className="btn btn-primary"
                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                    >
                      <CheckCircle size={13} style={{ marginRight: '0.35rem' }} />
                      {activeStaleReview.saving ? 'Saving...' : 'Confirm & Apply Reconciled Register'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // -------------------------------------------------------------
              // LIST VIEW: All Aged Offline Queue Items
              // -------------------------------------------------------------
              <>
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
                            onClick={() => handleStartStaleReview(item)}
                            disabled={reauthorizingId === item.clientMutationId}
                            className="btn btn-primary"
                            style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                          >
                            <CheckCircle size={13} style={{ marginRight: '0.35rem' }} />
                            {reauthorizingId === item.clientMutationId ? 'Loading Session...' : 'Review & Reconcile'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  {quarantinedItems.length > 0 && (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                      {isAdmin ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                            <h5 style={{ margin: 0, color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 700 }}>
                              <AlertTriangle size={15} />
                              Administrator Quarantine Recovery & Disposal ({quarantinedItems.length})
                            </h5>
                            <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.7rem', fontWeight: 700 }}>
                              Admin Authorized
                            </span>
                          </div>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.6rem', lineHeight: 1.35 }}>
                            Preserved from legacy storage ({quarantinedItems.filter((q) => q.source === 'localstorage_v1_fallback').length} from localStorage fallback). Unverified ownership requires administrator authorization and audit before export or permanent deletion.
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {quarantinedItems.map((q) => (
                              <div
                                key={q.id}
                                style={{
                                  background: '#fffbeb',
                                  border: '1px solid #fef3c7',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '0.6rem 0.75rem',
                                  fontSize: '0.775rem'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <strong>ID: {q.id}</strong> — Source:{' '}
                                    <em>{q.source === 'localstorage_v1_fallback' ? 'Legacy LocalStorage Fallback' : 'Legacy IndexedDB v1'}</em>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.725rem', marginTop: '0.15rem' }}>{q.reason}</div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleExportQuarantined(q)}
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: '0.725rem', padding: '0.2rem 0.5rem' }}
                                      title="Export unverified JSON data with audit tracking"
                                    >
                                      Export JSON
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDiscardQuarantined(q.id)}
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: '0.725rem', padding: '0.2rem 0.5rem', color: '#dc2626' }}
                                      title="Permanently discard quarantined record with audit tracking"
                                    >
                                      Discard
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
                          <h5 style={{ margin: '0 0 0.25rem 0', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700 }}>
                            <AlertTriangle size={15} color="#64748b" />
                            Device Quarantine Notice ({quarantinedItems.length} legacy unassigned record{quarantinedItems.length > 1 ? 's' : ''})
                          </h5>
                          <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                            <strong>Pupil Data Protection Safeguard:</strong> This workstation holds {quarantinedItems.length} quarantined legacy record(s) from earlier application versions with unverified authorship. In accordance with KCC Student Data Protection Policy, class teachers may not inspect, export raw JSON, or delete unverified pupil records. Please contact a System Administrator to perform authorized recovery or data disposal.
                          </p>
                        </div>
                      )}
                    </div>
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
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Save,
  AlertTriangle,
  RotateCcw,
  Search,
  Send,
  Download,
  Info
} from 'lucide-react';
import { api, HttpError } from '../api/client';
import {
  cacheClassRoster,
  getCachedClassRoster,
  queueOfflineAttendance,
  OfflineAttendanceMutation,
  exportMutationJson
} from '../api/offlineQueue';
import { getColomboCivilDate } from '../utils/dateUtils';
import {
  ConflictStudentDiff,
  buildStudentDiffList
} from '../utils/conflictDiffUtils';

interface AttendanceProps {
  user: any;
}

export const Attendance: React.FC<AttendanceProps> = ({ user }) => {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getColomboCivilDate());

  const [students, setStudents] = useState<any[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<number, { status: string; remarks: string }>>({});
  const [existingSession, setExistingSession] = useState<any | null>(null);
  const [serverRevision, setServerRevision] = useState<number>(0);
  const [rosterFingerprint, setRosterFingerprint] = useState<string>('');
  const [sessionNotes, setSessionNotes] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterView, setFilterView] = useState<'all' | 'absent' | 'late' | 'unmarked'>('all');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);

  // Concurrency Conflict Modal State with Per-Student Diff Comparison
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    problemDetails?: any;
    pendingMutation?: OfflineAttendanceMutation;
    latestServerSession?: any;
    latestServerRevision?: number;
    diffs?: ConflictStudentDiff[];
    filterConflictingOnly?: boolean;
    concurrencyError?: string | null;
  }>({ isOpen: false });

  const [copiedDraft, setCopiedDraft] = useState(false);

  useEffect(() => {
    loadClasses();

    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (selectedClassId && selectedDate) {
      loadAttendanceSession(selectedClassId, selectedDate);
    }
  }, [selectedClassId, selectedDate]);

  const loadClasses = async () => {
    try {
      const res = await api.getClasses();
      let availableClasses = res.classes || [];

      // If user is class teacher, prioritize assigned classes
      if (user.role === 'class_teacher' && user.assignedClassIds?.length > 0) {
        const filtered = availableClasses.filter((c: any) =>
          user.assignedClassIds.includes(c.id)
        );
        if (filtered.length > 0) {
          availableClasses = filtered;
        }
      }

      setClasses(availableClasses);
      if (availableClasses.length > 0 && !selectedClassId) {
        setSelectedClassId(availableClasses[0].id);
      }
    } catch (err) {
      console.error('Failed to load classes:', err);
    }
  };

  const loadAttendanceSession = async (classId: number, date: string) => {
    try {
      setLoading(true);
      setSaveSuccessMsg(null);
      setErrorMessage(null);

      const targetClass = classes.find((c) => c.id === classId);
      const academicYearId = targetClass?.academic_year_id || 1;

      if (navigator.onLine) {
        const res = await api.getAttendanceSession(classId, date);
        setExistingSession(res.session);
        setServerRevision(res.serverRevision || res.session?.revision || 0);
        setRosterFingerprint(res.rosterFingerprint || '');
        setSessionNotes(res.session?.notes || '');
        setStudents(res.students || []);

        // Cache roster in IndexedDB v2 with PII minimization
        await cacheClassRoster(
          user.id,
          academicYearId,
          classId,
          date,
          res.serverRevision || 0,
          res.rosterFingerprint || '',
          res.students || [],
          targetClass?.name
        );

        // Attendance mapping: UNMARKED BY DEFAULT if no prior record exists!
        const newMap: Record<number, { status: string; remarks: string }> = {};
        (res.students || []).forEach((st: any) => {
          newMap[st.student_id] = {
            status: st.attendance_status || 'unmarked',
            remarks: st.attendance_remarks || ''
          };
        });
        setAttendanceMap(newMap);
      } else {
        // Offline: Load from IndexedDB v2 cache for this specific date
        setIsOfflineMode(true);
        const cached = await getCachedClassRoster(user.id, academicYearId, classId, date);
        if (cached) {
          setStudents(cached.students || []);
          setServerRevision(cached.serverRevision || 0);
          setRosterFingerprint(cached.rosterFingerprint || '');
          const newMap: Record<number, { status: string; remarks: string }> = {};
          (cached.students || []).forEach((st: any) => {
            newMap[st.student_id] = {
              status: st.attendance_status || 'unmarked',
              remarks: st.attendance_remarks || ''
            };
          });
          setAttendanceMap(newMap);
        } else {
          setStudents([]);
          setServerRevision(0);
          setRosterFingerprint('');
          setAttendanceMap({});
          setErrorMessage(`No offline register cached for Class ${classId} on Date ${date}. Connect to school network to download this register.`);
        }
      }
    } catch (err: any) {
      console.warn('Network error loading session, falling back to offline cache:', err);
      setIsOfflineMode(true);
      const targetClass = classes.find((c) => c.id === classId);
      const cached = await getCachedClassRoster(user.id, targetClass?.academic_year_id || 1, classId, date);
      if (cached) {
        setStudents(cached.students || []);
        setServerRevision(cached.serverRevision || 0);
        setRosterFingerprint(cached.rosterFingerprint || '');
        const newMap: Record<number, { status: string; remarks: string }> = {};
        (cached.students || []).forEach((st: any) => {
          newMap[st.student_id] = {
            status: st.attendance_status || 'unmarked',
            remarks: st.attendance_remarks || ''
          };
        });
        setAttendanceMap(newMap);
      } else {
        setStudents([]);
        setServerRevision(0);
        setRosterFingerprint('');
        setAttendanceMap({});
        setErrorMessage(`Network error: No offline register cached for Date ${date}. Connect to school network to download this register.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (studentId: number, status: string) => {
    setAttendanceMap((prev) => {
      const current = prev[studentId]?.status;
      // Toggle back to unmarked if same status clicked
      const nextStatus = current === status ? 'unmarked' : status;
      return {
        ...prev,
        [studentId]: {
          ...prev[studentId],
          status: nextStatus
        }
      };
    });
  };

  const handleRemarksChange = (studentId: number, remarks: string) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks
      }
    }));
  };

  const handleQuickRemark = (studentId: number, tag: string) => {
    const existing = attendanceMap[studentId]?.remarks || '';
    const updated = existing ? `${existing}; ${tag}` : tag;
    handleRemarksChange(studentId, updated);
  };

  const handleMarkAll = (status: string) => {
    const newMap: Record<number, { status: string; remarks: string }> = {};
    students.forEach((st: any) => {
      newMap[st.student_id] = {
        status,
        remarks: attendanceMap[st.student_id]?.remarks || ''
      };
    });
    setAttendanceMap(newMap);
  };

  const handleClearAll = () => {
    const newMap: Record<number, { status: string; remarks: string }> = {};
    students.forEach((st: any) => {
      newMap[st.student_id] = {
        status: 'unmarked',
        remarks: attendanceMap[st.student_id]?.remarks || ''
      };
    });
    setAttendanceMap(newMap);
  };

  // Real-time Counts
  let countPresent = 0;
  let countAbsent = 0;
  let countLate = 0;
  let countExcused = 0;
  let countUnmarked = 0;

  students.forEach((st) => {
    const s = attendanceMap[st.student_id]?.status;
    if (s === 'present') countPresent++;
    else if (s === 'absent') countAbsent++;
    else if (s === 'late') countLate++;
    else if (s === 'excused') countExcused++;
    else countUnmarked++;
  });

  const total = students.length;
  const isRecorded = existingSession !== null || (total > 0 && countUnmarked < total);
  const attendanceRate = total > 0 && (countPresent + countLate > 0)
    ? Math.round(((countPresent + countLate) / total) * 100)
    : 0;

  // Execute Submission (Draft or Final)
  const handleSaveAttendance = async (mode: 'draft' | 'submitted') => {
    if (!selectedClassId || students.length === 0) {
      setErrorMessage('Cannot save attendance: No student roster loaded for the selected class and date.');
      return;
    }

    if (!rosterFingerprint && !navigator.onLine) {
      setErrorMessage(`Cannot save offline attendance: No verified roster fingerprint cached for Date ${selectedDate}. Connect online to initialize.`);
      return;
    }

    setErrorMessage(null);
    setSaveSuccessMsg(null);

    // Validation for final submitted register: 100% of roster must be marked
    if (mode === 'submitted' && countUnmarked > 0) {
      setErrorMessage(
        `Cannot submit final register: ${countUnmarked} student(s) remain unmarked. Please mark all students as Present, Absent, Late, or Excused, or click "Save Draft".`
      );
      return;
    }

    const targetClass = classes.find((c) => c.id === selectedClassId);
    const academicYearId = targetClass?.academic_year_id || 1;

    // Filter out unmarked students for draft payloads
    const activeRecords = students
      .filter((st) => {
        const s = attendanceMap[st.student_id]?.status;
        return s && s !== 'unmarked';
      })
      .map((st) => ({
        student_id: st.student_id,
        status: attendanceMap[st.student_id].status as any,
        remarks: attendanceMap[st.student_id].remarks || null
      }));

    const clientMutationId = crypto.randomUUID();

    const mutationPayload: OfflineAttendanceMutation = {
      clientMutationId,
      schoolId: 'kcc',
      userId: user.id,
      academicYearId,
      classId: selectedClassId,
      className: targetClass?.name,
      date: selectedDate,
      mode,
      baseRevision: serverRevision,
      rosterFingerprint,
      records: activeRecords,
      notes: sessionNotes || null,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    try {
      setSaving(true);

      if (navigator.onLine) {
        const apiPayload = {
          classId: selectedClassId,
          date: selectedDate,
          mode,
          baseRevision: serverRevision,
          clientMutationId,
          rosterFingerprint,
          notes: sessionNotes || null,
          records: activeRecords
        };

        const res = await api.saveAttendanceSession(apiPayload);

        setServerRevision(res.revision);
        setExistingSession({
          id: res.sessionId,
          date: selectedDate,
          status: mode,
          revision: res.revision,
          notes: sessionNotes
        });

        setSaveSuccessMsg(
          mode === 'submitted'
            ? `Finalized attendance register for ${selectedDate} submitted successfully (Revision ${res.revision}).`
            : `Attendance draft saved successfully (Revision ${res.revision}).`
        );
      } else {
        // Offline: enqueue in IndexedDB v2
        await queueOfflineAttendance(mutationPayload);
        setSaveSuccessMsg(
          `Offline: ${mode === 'submitted' ? 'Final register' : 'Draft'} saved locally on device and queued for sync.`
        );
      }

      setTimeout(() => setSaveSuccessMsg(null), 6000);
    } catch (err: any) {
      if (err instanceof HttpError) {
        // Online HTTP Server Responses: NEVER masquerade as connection loss or queue offline
        if (err.status === 409) {
          // 409 Concurrency Conflict or Fingerprint Mismatch -> Open Student-by-Student Diff Modal
          await openConflictResolutionModal(mutationPayload, err.problemDetails);
        } else if (err.status === 400 || err.status === 422) {
          setErrorMessage(`Validation / Policy Error (${err.code}): ${err.message}`);
        } else if (err.status === 401) {
          setErrorMessage('Your session has expired. Please log in again to save attendance.');
        } else if (err.status === 403) {
          setErrorMessage(`Access Denied (${err.code}): ${err.message}`);
        } else if (err.status === 429) {
          setErrorMessage('Too many requests. Please wait a moment before saving again.');
        } else if (err.status >= 500) {
          setErrorMessage(`Server Error (${err.status}): ${err.message}. Your draft remains intact on screen. Do not treat as network disconnect.`);
        } else {
          setErrorMessage(`Server Error (${err.status}): ${err.message}`);
        }
      } else {
        // Genuine network transport failure (e.g. !navigator.onLine, TypeError: Failed to fetch)
        console.warn('Network transport failure during save, queueing offline mutation:', err);
        await queueOfflineAttendance(mutationPayload);
        setIsOfflineMode(true);
        setSaveSuccessMsg('Network transport failure: Register safely queued in offline browser storage.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Student-by-Student Concurrency Conflict Reconciliation
  const openConflictResolutionModal = async (
    pendingMutation: OfflineAttendanceMutation,
    problemDetails?: any
  ) => {
    if (!selectedClassId || !selectedDate) return;
    try {
      setLoading(true);
      const latest = await api.getAttendanceSession(selectedClassId, selectedDate);
      const serverRecords = latest.records || [];

      const diffList = buildStudentDiffList(
        students,
        pendingMutation,
        serverRecords,
        attendanceMap
      );

      setConflictModal({
        isOpen: true,
        problemDetails,
        pendingMutation,
        latestServerSession: latest,
        latestServerRevision: latest.serverRevision,
        diffs: diffList,
        filterConflictingOnly: true,
        concurrencyError: null
      });
    } catch (err: any) {
      console.error('Failed to prepare conflict resolution diff:', err);
      setErrorMessage(`Failed to fetch latest server revision for conflict resolution: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStudentChoice = (studentId: number, chosen: 'local' | 'server') => {
    setConflictModal((prev) => {
      if (!prev.diffs) return prev;
      const updated = prev.diffs.map((d) => (d.student_id === studentId ? { ...d, chosen } : d));
      return { ...prev, diffs: updated };
    });
  };

  const handleChooseAll = (choice: 'local' | 'server') => {
    setConflictModal((prev) => {
      if (!prev.diffs) return prev;
      const updated = prev.diffs.map((d) => ({ ...d, chosen: choice }));
      return { ...prev, diffs: updated };
    });
  };

  const handleApplyDeliberateResolution = async () => {
    if (!selectedClassId || !selectedDate || !conflictModal.diffs) return;
    try {
      setSaving(true);
      const targetRev = conflictModal.latestServerRevision!;
      const targetFingerprint =
        conflictModal.latestServerSession?.rosterFingerprint || rosterFingerprint;

      // BLOCKER C: Determine allowed mode from server-current register state
      // Rule ATT-014: Once a register has been finalized ('submitted') on server, it can NEVER be downgraded to draft.
      const isServerSubmitted = conflictModal.latestServerSession?.status === 'submitted';
      const isLocalSubmitted =
        existingSession?.status === 'submitted' || conflictModal.pendingMutation?.mode === 'submitted';
      const targetMode: 'draft' | 'submitted' =
        (isServerSubmitted || isLocalSubmitted) ? 'submitted' : 'draft';

      const resolvedRecords = conflictModal.diffs
        .map((d) => {
          let status = d.chosen === 'server' ? d.serverStatus : d.localStatus;
          // When reconciling against a server-finalized register, unmarked is not allowed:
          // inherit server status if local was unmarked, or local status if valid
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

      // If submitting finalized register, enforce 100% complete roster check
      if (targetMode === 'submitted' && resolvedRecords.length < students.length) {
        setConflictModal((prev) => ({
          ...prev,
          concurrencyError: `Finalized register requires complete attendance. ${students.length - resolvedRecords.length} student(s) remain unmarked. Please choose a status for every pupil before submitting.`
        }));
        return;
      }

      const newMutationId = crypto.randomUUID();

      const res = await api.saveAttendanceSession({
        classId: selectedClassId,
        date: selectedDate,
        mode: targetMode,
        baseRevision: targetRev,
        clientMutationId: newMutationId,
        rosterFingerprint: targetFingerprint,
        notes: sessionNotes || (isServerSubmitted ? 'Reconciled against server-finalized register' : null),
        records: resolvedRecords
      });

      setServerRevision(res.revision);
      setExistingSession({
        id: res.sessionId,
        date: selectedDate,
        status: res.mode,
        revision: res.revision
      });

      const updatedMap = { ...attendanceMap };
      resolvedRecords.forEach((r) => {
        updatedMap[r.student_id] = { status: r.status, remarks: r.remarks || '' };
      });
      setAttendanceMap(updatedMap);

      setConflictModal({ isOpen: false });
      setSaveSuccessMsg(
        `Conflict resolved! Deliberate choices successfully applied and saved at Revision ${res.revision} (${res.mode} mode).`
      );
    } catch (err: any) {
      if (err instanceof HttpError && err.status === 409) {
        // BLOCKER B: Second optimistic revision check caught concurrent collision!
        // Immediately fetch the fresh server state and REBUILD student diff comparisons
        const fresh = await api.getAttendanceSession(selectedClassId, selectedDate);
        
        // Preserve prior choices where possible, but require re-review of newly modified records
        const priorChoices = new Map<number, 'local' | 'server'>();
        conflictModal.diffs.forEach(d => priorChoices.set(d.student_id, d.chosen));

        const freshDiffs = buildStudentDiffList(
          students,
          conflictModal.pendingMutation!,
          fresh.records || [],
          attendanceMap,
          priorChoices,
          conflictModal.latestServerSession?.records || []
        );

        setConflictModal((prev) => ({
          ...prev,
          latestServerSession: fresh,
          latestServerRevision: fresh.serverRevision,
          diffs: freshDiffs,
          concurrencyError: `Collision recurred! Another user submitted an update while you were reviewing. Server advanced to Revision ${fresh.serverRevision}. The student comparison has been refreshed with the latest server records. Please re-verify choices before re-submitting.`
        }));
      } else {
        setErrorMessage(`Failed to apply deliberate conflict resolution: ${err.message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleKeepServer = async () => {
    setConflictModal({ isOpen: false });
    if (selectedClassId && selectedDate) {
      await loadAttendanceSession(selectedClassId, selectedDate);
    }
    setSaveSuccessMsg('Discarded local edits and reloaded latest server register.');
  };

  const handleExportLocalDraft = () => {
    if (!conflictModal.pendingMutation) return;
    const jsonStr = exportMutationJson(conflictModal.pendingMutation);
    navigator.clipboard.writeText(jsonStr);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 3000);
  };

  // Filter students by search query and status tab
  const filteredStudents = students.filter((st) => {
    const s = attendanceMap[st.student_id]?.status || 'unmarked';
    if (filterView === 'absent' && s !== 'absent') return false;
    if (filterView === 'late' && s !== 'late') return false;
    if (filterView === 'unmarked' && s !== 'unmarked') return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      st.full_name?.toLowerCase().includes(q) ||
      st.calling_name?.toLowerCase().includes(q) ||
      st.admission_no?.toLowerCase().includes(q) ||
      String(st.roll_number || '').includes(q)
    );
  });

  const isSubmittedState = existingSession?.status === 'submitted';

  return (
    <div>
      {/* Header with Title and Dual Action Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Daily Class Attendance Register</h2>
            {isOfflineMode && (
              <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', fontSize: '0.75rem' }}>
                Working Offline (IndexedDB v2)
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Touch-friendly roll call with atomic revision concurrency, date boundaries, and offline sync.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          {/* Draft Button: Allows partial records */}
          <button
            onClick={() => handleSaveAttendance('draft')}
            disabled={saving || students.length === 0 || isSubmittedState}
            className="btn btn-secondary"
            title={isSubmittedState ? 'Submitted registers cannot be downgraded to draft' : 'Save partial roll-call progress'}
          >
            <Save size={16} />
            <span>{saving ? 'Saving...' : 'Save Draft'}</span>
          </button>

          {/* Final Submit Button: Requires 100% complete records */}
          <button
            onClick={() => handleSaveAttendance('submitted')}
            disabled={saving || students.length === 0}
            className="btn btn-primary"
            style={{ minWidth: '170px' }}
            title="Submit official finalized attendance register"
          >
            <Send size={16} />
            <span>
              {saving
                ? 'Submitting...'
                : isSubmittedState
                ? `Update Register (Rev ${serverRevision})`
                : 'Submit Final Register'}
            </span>
          </button>
        </div>
      </div>

      {/* Class & Date Selector Card */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: '240px', flex: '1 1 240px' }}>
            <label className="form-label">Select Class (Grade 6–13)</label>
            <select
              className="form-select"
              value={selectedClassId || ''}
              onChange={(e) => setSelectedClassId(Number(e.target.value))}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.class_teacher_name ? `• ${c.class_teacher_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '180px' }}>
            <label className="form-label">Register Date (Asia/Colombo)</label>
            <input
              type="date"
              className="form-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleMarkAll('present')}
              className="btn btn-secondary btn-sm"
              title="Mark all enrolled students as Present"
            >
              <CheckCircle2 size={14} style={{ color: 'var(--present)' }} />
              <span>Mark All Present</span>
            </button>

            <button
              onClick={() => handleMarkAll('absent')}
              className="btn btn-secondary btn-sm"
              title="Mark all enrolled students as Absent"
            >
              <XCircle size={14} style={{ color: 'var(--absent)' }} />
              <span>Mark All Absent</span>
            </button>

            <button
              onClick={handleClearAll}
              className="btn btn-secondary btn-sm"
              title="Reset all students to Unmarked"
            >
              <RotateCcw size={14} />
              <span>Clear to Unmarked</span>
            </button>
          </div>
        </div>

        {/* Feedback / Alert Banners */}
        {saveSuccessMsg && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              background: 'var(--present-bg)',
              color: 'var(--present)',
              border: '1px solid var(--present-border)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              fontSize: '0.875rem'
            }}
          >
            <CheckCircle2 size={18} />
            <strong>{saveSuccessMsg}</strong>
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              background: 'var(--absent-bg)',
              color: 'var(--absent)',
              border: '1px solid var(--absent-border)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              fontSize: '0.875rem'
            }}
          >
            <AlertTriangle size={18} />
            <strong>{errorMessage}</strong>
          </div>
        )}

        {/* Truthful Session Status Indicator */}
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: isSubmittedState
              ? 'rgba(5, 150, 105, 0.08)'
              : existingSession
              ? 'rgba(217, 119, 6, 0.08)'
              : 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.825rem',
            border: `1px solid ${
              isSubmittedState
                ? 'var(--present-border)'
                : existingSession
                ? 'rgba(217, 119, 6, 0.25)'
                : 'var(--border-color)'
            }`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Info size={16} />
            <span>
              {isSubmittedState
                ? `Official Register Finalized for ${selectedDate} (Revision ${serverRevision}). Submitted by ${existingSession?.taken_by_name || 'Class Teacher'}.`
                : existingSession
                ? `Draft Attendance in Progress for ${selectedDate} (Revision ${serverRevision}). ${countUnmarked} student(s) unmarked.`
                : `No attendance record exists for ${selectedDate}. Select students and submit final register or draft.`}
            </span>
          </div>

          <span
            className="badge"
            style={{
              background: isSubmittedState
                ? 'var(--present)'
                : existingSession
                ? 'var(--late)'
                : 'var(--text-muted)',
              color: 'white',
              fontSize: '0.725rem'
            }}
          >
            {isSubmittedState ? `Final (Rev ${serverRevision})` : existingSession ? `Draft (Rev ${serverRevision})` : 'Not Recorded'}
          </span>
        </div>
      </div>

      {/* Live Roll Summary & Metrics Banner */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'var(--bg-subtle)'
        }}
      >
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Class Enrolment:</span>
            <strong style={{ marginLeft: 6, fontSize: '0.95rem' }}>{total} Students</strong>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-present" style={{ fontSize: '0.8rem' }}>
              Present: {countPresent}
            </span>
            <span className="badge badge-absent" style={{ fontSize: '0.8rem' }}>
              Absent: {countAbsent}
            </span>
            <span className="badge badge-late" style={{ fontSize: '0.8rem' }}>
              Late: {countLate}
            </span>
            <span className="badge badge-excused" style={{ fontSize: '0.8rem' }}>
              Excused: {countExcused}
            </span>
            <span className="badge badge-unmarked" style={{ fontSize: '0.8rem' }}>
              Unmarked: {countUnmarked}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>Truthful Attendance:</span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.4rem',
              fontWeight: 800,
              color: !isRecorded ? 'var(--text-muted)' : attendanceRate >= 80 ? 'var(--present)' : 'var(--absent)'
            }}
          >
            {!isRecorded ? '—' : `${attendanceRate}%`}
          </span>
        </div>
      </div>

      {/* Search & Audit Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div style={{ position: 'relative', width: '280px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }}
          />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '36px', height: 38 }}
            placeholder="Search student or roll #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterView('all')}
            className={`btn btn-sm ${filterView === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          >
            All Students ({students.length})
          </button>
          <button
            onClick={() => setFilterView('unmarked')}
            className={`btn btn-sm ${filterView === 'unmarked' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Unmarked ({countUnmarked})
          </button>
          <button
            onClick={() => setFilterView('absent')}
            className={`btn btn-sm ${filterView === 'absent' ? 'btn-danger' : 'btn-secondary'}`}
          >
            Absentees ({countAbsent})
          </button>
          <button
            onClick={() => setFilterView('late')}
            className={`btn btn-sm ${filterView === 'late' ? 'btn-secondary' : 'btn-secondary'}`}
            style={{
              background: filterView === 'late' ? 'var(--late)' : undefined,
              color: filterView === 'late' ? 'white' : undefined
            }}
          >
            Late ({countLate})
          </button>
        </div>
      </div>

      {/* Attendance Roster Grid / List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 65, textAlign: 'center' }}>Roll #</th>
                <th>Admission & Student Name</th>
                <th style={{ width: 340, textAlign: 'center' }}>Attendance Status (Touch / Tap)</th>
                <th>Remarks & Quick Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="animate-spin" style={{ display: 'inline-block', width: 24, height: 24, border: '3px solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
                    <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>Loading class roster...</p>
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>
                      No students found matching current filter or search criteria.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => {
                  const currentStatus = attendanceMap[st.student_id]?.status || 'unmarked';
                  const currentRemark = attendanceMap[st.student_id]?.remarks || '';

                  return (
                    <tr key={st.student_id}>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            color: 'var(--text-muted)',
                            background: 'var(--bg-subtle)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-xs)'
                          }}
                        >
                          #{st.roll_number || '-'}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            className="user-avatar"
                            style={{
                              width: 36,
                              height: 36,
                              fontSize: '0.8rem',
                              background:
                                currentStatus === 'present'
                                  ? 'var(--present)'
                                  : currentStatus === 'absent'
                                  ? 'var(--absent)'
                                  : currentStatus === 'late'
                                  ? 'var(--late)'
                                  : currentStatus === 'excused'
                                  ? 'var(--excused)'
                                  : '#64748b'
                            }}
                          >
                            {st.calling_name?.charAt(0) || 'S'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.925rem' }}>
                              {st.full_name}
                              {st.is_currently_enrolled === 0 && (
                                <span className="badge badge-unmarked" style={{ marginLeft: 6, fontSize: '0.65rem' }}>
                                  Transferred (Historical)
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {st.admission_no} • {st.calling_name}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {/* 5-Way Touch Segmented Control (Min 44px Touch Target) */}
                        <div className="attendance-btn-group" style={{ margin: '0 auto' }}>
                          <button
                            type="button"
                            className={`att-btn present ${currentStatus === 'present' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'present')}
                            title="Mark Present"
                            aria-pressed={currentStatus === 'present'}
                          >
                            P • Present
                          </button>

                          <button
                            type="button"
                            className={`att-btn absent ${currentStatus === 'absent' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'absent')}
                            title="Mark Absent"
                            aria-pressed={currentStatus === 'absent'}
                          >
                            A • Absent
                          </button>

                          <button
                            type="button"
                            className={`att-btn late ${currentStatus === 'late' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'late')}
                            title="Mark Late"
                            aria-pressed={currentStatus === 'late'}
                          >
                            L • Late
                          </button>

                          <button
                            type="button"
                            className={`att-btn excused ${currentStatus === 'excused' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'excused')}
                            title="Mark Excused"
                            aria-pressed={currentStatus === 'excused'}
                          >
                            E • Excused
                          </button>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{
                              padding: '0.45rem 0.75rem',
                              fontSize: '0.825rem',
                              backgroundColor: currentStatus === 'absent' ? 'var(--absent-bg)' : 'transparent',
                              borderColor: currentStatus === 'absent' ? 'var(--absent-border)' : undefined
                            }}
                            placeholder={currentStatus === 'absent' ? 'Reason for absence...' : 'Optional remarks...'}
                            value={currentRemark}
                            onChange={(e) => handleRemarksChange(st.student_id, e.target.value)}
                          />

                          {/* Quick Reason Chips for Absentees / Late */}
                          {(currentStatus === 'absent' || currentStatus === 'late' || currentStatus === 'excused') && (
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                              {['Medical', 'Sick Leave', 'Transport', 'Family Event', 'Official Duty'].map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => handleQuickRemark(st.student_id, tag)}
                                  style={{
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-subtle)',
                                    borderRadius: 'var(--radius-xs)',
                                    fontSize: '0.675rem',
                                    padding: '0.1rem 0.35rem',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer'
                                  }}
                                  title={`Append reason: ${tag}`}
                                >
                                  +{tag}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side-by-Side Student-by-Student Conflict Resolution Modal */}
      {conflictModal.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
            backdropFilter: 'blur(3px)'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '880px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.75rem',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
              border: '2px solid #f59e0b',
              backgroundColor: 'var(--bg-card, #ffffff)'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <AlertTriangle size={26} color="var(--late)" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#92400e' }}>
                  Student-by-Student Concurrency Conflict Resolution
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
                <span className="badge" style={{ background: 'var(--bg-subtle)', padding: '0.25rem 0.5rem' }}>
                  Base Rev: <strong>{conflictModal.pendingMutation?.baseRevision ?? serverRevision}</strong>
                </span>
                <span className="badge" style={{ background: '#fef3c7', color: '#92400e', padding: '0.25rem 0.5rem' }}>
                  Server Rev: <strong>{conflictModal.latestServerRevision ?? (serverRevision + 1)}</strong>
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.85rem', lineHeight: 1.45 }}>
              This register was modified on the school server while you were working. Blind overwriting is strictly prohibited.
              Review the differences below and deliberately select which attendance record to keep for each student.
            </p>

            {/* Recurrence Warning Banner */}
            {conflictModal.concurrencyError && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #ef4444',
                  color: '#991b1b',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  marginBottom: '0.75rem'
                }}
              >
                ⚠️ {conflictModal.concurrencyError}
              </div>
            )}

            {/* Bulk Controls & Filtering Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                background: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '0.85rem',
                fontSize: '0.825rem',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span>
                  Discrepancies: <strong>{conflictModal.diffs?.filter((d) => d.isDiff).length || 0}</strong> /{' '}
                  {conflictModal.diffs?.length || 0} students
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={conflictModal.filterConflictingOnly ?? true}
                    onChange={(e) =>
                      setConflictModal((prev) => ({ ...prev, filterConflictingOnly: e.target.checked }))
                    }
                  />
                  <span>Show only discrepancies</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                  onClick={() => handleChooseAll('server')}
                  title="Choose server version for all students"
                >
                  Accept All Server
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                  onClick={() => handleChooseAll('local')}
                  title="Choose local draft version for all students"
                >
                  Keep All My Draft
                </button>
              </div>
            </div>

            {/* Scrollable Student-by-Student Comparison Table */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
                maxHeight: '380px'
              }}
            >
              <table className="table" style={{ width: '100%', fontSize: '0.825rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card, #ffffff)', zIndex: 10 }}>
                  <tr>
                    <th style={{ width: '22%' }}>Student</th>
                    <th style={{ width: '25%', background: '#fef3c7' }}>Server Record (Rev {conflictModal.latestServerRevision})</th>
                    <th style={{ width: '25%', background: '#e0e7ff' }}>Your Local Draft</th>
                    <th style={{ width: '28%', textAlign: 'center' }}>Chosen Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {(conflictModal.diffs || [])
                    .filter((d) => (conflictModal.filterConflictingOnly ? d.isDiff : true))
                    .map((d) => {
                      return (
                        <tr
                          key={d.student_id}
                          style={{
                            background: d.isDiff ? (d.chosen === 'server' ? '#fffbeb' : '#eef2ff') : 'transparent',
                            borderBottom: '1px solid var(--border-color)'
                          }}
                        >
                          <td>
                            <strong>{d.admission_no}</strong>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{d.calling_name}</div>
                            {d.serverChangedAgain && (
                              <div style={{ marginTop: '0.25rem' }}>
                                <span
                                  className="badge"
                                  style={{
                                    background: '#fee2e2',
                                    color: '#991b1b',
                                    border: '1px solid #ef4444',
                                    fontSize: '0.675rem',
                                    fontWeight: 700
                                  }}
                                  title="Server status or remarks changed in the latest concurrent submission. Prior local choice was invalidated."
                                >
                                  ⚠️ Server Changed Again
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Server State */}
                          <td style={{ background: 'rgba(254, 243, 199, 0.4)' }}>
                            <span
                              className={`badge att-status-${d.serverStatus}`}
                              style={{ textTransform: 'capitalize', fontWeight: 600 }}
                            >
                              {d.serverStatus}
                            </span>
                            {d.serverRemarks && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                <em>"{d.serverRemarks}"</em>
                              </div>
                            )}
                          </td>

                          {/* Local Draft State */}
                          <td style={{ background: 'rgba(224, 231, 255, 0.4)' }}>
                            <span
                              className={`badge att-status-${d.localStatus}`}
                              style={{ textTransform: 'capitalize', fontWeight: 600 }}
                            >
                              {d.localStatus}
                            </span>
                            {d.localRemarks && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                <em>"{d.localRemarks}"</em>
                              </div>
                            )}
                          </td>

                          {/* Resolution Choice Toggles */}
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                              <button
                                type="button"
                                onClick={() => handleToggleStudentChoice(d.student_id, 'server')}
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.75rem',
                                  fontWeight: d.chosen === 'server' ? 700 : 400,
                                  background: d.chosen === 'server' ? 'var(--late)' : 'transparent',
                                  color: d.chosen === 'server' ? '#ffffff' : 'inherit',
                                  border: 'none',
                                  cursor: 'pointer'
                                }}
                                title="Keep server status for this student"
                              >
                                Server: {d.serverStatus}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStudentChoice(d.student_id, 'local')}
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.75rem',
                                  fontWeight: d.chosen === 'local' ? 700 : 400,
                                  background: d.chosen === 'local' ? '#4f46e5' : 'transparent',
                                  color: d.chosen === 'local' ? '#ffffff' : 'inherit',
                                  border: 'none',
                                  cursor: 'pointer'
                                }}
                                title="Keep your draft status for this student"
                              >
                                Draft: {d.localStatus}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleKeepServer}
                  className="btn btn-secondary"
                  title="Discard local edits and reload latest server register"
                >
                  <RotateCcw size={14} />
                  <span>Discard & Reload Server</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportLocalDraft}
                  className="btn btn-secondary"
                  title="Copy local draft JSON to clipboard"
                >
                  <Download size={14} />
                  <span>{copiedDraft ? '✓ Copied Draft JSON!' : 'Export Draft JSON'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleApplyDeliberateResolution}
                className="btn btn-primary"
                disabled={saving}
                style={{ padding: '0.6rem 1.25rem', fontWeight: 700 }}
              >
                <CheckCircle2 size={16} />
                <span>
                  {saving
                    ? 'Submitting Resolution...'
                    : `Apply Deliberate Choices (Revision ${conflictModal.latestServerRevision ?? (serverRevision + 1)})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

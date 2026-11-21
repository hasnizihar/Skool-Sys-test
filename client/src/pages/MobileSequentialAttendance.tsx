import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Save,
  Send,
  AlertTriangle,
  User,
  Users,
  Calendar,
  Check,
  X,
  Edit3,
  List,
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react';
import { api, HttpError } from '../api/client';
import {
  cacheClassRoster,
  getCachedClassRoster,
  queueOfflineAttendance,
  OfflineAttendanceMutation,
  minimizeStudentForOffline
} from '../api/offlineQueue';
import { getColomboCivilDate } from '../utils/dateUtils';
import { useToast } from '../ui/useToast';
import './mobileSequentialAttendance.css';

interface Props {
  user: any;
  onNavigate?: (tab: string) => void;
  initialClassId?: number;
  initialDate?: string;
  onSwitchToTableMode?: () => void;
}

export const PREDEFINED_ABSENCE_REASONS = [
  { id: 'sick', label: 'Sick / Medical', icon: '🩺' },
  { id: 'leave', label: 'Approved Leave', icon: '📝' },
  { id: 'family', label: 'Family Event', icon: '👨‍👩‍👧' },
  { id: 'transport', label: 'Transport / Weather', icon: '🚌' },
  { id: 'unexcused', label: 'Unexcused / Truant', icon: '❓' }
];

export const MobileSequentialAttendance: React.FC<Props> = ({
  user,
  onNavigate,
  initialClassId,
  initialDate,
  onSwitchToTableMode
}) => {
  const { showSuccess, showError, showWarning } = useToast();

  // 1. Class & Date Selection
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(initialClassId || null);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || getColomboCivilDate());

  // 2. Roster & Session State
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Attendance Map: studentId -> { status: string; remarks: string }
  const [attendanceMap, setAttendanceMap] = useState<Record<number, { status: string; remarks: string }>>({});
  const [existingSession, setExistingSession] = useState<any | null>(null);
  const [serverRevision, setServerRevision] = useState<number>(0);
  const [rosterFingerprint, setRosterFingerprint] = useState<string>('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // 3. View Mode: 'card' (sequential roll-call) | 'summary' (review & submit)
  const [viewMode, setViewMode] = useState<'card' | 'summary'>('card');

  // 4. Absence Reason Modal State
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [activeStudentForAbsence, setActiveStudentForAbsence] = useState<any | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [customReason, setCustomReason] = useState<string>('');

  // 5. Jump Drawer / Roster List State
  const [jumpDrawerOpen, setJumpDrawerOpen] = useState(false);

  // Online / Offline Listeners
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load Classes
  useEffect(() => {
    loadClasses();
  }, []);

  // Load Session whenever class or date changes
  useEffect(() => {
    if (selectedClassId && selectedDate) {
      loadAttendanceSession(selectedClassId, selectedDate);
    }
  }, [selectedClassId, selectedDate]);

  const loadClasses = async () => {
    try {
      const res = await api.getClasses();
      let available = res.classes || [];

      // If class teacher, prioritize assigned classes
      if (user.role === 'class_teacher' && user.assignedClassIds?.length > 0) {
        const filtered = available.filter((c: any) => user.assignedClassIds.includes(c.id));
        if (filtered.length > 0) available = filtered;
      }

      setClasses(available);

      // If teacher has only 1 class or no class currently selected
      if (available.length > 0 && !selectedClassId) {
        setSelectedClassId(available[0].id);
      }
    } catch (err) {
      console.error('Failed to load classes:', err);
    }
  };

  const loadAttendanceSession = async (classId: number, dateStr: string) => {
    setLoading(true);
    try {
      if (navigator.onLine) {
        const res = await api.getAttendanceSession(classId, dateStr);
        setExistingSession(res.session || null);
        setServerRevision(res.serverRevision || 0);
        setRosterFingerprint(res.rosterFingerprint || '');

        const roster = res.students || [];
        setStudents(roster);

        // Prepopulate attendance map
        const newMap: Record<number, { status: string; remarks: string }> = {};
        roster.forEach((st: any) => {
          if (st.attendance_status) {
            newMap[st.student_id] = {
              status: st.attendance_status,
              remarks: st.attendance_remarks || ''
            };
          }
        });
        setAttendanceMap(newMap);

        // Cache roster for offline use
        if (roster.length > 0) {
          cacheClassRoster(
            user.id,
            res.session?.academic_year_id || 1,
            classId,
            dateStr,
            res.serverRevision || 0,
            res.rosterFingerprint || '',
            roster,
            res.session?.class_name
          ).catch(console.warn);
        }
      } else {
        // Offline: try to load from IndexedDB cache
        const cached = await getCachedClassRoster(user.id, 1, classId, dateStr);
        if (cached && cached.students?.length > 0) {
          setStudents(cached.students);
          setServerRevision(cached.serverRevision || 0);
          setRosterFingerprint(cached.rosterFingerprint || '');
          const newMap: Record<number, { status: string; remarks: string }> = {};
          cached.students.forEach((st: any) => {
            if (st.attendance_status) {
              newMap[st.student_id] = {
                status: st.attendance_status,
                remarks: st.attendance_remarks || ''
              };
            }
          });
          setAttendanceMap(newMap);
          showWarning('Offline Mode: Loaded cached class roster.');
        } else {
          showError('Offline: No cached class roster available for this class.');
        }
      }
      setCurrentIndex(0);
      setViewMode('card');
    } catch (err: any) {
      console.error('Error loading attendance session:', err);
      showError(err.message || 'Failed to load class attendance.');
    } finally {
      setLoading(false);
    }
  };

  // Current Student & Metrics
  const currentStudent = students[currentIndex] || null;
  const currentRecord = currentStudent ? attendanceMap[currentStudent.student_id] : null;

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    let unrecorded = 0;

    students.forEach((st) => {
      const rec = attendanceMap[st.student_id];
      if (!rec || !rec.status) unrecorded++;
      else if (rec.status === 'present') present++;
      else if (rec.status === 'absent') absent++;
      else if (rec.status === 'late') late++;
      else if (rec.status === 'excused') excused++;
    });

    const total = students.length;
    const recorded = total - unrecorded;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return { total, present, absent, late, excused, unrecorded, recorded, rate };
  }, [students, attendanceMap]);

  // Actions
  const handleMarkPresent = useCallback(() => {
    if (!currentStudent) return;

    setAttendanceMap((prev) => ({
      ...prev,
      [currentStudent.student_id]: {
        status: 'present',
        remarks: ''
      }
    }));

    // Auto-advance
    if (currentIndex < students.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Reached the end: open summary
      setViewMode('summary');
    }
  }, [currentStudent, currentIndex, students.length]);

  const handleOpenAbsentModal = useCallback(() => {
    if (!currentStudent) return;
    setActiveStudentForAbsence(currentStudent);

    // If student already has recorded remarks, parse them
    const existing = attendanceMap[currentStudent.student_id];
    if (existing && existing.remarks) {
      const parsed = existing.remarks.split(',').map((s) => s.trim()).filter(Boolean);
      const standard = parsed.filter((p) => PREDEFINED_ABSENCE_REASONS.some((r) => r.label === p));
      const custom = parsed.filter((p) => !PREDEFINED_ABSENCE_REASONS.some((r) => r.label === p)).join(', ');
      setSelectedReasons(standard);
      setCustomReason(custom);
    } else {
      setSelectedReasons([]);
      setCustomReason('');
    }

    setAbsenceModalOpen(true);
  }, [currentStudent, attendanceMap]);

  const handleConfirmAbsent = () => {
    if (!activeStudentForAbsence) return;

    // Combine reasons
    const reasons = [...selectedReasons];
    if (customReason.trim()) {
      reasons.push(customReason.trim());
    }
    const combinedRemarks = reasons.join(', ');

    setAttendanceMap((prev) => ({
      ...prev,
      [activeStudentForAbsence.student_id]: {
        status: 'absent',
        remarks: combinedRemarks
      }
    }));

    setAbsenceModalOpen(false);
    setActiveStudentForAbsence(null);

    // Auto-advance
    if (currentIndex < students.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setViewMode('summary');
    }
  };

  const handleQuickMarkLate = () => {
    if (!currentStudent) return;
    setAttendanceMap((prev) => ({
      ...prev,
      [currentStudent.student_id]: { status: 'late', remarks: 'Late Arrival' }
    }));
    if (currentIndex < students.length - 1) setCurrentIndex((prev) => prev + 1);
    else setViewMode('summary');
  };

  const handleClearCurrentStatus = () => {
    if (!currentStudent) return;
    setAttendanceMap((prev) => {
      const next = { ...prev };
      delete next[currentStudent.student_id];
      return next;
    });
  };

  const toggleReasonSelection = (label: string) => {
    setSelectedReasons((prev) =>
      prev.includes(label) ? prev.filter((r) => r !== label) : [...prev, label]
    );
  };

  // Save / Submit Handler
  const handleSaveAttendance = async (mode: 'draft' | 'submitted') => {
    if (!selectedClassId) return;

    if (mode === 'submitted' && counts.unrecorded > 0) {
      showError(`Cannot finalize register. ${counts.unrecorded} student(s) remain unrecorded.`);
      return;
    }

    // Prepare active records array
    const activeRecords = students
      .filter((st) => attendanceMap[st.student_id]?.status)
      .map((st) => ({
        student_id: st.student_id,
        status: attendanceMap[st.student_id].status as any,
        remarks: attendanceMap[st.student_id].remarks || null
      }));

    const clientMutationId = crypto.randomUUID();
    const targetClass = classes.find((c) => c.id === selectedClassId);

    const mutationPayload: OfflineAttendanceMutation = {
      clientMutationId,
      schoolId: 'kcc',
      userId: user.id,
      academicYearId: existingSession?.academic_year_id || 1,
      classId: selectedClassId,
      className: targetClass?.name,
      date: selectedDate,
      mode,
      baseRevision: serverRevision,
      rosterFingerprint,
      records: activeRecords,
      notes: existingSession?.notes || null,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    setSaving(true);
    try {
      if (navigator.onLine) {
        const apiPayload = {
          classId: selectedClassId,
          date: selectedDate,
          mode,
          baseRevision: serverRevision,
          clientMutationId,
          rosterFingerprint,
          notes: existingSession?.notes || null,
          records: activeRecords
        };

        const res = await api.saveAttendanceSession(apiPayload);
        setServerRevision(res.revision);
        setExistingSession({
          id: res.sessionId,
          date: selectedDate,
          status: mode,
          revision: res.revision
        });

        showSuccess(
          mode === 'submitted'
            ? `Final attendance register submitted (Revision ${res.revision}).`
            : `Draft saved successfully (Revision ${res.revision}).`
        );
      } else {
        // Offline: save to IndexedDB
        await queueOfflineAttendance(mutationPayload);
        showWarning(
          mode === 'submitted'
            ? 'Offline: Final register queued on device for auto-sync.'
            : 'Offline: Draft queued on device.'
        );
      }
    } catch (err: any) {
      console.error('Save attendance error:', err);
      if (err instanceof HttpError) {
        if (err.status === 409) {
          showError('Conflict: The attendance register was updated by another user. Please refresh.');
        } else {
          showError(`Submission Error (${err.status}): ${err.message}`);
        }
      } else {
        // Genuine network transport failure
        await queueOfflineAttendance(mutationPayload);
        showWarning('Network failure: Saved to offline browser queue.');
      }
    } finally {
      setSaving(false);
    }
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="msa-container" role="region" aria-label="Mobile Sequential Attendance">
      {/* 1. Header Bar with Class & Date Selectors */}
      <header className="msa-top-bar">
        <div className="msa-top-meta">
          <div className="msa-class-selector-wrapper">
            <label htmlFor="msa-class-select" className="sr-only">Select Class</label>
            <select
              id="msa-class-select"
              className="msa-select"
              value={selectedClassId || ''}
              onChange={(e) => setSelectedClassId(Number(e.target.value))}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (Grade {c.grade})
                </option>
              ))}
            </select>
          </div>

          <div className="msa-date-wrapper">
            <Calendar size={14} className="msa-date-icon" />
            <input
              type="date"
              className="msa-date-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={getColomboCivilDate()}
            />
          </div>
        </div>

        <div className="msa-view-actions">
          {isOffline && (
            <span className="msa-offline-pill" title="Working offline">
              <WifiOff size={13} /> Offline
            </span>
          )}

          {onSwitchToTableMode && (
            <button
              type="button"
              className="msa-btn-subtle"
              onClick={onSwitchToTableMode}
              title="Switch to full table register view"
            >
              <List size={15} /> Table View
            </button>
          )}

          <button
            type="button"
            className={`msa-mode-pill ${viewMode === 'summary' ? 'active' : ''}`}
            onClick={() => setViewMode((prev) => (prev === 'card' ? 'summary' : 'card'))}
          >
            {viewMode === 'card' ? 'Review & Submit' : 'Card View'}
          </button>
        </div>
      </header>

      {/* Existing Session Status Banner */}
      {existingSession && (
        <div className={`msa-session-banner ${existingSession.status === 'submitted' ? 'submitted' : 'draft'}`}>
          <div className="msa-banner-text">
            <strong>{existingSession.status === 'submitted' ? 'Register Finalized' : 'Draft Saved'}</strong>
            <span> · Revision {serverRevision}</span>
          </div>
          {existingSession.status === 'submitted' && (
            <span className="msa-submitted-tag">Completed</span>
          )}
        </div>
      )}

      {/* Progress Ribbon */}
      <div className="msa-progress-ribbon">
        <div className="msa-progress-info">
          <span className="msa-progress-count">
            {viewMode === 'card' && currentStudent
              ? `Student ${currentIndex + 1} of ${students.length}`
              : `${counts.recorded} of ${counts.total} Recorded`}
          </span>
          <span className="msa-progress-stats">
            <span className="msa-dot msa-dot--green" /> {counts.present} P
            <span className="msa-dot msa-dot--red" /> {counts.absent} A
            {counts.unrecorded > 0 && (
              <span className="msa-unrecorded-badge">{counts.unrecorded} Left</span>
            )}
          </span>
        </div>
        <div className="msa-progress-track">
          <div
            className="msa-progress-fill"
            style={{ width: `${students.length > 0 ? (counts.recorded / students.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* 2. Main Content: Sequential Card Mode vs Summary Review Mode */}
      {loading ? (
        <div className="msa-loading-state">
          <div className="msa-spinner" />
          <p>Loading class roster for {selectedClass?.name || 'class'}...</p>
        </div>
      ) : students.length === 0 ? (
        <div className="msa-empty-state">
          <Users size={48} className="msa-empty-icon" />
          <h3>No Enrolled Students Found</h3>
          <p>There are no active pupils enrolled in this class for the selected academic year.</p>
        </div>
      ) : viewMode === 'card' ? (
        /* Sequential Card Mode */
        <main className="msa-card-stage">
          {currentStudent && (
            <article className="msa-student-card" key={currentStudent.student_id}>
              {/* Card Meta Badges */}
              <div className="msa-card-badges">
                <span className="msa-roll-badge">
                  Roll #{currentStudent.roll_number || (currentIndex + 1)}
                </span>
                <span className="msa-adm-badge">
                  Index: {currentStudent.admission_no}
                </span>
                {currentRecord?.status && (
                  <span className={`msa-status-pill ${currentRecord.status}`}>
                    {currentRecord.status.toUpperCase()}
                    {currentRecord.remarks && ` · ${currentRecord.remarks}`}
                  </span>
                )}
              </div>

              {/* Student Name & Avatar */}
              <div className="msa-card-avatar-row">
                <div className={`msa-avatar ${currentStudent.gender?.toLowerCase() === 'female' ? 'avatar-f' : 'avatar-m'}`}>
                  {currentStudent.calling_name?.charAt(0) || currentStudent.full_name?.charAt(0) || 'S'}
                </div>
                <div className="msa-name-block">
                  <h2 className="msa-calling-name">
                    {currentStudent.calling_name || currentStudent.full_name}
                  </h2>
                  <p className="msa-full-name" title={currentStudent.full_name}>
                    {currentStudent.full_name}
                  </p>
                </div>
              </div>

              {/* Quick Jump Ribbon Trigger */}
              <div className="msa-jump-trigger-row">
                <button
                  type="button"
                  className="msa-jump-btn"
                  onClick={() => setJumpDrawerOpen(true)}
                  title="View full roster to jump to student"
                >
                  <List size={14} /> Quick Roster Jump
                </button>
              </div>

              {/* Primary Dual Actions: PRESENT (Green) vs ABSENT (Red) */}
              <div className="msa-action-buttons-grid">
                <button
                  type="button"
                  className={`msa-big-action-btn msa-btn--present ${currentRecord?.status === 'present' ? 'selected' : ''}`}
                  onClick={handleMarkPresent}
                  aria-label={`Mark ${currentStudent.calling_name || 'student'} Present`}
                >
                  <CheckCircle2 size={32} className="msa-action-icon" />
                  <span className="msa-action-text">PRESENT</span>
                </button>

                <button
                  type="button"
                  className={`msa-big-action-btn msa-btn--absent ${currentRecord?.status === 'absent' ? 'selected' : ''}`}
                  onClick={handleOpenAbsentModal}
                  aria-label={`Mark ${currentStudent.calling_name || 'student'} Absent`}
                >
                  <XCircle size={32} className="msa-action-icon" />
                  <span className="msa-action-text">ABSENT</span>
                </button>
              </div>

              {/* Secondary Actions: Late / Clear */}
              <div className="msa-secondary-actions">
                <button
                  type="button"
                  className="msa-subtle-btn"
                  onClick={handleQuickMarkLate}
                  title="Mark Late Arrival"
                >
                  <Clock size={14} /> Late
                </button>

                {currentRecord?.status && (
                  <button
                    type="button"
                    className="msa-subtle-btn msa-subtle-btn--clear"
                    onClick={handleClearCurrentStatus}
                    title="Clear current mark"
                  >
                    <RotateCcw size={14} /> Clear Selection
                  </button>
                )}
              </div>
            </article>
          )}

          {/* Stepper Navigation Footer */}
          <nav className="msa-stepper-nav" aria-label="Student Navigation">
            <button
              type="button"
              className="msa-nav-btn"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              aria-label="Previous Student"
            >
              <ChevronLeft size={20} /> Prev
            </button>

            <button
              type="button"
              className="msa-summary-trigger-btn"
              onClick={() => setViewMode('summary')}
            >
              Summary ({counts.recorded}/{counts.total})
            </button>

            <button
              type="button"
              className="msa-nav-btn"
              disabled={currentIndex >= students.length - 1}
              onClick={() => setCurrentIndex((prev) => Math.min(students.length - 1, prev + 1))}
              aria-label="Next Student"
            >
              Next <ChevronRight size={20} />
            </button>
          </nav>
        </main>
      ) : (
        /* Summary Review Mode */
        <main className="msa-summary-stage">
          <div className="msa-summary-header">
            <h2>Attendance Register Summary</h2>
            <p>{selectedClass?.name} · {selectedDate}</p>
          </div>

          {/* Key Metric Counters */}
          <div className="msa-summary-cards-grid">
            <div className="msa-sum-card msa-sum-card--present">
              <span className="msa-sum-num">{counts.present}</span>
              <span className="msa-sum-label">Present</span>
            </div>
            <div className="msa-sum-card msa-sum-card--absent">
              <span className="msa-sum-num">{counts.absent}</span>
              <span className="msa-sum-label">Absent</span>
            </div>
            <div className="msa-sum-card msa-sum-card--unrecorded">
              <span className="msa-sum-num">{counts.unrecorded}</span>
              <span className="msa-sum-label">Unrecorded</span>
            </div>
            <div className="msa-sum-card msa-sum-card--rate">
              <span className="msa-sum-num">{counts.rate}%</span>
              <span className="msa-sum-label">Rate</span>
            </div>
          </div>

          {/* Absence Breakdown List */}
          <div className="msa-absent-breakdown">
            <h3>Absence Roster & Reasons ({counts.absent})</h3>
            {counts.absent === 0 ? (
              <p className="msa-no-absent">All marked students are Present! (Zero absences recorded)</p>
            ) : (
              <ul className="msa-absent-list">
                {students
                  .filter((st) => attendanceMap[st.student_id]?.status === 'absent')
                  .map((st) => {
                    const rec = attendanceMap[st.student_id];
                    return (
                      <li
                        key={st.student_id}
                        className="msa-absent-item"
                        onClick={() => {
                          const idx = students.findIndex((s) => s.student_id === st.student_id);
                          if (idx >= 0) {
                            setCurrentIndex(idx);
                            setViewMode('card');
                          }
                        }}
                        title="Click to jump to student card"
                      >
                        <div className="msa-absent-info">
                          <strong>{st.calling_name || st.full_name}</strong>
                          <span className="msa-absent-adm">Index {st.admission_no}</span>
                        </div>
                        <div className="msa-absent-reason">
                          {rec.remarks ? rec.remarks : <span className="msa-no-reason">No reason given</span>}
                          <Edit3 size={13} className="msa-edit-icon" />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>

          {/* Unrecorded Students Warning if any */}
          {counts.unrecorded > 0 && (
            <div className="msa-unrecorded-alert" role="alert">
              <AlertTriangle size={18} />
              <div>
                <strong>{counts.unrecorded} Student(s) Unrecorded</strong>
                <p>All students must have attendance marked before final register submission.</p>
              </div>
            </div>
          )}

          {/* Final Action Submission Bar */}
          <div className="msa-final-actions-bar">
            <button
              type="button"
              className="msa-btn-secondary"
              onClick={() => handleSaveAttendance('draft')}
              disabled={saving}
            >
              <Save size={16} /> Save Draft
            </button>

            <button
              type="button"
              className="msa-btn-primary"
              onClick={() => handleSaveAttendance('submitted')}
              disabled={saving || counts.unrecorded > 0}
            >
              <Send size={16} /> Submit Final Register
            </button>
          </div>
        </main>
      )}

      {/* 3. Absence Reason Modal / Action Sheet */}
      {absenceModalOpen && activeStudentForAbsence && (
        <div className="msa-modal-backdrop" onClick={() => setAbsenceModalOpen(false)}>
          <div
            className="msa-modal-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="msa-modal-title"
          >
            <div className="msa-modal-header">
              <div>
                <h3 id="msa-modal-title">Record Absence Reason</h3>
                <p className="msa-modal-subtitle">
                  {activeStudentForAbsence.calling_name || activeStudentForAbsence.full_name} (Index #{activeStudentForAbsence.admission_no})
                </p>
              </div>
              <button
                type="button"
                className="msa-modal-close"
                onClick={() => setAbsenceModalOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Predefined Reason Chips */}
            <div className="msa-reasons-grid">
              {PREDEFINED_ABSENCE_REASONS.map((r) => {
                const isSelected = selectedReasons.includes(r.label);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`msa-reason-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleReasonSelection(r.label)}
                  >
                    <span className="msa-reason-icon">{r.icon}</span>
                    <span>{r.label}</span>
                    {isSelected && <Check size={14} className="msa-chip-check" />}
                  </button>
                );
              })}
            </div>

            {/* Custom Reason Input */}
            <div className="msa-custom-reason-block">
              <label htmlFor="msa-custom-reason" className="msa-input-label">
                Custom / Additional Note (Optional):
              </label>
              <input
                id="msa-custom-reason"
                type="text"
                className="msa-custom-input"
                placeholder="e.g. Hospital admission, fever, religious holiday"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            </div>

            {/* Modal Actions */}
            <div className="msa-modal-actions">
              <button
                type="button"
                className="msa-modal-btn msa-modal-btn--secondary"
                onClick={() => {
                  setSelectedReasons([]);
                  setCustomReason('');
                  handleConfirmAbsent();
                }}
              >
                Skip Reason
              </button>

              <button
                type="button"
                className="msa-modal-btn msa-modal-btn--primary"
                onClick={handleConfirmAbsent}
              >
                Confirm Absent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Quick Jump Roster Drawer */}
      {jumpDrawerOpen && (
        <div className="msa-modal-backdrop" onClick={() => setJumpDrawerOpen(false)}>
          <aside
            className="msa-drawer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Quick Roster Jump Drawer"
          >
            <div className="msa-drawer-header">
              <h3>Class Roster ({students.length})</h3>
              <button
                type="button"
                className="msa-modal-close"
                onClick={() => setJumpDrawerOpen(false)}
                aria-label="Close Drawer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="msa-drawer-list">
              {students.map((st, idx) => {
                const rec = attendanceMap[st.student_id];
                const isSelected = idx === currentIndex;
                return (
                  <button
                    key={st.student_id}
                    type="button"
                    className={`msa-drawer-item ${isSelected ? 'current' : ''} ${rec?.status || 'unmarked'}`}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setViewMode('card');
                      setJumpDrawerOpen(false);
                    }}
                  >
                    <span className="msa-drawer-roll">#{st.roll_number || (idx + 1)}</span>
                    <span className="msa-drawer-name">{st.calling_name || st.full_name}</span>
                    <span className={`msa-drawer-status-pill ${rec?.status || 'unmarked'}`}>
                      {rec?.status ? rec.status.toUpperCase() : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

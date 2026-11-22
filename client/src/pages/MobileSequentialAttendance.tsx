import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Save,
  Send,
  AlertTriangle,
  Users,
  Edit3,
  List,
  Calendar,
  WifiOff,
  ArrowLeft,
  LayoutList
} from 'lucide-react';
import {
  Title,
  Text,
  Badge,
  Button,
  SimpleGrid,
  ScrollArea,
  Stack,
  Box
} from '@mantine/core';
import { api, HttpError } from '../api/client';
import {
  cacheClassRoster,
  getCachedClassRoster,
  queueOfflineAttendance,
  OfflineAttendanceMutation
} from '../api/offlineQueue';
import { getColomboCivilDate } from '../utils/dateUtils';
import { useToast } from '../ui/useToast';
import { LoadingState, EmptyState } from '../ui/mantine';
import './mobileSequentialAttendance.css';
import { UnsubmittedAttendanceModal } from '../components/UnsubmittedAttendanceModal';

interface Props {
  user: any;
  onNavigate?: (tab: string) => void;
  registerNavGuard?: (guard: ((targetTab: string) => boolean) | null) => void;
  initialClassId?: number;
  initialDate?: string;
  onSwitchToTableMode?: () => void;
  onBackToClasses?: () => void;
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
  registerNavGuard,
  initialClassId,
  initialDate,
  onSwitchToTableMode,
  onBackToClasses
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

  // Unsubmitted Attendance Interception Modal State
  const initialAttendanceMapRef = React.useRef<string>('');
  const isBypassingGuardRef = React.useRef<boolean>(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);

  // Attendance Map: studentId -> { status: string; remarks: string }
  const [attendanceMap, setAttendanceMap] = useState<Record<number, { status: string; remarks: string }>>({});
  const [existingSession, setExistingSession] = useState<any | null>(null);
  const [serverRevision, setServerRevision] = useState<number>(0);
  const [rosterFingerprint, setRosterFingerprint] = useState<string>('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // 3. View Mode: 'card' (sequential roll-call) | 'summary' (review & submit)
  const [viewMode, setViewMode] = useState<'card' | 'summary'>('card');

  // 4. Jump Drawer / Roster List State
  const [jumpDrawerOpen, setJumpDrawerOpen] = useState(false);

  // 5. Absence Reason Modal State (strictly ONE reason selectable)
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [activeStudentForAbsence, setActiveStudentForAbsence] = useState<any | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState<string>('');

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
        initialAttendanceMapRef.current = JSON.stringify(newMap);

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
          initialAttendanceMapRef.current = JSON.stringify(newMap);
          showWarning('Offline Mode: Loaded cached class roster.');
        } else {
          showError('Offline: No cached class roster available for this class.');
        }
      }
      setCurrentIndex(0);
      setViewMode('card');
    } catch (err: any) {
      console.error('Error loading attendance session:', err);
      initialAttendanceMapRef.current = '';
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
    let unrecorded = 0;

    students.forEach((st) => {
      const rec = attendanceMap[st.student_id];
      if (!rec || !rec.status) unrecorded++;
      else if (rec.status === 'present') present++;
      else if (rec.status === 'absent') absent++;
      else unrecorded++;
    });

    const total = students.length;
    const recorded = total - unrecorded;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    return { total, present, absent, unrecorded, recorded, rate };
  }, [students, attendanceMap]);

  const hasMarksRecorded = counts.recorded > 0;
  const isDirty = useMemo(() => {
    if (!initialAttendanceMapRef.current) return false;
    return JSON.stringify(attendanceMap) !== initialAttendanceMapRef.current;
  }, [attendanceMap]);

  const isUnsubmitted = useMemo(() => {
    if (!selectedClassId || students.length === 0) return false;
    if (existingSession?.status !== 'submitted') {
      return hasMarksRecorded;
    }
    return isDirty;
  }, [selectedClassId, students.length, existingSession?.status, hasMarksRecorded, isDirty]);

  // Attempt Leave interceptor
  const handleAttemptLeave = (action: () => void) => {
    if (isUnsubmitted) {
      setPendingLeaveAction(() => action);
      setLeaveModalOpen(true);
    } else {
      action();
    }
  };

  // Global Navigation Guard for tab changes
  useEffect(() => {
    if (!registerNavGuard) return;
    registerNavGuard((targetTab: string) => {
      if (isBypassingGuardRef.current) return true;
      if (isUnsubmitted) {
        setPendingLeaveAction(() => () => {
          isBypassingGuardRef.current = true;
          onNavigate?.(targetTab);
        });
        setLeaveModalOpen(true);
        return false;
      }
      return true;
    });
    return () => registerNavGuard(null);
  }, [registerNavGuard, isUnsubmitted, onNavigate]);

  // Window unload / refresh guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUnsubmitted) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isUnsubmitted]);

  // Modal leave actions
  const handleSubmitAndLeave = async () => {
    const success = await handleSaveAttendance('submitted');
    if (success) {
      setLeaveModalOpen(false);
      if (pendingLeaveAction) {
        const act = pendingLeaveAction;
        setPendingLeaveAction(null);
        act();
      }
    }
  };

  const handleSaveDraftAndLeave = async () => {
    const success = await handleSaveAttendance('draft');
    if (success) {
      setLeaveModalOpen(false);
      if (pendingLeaveAction) {
        const act = pendingLeaveAction;
        setPendingLeaveAction(null);
        act();
      }
    }
  };

  const handleDiscardAndLeave = () => {
    setLeaveModalOpen(false);
    if (pendingLeaveAction) {
      const act = pendingLeaveAction;
      setPendingLeaveAction(null);
      act();
    }
  };

  const handleStayOnRegister = () => {
    setLeaveModalOpen(false);
    setPendingLeaveAction(null);
  };

  // Actions: PRESENT & ABSENT with instant auto-advance
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
      setViewMode('summary');
    }
  }, [currentStudent, currentIndex, students.length]);

  // Open Absence Reason Modal (Pre-populate with student's current reason if any)
  const handleOpenAbsentModal = useCallback((student: any) => {
    setActiveStudentForAbsence(student);

    const rec = attendanceMap[student.student_id];
    if (rec && rec.remarks) {
      const matched = PREDEFINED_ABSENCE_REASONS.find((r) =>
        rec.remarks.startsWith(r.label)
      );
      if (matched) {
        setSelectedReason(matched.label);
        const remainder = rec.remarks.replace(matched.label, '').replace(/^ - /, '').trim();
        setCustomReason(remainder);
      } else {
        setSelectedReason(null);
        setCustomReason(rec.remarks);
      }
    } else {
      setSelectedReason(null);
      setCustomReason('');
    }

    setAbsenceModalOpen(true);
  }, [attendanceMap]);

  // Strictly single-selection toggle: clicking reason selects ONLY that reason; clicking it again deselects
  const handleToggleReason = (reasonLabel: string) => {
    setSelectedReason((prev) => (prev === reasonLabel ? null : reasonLabel));
  };

  const handleConfirmAbsent = () => {
    if (!activeStudentForAbsence) return;

    let remarks = selectedReason || '';
    if (customReason.trim()) {
      remarks = remarks ? `${remarks} - ${customReason.trim()}` : customReason.trim();
    }

    setAttendanceMap((prev) => ({
      ...prev,
      [activeStudentForAbsence.student_id]: {
        status: 'absent',
        remarks
      }
    }));

    const isCurrent = currentStudent && activeStudentForAbsence.student_id === currentStudent.student_id;
    setAbsenceModalOpen(false);
    setActiveStudentForAbsence(null);
    setSelectedReason(null);
    setCustomReason('');

    // Advance if marking the current student on card roll-call
    if (viewMode === 'card' && isCurrent) {
      if (currentIndex < students.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setViewMode('summary');
      }
    }
  };

  const handleSkipReason = () => {
    if (!activeStudentForAbsence) return;

    setAttendanceMap((prev) => ({
      ...prev,
      [activeStudentForAbsence.student_id]: {
        status: 'absent',
        remarks: ''
      }
    }));

    const isCurrent = currentStudent && activeStudentForAbsence.student_id === currentStudent.student_id;
    setAbsenceModalOpen(false);
    setActiveStudentForAbsence(null);
    setSelectedReason(null);
    setCustomReason('');

    // Advance if marking the current student on card roll-call
    if (viewMode === 'card' && isCurrent) {
      if (currentIndex < students.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setViewMode('summary');
      }
    }
  };

  const handleMarkAbsent = useCallback(() => {
    if (!currentStudent) return;
    handleOpenAbsentModal(currentStudent);
  }, [currentStudent, handleOpenAbsentModal]);

  const handleClearCurrentStatus = () => {
    if (!currentStudent) return;
    setAttendanceMap((prev) => {
      const next = { ...prev };
      delete next[currentStudent.student_id];
      return next;
    });
  };

  // Save / Submit Handler - returns Promise<boolean>
  const handleSaveAttendance = async (mode: 'draft' | 'submitted'): Promise<boolean> => {
    if (!selectedClassId) return false;

    if (mode === 'submitted' && counts.unrecorded > 0) {
      showError(`Cannot finalize register. ${counts.unrecorded} student(s) remain unrecorded.`);
      return false;
    }

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
        await queueOfflineAttendance(mutationPayload);
        showWarning(
          mode === 'submitted'
            ? 'Offline: Final register queued on device for auto-sync.'
            : 'Offline: Draft queued on device.'
        );
      }
      initialAttendanceMapRef.current = JSON.stringify(attendanceMap);
      return true;
    } catch (err: any) {
      console.error('Save attendance error:', err);
      if (err instanceof HttpError) {
        if (err.status === 409) {
          showError('Conflict: The attendance register was updated by another user. Please refresh.');
        } else {
          showError(`Submission Error (${err.status}): ${err.message}`);
        }
      } else {
        await queueOfflineAttendance(mutationPayload);
        showWarning('Network failure: Saved to offline browser queue.');
        initialAttendanceMapRef.current = JSON.stringify(attendanceMap);
        return true;
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const progressPercent = students.length > 0 ? (counts.recorded / students.length) * 100 : 0;

  const formatDisplayDate = (isoDate: string) => {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(parts[1], 10) - 1] || parts[1];
    return `${parseInt(parts[2], 10)} ${month} ${parts[0]}`;
  };

  // Keyboard Navigation for fast roll-call
  useEffect(() => {
    if (viewMode !== 'card' || jumpDrawerOpen || absenceModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleMarkPresent();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleMarkAbsent();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((prev) => Math.min(students.length - 1, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, jumpDrawerOpen, absenceModalOpen, handleMarkPresent, handleMarkAbsent, students.length]);

  return (
    <div className="msa-container" role="region" aria-label="Mobile Sequential Attendance">
      {/* 1. Compact Mobile Header */}
      <header className="msa-mobile-header">
        {/* Navigation & Tools Bar */}
        <div className="msa-header-top-row">
          {onBackToClasses && (
            <button
              type="button"
              className="msa-back-btn"
              onClick={() => handleAttemptLeave(() => onBackToClasses())}
              title="Return to classes"
            >
              <ArrowLeft size={15} />
              <span>Classes</span>
            </button>
          )}

          <div className="msa-header-tools">
            {onSwitchToTableMode && (
              <button
                type="button"
                className="msa-tool-btn"
                onClick={() => handleAttemptLeave(() => onSwitchToTableMode())}
                title="Switch to Table Register"
              >
                <LayoutList size={14} />
                <span>Table</span>
              </button>
            )}
            <button
              type="button"
              className="msa-tool-btn msa-tool-btn--roster"
              onClick={() => setJumpDrawerOpen(true)}
              title="View class roster"
            >
              <List size={14} />
              <span>Roster</span>
            </button>
          </div>
        </div>

        {/* Identity & Status Row */}
        <div className="msa-header-identity-row">
          <div className="msa-class-title-block">
            <span className="msa-tracker-label">CLASS ATTENDANCE</span>
            <div className="msa-class-dropdown-wrap">
              <span className="msa-class-current-text">
                {selectedClass ? `${selectedClass.name} · Grade ${selectedClass.grade}` : 'Select Class'}
              </span>
              <ChevronDown size={15} className="msa-class-chevron" />
              <select
                id="msa-class-select"
                aria-label="Select Class"
                className="msa-class-native-select"
                value={selectedClassId || ''}
                onChange={(e) => {
                  const nextId = Number(e.target.value);
                  if (nextId === selectedClassId) return;
                  handleAttemptLeave(() => setSelectedClassId(nextId));
                }}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · Grade {c.grade}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="msa-header-status-block">
            {isOffline && (
              <span className="msa-status-badge msa-badge--offline">
                <WifiOff size={11} /> Offline
              </span>
            )}
            <span
              className={`msa-status-badge ${
                existingSession?.status === 'submitted'
                  ? 'msa-badge--completed'
                  : existingSession?.status === 'draft'
                  ? 'msa-badge--draft'
                  : counts.recorded > 0
                  ? 'msa-badge--progress'
                  : 'msa-badge--not-recorded'
              }`}
            >
              {existingSession?.status === 'submitted'
                ? `FINALIZED (REV ${serverRevision})`
                : existingSession?.status === 'draft'
                ? `DRAFT (REV ${serverRevision})`
                : counts.recorded > 0
                ? 'IN PROGRESS'
                : 'NOT RECORDED'}
            </span>
          </div>
        </div>

        {/* Date Selector Row */}
        <div className="msa-header-date-row">
          <label className="msa-date-pill-wrapper" title="Tap to change attendance date">
            <Calendar size={13} className="msa-calendar-icon" />
            <span className="msa-formatted-date">{formatDisplayDate(selectedDate)}</span>
            <input
              type="date"
              className="msa-mobile-date-input"
              value={selectedDate}
              onChange={(e) => {
                const nextDate = e.target.value;
                if (nextDate === selectedDate) return;
                handleAttemptLeave(() => setSelectedDate(nextDate));
              }}
              max={getColomboCivilDate()}
              aria-label="Attendance Date"
            />
          </label>
        </div>
      </header>

      {/* 2. Main Content: Sequential Card Mode vs Summary Review Mode */}
      {loading ? (
        <LoadingState message={`Loading class roster for ${selectedClass?.name || 'class'}...`} minHeight={240} />
      ) : students.length === 0 ? (
        <EmptyState
          icon={<Users size={36} />}
          title="No Enrolled Students Found"
          description="There are no active pupils enrolled in this class for the selected academic year."
        />
      ) : viewMode === 'card' ? (
        /* Sequential Card Mode */
        <main className="msa-card-stage">
          {/* Progress Section */}
          <div className="msa-progress-section">
            <div className="msa-progress-meta">
              <span className="msa-progress-step">
                STUDENT {String(currentIndex + 1).padStart(2, '0')} OF {String(students.length).padStart(2, '0')}
              </span>
              <span className="msa-progress-marked">
                {counts.recorded} MARKED
              </span>
            </div>
            <div className="msa-progress-track">
              <div
                className="msa-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Student Identity Card */}
          {currentStudent && (
            <div className="msa-student-card" key={currentStudent.student_id}>
              {/* Avatar ~64px */}
              <div
                className={`msa-avatar-mobile ${
                  currentStudent.gender?.toLowerCase() === 'female' ? 'avatar-f' : 'avatar-m'
                }`}
              >
                {currentStudent.calling_name?.charAt(0) || currentStudent.full_name?.charAt(0) || 'S'}
              </div>

              {/* Identity Hierarchy */}
              <div className="msa-identity-block">
                <h1 className="msa-student-calling-name">
                  {currentStudent.calling_name || currentStudent.full_name}
                </h1>
                <p className="msa-student-full-name">
                  {currentStudent.full_name}
                </p>

                <div className="msa-student-identifiers">
                  <span className="msa-roll-number">
                    Roll No. {String(currentStudent.roll_number || (currentIndex + 1)).padStart(2, '0')}
                  </span>
                  <span className="msa-id-divider">&bull;</span>
                  <span className="msa-admission-number">
                    Index {currentStudent.admission_no}
                  </span>
                </div>
              </div>

              {/* Status feedback badge if marked */}
              {currentRecord?.status && (
                <div className="msa-current-status-banner">
                  <div className="msa-status-banner-header">
                    <span className={`msa-marked-pill msa-marked-pill--${currentRecord.status}`}>
                      {currentRecord.status === 'present' ? '✓ MARKED PRESENT' : '✕ MARKED ABSENT'}
                    </span>
                    <div className="msa-status-action-btns">
                      {currentRecord.status === 'absent' && (
                        <button
                          type="button"
                          className="msa-mini-action-btn msa-mini-action-btn--reason"
                          onClick={() => handleOpenAbsentModal(currentStudent)}
                          title="Edit absence reason"
                        >
                          <Edit3 size={12} />
                          <span>Reason</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="msa-mini-action-btn msa-mini-action-btn--clear"
                        onClick={handleClearCurrentStatus}
                        title="Clear attendance mark"
                      >
                        <RotateCcw size={12} />
                        <span>Clear</span>
                      </button>
                    </div>
                  </div>

                  {currentRecord.status === 'absent' && (
                    <div
                      className="msa-status-reason-row"
                      onClick={() => handleOpenAbsentModal(currentStudent)}
                      title="Tap to change absence reason"
                      role="button"
                      tabIndex={0}
                    >
                      <span className="msa-reason-label">Reason:</span>
                      <span
                        className={`msa-reason-value ${
                          !currentRecord.remarks ? 'msa-reason-value--empty' : ''
                        }`}
                      >
                        {currentRecord.remarks || 'No reason specified (tap to add)'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ONLY TWO LARGE BUTTONS: PRESENT & ABSENT */}
              <div className="msa-action-buttons-stack">
                <button
                  type="button"
                  className={`msa-action-btn msa-action-btn--present ${
                    currentRecord?.status === 'present' ? 'active' : ''
                  }`}
                  onClick={handleMarkPresent}
                  aria-label={`Mark ${currentStudent.calling_name || 'student'} Present`}
                >
                  <div className="msa-action-icon-circle">
                    <Check size={26} strokeWidth={3} />
                  </div>
                  <div className="msa-action-content">
                    <span className="msa-action-title">PRESENT</span>
                    <span className="msa-action-subtitle">Tap to mark present</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`msa-action-btn msa-action-btn--absent ${
                    currentRecord?.status === 'absent' ? 'active' : ''
                  }`}
                  onClick={handleMarkAbsent}
                  aria-label={`Mark ${currentStudent.calling_name || 'student'} Absent`}
                >
                  <div className="msa-action-icon-circle">
                    <X size={26} strokeWidth={3} />
                  </div>
                  <div className="msa-action-content">
                    <span className="msa-action-title">ABSENT</span>
                    <span className="msa-action-subtitle">Tap to mark absent</span>
                  </div>
                </button>
              </div>

              <p className="msa-instruction-text">
                Select a status to continue roll call
              </p>
            </div>
          )}

          {/* Bottom Navigation */}
          <div className="msa-bottom-controls">
            <div className="msa-stepper-row">
              <button
                type="button"
                className="msa-step-btn msa-step-btn--prev"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                aria-label="Previous Student"
              >
                <ChevronLeft size={18} />
                <span>Previous</span>
              </button>

              <button
                type="button"
                className="msa-step-btn msa-step-btn--summary"
                onClick={() => setViewMode('summary')}
                aria-label="Attendance Summary"
              >
                <span>Summary</span>
                {counts.recorded > 0 && (
                  <span className="msa-summary-count-badge">
                    {counts.recorded}/{counts.total}
                  </span>
                )}
              </button>

              <button
                type="button"
                className="msa-step-btn msa-step-btn--next"
                disabled={currentIndex >= students.length - 1}
                onClick={() => setCurrentIndex((prev) => Math.min(students.length - 1, prev + 1))}
                aria-label="Next Student"
              >
                <span>Next</span>
                <ChevronRight size={18} />
              </button>
            </div>

            <button
              type="button"
              className="msa-view-roster-link"
              onClick={() => setJumpDrawerOpen(true)}
            >
              <List size={14} />
              <span>View Student Roster</span>
            </button>
          </div>
        </main>
      ) : (
        /* Summary Review Mode */
        <main className="msa-summary-stage">
          <div className="msa-summary-card">
            <div className="msa-summary-header">
              <div className="msa-summary-header-top">
                <button
                  type="button"
                  className="msa-back-btn"
                  onClick={() => setViewMode('card')}
                  title="Return to card roll-call"
                >
                  <ArrowLeft size={14} />
                  <span>Roll-Call Cards</span>
                </button>
                <span className="msa-summary-mode-badge">
                  Summary Review
                </span>
              </div>
              <div className="msa-summary-title-block">
                <h2 className="msa-summary-title">Attendance Register Summary</h2>
                <p className="msa-summary-subtitle">
                  {selectedClass?.name} &bull; {formatDisplayDate(selectedDate)}
                </p>
              </div>
            </div>

            {/* Key Metric Counters (2x2 Dedicated Mobile Grid) */}
            <div className="msa-summary-metrics-grid">
              <div className="msa-summary-metric-card msa-metric-card--present">
                <span className="msa-metric-label">Present</span>
                <span className="msa-metric-value">{counts.present}</span>
              </div>

              <div className="msa-summary-metric-card msa-metric-card--absent">
                <span className="msa-metric-label">Absent</span>
                <span className="msa-metric-value">{counts.absent}</span>
              </div>

              <div className="msa-summary-metric-card msa-metric-card--unrecorded">
                <span className="msa-metric-label">Unrecorded</span>
                <span className="msa-metric-value">{counts.unrecorded}</span>
              </div>

              <div className="msa-summary-metric-card msa-metric-card--rate">
                <span className="msa-metric-label">Attendance Rate</span>
                <span className="msa-metric-value">{counts.rate}%</span>
              </div>
            </div>

            {/* Absence Breakdown List */}
            <Box mt="lg">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 className="msa-summary-section-title">Absent Students ({counts.absent})</h3>
                <Badge color="red" variant="light" size="sm">
                  {counts.absent} Absent
                </Badge>
              </div>

              {counts.absent === 0 ? (
                <Box p="sm" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px' }}>
                  <Text size="sm" c="green.8" fw={600}>
                    All recorded students are Present! (Zero absences recorded)
                  </Text>
                </Box>
              ) : (
                <ScrollArea.Autosize mah={260}>
                  <Stack gap="xs">
                    {students
                      .filter((st) => attendanceMap[st.student_id]?.status === 'absent')
                      .map((st) => {
                        const rec = attendanceMap[st.student_id];
                        return (
                          <div
                            key={st.student_id}
                            className="msa-absent-item"
                            onClick={() => handleOpenAbsentModal(st)}
                            title="Click to edit absence reason"
                            role="button"
                            tabIndex={0}
                          >
                            <div className="msa-absent-student-info">
                              <span className="msa-absent-name">
                                {st.calling_name || st.full_name}
                              </span>
                              <span className="msa-absent-admission">
                                Index {st.admission_no}
                              </span>
                            </div>
                            <div className="msa-absent-reason-pill">
                              <span>{rec?.remarks ? rec.remarks : 'No reason given'}</span>
                              <Edit3 size={12} />
                            </div>
                          </div>
                        );
                      })}
                  </Stack>
                </ScrollArea.Autosize>
              )}
            </Box>

            {/* Unrecorded Alert */}
            {counts.unrecorded > 0 && (
              <Box mt="md" style={{ display: 'flex', gap: '10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px' }} role="alert">
                <AlertTriangle size={18} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ fontSize: '0.84rem', color: '#92400e' }}>{counts.unrecorded} Student(s) Unrecorded</strong>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#b45309' }}>
                    All students must have attendance marked before final register submission.
                  </p>
                </div>
              </Box>
            )}

            {/* Final Submission Bar */}
            <div className="msa-final-actions-bar">
              <Button
                variant="default"
                size="md"
                leftSection={<Save size={16} />}
                onClick={() => handleSaveAttendance('draft')}
                loading={saving}
                className="msa-summary-action-btn"
              >
                Save Draft
              </Button>

              <Button
                color="blue"
                size="md"
                leftSection={<Send size={16} />}
                onClick={() => handleSaveAttendance('submitted')}
                loading={saving}
                disabled={saving || counts.unrecorded > 0}
                className="msa-summary-action-btn"
              >
                Submit Register
              </Button>
            </div>
          </div>
        </main>
      )}

      {/* 3. Absence Reason Modal (Strictly ONE reason selectable) */}
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
                <h3 id="msa-modal-title" className="msa-modal-title">
                  Record Absence Reason
                </h3>
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

            {/* Predefined Reason Chips: Strictly ONE reason selectable */}
            <div className="msa-reasons-grid" role="radiogroup" aria-label="Absence reason selection">
              {PREDEFINED_ABSENCE_REASONS.map((r) => {
                const isSelected = selectedReason === r.label;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`msa-reason-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggleReason(r.label)}
                  >
                    <span className="msa-reason-icon">{r.icon}</span>
                    <span>{r.label}</span>
                    {isSelected && <Check size={16} className="msa-chip-check" />}
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
              <Button
                variant="default"
                size="md"
                onClick={handleSkipReason}
              >
                Skip Reason
              </Button>

              <Button
                color="red"
                size="md"
                onClick={handleConfirmAbsent}
              >
                Confirm Absent
              </Button>
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
              <Title order={4} c="#0f172a">Class Roster ({students.length})</Title>
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
                    className={`msa-drawer-item ${isSelected ? 'current' : ''}`}
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

      {/* Unsubmitted Attendance Exit Interception Modal */}
      <UnsubmittedAttendanceModal
        opened={leaveModalOpen}
        classTitle={selectedClass ? `${selectedClass.name} · Grade ${selectedClass.grade}` : 'Selected Class'}
        dateStr={selectedDate}
        counts={counts}
        saving={saving}
        onClose={handleStayOnRegister}
        onSubmitAndLeave={handleSubmitAndLeave}
        onSaveDraftAndLeave={handleSaveDraftAndLeave}
        onDiscardAndLeave={handleDiscardAndLeave}
      />
    </div>
  );
};

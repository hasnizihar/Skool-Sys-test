import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Save,
  AlertTriangle,
  RotateCcw,
  Search,
  Send,
  Download,
  Info,
  UserCheck,
  X,
  Sparkles,
  LayoutList,
  School,
  WifiOff,
  Users,
  Building2,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Layers,
  Check,
  Edit3
} from 'lucide-react';
import {
  Badge,
  Paper,
  Button,
  ScrollArea,
  Group,
  Stack,
  Text,
  Title,
  SimpleGrid,
  Box,
  Alert,
  Tooltip,
  SegmentedControl
} from '@mantine/core';
import { api, HttpError } from '../api/client';
import { MobileSequentialAttendance, PREDEFINED_ABSENCE_REASONS } from './MobileSequentialAttendance';
import { UnsubmittedAttendanceModal } from '../components/UnsubmittedAttendanceModal';
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
import { useToast } from '../ui/useToast';
import { LoadingState, EmptyState } from '../ui/mantine';
import './attendance.css';
import './mobileSequentialAttendance.css';

interface AttendanceProps {
  user: any;
  onNavigate?: (tab: string) => void;
  registerNavGuard?: (guard: ((targetTab: string) => boolean) | null) => void;
}

export const Attendance: React.FC<AttendanceProps> = ({ user, onNavigate, registerNavGuard }) => {
  const toast = useToast();

  const [displayMode, setDisplayMode] = useState<'card' | 'table'>(() => {
    return window.innerWidth < 768 ? 'card' : 'table';
  });

  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getColomboCivilDate());
  const [dailySummaries, setDailySummaries] = useState<Record<number, any>>({});
  const [loadingHierarchy, setLoadingHierarchy] = useState<boolean>(true);

  const [students, setStudents] = useState<any[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<number, { status: string; remarks: string }>>({});
  const [existingSession, setExistingSession] = useState<any | null>(null);
  const [serverRevision, setServerRevision] = useState<number>(0);
  const [rosterFingerprint, setRosterFingerprint] = useState<string>('');
  const [sessionNotes, setSessionNotes] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterView, setFilterView] = useState<'all' | 'absent' | 'unmarked'>('all');

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

  // Absence Reason Modal State for Table Mode (Strictly single-choice selection)
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [activeStudentForAbsence, setActiveStudentForAbsence] = useState<any | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState<string>('');

  // Unsubmitted Attendance Interception Modal State
  const initialAttendanceMapRef = React.useRef<string>('');
  const isBypassingGuardRef = React.useRef<boolean>(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);

  // Real-time Counts
  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let unrecorded = 0;
    students.forEach((st) => {
      const s = attendanceMap[st.student_id]?.status;
      if (s === 'present') present++;
      else if (s === 'absent') absent++;
      else unrecorded++;
    });
    const total = students.length;
    const recorded = total - unrecorded;
    const rate = total > 0 && present > 0 ? Math.round((present / total) * 100) : 0;
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

  useEffect(() => {
    loadHierarchy(selectedDate);

    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // When date changes, refresh daily report summaries
  useEffect(() => {
    api.getDailyAttendanceReport(selectedDate)
      .then((res) => {
        if (res?.summaries) {
          const sumMap: Record<number, any> = {};
          res.summaries.forEach((s: any) => {
            sumMap[s.class_id] = s;
          });
          setDailySummaries(sumMap);
        }
      })
      .catch(() => {});
  }, [selectedDate]);

  useEffect(() => {
    if (selectedClassId && selectedDate) {
      loadAttendanceSession(selectedClassId, selectedDate);
    }
  }, [selectedClassId, selectedDate]);

  // Auto-sync selectedSectionId if selectedClassId is set
  useEffect(() => {
    if (selectedClassId && !selectedSectionId && classes.length > 0) {
      const target = classes.find((c) => c.id === selectedClassId);
      if (target?.section_id) {
        setSelectedSectionId(target.section_id);
      }
    }
  }, [selectedClassId, selectedSectionId, classes]);

  const loadHierarchy = async (dateStr: string) => {
    try {
      setLoadingHierarchy(true);
      const [classRes, secRes, dailyRes] = await Promise.all([
        api.getClasses().catch(() => ({ classes: [] })),
        api.getSections().catch(() => ({ sections: [] })),
        api.getDailyAttendanceReport(dateStr).catch(() => ({ summaries: [] }))
      ]);

      let availableClasses = classRes.classes || [];

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

      // Map daily summaries by class_id
      const sumMap: Record<number, any> = {};
      if (dailyRes?.summaries) {
        dailyRes.summaries.forEach((s: any) => {
          sumMap[s.class_id] = s;
        });
      }
      setDailySummaries(sumMap);

      // Build sections list enriched with accessible classes
      const rawSections = secRes.sections || [];
      const accessibleClassSectionIds = new Set(
        availableClasses.map((c: any) => c.section_id).filter(Boolean)
      );

      let enrichedSections: any[] = [];
      if (rawSections.length > 0) {
        enrichedSections = rawSections
          .filter((sec: any) => {
            if (user.role === 'admin') return true;
            return accessibleClassSectionIds.has(sec.id);
          })
          .map((sec: any) => {
            const secClasses = availableClasses.filter((c: any) => c.section_id === sec.id);
            return {
              ...sec,
              classes: secClasses,
              classCount: secClasses.length,
              totalStudents: secClasses.reduce((acc: number, c: any) => acc + (c.student_count || 0), 0)
            };
          })
          .filter((sec: any) => sec.classes.length > 0 || user.role === 'admin');
      }

      // Check for leftover classes without a section or whose section wasn't returned
      const accountedClassIds = new Set(
        enrichedSections.flatMap((s: any) => s.classes.map((c: any) => c.id))
      );
      const leftoverClasses = availableClasses.filter((c: any) => !accountedClassIds.has(c.id));
      if (leftoverClasses.length > 0) {
        const groups: Record<string, any[]> = {};
        leftoverClasses.forEach((c: any) => {
          const sName = c.section_name || 'General / Other Classes';
          if (!groups[sName]) groups[sName] = [];
          groups[sName].push(c);
        });
        Object.entries(groups).forEach(([name, clsList], idx) => {
          enrichedSections.push({
            id: -(idx + 1), // synthetic id
            name,
            grade_range: clsList.map((c: any) => c.grade).filter((v, i, a) => a.indexOf(v) === i).sort((a: number, b: number) => a - b).join(', '),
            classes: clsList,
            classCount: clsList.length,
            totalStudents: clsList.reduce((acc: number, c: any) => acc + (c.student_count || 0), 0)
          });
        });
      }

      setSections(enrichedSections);
    } catch (err) {
      console.error('Failed to load classes or sections:', err);
    } finally {
      setLoadingHierarchy(false);
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
        initialAttendanceMapRef.current = JSON.stringify(newMap);
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
          initialAttendanceMapRef.current = JSON.stringify(newMap);
        } else {
          setStudents([]);
          setServerRevision(0);
          setRosterFingerprint('');
          setAttendanceMap({});
          initialAttendanceMapRef.current = '';
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
        initialAttendanceMapRef.current = JSON.stringify(newMap);
      } else {
        setStudents([]);
        setServerRevision(0);
        setRosterFingerprint('');
        setAttendanceMap({});
        initialAttendanceMapRef.current = '';
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
          status: nextStatus,
          remarks: nextStatus === 'present' || nextStatus === 'unmarked' ? '' : prev[studentId]?.remarks || ''
        }
      };
    });
  };

  const handleOpenAbsentModal = (student: any) => {
    setActiveStudentForAbsence(student);
    const existing = attendanceMap[student.student_id];
    if (existing && existing.remarks) {
      const matched = PREDEFINED_ABSENCE_REASONS.find((r) =>
        existing.remarks.startsWith(r.label)
      );
      if (matched) {
        setSelectedReason(matched.label);
        const remainder = existing.remarks.replace(matched.label, '').replace(/^ - /, '').trim();
        setCustomReason(remainder);
      } else {
        setSelectedReason(null);
        setCustomReason(existing.remarks);
      }
    } else {
      setSelectedReason(null);
      setCustomReason('');
    }
    setAbsenceModalOpen(true);
  };

  const handleToggleReason = (reasonLabel: string) => {
    // Strictly single-choice selection: clicking toggles or replaces
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

    setAbsenceModalOpen(false);
    setActiveStudentForAbsence(null);
    setSelectedReason(null);
    setCustomReason('');
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

    setAbsenceModalOpen(false);
    setActiveStudentForAbsence(null);
    setSelectedReason(null);
    setCustomReason('');
  };

  const handleClearAbsent = () => {
    if (!activeStudentForAbsence) return;

    setAttendanceMap((prev) => {
      const next = { ...prev };
      delete next[activeStudentForAbsence.student_id];
      return next;
    });

    setAbsenceModalOpen(false);
    setActiveStudentForAbsence(null);
    setSelectedReason(null);
    setCustomReason('');
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
    const previousMap = { ...attendanceMap };
    const newMap: Record<number, { status: string; remarks: string }> = {};
    students.forEach((st: any) => {
      newMap[st.student_id] = {
        status,
        remarks: attendanceMap[st.student_id]?.remarks || ''
      };
    });
    setAttendanceMap(newMap);

    if (status === 'present') {
      toast.showSuccess(`Marked all ${students.length} students as Present.`, {
        label: 'Undo',
        onClick: () => {
          setAttendanceMap(previousMap);
          toast.showInfo('Restored previous roll-call status.');
        }
      });
    }
  };

  const handleClearAll = () => {
    const previousMap = { ...attendanceMap };
    const newMap: Record<number, { status: string; remarks: string }> = {};
    students.forEach((st: any) => {
      newMap[st.student_id] = {
        status: 'unmarked',
        remarks: attendanceMap[st.student_id]?.remarks || ''
      };
    });
    setAttendanceMap(newMap);

    toast.showInfo('Reset all students to Unmarked.', {
      label: 'Undo',
      onClick: () => {
        setAttendanceMap(previousMap);
      }
    });
  };

  // Real-time Counts derived from useMemo counts
  const countPresent = counts.present;
  const countAbsent = counts.absent;
  const countUnmarked = counts.unrecorded;
  const total = counts.total;
  const isRecorded = existingSession !== null || (total > 0 && countUnmarked < total);
  const attendanceRate = counts.rate;

  // Civil Calendar Date Navigation Handlers (Prev, Today, Next)
  const handleShiftDate = (offset: number) => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const dt = new Date(Date.UTC(year, month - 1, day));
    dt.setUTCDate(dt.getUTCDate() + offset);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const handleGoToday = () => {
    setSelectedDate(getColomboCivilDate());
  };

  // Execute Submission (Draft or Final) - returns Promise<boolean>
  const handleSaveAttendance = async (mode: 'draft' | 'submitted'): Promise<boolean> => {
    if (!selectedClassId || students.length === 0) {
      setErrorMessage('Cannot save attendance: No student roster loaded for the selected class and date.');
      return false;
    }

    if (!rosterFingerprint && !navigator.onLine) {
      setErrorMessage(`Cannot save offline attendance: No verified roster fingerprint cached for Date ${selectedDate}. Connect online to initialize.`);
      return false;
    }

    setErrorMessage(null);
    setSaveSuccessMsg(null);

    // Validation for final submitted register: 100% of roster must be marked
    if (mode === 'submitted' && countUnmarked > 0) {
      setErrorMessage(
        `Cannot submit final register: ${countUnmarked} student(s) remain unmarked. Please mark all students as Present or Absent, or click "Save Draft".`
      );
      return false;
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

        const successText = mode === 'submitted'
          ? `Finalized attendance register for ${selectedDate} submitted successfully (Revision ${res.revision}).`
          : `Attendance draft saved successfully (Revision ${res.revision}).`;

        setSaveSuccessMsg(successText);
        toast.showSuccess(mode === 'submitted' ? 'Final register submitted.' : 'Draft saved to server.');
      } else {
        // Offline: enqueue in IndexedDB v2
        await queueOfflineAttendance(mutationPayload);
        const offlineText = `Offline: ${mode === 'submitted' ? 'Final register' : 'Draft'} saved locally on device and queued for sync.`;
        setSaveSuccessMsg(offlineText);
        toast.showWarning(mode === 'submitted' ? 'Final register queued offline.' : 'Draft queued offline.');
      }

      initialAttendanceMapRef.current = JSON.stringify(attendanceMap);
      setTimeout(() => setSaveSuccessMsg(null), 6000);
      return true;
    } catch (err: any) {
      if (err instanceof HttpError) {
        if (err.status === 409) {
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
        console.warn('Network transport failure during save, queueing offline mutation:', err);
        await queueOfflineAttendance(mutationPayload);
        setIsOfflineMode(true);
        const queuedText = 'Network transport failure: Register safely queued in offline browser storage.';
        setSaveSuccessMsg(queuedText);
        toast.showWarning('Network failure: Saved to offline storage.');
        initialAttendanceMapRef.current = JSON.stringify(attendanceMap);
        return true;
      }
      return false;
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

      const isServerSubmitted = conflictModal.latestServerSession?.status === 'submitted';
      const isLocalSubmitted =
        existingSession?.status === 'submitted' || conflictModal.pendingMutation?.mode === 'submitted';
      const targetMode: 'draft' | 'submitted' =
        (isServerSubmitted || isLocalSubmitted) ? 'submitted' : 'draft';

      const resolvedRecords = conflictModal.diffs
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
      const confMsg = `Conflict resolved! Deliberate choices successfully applied and saved at Revision ${res.revision} (${res.mode} mode).`;
      setSaveSuccessMsg(confMsg);
      toast.showSuccess(`Revision ${res.revision} applied.`);
    } catch (err: any) {
      if (err instanceof HttpError && err.status === 409) {
        const fresh = await api.getAttendanceSession(selectedClassId, selectedDate);
        
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
    const msg = 'Discarded local edits and reloaded latest server register.';
    setSaveSuccessMsg(msg);
    toast.showInfo(msg);
  };

  const handleExportLocalDraft = () => {
    if (!conflictModal.pendingMutation) return;
    const jsonStr = exportMutationJson(conflictModal.pendingMutation);
    navigator.clipboard.writeText(jsonStr);
    setCopiedDraft(true);
    toast.showSuccess('Exported local draft JSON to clipboard.');
    setTimeout(() => setCopiedDraft(false), 3000);
  };

  // Filter students by search query and status tab
  const filteredStudents = students.filter((st) => {
    const s = attendanceMap[st.student_id]?.status || 'unmarked';
    if (filterView === 'absent' && s !== 'absent') return false;
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

  const getStatusColor = (st: string) => {
    switch (st) {
      case 'present': return 'var(--present)';
      case 'absent': return 'var(--absent)';
      case 'late': return 'var(--late)';
      case 'excused': return 'var(--excused)';
      default: return '#64748b';
    }
  };

  const currentSection = useMemo(() => {
    if (!selectedSectionId) return null;
    return sections.find((s) => s.id === selectedSectionId) || null;
  }, [sections, selectedSectionId]);

  const currentClass = useMemo(() => {
    if (!selectedClassId) return null;
    return classes.find((c) => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  const activeClassesInCurrentSection = useMemo(() => {
    if (!selectedSectionId) return classes;
    const sec = sections.find((s) => s.id === selectedSectionId);
    return sec?.classes || classes.filter((c) => c.section_id === selectedSectionId);
  }, [sections, selectedSectionId, classes]);

  const secondarySections = useMemo(
    () => sections.filter((s) => s.grade_range === '6-11' || s.name?.toLowerCase().includes('secondary')),
    [sections]
  );

  const collegiateSections = useMemo(
    () => sections.filter((s) => !secondarySections.includes(s)),
    [sections, secondarySections]
  );

  if (selectedClassId && displayMode === 'card') {
    return (
      <MobileSequentialAttendance
        user={user}
        initialClassId={selectedClassId}
        initialDate={selectedDate}
        onSwitchToTableMode={() => setDisplayMode('table')}
        onBackToClasses={() => setSelectedClassId(null)}
        onNavigate={onNavigate}
        registerNavGuard={registerNavGuard}
      />
    );
  }

  return (
    <div className="attendance-page">
      {/* Header with Title and Primary Submission CTAs */}
      <div className="attendance-header">
        <div className="attendance-header-titles">
          <div className="attendance-title-row">
            <h2 className="attendance-title">Daily Class Attendance Register</h2>
            {isOfflineMode && (
              <Badge color="yellow" variant="light" size="sm" leftSection={<WifiOff size={12} />}>
                Working Offline (IndexedDB v2)
              </Badge>
            )}
          </div>
        </div>

        <div className="attendance-actions">
          {/* Date Quick Nav & Calendar Selector */}
          <Group gap={6} align="center" wrap="nowrap">
            <Button.Group>
              <Button
                variant="default"
                size="sm"
                px={8}
                style={{ height: 36 }}
                onClick={() => handleAttemptLeave(() => handleShiftDate(-1))}
                title="Previous Day"
                aria-label="Previous Day"
              >
                <ChevronLeft size={15} />
              </Button>
              <Button
                variant={selectedDate === getColomboCivilDate() ? 'light' : 'default'}
                color={selectedDate === getColomboCivilDate() ? 'blue' : undefined}
                size="sm"
                px={12}
                style={{ height: 36, fontWeight: 600 }}
                onClick={() => handleAttemptLeave(() => handleGoToday())}
                title="Jump to Today"
              >
                Today
              </Button>
              <Button
                variant="default"
                size="sm"
                px={8}
                style={{ height: 36 }}
                onClick={() => handleAttemptLeave(() => handleShiftDate(1))}
                title="Next Day"
                aria-label="Next Day"
              >
                <ChevronRight size={15} />
              </Button>
            </Button.Group>

            {/* Attendance Date Selector */}
            <div className="attendance-header-date" title="Select attendance date">
              <input
                type="date"
                className="attendance-date-input"
                value={selectedDate}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  if (nextDate === selectedDate) return;
                  handleAttemptLeave(() => setSelectedDate(nextDate));
                }}
                aria-label="Attendance Date"
              />
            </div>
          </Group>

          {/* Clear Toggle for Table / Card Mode */}
          <SegmentedControl
            value={displayMode}
            onChange={(val: any) => {
              if (val === displayMode) return;
              handleAttemptLeave(() => setDisplayMode(val));
            }}
            data={[
              {
                value: 'table',
                label: (
                  <Group gap={6} align="center" wrap="nowrap">
                    <LayoutList size={15} />
                    <span>Table Mode</span>
                  </Group>
                )
              },
              {
                value: 'card',
                label: (
                  <Group gap={6} align="center" wrap="nowrap">
                    <Sparkles size={15} />
                    <span>Card Mode</span>
                  </Group>
                )
              }
            ]}
            size="sm"
            radius="md"
          />

          {/* If a class is selected, show Save Draft and Submit Final buttons */}
          {selectedClassId && (
            <>
              <button
                type="button"
                onClick={() => handleSaveAttendance('draft')}
                disabled={saving || students.length === 0 || isSubmittedState}
                className="btn btn-secondary"
                title={isSubmittedState ? 'Submitted registers cannot be downgraded to draft' : 'Save partial roll-call progress'}
              >
                <Save size={16} />
                <span>{saving ? 'Saving...' : 'Save Draft'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveAttendance('submitted')}
                disabled={saving || students.length === 0}
                className="btn btn-primary"
                style={{ minWidth: '175px' }}
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
            </>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* 1. SECTIONS SELECTION LEVEL (CARDS)                               */}
      {/* ================================================================ */}
      {!selectedSectionId && !selectedClassId && (
        <div className="att-hierarchy-container">
          <Paper p="xs" radius="md" withBorder className="att-guidance-card">
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Group gap="xs" align="center">
                <Building2 size={16} color="#2563eb" />
                <Text fw={700} size="sm" c="#0f172a">
                  School Sections
                </Text>
                <Text size="xs" c="dimmed">
                  Select a section below to view classrooms and record attendance
                </Text>
              </Group>

              <Badge color="blue" variant="light" size="sm">
                {sections.length} Section{sections.length !== 1 ? 's' : ''} Accessible
              </Badge>
            </Group>
          </Paper>

          {loadingHierarchy ? (
            <LoadingState message="Loading accessible school sections..." />
          ) : sections.length === 0 ? (
            <EmptyState
              title="No Sections Assigned"
              description="You do not have any accessible school sections or classes assigned to your user account."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {secondarySections.length > 0 && (
                <div>
                  <Group justify="space-between" align="center" mb={8}>
                    <Text fw={700} size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
                      Secondary Division &middot; Grades 6&ndash;11
                    </Text>
                    <Text size="xs" c="dimmed">
                      {secondarySections.length} Sections
                    </Text>
                  </Group>
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                    {secondarySections.map((sec) => {
                      let submittedCount = 0;
                      let draftCount = 0;
                      (sec.classes || []).forEach((c: any) => {
                        const sum = dailySummaries[c.id];
                        if (sum?.session_status === 'submitted') submittedCount++;
                        else if (sum?.session_status === 'draft') draftCount++;
                      });
                      const isAllSubmitted = sec.classCount > 0 && submittedCount === sec.classCount;

                      return (
                        <Paper
                          key={sec.id}
                          p="md"
                          radius="md"
                          withBorder
                          className="att-section-card"
                          onClick={() => setSelectedSectionId(sec.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedSectionId(sec.id);
                            }
                          }}
                        >
                          <Group justify="space-between" align="center" mb="xs">
                            <Group gap={6} align="center">
                              <Building2 size={16} color="#2563eb" />
                              <Text fw={750} size="md" c="#0f172a">
                                {sec.name}
                              </Text>
                            </Group>
                            {sec.grade_range && (
                              <Badge variant="light" color="blue" size="xs">
                                Grades {sec.grade_range}
                              </Badge>
                            )}
                          </Group>

                          <Text size="xs" c="dimmed" mb="md">
                            {sec.classCount} Classes &bull; {sec.totalStudents} Pupils
                          </Text>

                          <div className="att-card-footer">
                            <div>
                              {isAllSubmitted ? (
                                <Badge color="green" variant="light" size="xs">
                                  All {sec.classCount} Submitted
                                </Badge>
                              ) : submittedCount > 0 ? (
                                <Badge color="blue" variant="light" size="xs">
                                  {submittedCount} of {sec.classCount} Submitted
                                </Badge>
                              ) : draftCount > 0 ? (
                                <Badge color="yellow" variant="light" size="xs">
                                  {draftCount} Draft in Progress
                                </Badge>
                              ) : (
                                <Badge color="gray" variant="light" size="xs">
                                  Pending Roll-Call
                                </Badge>
                              )}
                            </div>
                            <span className="att-card-arrow">
                              View Classes &rarr;
                            </span>
                          </div>
                        </Paper>
                      );
                    })}
                  </SimpleGrid>
                </div>
              )}

              {collegiateSections.length > 0 && (
                <div>
                  <Group justify="space-between" align="center" mb={8}>
                    <Text fw={700} size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
                      Collegiate Division &middot; Grades 12&ndash;13 (A/L)
                    </Text>
                    <Text size="xs" c="dimmed">
                      {collegiateSections.length} Sections
                    </Text>
                  </Group>
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                    {collegiateSections.map((sec) => {
                      let submittedCount = 0;
                      let draftCount = 0;
                      (sec.classes || []).forEach((c: any) => {
                        const sum = dailySummaries[c.id];
                        if (sum?.session_status === 'submitted') submittedCount++;
                        else if (sum?.session_status === 'draft') draftCount++;
                      });
                      const isAllSubmitted = sec.classCount > 0 && submittedCount === sec.classCount;

                      return (
                        <Paper
                          key={sec.id}
                          p="md"
                          radius="md"
                          withBorder
                          className="att-section-card"
                          onClick={() => setSelectedSectionId(sec.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedSectionId(sec.id);
                            }
                          }}
                        >
                          <Group justify="space-between" align="center" mb="xs">
                            <Group gap={6} align="center">
                              <Building2 size={16} color="#2563eb" />
                              <Text fw={750} size="md" c="#0f172a">
                                {sec.name}
                              </Text>
                            </Group>
                            {sec.grade_range && (
                              <Badge variant="light" color="blue" size="xs">
                                Grades {sec.grade_range}
                              </Badge>
                            )}
                          </Group>

                          <Text size="xs" c="dimmed" mb="md">
                            {sec.classCount} Classes &bull; {sec.totalStudents} Pupils
                          </Text>

                          <div className="att-card-footer">
                            <div>
                              {isAllSubmitted ? (
                                <Badge color="green" variant="light" size="xs">
                                  All {sec.classCount} Submitted
                                </Badge>
                              ) : submittedCount > 0 ? (
                                <Badge color="blue" variant="light" size="xs">
                                  {submittedCount} of {sec.classCount} Submitted
                                </Badge>
                              ) : draftCount > 0 ? (
                                <Badge color="yellow" variant="light" size="xs">
                                  {draftCount} Draft in Progress
                                </Badge>
                              ) : (
                                <Badge color="gray" variant="light" size="xs">
                                  Pending Roll-Call
                                </Badge>
                              )}
                            </div>
                            <span className="att-card-arrow">
                              View Classes &rarr;
                            </span>
                          </div>
                        </Paper>
                      );
                    })}
                  </SimpleGrid>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* 2. CLASSES SELECTION LEVEL (CARDS)                                */}
      {/* ================================================================ */}
      {selectedSectionId && !selectedClassId && (
        <div className="att-hierarchy-container">
          <Paper p="sm" radius="md" withBorder className="att-breadcrumb-card">
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Group gap="xs" align="center">
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  leftSection={<ArrowLeft size={14} />}
                  onClick={() => setSelectedSectionId(null)}
                >
                  All Sections
                </Button>
                <ChevronRight size={14} color="#94a3b8" />
                <Group gap={6} align="center">
                  <Building2 size={16} color="#2563eb" />
                  <Text fw={700} size="sm" c="#0f172a">
                    {currentSection?.name || 'Section Classes'}
                  </Text>
                  {currentSection?.grade_range && (
                    <Badge variant="light" color="blue" size="xs">
                      Grades {currentSection.grade_range}
                    </Badge>
                  )}
                </Group>
              </Group>

              <Badge color="blue" variant="light" size="sm">
                {activeClassesInCurrentSection.length} Class{activeClassesInCurrentSection.length !== 1 ? 'es' : ''}
              </Badge>
            </Group>
          </Paper>

          {activeClassesInCurrentSection.length === 0 ? (
            <EmptyState
              title="No Classes in this Section"
              description="No classroom units are currently assigned or accessible to you in this section."
            />
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
              {activeClassesInCurrentSection.map((cls: any) => {
                const summary = dailySummaries[cls.id];
                const isSubmitted = summary?.session_status === 'submitted';
                const isDraft = summary?.session_status === 'draft';
                const cleanTeacher = cls.class_teacher_name
                  ? cls.class_teacher_name.replace(/^DEMO ONLY:\s*/i, '').replace(/\s*\(Synthetic Teacher\)/i, '').trim()
                  : '';

                return (
                  <Paper
                    key={cls.id}
                    p="lg"
                    radius="md"
                    withBorder
                    className="att-class-card"
                    onClick={() => setSelectedClassId(cls.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedClassId(cls.id);
                      }
                    }}
                  >
                    <Group justify="space-between" align="flex-start" mb="xs">
                      <Text fw={750} size="lg" c="#0f172a">
                        {cls.name}
                      </Text>
                      <Badge variant="light" color="blue" size="sm">
                        Grade {cls.grade}
                      </Badge>
                    </Group>

                    <Text size="xs" c="dimmed" mb={4} lineClamp={1}>
                      Teacher: <span style={{ color: '#334155', fontWeight: 600 }}>{cleanTeacher || 'Unassigned'}</span>
                    </Text>

                    <Text size="xs" c="dimmed" mb="md">
                      <Users size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      {cls.student_count || 0} Pupils
                    </Text>

                    <div className="att-card-footer">
                      <div>
                        {isSubmitted ? (
                          <Badge color="green" variant="light" size="xs">
                            ✓ Submitted ({summary.present_count}/{summary.enrolled_count})
                          </Badge>
                        ) : isDraft ? (
                          <Badge color="yellow" variant="light" size="xs">
                            ✎ Draft in Progress
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="light" size="xs">
                            Pending Roll-Call
                          </Badge>
                        )}
                      </div>
                      <span className="att-card-arrow">
                        {displayMode === 'card' ? 'Roll-Call' : 'Open Register'} &rarr;
                      </span>
                    </div>
                  </Paper>
                );
              })}
            </SimpleGrid>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* 3. ATTENDANCE TRACKING FOR SELECTED CLASS                         */}
      {/* ================================================================ */}
      {selectedClassId && (
        <>
          {/* Navigation Breadcrumb Bar */}
          <Paper p="xs" radius="md" withBorder className="att-breadcrumb-card">
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Group gap="xs" align="center">
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  leftSection={<ArrowLeft size={14} />}
                  onClick={() => handleAttemptLeave(() => setSelectedClassId(null))}
                >
                  Back to Classes
                </Button>
                <ChevronRight size={14} color="#94a3b8" />
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={() => handleAttemptLeave(() => {
                    setSelectedClassId(null);
                    setSelectedSectionId(null);
                  })}
                >
                  All Sections
                </Button>
                <ChevronRight size={14} color="#94a3b8" />
                <Text fw={700} size="sm" c="#0f172a">
                  {currentSection?.name || 'Section'}
                </Text>
                <ChevronRight size={14} color="#94a3b8" />
                <Badge color="blue" size="sm" variant="filled">
                  {currentClass?.name || `Class ${selectedClassId}`}
                </Badge>
                <Badge
                  color={isSubmittedState ? 'green' : existingSession ? 'yellow' : 'gray'}
                  variant="light"
                  size="sm"
                >
                  {isSubmittedState
                    ? `Final (Rev ${serverRevision})`
                    : existingSession
                    ? `Draft (Rev ${serverRevision})`
                    : 'Not Recorded'}
                </Badge>
              </Group>

              {/* Quick Roll Actions & Class Switcher */}
              <Group gap="xs" align="center">
                <Button.Group>
                  <Button
                    size="xs"
                    variant="light"
                    color="teal"
                    leftSection={<CheckCircle2 size={13} />}
                    onClick={() => handleMarkAll('present')}
                    title="Mark all enrolled students as Present"
                  >
                    All Present
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    leftSection={<XCircle size={13} />}
                    onClick={() => handleMarkAll('absent')}
                    title="Mark all enrolled students as Absent"
                  >
                    All Absent
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<RotateCcw size={13} />}
                    onClick={handleClearAll}
                    title="Reset all students to Unmarked"
                  >
                    Clear
                  </Button>
                </Button.Group>

                {activeClassesInCurrentSection.length > 1 && (
                  <Group gap={4} align="center">
                    <Text size="xs" c="dimmed">Class:</Text>
                    <select
                      className="attendance-select-compact"
                      value={selectedClassId}
                      onChange={(e) => {
                        const nextId = Number(e.target.value);
                        if (nextId === selectedClassId) return;
                        handleAttemptLeave(() => setSelectedClassId(nextId));
                      }}
                    >
                      {activeClassesInCurrentSection.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Group>
                )}
              </Group>
            </Group>
          </Paper>

          {/* Feedback / Alert Banners */}
          {saveSuccessMsg && (
            <div className="attendance-alert attendance-alert--success" role="status">
              <CheckCircle2 size={18} />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {errorMessage && (
            <div className="attendance-alert attendance-alert--error" role="alert">
              <AlertTriangle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

      {/* Live Roll Summary & Metrics Banner */}
      <div className="attendance-tally-card">
        <div className="attendance-tally-metrics">
          <span className="attendance-tally-pill attendance-tally-pill--total">
            <UserCheck size={14} />
            <span>Enrolled: {total}</span>
          </span>

          <span className="attendance-tally-pill attendance-tally-pill--present">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--present)' }} />
            <span>Present: {countPresent}</span>
          </span>

          <span className="attendance-tally-pill attendance-tally-pill--absent">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--absent)' }} />
            <span>Absent: {countAbsent}</span>
          </span>

          <span className="attendance-tally-pill attendance-tally-pill--unmarked">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748b' }} />
            <span>Unmarked: {countUnmarked}</span>
          </span>
        </div>

        <div className="attendance-rate-box">
          <div className="attendance-rate-labels">
            <span className="attendance-rate-label">Attendance Rate</span>
            <span className="attendance-rate-subtext">
              {isRecorded ? `${countPresent} / ${total} Pupils` : 'No Record'}
            </span>
          </div>
          <span
            className={`attendance-rate-value ${
              !isRecorded
                ? 'attendance-rate-value--none'
                : attendanceRate >= 80
                ? 'attendance-rate-value--high'
                : 'attendance-rate-value--low'
            }`}
          >
            {!isRecorded ? '—' : `${attendanceRate}%`}
          </span>
        </div>
      </div>

      {/* Search & Audit Filter Toolbar */}
      <div className="attendance-filter-toolbar">
        <div className="attendance-search-box">
          <Search size={16} className="attendance-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="attendance-search-input"
            placeholder="Search student or roll #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search students by name or roll number"
          />
          {searchQuery && (
            <button
              type="button"
              className="attendance-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear student search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="attendance-filter-tabs">
          <button
            type="button"
            onClick={() => setFilterView('all')}
            className={`attendance-tab-btn ${filterView === 'all' ? 'active' : ''}`}
          >
            All Students ({students.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterView('unmarked')}
            className={`attendance-tab-btn ${filterView === 'unmarked' ? 'active' : ''}`}
          >
            Unmarked ({countUnmarked})
          </button>
          <button
            type="button"
            onClick={() => setFilterView('absent')}
            className={`attendance-tab-btn attendance-tab-btn--absent ${filterView === 'absent' ? 'active' : ''}`}
          >
            Absentees ({countAbsent})
          </button>
        </div>
      </div>

      {/* Attendance Roster Grid / List */}
      <div className="attendance-roster-card card" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table className="attendance-table data-table">
            <thead>
              <tr>
                <th style={{ width: 70, textAlign: 'center' }}>Roll #</th>
                <th>Admission & Student Name</th>
                <th style={{ width: 260, textAlign: 'center' }}>Attendance Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} style={{ padding: '3.5rem 1rem' }}>
                    <LoadingState message="Loading class roster..." minHeight={120} />
                  </td>
                </tr>
              ) : students.length === 0 ? null : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '2.5rem 1rem' }}>
                    <EmptyState
                      icon={<Users size={32} />}
                      title="No Matching Students"
                      description="No students found matching current filter or search criteria."
                      withBorder={false}
                    />
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => {
                  const currentStatus = attendanceMap[st.student_id]?.status || 'unmarked';

                  return (
                    <tr key={st.student_id}>
                      <td style={{ textAlign: 'center' }}>
                        <span className="attendance-roll-badge">
                          #{st.roll_number || '-'}
                        </span>
                      </td>

                      <td>
                        <div className="attendance-student-info">
                          <div
                            className="attendance-avatar"
                            style={{ backgroundColor: getStatusColor(currentStatus) }}
                            aria-hidden="true"
                          >
                            {st.calling_name?.charAt(0) || 'S'}
                          </div>
                          <div className="attendance-name-group">
                            <div className="attendance-full-name">
                              {st.full_name}
                              {st.is_currently_enrolled === 0 && (
                                <span className="badge badge-unmarked" style={{ marginLeft: 6, fontSize: '0.65rem' }}>
                                  Transferred (Historical)
                                </span>
                              )}
                            </div>
                            <div className="attendance-meta-row">
                              <span>{st.admission_no}</span>
                              <span>•</span>
                              <span style={{ fontWeight: 600 }}>{st.calling_name}</span>
                              {currentStatus === 'absent' && (
                                <>
                                  <span>•</span>
                                  <button
                                    type="button"
                                    className="table-absence-reason-badge"
                                    onClick={() => handleOpenAbsentModal(st)}
                                    title="Click to view or edit absence reason"
                                  >
                                    <span>
                                      {attendanceMap[st.student_id]?.remarks
                                        ? attendanceMap[st.student_id].remarks
                                        : 'Absent · No reason'}
                                    </span>
                                    <Edit3 size={11} />
                                  </button>
                                </>
                              )}
                              <span className="attendance-roll-badge" style={{ display: 'none' /* Handled by mobile media query */ }}>
                                Roll #{st.roll_number || '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {/* Present vs Absent Segmented Control (Min 44px Touch Target) */}
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
                            onClick={() => handleOpenAbsentModal(st)}
                            title="Mark Absent & Record Reason"
                            aria-pressed={currentStatus === 'absent'}
                          >
                            A • Absent
                          </button>
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
      </>
      )}

      {/* Side-by-Side Student-by-Student Conflict Resolution Modal */}
      {conflictModal.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
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
              backgroundColor: 'var(--bg-card, #ffffff)',
              borderRadius: 'var(--radius-xl, 16px)'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <AlertTriangle size={26} color="#d97706" />
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
                  borderRadius: 'var(--radius-sm, 6px)',
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
                borderRadius: 'var(--radius-md, 8px)',
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
                borderRadius: 'var(--radius-md, 8px)',
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
                            <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm, 6px)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                              <button
                                type="button"
                                onClick={() => handleToggleStudentChoice(d.student_id, 'server')}
                                style={{
                                  padding: '0.4rem 0.75rem',
                                  fontSize: '0.75rem',
                                  fontWeight: d.chosen === 'server' ? 700 : 400,
                                  background: d.chosen === 'server' ? '#d97706' : 'transparent',
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
                                  padding: '0.4rem 0.75rem',
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
                style={{ padding: '0.65rem 1.4rem', fontWeight: 700 }}
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

      {/* Absence Reason Modal for Table Mode (Strictly single-choice selection) */}
      {absenceModalOpen && activeStudentForAbsence && (
        <div className="msa-modal-backdrop" onClick={() => setAbsenceModalOpen(false)}>
          <div
            className="msa-modal-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="table-absence-modal-title"
          >
            <div className="msa-modal-header">
              <div>
                <h3 id="table-absence-modal-title" className="msa-modal-title">
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
              <label htmlFor="table-custom-reason" className="msa-input-label">
                Custom / Additional Note (Optional):
              </label>
              <input
                id="table-custom-reason"
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

            {/* If student was already marked absent, option to clear */}
            {attendanceMap[activeStudentForAbsence.student_id]?.status === 'absent' && (
              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={handleClearAbsent}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Reset this student to Unmarked
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unsubmitted Attendance Exit Interception Modal */}
      <UnsubmittedAttendanceModal
        opened={leaveModalOpen}
        classTitle={currentClass?.name ? `${currentClass.name} · Grade ${currentClass.grade}` : 'Selected Class'}
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

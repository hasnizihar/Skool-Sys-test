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
  WifiOff,
  Phone
} from 'lucide-react';
import {
  Paper,
  Badge,
  Button,
  Group,
  Stack,
  Text,
  Title,
  Progress,
  Drawer,
  Modal,
  Box,
  SimpleGrid,
  ScrollArea,
  Tooltip
} from '@mantine/core';
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
import { LoadingState, EmptyState } from '../ui/mantine';
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

  const handleQuickMarkExcused = () => {
    if (!currentStudent) return;
    setAttendanceMap((prev) => ({
      ...prev,
      [currentStudent.student_id]: { status: 'excused', remarks: 'Excused Leave' }
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
  const progressPercent = students.length > 0 ? (counts.recorded / students.length) * 100 : 0;

  return (
    <div className="msa-container" role="region" aria-label="Mobile Sequential Attendance">
      {/* 1. Header Bar with Class & Date Selectors */}
      <Paper p="sm" radius="md" withBorder className="msa-top-bar" shadow="xs">
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
            <Badge
              color="yellow"
              variant="light"
              leftSection={<WifiOff size={12} />}
              size="sm"
            >
              Offline
            </Badge>
          )}

          {onSwitchToTableMode && (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<List size={14} />}
              onClick={onSwitchToTableMode}
              title="Switch to full table register view"
            >
              Table View
            </Button>
          )}

          <Button
            variant={viewMode === 'summary' ? 'filled' : 'light'}
            color="blue"
            size="xs"
            onClick={() => setViewMode((prev) => (prev === 'card' ? 'summary' : 'card'))}
          >
            {viewMode === 'card' ? 'Review & Submit' : 'Card View'}
          </Button>
        </div>
      </Paper>

      {/* Existing Session Status Banner */}
      {existingSession && (
        <Paper
          p="xs"
          radius="sm"
          withBorder
          className={`msa-session-banner ${existingSession.status === 'submitted' ? 'submitted' : 'draft'}`}
        >
          <div className="msa-banner-text">
            <strong>{existingSession.status === 'submitted' ? 'Register Finalized' : 'Draft Saved'}</strong>
            <span> · Revision {serverRevision}</span>
          </div>
          {existingSession.status === 'submitted' && (
            <Badge color="green" size="xs" variant="filled">Completed</Badge>
          )}
        </Paper>
      )}

      {/* Progress Ribbon */}
      <Paper p="xs" radius="md" withBorder className="msa-progress-ribbon" shadow="xs">
        <Group justify="space-between" mb={6}>
          <Text size="sm" fw={700} c="dark.7">
            {viewMode === 'card' && currentStudent
              ? `Student ${currentIndex + 1} of ${students.length}`
              : `${counts.recorded} of ${counts.total} Recorded`}
          </Text>
          <Group gap="xs">
            <Badge color="green" variant="light" size="sm">
              {counts.present} P
            </Badge>
            <Badge color="red" variant="light" size="sm">
              {counts.absent} A
            </Badge>
            {counts.late > 0 && (
              <Badge color="yellow" variant="light" size="sm">
                {counts.late} L
              </Badge>
            )}
            {counts.unrecorded > 0 && (
              <Badge color="gray" variant="filled" size="sm">
                {counts.unrecorded} Left
              </Badge>
            )}
          </Group>
        </Group>
        <Progress
          value={progressPercent}
          color={counts.unrecorded === 0 ? 'green' : 'blue'}
          size="sm"
          radius="xl"
          animated={loading}
        />
      </Paper>

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
          {currentStudent && (
            <Paper
              p="md"
              radius="lg"
              withBorder
              className="msa-student-card"
              shadow="sm"
              key={currentStudent.student_id}
            >
              {/* Card Meta Badges */}
              <Group justify="space-between" align="center" className="msa-card-badges">
                <Group gap="xs">
                  <Badge color="blue" variant="filled" size="md">
                    Roll #{currentStudent.roll_number || (currentIndex + 1)}
                  </Badge>
                  <Badge color="gray" variant="light" size="md">
                    Index: {currentStudent.admission_no}
                  </Badge>
                </Group>
                {currentRecord?.status && (
                  <Badge
                    color={
                      currentRecord.status === 'present'
                        ? 'green'
                        : currentRecord.status === 'absent'
                        ? 'red'
                        : currentRecord.status === 'late'
                        ? 'yellow'
                        : 'blue'
                    }
                    variant="filled"
                    size="md"
                  >
                    {currentRecord.status.toUpperCase()}
                    {currentRecord.remarks && ` · ${currentRecord.remarks}`}
                  </Badge>
                )}
              </Group>

              {/* Student Name & Avatar */}
              <div className="msa-card-avatar-row">
                <div
                  className={`msa-avatar ${
                    currentStudent.gender?.toLowerCase() === 'female' ? 'avatar-f' : 'avatar-m'
                  }`}
                >
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
                <Button
                  variant="subtle"
                  color="blue"
                  size="xs"
                  leftSection={<List size={13} />}
                  onClick={() => setJumpDrawerOpen(true)}
                  title="View full roster to jump to student"
                >
                  Quick Roster Jump
                </Button>
              </div>

              {/* Primary Dual Actions: PRESENT (Green) vs ABSENT (Red) */}
              <div className="msa-action-buttons-grid">
                <button
                  type="button"
                  className={`msa-big-action-btn msa-btn--present ${
                    currentRecord?.status === 'present' ? 'selected' : ''
                  }`}
                  onClick={handleMarkPresent}
                  aria-label={`Mark ${currentStudent.calling_name || 'student'} Present`}
                >
                  <CheckCircle2 size={32} className="msa-action-icon" />
                  <span className="msa-action-text">PRESENT</span>
                </button>

                <button
                  type="button"
                  className={`msa-big-action-btn msa-btn--absent ${
                    currentRecord?.status === 'absent' ? 'selected' : ''
                  }`}
                  onClick={handleOpenAbsentModal}
                  aria-label={`Mark ${currentStudent.calling_name || 'student'} Absent`}
                >
                  <XCircle size={32} className="msa-action-icon" />
                  <span className="msa-action-text">ABSENT</span>
                </button>
              </div>

              {/* Secondary Actions: Late / Excused / Clear */}
              <div className="msa-secondary-actions">
                <Group gap="xs">
                  <Button
                    variant={currentRecord?.status === 'late' ? 'filled' : 'light'}
                    color="yellow"
                    size="xs"
                    leftSection={<Clock size={13} />}
                    onClick={handleQuickMarkLate}
                    title="Mark Late Arrival"
                  >
                    Late
                  </Button>

                  <Button
                    variant={currentRecord?.status === 'excused' ? 'filled' : 'light'}
                    color="indigo"
                    size="xs"
                    leftSection={<HelpCircle size={13} />}
                    onClick={handleQuickMarkExcused}
                    title="Mark Excused Absence"
                  >
                    Excused
                  </Button>
                </Group>

                {currentRecord?.status && (
                  <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    leftSection={<RotateCcw size={13} />}
                    onClick={handleClearCurrentStatus}
                    title="Clear current mark"
                  >
                    Clear Mark
                  </Button>
                )}
              </div>
            </Paper>
          )}

          {/* Stepper Navigation Footer */}
          <Paper p="xs" radius="md" withBorder className="msa-stepper-nav" shadow="xs">
            <Button
              variant="default"
              size="md"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              leftSection={<ChevronLeft size={18} />}
              style={{ flex: 1 }}
              aria-label="Previous Student"
            >
              Prev
            </Button>

            <Button
              variant="light"
              color="blue"
              size="md"
              onClick={() => setViewMode('summary')}
              style={{ flex: 1.4 }}
            >
              Summary ({counts.recorded}/{counts.total})
            </Button>

            <Button
              variant="default"
              size="md"
              disabled={currentIndex >= students.length - 1}
              onClick={() => setCurrentIndex((prev) => Math.min(students.length - 1, prev + 1))}
              rightSection={<ChevronRight size={18} />}
              style={{ flex: 1 }}
              aria-label="Next Student"
            >
              Next
            </Button>
          </Paper>
        </main>
      ) : (
        /* Summary Review Mode */
        <main className="msa-summary-stage">
          <Paper p="md" radius="lg" withBorder shadow="sm">
            <div className="msa-summary-header">
              <Title order={3}>Attendance Register Summary</Title>
              <Text size="sm" c="dimmed">
                {selectedClass?.name} · {selectedDate}
              </Text>
            </div>

            {/* Key Metric Counters */}
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" mt="md">
              <Paper p="sm" radius="md" withBorder bg="green.0">
                <Text size="xs" fw={700} c="green.9" tt="uppercase">
                  Present
                </Text>
                <Text size="xl" fw={800} c="green.8">
                  {counts.present}
                </Text>
              </Paper>
              <Paper p="sm" radius="md" withBorder bg="red.0">
                <Text size="xs" fw={700} c="red.9" tt="uppercase">
                  Absent
                </Text>
                <Text size="xl" fw={800} c="red.8">
                  {counts.absent}
                </Text>
              </Paper>
              <Paper p="sm" radius="md" withBorder bg="yellow.0">
                <Text size="xs" fw={700} c="yellow.9" tt="uppercase">
                  Unrecorded
                </Text>
                <Text size="xl" fw={800} c="yellow.8">
                  {counts.unrecorded}
                </Text>
              </Paper>
              <Paper p="sm" radius="md" withBorder bg="blue.0">
                <Text size="xs" fw={700} c="blue.9" tt="uppercase">
                  Rate
                </Text>
                <Text size="xl" fw={800} c="blue.8">
                  {counts.rate}%
                </Text>
              </Paper>
            </SimpleGrid>

            {/* Absence Breakdown List */}
            <Box mt="lg">
              <Group justify="space-between" mb="xs">
                <Title order={4}>Absence Roster & Reasons ({counts.absent})</Title>
                <Badge color="red" variant="light" size="sm">
                  {counts.absent} Absent
                </Badge>
              </Group>

              {counts.absent === 0 ? (
                <Paper p="sm" radius="sm" bg="green.0" withBorder>
                  <Text size="sm" c="green.8" fw={600}>
                    All recorded students are Present! (Zero absences recorded)
                  </Text>
                </Paper>
              ) : (
                <ScrollArea.Autosize mah={260}>
                  <Stack gap="xs">
                    {students
                      .filter((st) => attendanceMap[st.student_id]?.status === 'absent')
                      .map((st) => {
                        const rec = attendanceMap[st.student_id];
                        return (
                          <Paper
                            key={st.student_id}
                            p="xs"
                            radius="md"
                            withBorder
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
                          </Paper>
                        );
                      })}
                  </Stack>
                </ScrollArea.Autosize>
              )}
            </Box>

            {/* Unrecorded Students Warning if any */}
            {counts.unrecorded > 0 && (
              <Box mt="md" className="msa-unrecorded-alert" role="alert">
                <AlertTriangle size={18} />
                <div>
                  <strong>{counts.unrecorded} Student(s) Unrecorded</strong>
                  <p>All students must have attendance marked before final register submission.</p>
                </div>
              </Box>
            )}

            {/* Final Action Submission Bar */}
            <div className="msa-final-actions-bar">
              <Button
                variant="default"
                size="md"
                leftSection={<Save size={16} />}
                onClick={() => handleSaveAttendance('draft')}
                loading={saving}
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
              >
                Submit Final Register
              </Button>
            </div>
          </Paper>
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
              <Button
                variant="default"
                size="md"
                onClick={() => {
                  setSelectedReasons([]);
                  setCustomReason('');
                  handleConfirmAbsent();
                }}
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
              <Title order={4}>Class Roster ({students.length})</Title>
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

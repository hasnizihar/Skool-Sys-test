import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Printer,
  Edit3,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Shield,
  CheckCircle2,
  School,
  X,
  AlertCircle,
  Hash,
  Briefcase,
  Save,
  RotateCcw
} from 'lucide-react';
import {
  Modal,
  Paper,
  Text,
  Title,
  Group,
  Stack,
  SimpleGrid,
  Box,
  Divider,
  Alert,
  Badge,
  Button,
  ScrollArea,
  TextInput,
  Select,
  Tooltip,
  SegmentedControl,
  Textarea
} from '@mantine/core';
import { useForm, isNotEmpty } from '@mantine/form';
import { api } from '../api/client';
import { UnsavedChangesModal } from '../components/UnsavedChangesModal';
import { LoadingState, ErrorState } from '../ui/mantine';
import './studentFullView.css';

interface HeatmapProps {
  history: Array<{ status: string; remarks?: string | null; date: string; class_name?: string }>;
  academicYear?: string;
  stats?: {
    total_days?: number;
    present_days?: number;
    absent_days?: number;
    late_days?: number;
    excused_days?: number;
    attendanceRate?: number;
  };
}

const AttendanceContributionHeatmap: React.FC<HeatmapProps> = ({
  history = [],
  academicYear = '2026',
  stats
}) => {
  const year = parseInt(academicYear, 10) || 2026;

  // Build attendance map keyed by date 'YYYY-MM-DD'
  const attendanceMap = useMemo(() => {
    const map = new Map<string, { status: string; remarks?: string | null; class_name?: string }>();
    (history || []).forEach((h) => {
      if (h.date) {
        map.set(h.date, h);
      }
    });
    return map;
  }, [history]);

  // Compute 53 calendar weeks for the year (Monday to Sunday rows)
  const { weeks, monthLabels } = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDate = new Date(year, 0, 1);
    const startDay = startDate.getDay(); // 0 is Sunday, 1 is Monday...
    const dayOffset = (startDay + 6) % 7; // Monday offset (0 = Mon, 6 = Sun)
    const gridStart = new Date(year, 0, 1 - dayOffset);
    const endDate = new Date(year, 11, 31);

    const generatedWeeks: Array<Array<{
      dateStr: string;
      inYear: boolean;
      month: number;
      dayOfMonth: number;
      dayOfWeek: number;
      dateObj: Date;
    }>> = [];

    let curr = new Date(gridStart);

    while (curr <= endDate || ((curr.getDay() + 6) % 7) !== 0) {
      const dateStr = `${curr.getFullYear()}-${pad(curr.getMonth() + 1)}-${pad(curr.getDate())}`;
      const inYear = curr.getFullYear() === year;
      const month = curr.getMonth();
      const dayOfMonth = curr.getDate();
      const dayOfWeek = curr.getDay();
      const isoDay = (dayOfWeek + 6) % 7;

      if (isoDay === 0) {
        generatedWeeks.push([]);
      }

      generatedWeeks[generatedWeeks.length - 1].push({
        dateStr,
        inYear,
        month,
        dayOfMonth,
        dayOfWeek,
        dateObj: new Date(curr)
      });

      curr.setDate(curr.getDate() + 1);
    }

    const labels: Array<{ name: string; colIdx: number }> = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let m = 0; m < 12; m++) {
      const colIdx = generatedWeeks.findIndex((w) =>
        w.some((d) => d.inYear && d.month === m && d.dayOfMonth <= 7)
      );
      if (colIdx !== -1) {
        labels.push({ name: monthNames[m], colIdx });
      }
    }

    return { weeks: generatedWeeks, monthLabels: labels };
  }, [year]);

  const todayStr = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);

  return (
    <div className="att-contrib-card card" style={{ padding: 0 }}>
      {/* Header: Structured Title + Compact KPI Metric Cards */}
      <div className="att-contrib-header">
        <div className="att-contrib-header-left">
          <h3 className="att-contrib-title">Daily Attendance History Log</h3>
          <p className="att-contrib-subtitle">
            Annual roll-call contribution for Academic Year {academicYear}
          </p>
        </div>

        <div className="att-contrib-header-stats">
          <div className="att-contrib-kpi-chip present">
            <span className="att-contrib-kpi-label">Days Present</span>
            <div className="att-contrib-kpi-val-row">
              <span className="att-contrib-kpi-number">{stats?.present_days ?? 0}</span>
            </div>
          </div>

          <div className="att-contrib-kpi-chip absent">
            <span className="att-contrib-kpi-label">Days Absent</span>
            <div className="att-contrib-kpi-val-row">
              <span className="att-contrib-kpi-number">{stats?.absent_days ?? 0}</span>
            </div>
          </div>

          <div className="att-contrib-kpi-chip rate">
            <div className="att-contrib-kpi-label-row">
              <span className="att-contrib-kpi-label">Attendance Rate</span>
              <span
                className={`badge ${(stats?.attendanceRate ?? 100) >= 80 ? 'badge-present' : 'badge-absent'}`}
                style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.45rem', textTransform: 'capitalize' }}
              >
                {(stats?.attendanceRate ?? 100) >= 80 ? 'Good Standing' : 'Needs Attention'}
              </span>
            </div>
            <div className="att-contrib-kpi-val-row">
              <span className="att-contrib-kpi-number">{stats?.attendanceRate ?? 100}%</span>
              <span className="att-contrib-kpi-sub">
                ({stats?.present_days ?? 0}/{stats?.total_days ?? 0})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap Area */}
      <div className="att-contrib-body">
        <div className="att-contrib-scroll-wrapper">
          <div className="att-contrib-graph">
            {/* Month Headers */}
            <div className="att-contrib-months">
              {monthLabels.map((m) => (
                <span
                  key={m.name}
                  className="att-contrib-month-label"
                  style={{ left: `${m.colIdx * 20}px` }}
                >
                  {m.name}
                </span>
              ))}
            </div>

            {/* Main Day Graph */}
            <div className="att-contrib-main">
              {/* Day Axis (GitHub Mon, Wed, Fri Style) */}
              <div className="att-contrib-days-axis" aria-hidden="true">
                <span className="att-contrib-day-label">Mon</span>
                <span className="att-contrib-day-label" style={{ visibility: 'hidden' }}>Tue</span>
                <span className="att-contrib-day-label">Wed</span>
                <span className="att-contrib-day-label" style={{ visibility: 'hidden' }}>Thu</span>
                <span className="att-contrib-day-label">Fri</span>
                <span className="att-contrib-day-label" style={{ visibility: 'hidden' }}>Sat</span>
                <span className="att-contrib-day-label" style={{ visibility: 'hidden' }}>Sun</span>
              </div>

              {/* 53 Week Columns */}
              <div className="att-contrib-weeks" role="grid" aria-label="Annual Attendance Contribution Heatmap">
                {weeks.map((week, wIdx) => (
                  <div key={wIdx} className="att-contrib-week-col" role="row">
                    {week.map((cell) => {
                      const record = attendanceMap.get(cell.dateStr);
                      const isWeekend = cell.dayOfWeek === 0 || cell.dayOfWeek === 6;
                      const isFuture = cell.dateStr > todayStr;
                      const isToday = cell.dateStr === todayStr;

                      let cellStatusClass = 'empty';
                      if (!cell.inYear) {
                        cellStatusClass = 'out-of-year';
                      } else if (record) {
                        cellStatusClass = record.status === 'present' ? 'present' : 'absent';
                      } else if (isWeekend) {
                        cellStatusClass = 'weekend';
                      } else if (isFuture) {
                        cellStatusClass = 'future';
                      }

                      if (isToday) {
                        cellStatusClass += ' is-today';
                      }

                      const dateFormatted = cell.dateObj.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });

                      const tooltipContent = (
                        <div style={{ fontSize: '0.75rem', lineHeight: 1.45, textAlign: 'left', minWidth: '140px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '3px', marginBottom: '4px' }}>
                            <span>{dateFormatted}</span>
                            {isToday && (
                              <span style={{ fontSize: '0.65rem', background: '#2563eb', color: '#fff', padding: '1px 5px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 800 }}>
                                Today
                              </span>
                            )}
                          </div>
                          {record ? (
                            <>
                              <div
                                style={{
                                  color: record.status === 'present' ? '#4ade80' : '#f87171',
                                  fontWeight: 700,
                                  textTransform: 'capitalize',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <span>{record.status === 'present' ? '●' : '▲'}</span>
                                <span>{record.status}</span>
                                {record.class_name && <span style={{ opacity: 0.85, fontWeight: 500 }}>• {record.class_name}</span>}
                              </div>
                              {record.remarks && (
                                <div style={{ color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic', fontSize: '0.7rem', marginTop: '2px' }}>
                                  &ldquo;{record.remarks}&rdquo;
                                </div>
                              )}
                            </>
                          ) : isWeekend ? (
                            <div style={{ color: 'var(--text-muted, #94a3b8)' }}>Weekend (No School)</div>
                          ) : isFuture ? (
                            <div style={{ color: 'var(--text-muted, #94a3b8)' }}>Future School Date</div>
                          ) : (
                            <div style={{ color: 'var(--text-muted, #94a3b8)' }}>No session recorded</div>
                          )}
                        </div>
                      );

                      if (!cell.inYear) {
                        return (
                          <div
                            key={cell.dateStr}
                            className={`att-contrib-cell ${cellStatusClass}`}
                            aria-hidden="true"
                          />
                        );
                      }

                      return (
                        <Tooltip
                          key={cell.dateStr}
                          label={tooltipContent}
                          withArrow
                          position="top"
                          openDelay={60}
                        >
                          <div
                            className={`att-contrib-cell ${cellStatusClass}`}
                            tabIndex={0}
                            role="gridcell"
                            aria-label={`${cell.dateStr}: ${record?.status || (isWeekend ? 'weekend' : isFuture ? 'future' : 'no session')}`}
                          />
                        </Tooltip>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Legend */}
      <div className="att-contrib-footer">
        <Text size="xs" c="dimmed" fw={500}>
          Tracked across <strong>{stats?.total_days || history.length}</strong> school days in Academic Year {academicYear}
        </Text>

        <div className="att-contrib-legend">
          <span className="att-contrib-legend-item">
            <span className="att-contrib-legend-chip present" />
            <span>Present</span>
          </span>
          <span className="att-contrib-legend-item">
            <span className="att-contrib-legend-chip absent" />
            <span>Absent</span>
          </span>
          <span className="att-contrib-legend-item">
            <span className="att-contrib-legend-chip weekend" />
            <span>Weekend</span>
          </span>
          <span className="att-contrib-legend-item">
            <span className="att-contrib-legend-chip future" />
            <span>Future Date</span>
          </span>
        </div>
      </div>
    </div>
  );
};

interface StudentFullViewProps {
  studentId: number;
  onBack: () => void;
  user: any;
  onStudentUpdated?: () => void;
  onNavigate?: (tab: string) => void;
  registerNavGuard?: (guard: ((targetTab: string) => boolean) | null) => void;
}

export const StudentFullView: React.FC<StudentFullViewProps> = ({
  studentId,
  onBack,
  user,
  onStudentUpdated,
  onNavigate,
  registerNavGuard
}) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit State powered by @mantine/form (matches AddStudentView layout)
  const [isEditing, setIsEditing] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string>('6');

  // Grade options 6 to 13
  const gradeOptions = useMemo(() => {
    return [6, 7, 8, 9, 10, 11, 12, 13].map((g) => ({
      value: String(g),
      label: `Grade ${g}`
    }));
  }, []);

  // Filter classes by selected grade for edit modal
  const filteredEditClasses = useMemo(() => {
    return classes.filter((c) => String(c.grade) === String(selectedGrade));
  }, [classes, selectedGrade]);

  const editStudentForm = useForm({
    mode: 'controlled',
    initialValues: {
      admission_no: '',
      full_name: '',
      name_with_initials: '',
      dob: '',
      gender: 'Male',
      address: '',
      grade: '6',
      class_id: '',
      guardian_name: '',
      guardian_relation: 'Father',
      guardian_occupation: '',
      guardian_phone: '',
      guardian_phone_2: '',
      guardian_email: '',
    },
    validate: {
      admission_no: (val) =>
        !val?.trim()
          ? 'Index number is required'
          : !/^\d{5}$/.test(val.trim())
          ? 'Index number must be exactly 5 digits (e.g. 16087)'
          : null,
      full_name: isNotEmpty('Full name is required'),
      name_with_initials: isNotEmpty('Name with initials is required (e.g. M.R. Shihab)'),
      dob: isNotEmpty('Date of birth is required'),
      gender: (val) => (val === 'Male' || val === 'Female' ? null : 'Gender must be Male or Female'),
      address: isNotEmpty('Residential address is required'),
      class_id: isNotEmpty('Class assignment is required'),
      guardian_name: isNotEmpty('Guardian name is required'),
      guardian_relation: isNotEmpty('Guardian relationship is required'),
      guardian_phone: (val) =>
        !val?.trim()
          ? 'Phone Number 1 is required'
          : !/^\+?[0-9\s-]{9,15}$/.test(val.trim())
          ? 'Valid phone number required (e.g. 0771234567)'
          : null,
      guardian_phone_2: (val) =>
        val && val.trim() && !/^\+?[0-9\s-]{9,15}$/.test(val.trim())
          ? 'Valid secondary phone number required'
          : null,
      guardian_email: (val) =>
        val && val.trim() && !/^\S+@\S+\.\S+$/.test(val.trim()) ? 'Valid email required' : null,
    },
    transformValues: (values) => ({
      admission_no: values.admission_no.trim(),
      full_name: values.full_name.trim(),
      name_with_initials: values.name_with_initials.trim(),
      dob: values.dob,
      gender: values.gender,
      address: values.address.trim(),
      class_id: values.class_id ? Number(values.class_id) : null,
      guardian_name: values.guardian_name.trim(),
      guardian_relation: values.guardian_relation.trim(),
      guardian_occupation: values.guardian_occupation.trim(),
      guardian_phone: values.guardian_phone.trim(),
      guardian_phone_2: values.guardian_phone_2.trim() || null,
      guardian_email: values.guardian_email.trim() || null,
    }),
  });

  // Unsaved changes modal state & navigation guards
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);
  const isBypassingGuardRef = useRef(false);

  const isEditDirty = useMemo(() => {
    if (!isEditing) return false;
    return editStudentForm.isDirty();
  }, [isEditing, editStudentForm.values]);

  const handleAttemptLeaveEdit = (action: () => void) => {
    if (isEditDirty) {
      setPendingLeaveAction(() => action);
      setShowConfirmModal(true);
    } else {
      action();
    }
  };

  const handleConfirmDiscard = () => {
    setShowConfirmModal(false);
    editStudentForm.reset();
    editStudentForm.resetDirty();
    if (pendingLeaveAction) {
      const act = pendingLeaveAction;
      setPendingLeaveAction(null);
      act();
    } else {
      setIsEditing(false);
    }
  };

  const handleCloseConfirmModal = () => {
    setShowConfirmModal(false);
    setPendingLeaveAction(null);
  };

  // Browser reload / close guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isEditDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isEditDirty]);

  // Tab switch navigation guard
  useEffect(() => {
    if (!registerNavGuard) return;
    registerNavGuard((targetTab: string) => {
      if (isBypassingGuardRef.current) return true;
      if (isEditDirty) {
        setPendingLeaveAction(() => () => {
          isBypassingGuardRef.current = true;
          onNavigate?.(targetTab);
        });
        setShowConfirmModal(true);
        return false;
      }
      return true;
    });
    return () => registerNavGuard(null);
  }, [registerNavGuard, isEditDirty, onNavigate]);

  useEffect(() => {
    loadStudent();
    loadClasses();
  }, [studentId]);

  const loadStudent = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getStudent(studentId);
      setData(res);
      const studentGrade = res.student.grade ? String(res.student.grade) : '6';
      setSelectedGrade(studentGrade);
      const studentVals = {
        admission_no: res.student.admission_no || '',
        full_name: res.student.full_name || '',
        name_with_initials: res.student.name_with_initials || '',
        dob: res.student.dob || '',
        gender: res.student.gender || 'Male',
        address: res.student.address || '',
        grade: studentGrade,
        class_id: res.student.class_id ? String(res.student.class_id) : '',
        guardian_name: res.student.guardian_name || '',
        guardian_relation: res.student.guardian_relation || 'Father',
        guardian_occupation: res.student.guardian_occupation || '',
        guardian_phone: res.student.guardian_phone || '',
        guardian_phone_2: res.student.guardian_phone_2 || '',
        guardian_email: res.student.guardian_email || '',
      };
      editStudentForm.setInitialValues(studentVals);
      editStudentForm.setValues(studentVals);
      editStudentForm.resetDirty();
    } catch (err: any) {
      setError(err.message || 'Failed to load student record details.');
    } finally {
      setLoading(false);
    }
  };

  const loadClasses = async () => {
    try {
      const res = await api.getClasses();
      setClasses(res.classes || []);
    } catch (err) {
      console.error('Failed to load classes for edit:', err);
    }
  };

  const handleEditSubmit = editStudentForm.onSubmit(async (transformedValues) => {
    try {
      setSavingEdit(true);
      setEditError(null);
      await api.updateStudent(studentId, transformedValues);
      setIsEditing(false);
      await loadStudent();
      if (onStudentUpdated) onStudentUpdated();
    } catch (err: any) {
      setEditError(err.message || 'Failed to save student record updates.');
    } finally {
      setSavingEdit(false);
    }
  });

  const calculateAge = (dobString: string) => {
    if (!dobString) return '';
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age > 0 ? `${age} Years` : '';
  };

  if (loading) {
    return (
      <Box py="xl">
        <LoadingState
          message="Retrieving comprehensive student dossier, enrollment, and attendance records..."
          minHeight={240}
        />
      </Box>
    );
  }

  if (error || !data?.student) {
    return (
      <Paper withBorder p="xl" radius="md" style={{ textAlign: 'center' }}>
        <ErrorState
          title="Failed to Load Student Record"
          message={error || 'The requested student record could not be found or loaded.'}
          onRetry={onBack}
          retryLabel="Back to Student Directory"
        />
      </Paper>
    );
  }

  const { student, attendance } = data;
  const attRate = attendance?.attendanceRate !== undefined ? attendance.attendanceRate : 100;
  const isFemale = student.gender === 'Female';

  if (isEditing) {
    return (
      <div className="add-student-page" style={{ maxWidth: 960, margin: '0 auto', paddingBottom: '3rem' }}>
        {/* Top Header & Breadcrumb */}
        <Paper p="md" radius="lg" withBorder shadow="xs" mb="lg" style={{ background: 'var(--bg-card, #ffffff)' }}>
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Group gap="sm">
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                leftSection={<ArrowLeft size={16} />}
                onClick={() => handleAttemptLeaveEdit(() => setIsEditing(false))}
              >
                Back to Student Dossier
              </Button>
              <Divider orientation="vertical" />
              <div>
                <Title order={2} style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #0f172a)' }}>
                  Edit Student Record
                </Title>
                <Text size="xs" c="dimmed">
                  Official pupil registry update & class placement
                </Text>
              </div>
            </Group>

            <Badge variant="light" color="blue" size="lg">
              Academic Year {student.academic_year || '2026'}
            </Badge>
          </Group>
        </Paper>

        {/* Server Error Alert */}
        {editError && (
          <Alert
            icon={<AlertCircle size={18} />}
            title="Update Failed"
            color="red"
            radius="md"
            mb="lg"
            withCloseButton
            onClose={() => setEditError(null)}
          >
            {editError}
          </Alert>
        )}

        <form onSubmit={handleEditSubmit}>
          <Stack gap="lg">
            {/* Card 1: Academic & Class Placement */}
            <Paper p="xl" radius="lg" withBorder shadow="xs" style={{ background: 'var(--bg-card, #ffffff)' }}>
              <Group gap="xs" mb="md">
                <School size={19} color="var(--primary, #2563eb)" />
                <Title order={3} style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                  1. Academic & Class Placement
                </Title>
              </Group>

              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <TextInput
                  label="Index Number"
                  placeholder="e.g. 16087"
                  required
                  leftSection={<Hash size={15} />}
                  maxLength={5}
                  {...editStudentForm.getInputProps('admission_no')}
                />

                <Select
                  label="Grade"
                  placeholder="Select Grade"
                  required
                  data={gradeOptions}
                  value={selectedGrade}
                  onChange={(val) => {
                    if (val) {
                      setSelectedGrade(val);
                      editStudentForm.setFieldValue('grade', val);
                      const matching = classes.filter((c) => String(c.grade) === String(val));
                      if (matching.length > 0 && !matching.some((m) => String(m.id) === String(editStudentForm.getValues().class_id))) {
                        editStudentForm.setFieldValue('class_id', String(matching[0].id));
                      }
                    }
                  }}
                />

                <Select
                  label="Class"
                  placeholder={filteredEditClasses.length === 0 ? 'No classes for Grade' : 'Select Class'}
                  required
                  disabled={filteredEditClasses.length === 0}
                  data={filteredEditClasses.map((c) => ({ value: String(c.id), label: c.name }))}
                  {...editStudentForm.getInputProps('class_id')}
                />
              </SimpleGrid>
            </Paper>

            {/* Card 2: Student Personal Information */}
            <Paper p="xl" radius="lg" withBorder shadow="xs" style={{ background: 'var(--bg-card, #ffffff)' }}>
              <Group gap="xs" mb="md">
                <User size={19} color="var(--primary, #2563eb)" />
                <Title order={3} style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                  2. Personal Information
                </Title>
              </Group>

              <Stack gap="md">
                <TextInput
                  label="Full Name"
                  placeholder="e.g. Mohamed Rinas Shihab"
                  required
                  {...editStudentForm.getInputProps('full_name')}
                />

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput
                    label="Name with Initial"
                    placeholder="e.g. M.R. Shihab"
                    required
                    {...editStudentForm.getInputProps('name_with_initials')}
                  />

                  <TextInput
                    type="date"
                    label="Date of Birth"
                    required
                    leftSection={<Calendar size={15} />}
                    {...editStudentForm.getInputProps('dob')}
                  />
                </SimpleGrid>

                <div>
                  <Text size="sm" fw={500} mb={4}>
                    Gender <span style={{ color: 'var(--mantine-color-red-filled, #fa5252)' }}>*</span>
                  </Text>
                  <SegmentedControl
                    fullWidth
                    data={[
                      { label: 'Male', value: 'Male' },
                      { label: 'Female', value: 'Female' }
                    ]}
                    value={editStudentForm.values.gender}
                    onChange={(val) => editStudentForm.setFieldValue('gender', val)}
                  />
                </div>

                <Textarea
                  label="Residential Address"
                  placeholder="e.g. No 45 Beach Road Kattankudy"
                  required
                  minRows={2}
                  {...editStudentForm.getInputProps('address')}
                />
              </Stack>
            </Paper>

            {/* Card 3: Guardian Details */}
            <Paper p="xl" radius="lg" withBorder shadow="xs" style={{ background: 'var(--bg-card, #ffffff)' }}>
              <Group gap="xs" mb="md">
                <Shield size={19} color="var(--primary, #2563eb)" />
                <Title order={3} style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                  3. Guardian Details
                </Title>
              </Group>

              <Stack gap="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput
                    label="Guardian Name"
                    placeholder="e.g. Mohamed Shihab"
                    required
                    {...editStudentForm.getInputProps('guardian_name')}
                  />

                  <Select
                    label="Guardian Relationship"
                    required
                    data={[
                      { value: 'Father', label: 'Father' },
                      { value: 'Mother', label: 'Mother' },
                      { value: 'Guardian', label: 'Guardian' },
                      { value: 'Relative', label: 'Relative' }
                    ]}
                    {...editStudentForm.getInputProps('guardian_relation')}
                  />
                </SimpleGrid>

                <TextInput
                  label="Guardian Occupation"
                  placeholder="e.g. Businessman, Civil Servant, Teacher"
                  leftSection={<Briefcase size={15} />}
                  {...editStudentForm.getInputProps('guardian_occupation')}
                />

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput
                    type="tel"
                    label="Phone Number 1 *"
                    placeholder="e.g. 0771234567"
                    required
                    leftSection={<Phone size={15} />}
                    {...editStudentForm.getInputProps('guardian_phone')}
                  />

                  <TextInput
                    type="tel"
                    label="Phone Number 2 (Optional)"
                    placeholder="e.g. 0652245678"
                    leftSection={<Phone size={15} />}
                    {...editStudentForm.getInputProps('guardian_phone_2')}
                  />
                </SimpleGrid>

                <TextInput
                  type="email"
                  label="Guardian Email (Optional)"
                  placeholder="guardian@example.com"
                  leftSection={<Mail size={15} />}
                  {...editStudentForm.getInputProps('guardian_email')}
                />
              </Stack>
            </Paper>

            {/* Action Footer */}
            <Paper p="md" radius="lg" withBorder shadow="sm" style={{ background: 'var(--bg-card, #ffffff)' }}>
              <Group justify="space-between" align="center">
                <Button variant="default" size="md" onClick={() => handleAttemptLeaveEdit(() => setIsEditing(false))} disabled={savingEdit}>
                  Cancel
                </Button>

                <Group gap="sm">
                  <Button
                    variant="subtle"
                    size="md"
                    onClick={() => {
                      if (data?.student) {
                        editStudentForm.setValues({
                          admission_no: data.student.admission_no || '',
                          full_name: data.student.full_name || '',
                          name_with_initials: data.student.name_with_initials || '',
                          dob: data.student.dob || '',
                          gender: data.student.gender || 'Male',
                          address: data.student.address || '',
                          grade: String(data.student.grade || '6'),
                          class_id: data.student.class_id ? String(data.student.class_id) : '',
                          guardian_name: data.student.guardian_name || '',
                          guardian_relation: data.student.guardian_relation || 'Father',
                          guardian_occupation: data.student.guardian_occupation || '',
                          guardian_phone: data.student.guardian_phone || '',
                          guardian_phone_2: data.student.guardian_phone_2 || '',
                          guardian_email: data.student.guardian_email || '',
                        });
                      }
                    }}
                    disabled={savingEdit}
                  >
                    Reset Changes
                  </Button>
                  <Button
                    type="submit"
                    size="md"
                    color="blue"
                    loading={savingEdit || editStudentForm.submitting}
                    leftSection={<Save size={18} />}
                  >
                    Save Changes
                  </Button>
                </Group>
              </Group>
            </Paper>
          </Stack>
        </form>

        {/* Unsaved Changes Confirmation Modal */}
        <UnsavedChangesModal
          opened={showConfirmModal}
          onClose={handleCloseConfirmModal}
          onDiscard={handleConfirmDiscard}
          title="Discard Unsaved Student Edits?"
          message="You have unsaved modifications to this student record. Leaving now will discard all changes and revert back to the saved state."
        />
      </div>
    );
  }

  return (
    <div className="dossier-page">
      {/* Top Breadcrumb & Navigation */}
      <div className="dossier-nav-bar btn-no-print">
        <button
          type="button"
          onClick={onBack}
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
        >
          <ArrowLeft size={16} />
          <span>Back to Student Directory</span>
        </button>

        <div className="dossier-action-group">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-secondary btn-sm"
          >
            <Printer size={15} />
            <span>Print Student Dossier</span>
          </button>

          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                if (data?.student) {
                  const studentGrade = data.student.grade ? String(data.student.grade) : '6';
                  setSelectedGrade(studentGrade);
                  const studentVals = {
                    admission_no: data.student.admission_no || '',
                    full_name: data.student.full_name || '',
                    name_with_initials: data.student.name_with_initials || '',
                    dob: data.student.dob || '',
                    gender: data.student.gender || 'Male',
                    address: data.student.address || '',
                    grade: studentGrade,
                    class_id: data.student.class_id ? String(data.student.class_id) : '',
                    guardian_name: data.student.guardian_name || '',
                    guardian_relation: data.student.guardian_relation || 'Father',
                    guardian_occupation: data.student.guardian_occupation || '',
                    guardian_phone: data.student.guardian_phone || '',
                    guardian_phone_2: data.student.guardian_phone_2 || '',
                    guardian_email: data.student.guardian_email || '',
                  };
                  editStudentForm.setInitialValues(studentVals);
                  editStudentForm.setValues(studentVals);
                  editStudentForm.resetDirty();
                }
                setIsEditing(true);
              }}
              className="btn btn-primary btn-sm"
            >
              <Edit3 size={15} />
              <span>Edit Student Record</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Student Hero Card */}
      <div className="dossier-hero-card">
        <div className="dossier-hero-left">
          <div className="dossier-hero-title-row">
            <h2 className="dossier-heading-name">{student.name_with_initials || student.full_name}</h2>
          </div>

          <p className="dossier-sub-id">
            <span>Full Name:</span>
            <strong style={{ color: 'var(--text-main)' }}>{student.full_name}</strong>
            <span style={{ color: 'var(--text-muted)', margin: '0 0.35rem' }}>•</span>
            <span>Index No :</span>
            <strong style={{ color: 'var(--text-main)', fontWeight: 700 }}>{student.admission_no}</strong>
          </p>
        </div>

        {/* Attendance Rate Metric KPI Box */}
        <div className="dossier-kpi-box">
          <div
            className="dossier-kpi-value"
            style={{
              color: attRate >= 80 ? 'var(--stat-present-text, #16a34a)' : attRate >= 60 ? 'var(--stat-late-text, #d97706)' : 'var(--stat-absent-text, #dc2626)'
            }}
          >
            {attRate}%
          </div>
          <div className="dossier-kpi-labels">
            <span className="dossier-kpi-title">Attendance Rate</span>
            <span className="dossier-kpi-subtitle">
              {attendance?.present_days || 0} / {attendance?.total_days || 0} days recorded
            </span>
          </div>
        </div>
      </div>

      {/* 3-Column Information Cards */}
      <div className="dossier-info-grid">
        {/* Card 1: Personal & Demographic Information */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <User size={18} style={{ color: 'var(--primary, #2563eb)' }} />
              <span>Personal & Demographic Information</span>
            </h3>
          </div>

          <div className="dossier-data-list">
            <div className="dossier-data-row">
              <span className="dossier-data-label">Full Name:</span>
              <span className="dossier-data-value">{student.full_name}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Name with Initials:</span>
              <span className="dossier-data-value">{student.name_with_initials || '—'}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Index No:</span>
              <span className="dossier-data-value" style={{ color: 'var(--primary, #2563eb)', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>
                {student.admission_no}
              </span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Date of Birth:</span>
              <span className="dossier-data-value">{student.dob} ({calculateAge(student.dob)})</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Gender:</span>
              <span className="dossier-data-value">{student.gender}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Enrollment Status:</span>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge ${student.status === 'Active' ? 'badge-present' : 'badge-absent'}`}>
                  {student.status}
                </span>
              </div>
            </div>

            <div className="dossier-data-row" style={{ alignItems: 'flex-start' }}>
              <span className="dossier-data-label">Residential Address:</span>
              <div className="dossier-data-value" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: '0.35rem' }}>
                <MapPin size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />
                <span>{student.address || 'No residential address on file'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Guardian Contacts */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <Shield size={18} style={{ color: '#16a34a' }} />
              <span>Guardian Contacts</span>
            </h3>
          </div>

          <div className="dossier-data-list">
            <div className="dossier-data-row">
              <span className="dossier-data-label">Guardian Name:</span>
              <span className="dossier-data-value">{student.guardian_name}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Relationship:</span>
              <span className="dossier-data-value">{student.guardian_relation}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Occupation:</span>
              <span className="dossier-data-value">{student.guardian_occupation || 'Not specified'}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Phone 1 (Primary):</span>
              <div style={{ textAlign: 'right' }}>
                <a
                  href={`tel:${student.guardian_phone}`}
                  className="dossier-action-link"
                >
                  <Phone size={13} />
                  <span>{student.guardian_phone}</span>
                </a>
              </div>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Phone 2 (Secondary):</span>
              <div style={{ textAlign: 'right' }}>
                {student.guardian_phone_2 ? (
                  <a
                    href={`tel:${student.guardian_phone_2}`}
                    className="dossier-action-link secondary"
                  >
                    <Phone size={13} />
                    <span>{student.guardian_phone_2}</span>
                  </a>
                ) : (
                  <span className="dossier-data-value" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Not provided</span>
                )}
              </div>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Guardian Email:</span>
              <div style={{ textAlign: 'right' }}>
                {student.guardian_email ? (
                  <a
                    href={`mailto:${student.guardian_email}`}
                    className="dossier-action-link"
                  >
                    <Mail size={13} />
                    <span>{student.guardian_email}</span>
                  </a>
                ) : (
                  <span className="dossier-data-value" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Not provided</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Classroom & Academic Placement */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <School size={18} style={{ color: '#7c3aed' }} />
              <span>Classroom & Academic Placement</span>
            </h3>
          </div>

          <div className="dossier-data-list">
            <div className="dossier-data-row">
              <span className="dossier-data-label">Assigned Class:</span>
              <span className="dossier-data-value" style={{ color: 'var(--primary, #2563eb)' }}>
                {student.class_name || 'Grade 8-A'}
              </span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Grade Level:</span>
              <span className="dossier-data-value">Grade {student.grade || 8}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Class Teacher:</span>
              <span className="dossier-data-value">
                {student.class_teacher_name || 'Mrs. Nimali Jayasinghe'}
              </span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Roll Number:</span>
              <span className="dossier-data-value" style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>
                #{student.roll_number || '—'}
              </span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Current Academic Year:</span>
              <span className="dossier-data-value">{student.academic_year || '2026'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Attendance History Log: Annual Contribution Heatmap (like GitHub) */}
      <AttendanceContributionHeatmap
        history={attendance?.history || []}
        academicYear={student?.academic_year_name || '2026'}
        stats={attendance}
      />
    </div>
  );
};

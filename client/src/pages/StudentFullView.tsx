import React, { useState, useEffect, useMemo } from 'react';
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
  ChevronDown,
  ChevronUp
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
  Tooltip
} from '@mantine/core';
import { useForm, isNotEmpty } from '@mantine/form';
import { api } from '../api/client';
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
  const [showTable, setShowTable] = useState(false);
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

  // Compute 53 calendar weeks for the year (Sunday to Saturday rows)
  const { weeks, monthLabels } = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDate = new Date(year, 0, 1);
    const firstDayOfWeek = startDate.getDay(); // 0 is Sunday
    const gridStart = new Date(year, 0, 1 - firstDayOfWeek);
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

    while (curr <= endDate || curr.getDay() !== 0) {
      const dateStr = `${curr.getFullYear()}-${pad(curr.getMonth() + 1)}-${pad(curr.getDate())}`;
      const inYear = curr.getFullYear() === year;
      const month = curr.getMonth();
      const dayOfMonth = curr.getDate();
      const dayOfWeek = curr.getDay();

      if (dayOfWeek === 0) {
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
      {/* Header */}
      <div className="att-contrib-header">
        <div>
          <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700 }}>Daily Attendance History Log</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
            Annual roll-call contribution for Academic Year {academicYear} &middot; Green: Present &middot; Red: Absent
          </p>
        </div>

        <Group gap="xs">
          <Badge color="green" variant="light" size="sm">
            {stats?.present_days ?? history.filter((h) => h.status === 'present').length} Present
          </Badge>
          <Badge color="red" variant="light" size="sm">
            {stats?.absent_days ?? history.filter((h) => h.status === 'absent').length} Absent
          </Badge>
          {((stats?.late_days ?? 0) > 0 || history.some((h) => h.status === 'late')) && (
            <Badge color="yellow" variant="light" size="sm">
              {stats?.late_days ?? history.filter((h) => h.status === 'late').length} Late
            </Badge>
          )}
          <Badge color="blue" variant="outline" size="sm">
            {stats?.attendanceRate ?? 100}% Rate
          </Badge>
        </Group>
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
                  style={{ left: `${m.colIdx * 14}px` }}
                >
                  {m.name}
                </span>
              ))}
            </div>

            {/* Main Day Graph */}
            <div className="att-contrib-main">
              {/* Day Axis (Sun to Sat) */}
              <div className="att-contrib-days-axis" aria-hidden="true">
                <span className="att-contrib-day-label" />
                <span className="att-contrib-day-label">Mon</span>
                <span className="att-contrib-day-label" />
                <span className="att-contrib-day-label">Wed</span>
                <span className="att-contrib-day-label" />
                <span className="att-contrib-day-label">Fri</span>
                <span className="att-contrib-day-label" />
              </div>

              {/* 53 Week Columns */}
              <div className="att-contrib-weeks" role="grid" aria-label="Annual Attendance Contribution Heatmap">
                {weeks.map((week, wIdx) => (
                  <div key={wIdx} className="att-contrib-week-col" role="row">
                    {week.map((cell) => {
                      const record = attendanceMap.get(cell.dateStr);
                      const isWeekend = cell.dayOfWeek === 0 || cell.dayOfWeek === 6;
                      const isFuture = cell.dateStr > todayStr;

                      let cellStatusClass = 'empty';
                      if (!cell.inYear) {
                        cellStatusClass = 'out-of-year';
                      } else if (record) {
                        cellStatusClass = record.status; // 'present', 'absent', 'late', 'excused'
                      } else if (isWeekend) {
                        cellStatusClass = 'weekend';
                      }

                      const dateFormatted = cell.dateObj.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });

                      const tooltipContent = (
                        <div style={{ fontSize: '0.75rem', lineHeight: 1.4, textAlign: 'left' }}>
                          <div style={{ fontWeight: 700 }}>{dateFormatted}</div>
                          {record ? (
                            <>
                              <div
                                style={{
                                  color:
                                    record.status === 'present'
                                      ? '#4ade80'
                                      : record.status === 'absent'
                                      ? '#f87171'
                                      : record.status === 'late'
                                      ? '#fbbf24'
                                      : '#c084fc',
                                  fontWeight: 600,
                                  textTransform: 'capitalize'
                                }}
                              >
                                {record.status} {record.class_name ? `• ${record.class_name}` : ''}
                              </div>
                              {record.remarks && (
                                <div style={{ color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic', fontSize: '0.7rem' }}>
                                  &ldquo;{record.remarks}&rdquo;
                                </div>
                              )}
                            </>
                          ) : isWeekend ? (
                            <div style={{ color: 'var(--text-muted, #94a3b8)' }}>Weekend (No School)</div>
                          ) : isFuture ? (
                            <div style={{ color: 'var(--text-muted, #94a3b8)' }}>Future Date</div>
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
                          openDelay={80}
                        >
                          <div
                            className={`att-contrib-cell ${cellStatusClass}`}
                            tabIndex={0}
                            role="gridcell"
                            aria-label={`${cell.dateStr}: ${record?.status || (isWeekend ? 'weekend' : 'no session')}`}
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
        <Text size="xs" c="dimmed">
          Tracked across {stats?.total_days || history.length} school days in {academicYear}
        </Text>

        <div className="att-contrib-legend">
          <span>Less</span>
          <span className="att-contrib-legend-item">
            <span
              className="att-contrib-legend-chip"
              style={{ background: 'var(--contrib-empty, #e2e8f0)', border: '1px solid var(--contrib-border, #cbd5e1)' }}
            />
          </span>
          <span className="att-contrib-legend-item">
            <span className="att-contrib-legend-chip" style={{ background: '#f59e0b' }} />
            <span>Late</span>
          </span>
          <span className="att-contrib-legend-item">
            <span className="att-contrib-legend-chip" style={{ background: '#ef4444' }} />
            <span>Absent</span>
          </span>
          <span className="att-contrib-legend-item">
            <span className="att-contrib-legend-chip" style={{ background: '#22c55e' }} />
            <span>Present</span>
          </span>
          <span>More</span>
        </div>
      </div>

      {/* Optional Detailed Roll-Call Table Toggle */}
      {history.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-color)', padding: '0.65rem 1.25rem', background: 'var(--bg-card)' }}>
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">
              Need individual teacher remarks or timestamp logs?
            </Text>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setShowTable((prev) => !prev)}
              leftSection={showTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            >
              {showTable ? 'Hide Detailed Table' : `View Detailed Table (${history.length} Entries)`}
            </Button>
          </Group>

          {showTable && (
            <div className="table-responsive" style={{ maxHeight: '240px', marginTop: '0.75rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Class</th>
                    <th>Attendance Status</th>
                    <th>Reason / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h: any, idx: number) => {
                    let badge = 'badge-present';
                    if (h.status === 'absent') badge = 'badge-absent';
                    if (h.status === 'late') badge = 'badge-late';
                    if (h.status === 'excused') badge = 'badge-excused';

                    return (
                      <tr key={idx}>
                        <td><strong>{h.date}</strong></td>
                        <td>{h.class_name}</td>
                        <td>
                          <span className={`badge ${badge}`} style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                            {h.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                          {h.remarks || 'Normal attendance'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface StudentFullViewProps {
  studentId: number;
  onBack: () => void;
  user: any;
  onStudentUpdated?: () => void;
}

export const StudentFullView: React.FC<StudentFullViewProps> = ({
  studentId,
  onBack,
  user,
  onStudentUpdated
}) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State powered by @mantine/form
  const [showEditModal, setShowEditModal] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const editStudentForm = useForm({
    mode: 'uncontrolled',
    initialValues: {
      full_name: '',
      calling_name: '',
      dob: '',
      gender: 'Male',
      address: '',
      class_id: '',
      roll_number: '',
      guardian: {
        name: '',
        relation: 'Father',
        phone: '',
        email: '',
      },
    },
    validate: {
      full_name: isNotEmpty('Full name is required'),
      calling_name: isNotEmpty('Calling name is required'),
      dob: isNotEmpty('Date of birth is required'),
      'guardian.name': isNotEmpty('Guardian name is required'),
      'guardian.relation': isNotEmpty('Guardian relation is required'),
      'guardian.phone': isNotEmpty('Guardian phone is required'),
    },
    transformValues: (values) => ({
      full_name: values.full_name.trim(),
      calling_name: values.calling_name.trim(),
      dob: values.dob,
      gender: values.gender,
      address: values.address.trim(),
      class_id: values.class_id ? Number(values.class_id) : null,
      roll_number: values.roll_number ? Number(values.roll_number) : null,
      guardian_name: values.guardian.name.trim(),
      guardian_relation: values.guardian.relation.trim(),
      guardian_phone: values.guardian.phone.trim(),
      guardian_email: values.guardian.email.trim(),
    }),
  });

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
      editStudentForm.setValues({
        full_name: res.student.full_name || '',
        calling_name: res.student.calling_name || '',
        dob: res.student.dob || '',
        gender: res.student.gender || 'Male',
        address: res.student.address || '',
        class_id: res.student.class_id ? String(res.student.class_id) : '',
        roll_number: res.student.roll_number ? String(res.student.roll_number) : '',
        guardian: {
          name: res.student.guardian_name || '',
          relation: res.student.guardian_relation || 'Father',
          phone: res.student.guardian_phone || '',
          email: res.student.guardian_email || '',
        },
      });
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
      setShowEditModal(false);
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
              onClick={() => setShowEditModal(true)}
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
          <div
            className="dossier-avatar"
            style={{
              background: isFemale
                ? 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)'
                : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
            }}
            aria-hidden="true"
          >
            {student.calling_name?.charAt(0) || student.full_name?.charAt(0) || 'S'}
          </div>

          <div className="dossier-hero-identity">
            <div className="dossier-name-row">
              <h2 className="dossier-full-name">{student.full_name}</h2>
              <span
                className={`badge ${
                  student.status === 'Active'
                    ? 'badge-present'
                    : student.status === 'Transferred'
                    ? 'badge-late'
                    : 'badge-absent'
                }`}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem', fontWeight: 700 }}
              >
                {student.status}
              </span>
            </div>

            <p className="dossier-sub-id">
              Calling Name: <strong style={{ color: 'var(--text-main)' }}>{student.calling_name}</strong> • Permanent Admission ID:{' '}
              <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>
                {student.admission_no}
              </strong>
            </p>

            <div className="dossier-badges-row">
              <span className="dossier-pill">
                <School size={13} style={{ color: 'var(--primary)' }} />
                <span>{student.class_name || 'Class Unassigned'}</span>
              </span>

              {student.roll_number && (
                <span className="dossier-pill">
                  Roll #{student.roll_number}
                </span>
              )}

              <span className="dossier-pill">
                {student.gender}
              </span>

              <span className="dossier-pill">
                <Calendar size={13} />
                <span>DOB: {student.dob} {calculateAge(student.dob) ? `(${calculateAge(student.dob)})` : ''}</span>
              </span>

              <span className="dossier-pill">
                Year: {student.academic_year || '2026'}
              </span>
            </div>
          </div>
        </div>

        {/* Key Attendance Metric Box */}
        <div className="dossier-kpi-box">
          <div
            className="dossier-kpi-value"
            style={{
              color: attRate >= 80 ? 'var(--present)' : attRate >= 60 ? 'var(--late)' : 'var(--absent)'
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

      {/* Grid of Information Sections */}
      <div className="dossier-grid">
        {/* Card 1: Personal & Demographic Information */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <User size={18} style={{ color: 'var(--primary)' }} />
              <span>Personal & Demographic Information</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Official Registry</span>
          </div>

          <div className="dossier-data-list">
            <div className="dossier-data-row">
              <span className="dossier-data-label">Full Name:</span>
              <span className="dossier-data-value">{student.full_name}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Calling Name:</span>
              <span className="dossier-data-value">{student.calling_name}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Permanent Admission No:</span>
              <span className="dossier-data-value" style={{ color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>
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
              <span className={`badge ${student.status === 'Active' ? 'badge-present' : 'badge-absent'}`}>
                {student.status}
              </span>
            </div>

            <div className="dossier-data-row" style={{ alignItems: 'flex-start' }}>
              <span className="dossier-data-label">Residential Address:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                <MapPin size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span>{student.address || 'No residential address on file'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Guardian & Emergency Contacts */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <Shield size={18} style={{ color: 'var(--present)' }} />
              <span>Guardian & Emergency Contacts</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Verified Contact</span>
          </div>

          <div className="dossier-data-list">
            <div className="dossier-data-row">
              <span className="dossier-data-label">Primary Guardian:</span>
              <span className="dossier-data-value">{student.guardian_name}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Relationship:</span>
              <span className="dossier-data-value">{student.guardian_relation}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Guardian Telephone:</span>
              <a
                href={`tel:${student.guardian_phone}`}
                className="btn btn-secondary btn-sm"
                style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Phone size={13} />
                <strong>{student.guardian_phone}</strong>
              </a>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Guardian Email:</span>
              <span className="dossier-data-value">
                {student.guardian_email ? (
                  <a href={`mailto:${student.guardian_email}`} style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Mail size={12} /> {student.guardian_email}
                  </a>
                ) : (
                  'Not provided'
                )}
              </span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">National Identity Card (NIC):</span>
              <span className="dossier-data-value">{student.guardian_nic || 'Not registered'}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Emergency Contact:</span>
              <span className="dossier-data-value">{student.emergency_contact || student.guardian_phone}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Classroom & Academic Placement */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <School size={18} style={{ color: 'var(--excused)' }} />
              <span>Classroom & Academic Placement</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Curriculum Assignment</span>
          </div>

          <div className="dossier-data-list">
            <div className="dossier-data-row">
              <span className="dossier-data-label">Assigned Class:</span>
              <strong className="dossier-data-value">{student.class_name || 'Grade 8-A'}</strong>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Grade Level:</span>
              <span className="dossier-data-value">Grade {student.grade || 8}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Class Teacher:</span>
              <strong className="dossier-data-value">{student.class_teacher_name || 'Mrs. Nimali Jayasinghe'}</strong>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Roll Number:</span>
              <strong className="dossier-data-value">#{student.roll_number || '1'}</strong>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Current Academic Year:</span>
              <span className="dossier-data-value">{student.academic_year || '2026'}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Attendance Summary Statistics */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <CheckCircle2 size={18} style={{ color: 'var(--present)' }} />
              <span>Attendance Statistics</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Term Attendance Metrics</span>
          </div>

          <div className="dossier-att-grid">
            <div className="dossier-att-stat">
              <div className="dossier-att-count" style={{ color: 'var(--present)' }}>
                {attendance?.present_days || 0}
              </div>
              <div className="dossier-att-label">Days Present</div>
            </div>

            <div className="dossier-att-stat">
              <div className="dossier-att-count" style={{ color: 'var(--absent)' }}>
                {attendance?.absent_days || 0}
              </div>
              <div className="dossier-att-label">Days Absent</div>
            </div>

            <div className="dossier-att-stat">
              <div className="dossier-att-count" style={{ color: 'var(--late)' }}>
                {attendance?.late_days || 0}
              </div>
              <div className="dossier-att-label">Days Late</div>
            </div>

            <div className="dossier-att-stat">
              <div className="dossier-att-count" style={{ color: 'var(--excused)' }}>
                {attendance?.excused_days || 0}
              </div>
              <div className="dossier-att-label">Days Excused</div>
            </div>
          </div>

          <div
            style={{
              padding: '0.65rem 0.9rem',
              borderRadius: 'var(--radius-md)',
              background: attRate >= 80 ? 'var(--present-bg)' : 'var(--absent-bg)',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              border: `1px solid ${attRate >= 80 ? 'var(--present-border)' : 'var(--absent-border)'}`
            }}
          >
            <CheckCircle2 size={16} color="var(--primary)" />
            <span>Cumulative Term Attendance Rate: {attRate}%</span>
          </div>
        </div>
      </div>

      {/* Daily Attendance History Log: Annual Contribution Heatmap (like GitHub) */}
      <AttendanceContributionHeatmap
        history={attendance?.history || []}
        academicYear={student?.academic_year_name || '2026'}
        stats={attendance}
      />

      {/* Edit Student Modal powered by @mantine/form */}
      <Modal
        opened={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={
          <Group gap="xs">
            <Edit3 size={18} color="var(--primary, #2563eb)" />
            <Text fw={650} size="md">Edit Student Record</Text>
          </Group>
        }
        size="lg"
        radius="md"
        centered
      >
        <form onSubmit={handleEditSubmit}>
          <Stack gap="md">
            {editError && (
              <Alert icon={<AlertCircle size={16} />} color="red" radius="md">
                {editError}
              </Alert>
            )}

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                label="Calling Name"
                placeholder="e.g. Kasun"
                required
                key={editStudentForm.key('calling_name')}
                {...editStudentForm.getInputProps('calling_name')}
              />

              <TextInput
                label="Full Name"
                placeholder="e.g. Kasun Malinda Ranasinghe"
                required
                key={editStudentForm.key('full_name')}
                {...editStudentForm.getInputProps('full_name')}
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                type="date"
                label="Date of Birth"
                required
                key={editStudentForm.key('dob')}
                {...editStudentForm.getInputProps('dob')}
              />

              <Select
                label="Gender"
                required
                data={[
                  { value: 'Male', label: 'Male' },
                  { value: 'Female', label: 'Female' },
                  { value: 'Other', label: 'Other' },
                ]}
                key={editStudentForm.key('gender')}
                {...editStudentForm.getInputProps('gender')}
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Select
                label="Class Assignment"
                placeholder="Select Class"
                clearable
                data={classes.map((c) => ({ value: String(c.id), label: c.name }))}
                key={editStudentForm.key('class_id')}
                {...editStudentForm.getInputProps('class_id')}
              />

              <TextInput
                type="number"
                label="Roll Number"
                placeholder="e.g. 21"
                key={editStudentForm.key('roll_number')}
                {...editStudentForm.getInputProps('roll_number')}
              />
            </SimpleGrid>

            <TextInput
              label="Residential Address"
              placeholder="Home address"
              key={editStudentForm.key('address')}
              {...editStudentForm.getInputProps('address')}
            />

            <Divider my="xs" label="Guardian Contacts (Nested Fields)" labelPosition="left" />

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                label="Guardian Name"
                placeholder="Parent / Guardian name"
                required
                key={editStudentForm.key('guardian.name')}
                {...editStudentForm.getInputProps('guardian.name')}
              />

              <TextInput
                label="Relation"
                placeholder="Father / Mother / Guardian"
                required
                key={editStudentForm.key('guardian.relation')}
                {...editStudentForm.getInputProps('guardian.relation')}
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                type="tel"
                label="Guardian Phone"
                placeholder="e.g. 0771234567"
                required
                key={editStudentForm.key('guardian.phone')}
                {...editStudentForm.getInputProps('guardian.phone')}
              />

              <TextInput
                type="email"
                label="Guardian Email"
                placeholder="guardian@example.com"
                key={editStudentForm.key('guardian.email')}
                {...editStudentForm.getInputProps('guardian.email')}
              />
            </SimpleGrid>

            <Group justify="flex-end" gap="sm" mt="md">
              <Button variant="default" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button type="submit" color="refinedBlue" loading={savingEdit || editStudentForm.submitting}>
                Save Updates
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </div>
  );
};

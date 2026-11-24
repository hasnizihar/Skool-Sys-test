import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Phone,
  CheckCircle,
  AlertCircle,
  Clock,
  Printer,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  FileSpreadsheet,
  Users,
  Search,
  Filter,
  RotateCcw,
  CalendarCheck,
  X
} from 'lucide-react';
import {
  Paper,
  Badge,
  Button,
  Group,
  Stack,
  Text,
  Title,
  SimpleGrid,
  ScrollArea,
  Progress,
  Tooltip,
  Box
} from '@mantine/core';
import { api } from '../api/client';
import { getColomboCivilDate } from '../utils/dateUtils';
import { LoadingState, EmptyState } from '../ui/mantine';
import './attendanceReports.css';

export const AttendanceReports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(getColomboCivilDate());

  // Daily Report State
  const [dailyData, setDailyData] = useState<any | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(false);

  // Section & Grade Filter State
  const [sections, setSections] = useState<any[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');

  // Monthly Report State
  const [classes, setClasses] = useState<any[]>([]);
  const [monthlyClassId, setMonthlyClassId] = useState<number | null>(null);
  const [monthlyYear, setMonthlyYear] = useState<number>(2026);
  const [monthlyMonth, setMonthlyMonth] = useState<number>(10);
  const [monthlyData, setMonthlyData] = useState<any | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  useEffect(() => {
    loadClasses();
    loadSections();
  }, []);

  const loadSections = async () => {
    try {
      const res = await api.getSections();
      if (res?.sections) {
        setSections(res.sections);
      }
    } catch (err) {
      console.error('Failed to load sections:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'daily') {
      loadDailyReport(selectedDate);
    }
  }, [activeTab, selectedDate]);

  useEffect(() => {
    if (activeTab === 'monthly' && monthlyClassId) {
      loadMonthlyReport(monthlyClassId, monthlyYear, monthlyMonth);
    }
  }, [activeTab, monthlyClassId, monthlyYear, monthlyMonth]);

  const loadClasses = async () => {
    try {
      const res = await api.getClasses();
      const cls = res.classes || [];
      setClasses(cls);
      if (cls.length > 0 && !monthlyClassId) {
        setMonthlyClassId(cls[0].id);
      }
    } catch (err) {
      console.error('Failed to load classes:', err);
    }
  };

  const loadDailyReport = async (date: string) => {
    try {
      setLoadingDaily(true);
      const res = await api.getDailyAttendanceReport(date);
      setDailyData(res);
    } catch (err) {
      console.error('Failed to load daily report:', err);
    } finally {
      setLoadingDaily(false);
    }
  };

  const loadMonthlyReport = async (classId: number, year: number, month: number) => {
    try {
      setLoadingMonthly(true);
      const res = await api.getMonthlyAttendanceReport(classId, year, month);
      setMonthlyData(res);
    } catch (err) {
      console.error('Failed to load monthly report:', err);
    } finally {
      setLoadingMonthly(false);
    }
  };

  const shiftDate = (days: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    const target = dt.toISOString().slice(0, 10);
    const today = getColomboCivilDate();
    if (days > 0 && target > today) return;
    setSelectedDate(target);
  };

  const jumpToToday = () => {
    setSelectedDate(getColomboCivilDate());
  };

  const isToday = selectedDate === getColomboCivilDate();

  // Dynamic list of unique grades derived from classes
  const availableGrades = useMemo(() => {
    const gradeSet = new Set<number>();
    const targetClasses =
      selectedSection === 'all'
        ? classes
        : classes.filter((c) => String(c.section_id) === String(selectedSection));

    targetClasses.forEach((c) => {
      if (c.grade !== undefined && c.grade !== null) {
        gradeSet.add(Number(c.grade));
      }
    });

    if (dailyData?.classes) {
      dailyData.classes.forEach((c: any) => {
        const classInfo = classes.find((cl) => cl.id === c.class_id);
        const secId = c.section_id ?? classInfo?.section_id;
        if (selectedSection === 'all' || String(secId) === String(selectedSection)) {
          const g = c.grade ?? classInfo?.grade;
          if (g !== undefined && g !== null) {
            gradeSet.add(Number(g));
          }
        }
      });
    }

    return Array.from(gradeSet).sort((a, b) => a - b);
  }, [classes, dailyData?.classes, selectedSection]);

  // Reset selectedGrade if selected section doesn't have it
  useEffect(() => {
    if (selectedGrade !== 'all' && availableGrades.length > 0 && !availableGrades.includes(Number(selectedGrade))) {
      setSelectedGrade('all');
    }
  }, [availableGrades, selectedGrade]);

  // Filtered classes based on section and grade filters
  const filteredClasses = useMemo(() => {
    if (!dailyData?.classes) return [];
    return dailyData.classes.filter((c: any) => {
      const classInfo = classes.find((cl) => cl.id === c.class_id);
      const secId = c.section_id ?? classInfo?.section_id;
      const g = c.grade ?? classInfo?.grade;

      if (selectedSection !== 'all' && String(secId) !== String(selectedSection)) {
        return false;
      }
      if (selectedGrade !== 'all' && String(g) !== String(selectedGrade)) {
        return false;
      }
      return true;
    });
  }, [dailyData?.classes, classes, selectedSection, selectedGrade]);

  // Filtered absent students based on section and grade filters
  const filteredAbsentStudents = useMemo(() => {
    if (!dailyData?.absentStudents) return [];
    return dailyData.absentStudents.filter((st: any) => {
      const classInfo = classes.find((cl) => cl.name === st.class_name || cl.id === st.class_id);
      const secId = st.section_id ?? classInfo?.section_id;
      const g = st.grade ?? classInfo?.grade;

      if (selectedSection !== 'all' && String(secId) !== String(selectedSection)) {
        return false;
      }
      if (selectedGrade !== 'all' && String(g) !== String(selectedGrade)) {
        return false;
      }
      return true;
    });
  }, [dailyData?.absentStudents, classes, selectedSection, selectedGrade]);

  // Monthly classes filtered by section and grade
  const monthlyFilteredClasses = useMemo(() => {
    return classes.filter((c) => {
      if (selectedSection !== 'all' && String(c.section_id) !== String(selectedSection)) {
        return false;
      }
      if (selectedGrade !== 'all' && String(c.grade) !== String(selectedGrade)) {
        return false;
      }
      return true;
    });
  }, [classes, selectedSection, selectedGrade]);

  useEffect(() => {
    if (monthlyFilteredClasses.length > 0) {
      const exists = monthlyFilteredClasses.some((c) => c.id === monthlyClassId);
      if (!exists) {
        setMonthlyClassId(monthlyFilteredClasses[0].id);
      }
    }
  }, [monthlyFilteredClasses, monthlyClassId]);

  // Calculate daily totals based on filtered classes
  let totalEnrolled = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLate = 0;
  let recordedSessions = 0;

  filteredClasses.forEach((c: any) => {
    totalEnrolled += Number(c.enrolled_count || 0);
    if (c.session_id) {
      recordedSessions++;
      totalPresent += Number(c.present_count || 0);
      totalAbsent += Number(c.absent_count || 0);
      totalLate += Number(c.late_count || 0);
    }
  });

  const schoolPercentage =
    recordedSessions > 0 && totalEnrolled > 0
      ? Math.round(((totalPresent + totalLate) / totalEnrolled) * 100)
      : null;

  return (
    <div className="attendance-reports-page">
      {/* Top Header */}
      <Paper p="md" radius="lg" withBorder shadow="xs" className="reports-header-card">
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <div className="reports-header-titles">
            <Title order={2} className="reports-title">
              Attendance Reports & Registry
            </Title>
            <Text size="sm" c="dimmed" className="reports-subtitle">
              Daily breakdown, absent student follow-up directory, and monthly attendance matrix.
            </Text>
          </div>

          <Group gap="sm" wrap="wrap" className="reports-actions">
            <div className="reports-view-toggle">
              <button
                type="button"
                onClick={() => setActiveTab('daily')}
                className={`reports-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
              >
                Daily Summary
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('monthly')}
                className={`reports-tab-btn ${activeTab === 'monthly' ? 'active' : ''}`}
              >
                Monthly Register
              </button>
            </div>

            <Button
              variant="default"
              size="sm"
              leftSection={<Printer size={15} />}
              onClick={() => window.print()}
              className="btn-no-print"
              title="Print report"
            >
              Print Report
            </Button>
          </Group>
        </Group>
      </Paper>

      {/* View Switcher & Toolbar Card */}
      <Paper p="md" radius="lg" withBorder shadow="xs" className="reports-toolbar-card">
        <div className="reports-toolbar-row">
          {activeTab === 'daily' ? (
            <>
              <div className="reports-daily-filters">
                <div className="reports-control-group">
                  <label className="reports-control-label">Report Date</label>
                  <div className="reports-date-picker-wrap">
                    <div className="reports-date-input-wrap">
                      <Calendar size={15} className="reports-date-icon" />
                      <input
                        type="date"
                        className="form-input reports-date-input"
                        value={selectedDate}
                        max={getColomboCivilDate()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val || val > getColomboCivilDate()) return;
                          setSelectedDate(val);
                        }}
                      />
                    </div>
                    <div className="reports-date-stepper">
                      <button
                        type="button"
                        className="reports-step-btn"
                        onClick={() => shiftDate(-1)}
                        title="Previous Day"
                        aria-label="Previous Day"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <button
                        type="button"
                        className={`reports-today-btn ${isToday ? 'active' : ''}`}
                        onClick={jumpToToday}
                        title="Jump to Current Date"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        className="reports-step-btn"
                        disabled={selectedDate >= getColomboCivilDate()}
                        onClick={() => shiftDate(1)}
                        title={selectedDate >= getColomboCivilDate() ? 'Future dates cannot be selected' : 'Next Day'}
                        aria-label="Next Day"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="reports-control-group" style={{ minWidth: 170 }}>
                  <label className="reports-control-label">Section</label>
                  <select
                    className="form-select reports-select"
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    aria-label="Filter by Section"
                  >
                    <option value="all">All Sections</option>
                    {sections.map((sec) => (
                      <option key={sec.id} value={String(sec.id)}>
                        {sec.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="reports-control-group" style={{ minWidth: 130 }}>
                  <label className="reports-control-label">Grade</label>
                  <select
                    className="form-select reports-select"
                    value={selectedGrade}
                    onChange={(e) => setSelectedGrade(e.target.value)}
                    aria-label="Filter by Grade"
                  >
                    <option value="all">All Grades</option>
                    {availableGrades.map((g) => (
                      <option key={g} value={String(g)}>
                        Grade {g}
                      </option>
                    ))}
                  </select>
                </div>

                {(selectedSection !== 'all' || selectedGrade !== 'all') && (
                  <div className="reports-control-group" style={{ alignSelf: 'flex-end' }}>
                    <button
                      type="button"
                      className="reports-clear-filter-btn"
                      onClick={() => {
                        setSelectedSection('all');
                        setSelectedGrade('all');
                      }}
                      title="Reset filters"
                    >
                      <X size={13} />
                      <span>Clear Filters</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="reports-monthly-controls">
              <div className="reports-control-group" style={{ minWidth: 170 }}>
                <label className="reports-control-label">Section</label>
                <select
                  className="form-select reports-select"
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  aria-label="Filter by Section"
                >
                  <option value="all">All Sections</option>
                  {sections.map((sec) => (
                    <option key={sec.id} value={String(sec.id)}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="reports-control-group" style={{ minWidth: 130 }}>
                <label className="reports-control-label">Grade</label>
                <select
                  className="form-select reports-select"
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  aria-label="Filter by Grade"
                >
                  <option value="all">All Grades</option>
                  {availableGrades.map((g) => (
                    <option key={g} value={String(g)}>
                      Grade {g}
                    </option>
                  ))}
                </select>
              </div>

              {(selectedSection !== 'all' || selectedGrade !== 'all') && (
                <div className="reports-control-group" style={{ alignSelf: 'flex-end' }}>
                  <button
                    type="button"
                    className="reports-clear-filter-btn"
                    onClick={() => {
                      setSelectedSection('all');
                      setSelectedGrade('all');
                    }}
                    title="Reset filters"
                  >
                    <X size={13} />
                    <span>Clear Filters</span>
                  </button>
                </div>
              )}

              <div className="reports-control-group" style={{ flex: '1 1 200px' }}>
                <label className="reports-control-label">Select Class</label>
                <select
                  className="form-select reports-select"
                  value={monthlyClassId || ''}
                  onChange={(e) => setMonthlyClassId(Number(e.target.value))}
                >
                  {monthlyFilteredClasses.length === 0 ? (
                    <option value="" disabled>No classes in filter</option>
                  ) : (
                    monthlyFilteredClasses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))
                  )}
                </select>
              </div>

              <div className="reports-control-group" style={{ flex: '0 0 140px' }}>
                <label className="reports-control-label">Month</label>
                <select
                  className="form-select reports-select"
                  value={monthlyMonth}
                  onChange={(e) => setMonthlyMonth(Number(e.target.value))}
                >
                  <option value={1}>January</option>
                  <option value={2}>February</option>
                  <option value={3}>March</option>
                  <option value={4}>April</option>
                  <option value={5}>May</option>
                  <option value={6}>June</option>
                  <option value={7}>July</option>
                  <option value={8}>August</option>
                  <option value={9}>September</option>
                  <option value={10}>October</option>
                  <option value={11}>November</option>
                  <option value={12}>December</option>
                </select>
              </div>

              <div className="reports-control-group" style={{ flex: '0 0 120px' }}>
                <label className="reports-control-label">Year</label>
                <select
                  className="form-select reports-select"
                  value={monthlyYear}
                  onChange={(e) => setMonthlyYear(Number(e.target.value))}
                >
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </Paper>

      {activeTab === 'daily' && (
        <>
          {loadingDaily ? (
            <LoadingState message="Compiling daily attendance report..." minHeight={200} />
          ) : (
            <>
              {/* Daily Summary Stats Grid */}
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                {/* 1. Overall Attendance */}
                <Paper p="md" radius="lg" withBorder shadow="xs" className="stat-card reports-stat-card">
                  <div className="stat-card-header">
                    <span className="stat-card-label">Overall Attendance</span>
                    <div className="stat-card-icon-badge stat-card-icon--green">
                      <CheckCircle size={17} />
                    </div>
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-card-value">
                      {schoolPercentage !== null ? `${schoolPercentage}%` : '—'}
                    </div>
                    <div className="stat-card-subtext">
                      {schoolPercentage !== null
                        ? `${totalPresent} / ${totalEnrolled} Pupils present`
                        : 'No attendance recorded'}
                    </div>
                  </div>
                </Paper>

                {/* 2. Students Present */}
                <Paper p="md" radius="lg" withBorder shadow="xs" className="stat-card reports-stat-card">
                  <div className="stat-card-header">
                    <span className="stat-card-label">Students Present</span>
                    <div className="stat-card-icon-badge stat-card-icon--blue">
                      <UserCheck size={17} />
                    </div>
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-card-value stat-card-value--blue">
                      {totalPresent}
                    </div>
                    <div className="stat-card-subtext">
                      Confirmed in classrooms
                    </div>
                  </div>
                </Paper>

                {/* 3. Students Absent */}
                <Paper p="md" radius="lg" withBorder shadow="xs" className="stat-card reports-stat-card">
                  <div className="stat-card-header">
                    <span className="stat-card-label">Students Absent</span>
                    <div className="stat-card-icon-badge stat-card-icon--red">
                      <AlertCircle size={17} />
                    </div>
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-card-value stat-card-value--red">
                      {totalAbsent}
                    </div>
                    <div className="stat-card-subtext">
                      {totalAbsent > 0 ? 'Listed in action directory' : 'Zero reported absences'}
                    </div>
                  </div>
                </Paper>

                {/* 4. Submission Status */}
                <Paper p="md" radius="lg" withBorder shadow="xs" className="stat-card reports-stat-card">
                  <div className="stat-card-header">
                    <span className="stat-card-label">Submission Status</span>
                    <div className="stat-card-icon-badge stat-card-icon--emerald">
                      <CalendarCheck size={17} />
                    </div>
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-card-value stat-card-value--emerald">
                      {recordedSessions}
                      <span className="stat-card-denom">/ {filteredClasses.length} Classes</span>
                    </div>
                    <div className="stat-card-subtext">
                      {filteredClasses.length > 0
                        ? `${recordedSessions} of ${filteredClasses.length} classes submitted (${Math.round((recordedSessions / filteredClasses.length) * 100)}%)`
                        : 'No classes in filter'}
                    </div>
                  </div>
                </Paper>
              </SimpleGrid>

              {/* Class Breakdown Table */}
              <Paper radius="lg" withBorder shadow="xs" className="reports-table-card">
                <div className="reports-card-header">
                  <div>
                    <h3 className="reports-card-title">Class-wise Attendance Breakdown</h3>
                    <p className="reports-card-subtext">Roll-call submission status and attendance percentage across classes</p>
                  </div>
                  {(selectedSection !== 'all' || selectedGrade !== 'all') && (
                    <Badge color="blue" variant="light" size="sm">
                      Filtered: {filteredClasses.length} Classes
                    </Badge>
                  )}
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Grade & Class</th>
                        <th>Class Teacher</th>
                        <th>Submission Status</th>
                        <th>Enrolled</th>
                        <th>Present</th>
                        <th>Absent</th>
                        <th>Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClasses.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                            No classes match the selected Section and Grade filters.
                          </td>
                        </tr>
                      ) : (
                        filteredClasses.map((c: any) => {
                          const enrolled = Number(c.enrolled_count || 0);
                          const present = Number(c.present_count || 0);
                          const absent = Number(c.absent_count || 0);
                          const pct = enrolled > 0 ? Math.round((present / enrolled) * 100) : 0;
                          const isSubmitted = !!c.session_id;

                          return (
                            <tr key={c.class_id}>
                              <td><strong>{c.class_name}</strong></td>
                              <td style={{ color: 'var(--text-muted)' }}>
                                {c.class_teacher_name ? c.class_teacher_name.replace(/^DEMO ONLY:\s*/i, '').replace(/\s*\(Synthetic Teacher\)/i, '').trim() : 'Unassigned'}
                              </td>
                              <td>
                                <Badge
                                  color={isSubmitted ? 'green' : 'yellow'}
                                  variant="light"
                                  size="sm"
                                >
                                  {isSubmitted ? 'Submitted' : 'Pending'}
                                </Badge>
                              </td>
                              <td>{enrolled}</td>
                              <td style={{ color: 'var(--present)', fontWeight: 600 }}>{present}</td>
                              <td style={{ color: 'var(--absent)', fontWeight: 600 }}>{absent}</td>
                              <td>
                                <Group gap="xs" align="center">
                                  <Progress
                                    value={pct}
                                    color={pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red'}
                                    size="sm"
                                    radius="xl"
                                    style={{ width: 80 }}
                                  />
                                  <Text size="sm" fw={700}>
                                    {pct}%
                                  </Text>
                                </Group>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Paper>

              {/* Absent Students Contact Directory */}
              <Paper radius="lg" withBorder shadow="xs" className="reports-table-card">
                <div className="reports-card-header">
                  <div>
                    <h3 className="reports-card-title">Absent Students Action Directory</h3>
                    <p className="reports-card-subtext">
                      Guardian telephone numbers for immediate school administrative verification
                    </p>
                  </div>
                  <Badge color="red" variant="filled" size="md">
                    {filteredAbsentStudents.length} Absentees
                  </Badge>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Admission No</th>
                        <th>Student Name</th>
                        <th>Class</th>
                        <th>Guardian Name</th>
                        <th>Guardian Phone (Call Action)</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAbsentStudents.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                            No absent students recorded for this date{selectedSection !== 'all' || selectedGrade !== 'all' ? ' in selected filters' : ''}.
                          </td>
                        </tr>
                      ) : (
                        filteredAbsentStudents.map((st: any) => (
                          <tr key={st.id}>
                            <td><strong>{st.admission_no}</strong></td>
                            <td>{st.full_name}</td>
                            <td><Badge color="gray" variant="light" size="sm">{st.class_name}</Badge></td>
                            <td>{st.guardian_name || '—'}</td>
                            <td>
                              {st.guardian_phone ? (
                                <a
                                  href={`tel:${st.guardian_phone}`}
                                  className="reports-phone-btn"
                                  style={{ textDecoration: 'none' }}
                                >
                                  <Button
                                    variant="light"
                                    color="blue"
                                    size="xs"
                                    leftSection={<Phone size={12} />}
                                  >
                                    {st.guardian_phone}
                                  </Button>
                                </a>
                              ) : (
                                <Text size="xs" c="dimmed">Not provided</Text>
                              )}
                            </td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                              {st.remarks || 'No reason specified'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Paper>
            </>
          )}
        </>
      )}

      {activeTab === 'monthly' && (
        <Paper radius="lg" withBorder shadow="xs" className="reports-table-card">
          <div className="reports-card-header">
            <div>
              <h3 className="reports-card-title">
                Monthly Attendance Register — {classes.find((c) => c.id === monthlyClassId)?.name}
              </h3>
              <p className="reports-card-subtext">
                Legend: <strong>P</strong> (Present) • <strong>A</strong> (Absent) • <strong>L</strong> (Late) • <strong>E</strong> (Excused)
              </p>
            </div>
          </div>

          {loadingMonthly ? (
            <LoadingState message="Loading monthly register matrix..." minHeight={240} />
          ) : (
            <div className="table-responsive">
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>Roll</th>
                    <th>Student Name</th>
                    {monthlyData?.sessions?.map((sess: any) => (
                      <th key={sess.id} style={{ textAlign: 'center', padding: '0.5rem 0.35rem', minWidth: 38 }}>
                        {sess.date.slice(8)}
                      </th>
                    ))}
                    <th style={{ textAlign: 'center' }}>% Present</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData?.students?.map((st: any) => {
                    const studentRecords = monthlyData.attendanceGrid[st.id] || {};
                    let presentCount = 0;
                    const sessionCount = monthlyData.sessions?.length || 0;

                    return (
                      <tr key={st.id}>
                        <td><strong>#{st.roll_number || '-'}</strong></td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{st.full_name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{st.admission_no}</div>
                        </td>
                        {monthlyData.sessions?.map((sess: any) => {
                          const status = studentRecords[sess.date];
                          let letter = '-';
                          let badgeColor = 'gray';

                          if (status === 'present') {
                            letter = 'P';
                            badgeColor = 'green';
                            presentCount++;
                          } else if (status === 'absent') {
                            letter = 'A';
                            badgeColor = 'red';
                          } else if (status === 'late') {
                            letter = 'L';
                            badgeColor = 'yellow';
                            presentCount++;
                          } else if (status === 'excused') {
                            letter = 'E';
                            badgeColor = 'blue';
                          }

                          return (
                            <td key={sess.id} style={{ textAlign: 'center', padding: '0.4rem 0.2rem' }}>
                              <Badge
                                color={badgeColor}
                                variant={status ? 'filled' : 'light'}
                                size="xs"
                                style={{ minWidth: 26, padding: '0 4px' }}
                              >
                                {letter}
                              </Badge>
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>
                          {sessionCount > 0
                            ? `${Math.round((presentCount / sessionCount) * 100)}%`
                            : '100%'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Paper>
      )}
    </div>
  );
};

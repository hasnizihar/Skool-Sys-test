import React, { useState, useEffect } from 'react';
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
  Filter
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

  // Monthly Report State
  const [classes, setClasses] = useState<any[]>([]);
  const [monthlyClassId, setMonthlyClassId] = useState<number | null>(null);
  const [monthlyYear, setMonthlyYear] = useState<number>(2026);
  const [monthlyMonth, setMonthlyMonth] = useState<number>(10);
  const [monthlyData, setMonthlyData] = useState<any | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  useEffect(() => {
    loadClasses();
  }, []);

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
    setSelectedDate(dt.toISOString().slice(0, 10));
  };

  const jumpToToday = () => {
    setSelectedDate(getColomboCivilDate());
  };

  const isToday = selectedDate === getColomboCivilDate();

  // Calculate daily totals
  let totalEnrolled = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLate = 0;
  let recordedSessions = 0;

  if (dailyData?.classes) {
    dailyData.classes.forEach((c: any) => {
      totalEnrolled += Number(c.enrolled_count || 0);
      if (c.session_id) {
        recordedSessions++;
        totalPresent += Number(c.present_count || 0);
        totalAbsent += Number(c.absent_count || 0);
        totalLate += Number(c.late_count || 0);
      }
    });
  }

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
              <div className="reports-control-group">
                <label className="reports-control-label">Report Date</label>
                <div className="reports-date-picker-wrap">
                  <div className="reports-date-input-wrap">
                    <Calendar size={15} className="reports-date-icon" />
                    <input
                      type="date"
                      className="form-input reports-date-input"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
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
                      onClick={() => shiftDate(1)}
                      title="Next Day"
                      aria-label="Next Day"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="reports-status-summary">
                <Badge
                  color={recordedSessions > 0 ? 'green' : 'gray'}
                  variant="light"
                  size="lg"
                  className="reports-status-pill"
                >
                  <span className="reports-status-dot" />
                  <span>
                    {recordedSessions > 0
                      ? `${recordedSessions} of ${dailyData?.classes?.length || 18} Classes Submitted`
                      : 'No Registers Submitted for this Date'}
                  </span>
                </Badge>
              </div>
            </>
          ) : (
            <div className="reports-monthly-controls">
              <div className="reports-control-group" style={{ flex: '1 1 240px' }}>
                <label className="reports-control-label">Select Class</label>
                <select
                  className="form-select reports-select"
                  value={monthlyClassId || ''}
                  onChange={(e) => setMonthlyClassId(Number(e.target.value))}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
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
                <Paper p="md" radius="lg" withBorder shadow="xs" className="stat-card">
                  <Group justify="space-between" align="flex-start" mb="xs">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Overall Attendance
                    </Text>
                    <Badge color="green" variant="light" size="lg" circle>
                      <CheckCircle size={18} />
                    </Badge>
                  </Group>
                  <div className="stat-content">
                    <Text size="2rem" fw={800} lh={1}>
                      {schoolPercentage !== null ? `${schoolPercentage}%` : '—'}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {schoolPercentage !== null
                        ? `${totalPresent + totalLate} / ${totalEnrolled} Pupils present`
                        : 'No attendance recorded'}
                    </Text>
                  </div>
                </Paper>

                <Paper p="md" radius="lg" withBorder shadow="xs" className="stat-card">
                  <Group justify="space-between" align="flex-start" mb="xs">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Students Present
                    </Text>
                    <Badge color="blue" variant="light" size="lg" circle>
                      <UserCheck size={18} />
                    </Badge>
                  </Group>
                  <div className="stat-content">
                    <Text size="2rem" fw={800} lh={1} c="blue.7">
                      {totalPresent}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Confirmed in classrooms
                    </Text>
                  </div>
                </Paper>

                <Paper p="md" radius="lg" withBorder shadow="xs" className="stat-card">
                  <Group justify="space-between" align="flex-start" mb="xs">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Students Absent
                    </Text>
                    <Badge color="red" variant="light" size="lg" circle>
                      <AlertCircle size={18} />
                    </Badge>
                  </Group>
                  <div className="stat-content">
                    <Text size="2rem" fw={800} lh={1} c="red.7">
                      {totalAbsent}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {totalAbsent > 0 ? 'Listed in action directory' : 'Zero reported absences'}
                    </Text>
                  </div>
                </Paper>

                <Paper p="md" radius="lg" withBorder shadow="xs" className="stat-card">
                  <Group justify="space-between" align="flex-start" mb="xs">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Students Late
                    </Text>
                    <Badge color="yellow" variant="light" size="lg" circle>
                      <Clock size={18} />
                    </Badge>
                  </Group>
                  <div className="stat-content">
                    <Text size="2rem" fw={800} lh={1} c="yellow.8">
                      {totalLate}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {totalLate > 0 ? 'Admitted with late record' : 'Zero recorded late arrivals'}
                    </Text>
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
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Grade & Class</th>
                        <th>Class Teacher</th>
                        <th>Status</th>
                        <th>Enrolled</th>
                        <th>Present</th>
                        <th>Absent</th>
                        <th>Late</th>
                        <th>Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyData?.classes?.map((c: any) => {
                        const enrolled = Number(c.enrolled_count || 0);
                        const present = Number(c.present_count || 0);
                        const absent = Number(c.absent_count || 0);
                        const late = Number(c.late_count || 0);
                        const pct = enrolled > 0 ? Math.round(((present + late) / enrolled) * 100) : 0;
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
                            <td style={{ color: 'var(--late)', fontWeight: 600 }}>{late}</td>
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
                      })}
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
                    {dailyData?.absentStudents?.length || 0} Absentees
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
                      {dailyData?.absentStudents?.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                            No absent students recorded for this date.
                          </td>
                        </tr>
                      ) : (
                        dailyData?.absentStudents?.map((st: any) => (
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

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
  UserCheck
} from 'lucide-react';
import { api } from '../api/client';
import { getColomboCivilDate } from '../utils/dateUtils';
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
      <div className="reports-header">
        <div className="reports-header-titles">
          <h2 className="reports-title">Attendance Reports & Registry</h2>
          <p className="reports-subtitle">
            Daily breakdown, absent student follow-up directory, and monthly attendance matrix.
          </p>
        </div>

        <div className="reports-actions">
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

          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-secondary btn-sm btn-no-print"
            title="Print report"
          >
            <Printer size={15} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* View Switcher & Toolbar Card */}
      <div className="reports-toolbar-card">
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
                <span className={`reports-status-pill ${recordedSessions > 0 ? 'reports-status-pill--active' : 'reports-status-pill--empty'}`}>
                  <span className="reports-status-dot" />
                  <span>
                    {recordedSessions > 0
                      ? `${recordedSessions} of ${dailyData?.classes?.length || 18} Classes Submitted`
                      : 'No Registers Submitted for this Date'}
                  </span>
                </span>
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
      </div>

      {activeTab === 'daily' && (
        <>
          {/* Daily Summary Stats Grid */}
          <div className="dashboard-stats-grid">
            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Overall Attendance</span>
                <div className="stat-icon" style={{ background: 'var(--present-bg)', color: 'var(--present)', borderColor: 'var(--present-border)' }}>
                  <CheckCircle size={18} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">
                  {schoolPercentage !== null ? `${schoolPercentage}%` : '—'}
                </div>
                <div className="stat-meta">
                  <span
                    className="stat-meta-dot"
                    style={{ background: schoolPercentage !== null ? 'var(--present)' : 'var(--text-muted)' }}
                  />
                  <span>
                    {schoolPercentage !== null
                      ? `${totalPresent + totalLate} / ${totalEnrolled} Pupils present`
                      : 'No attendance recorded'}
                  </span>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Students Present</span>
                <div className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#4f46e5', borderColor: 'rgba(99, 102, 241, 0.25)' }}>
                  <UserCheck size={18} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">{totalPresent}</div>
                <div className="stat-meta">
                  <span className="stat-meta-dot" style={{ background: '#4f46e5' }} />
                  <span>Confirmed in classrooms</span>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Students Absent</span>
                <div className="stat-icon" style={{ background: 'var(--absent-bg)', color: 'var(--absent)', borderColor: 'var(--absent-border)' }}>
                  <AlertCircle size={18} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">{totalAbsent}</div>
                <div className="stat-meta">
                  <span
                    className="stat-meta-dot"
                    style={{ background: totalAbsent > 0 ? 'var(--absent)' : 'var(--text-muted)' }}
                  />
                  <span>
                    {totalAbsent > 0 ? 'Listed in action directory' : 'Zero reported absences'}
                  </span>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Students Late</span>
                <div className="stat-icon" style={{ background: 'var(--late-bg)', color: 'var(--late)', borderColor: 'var(--late-border)' }}>
                  <Clock size={18} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">{totalLate}</div>
                <div className="stat-meta">
                  <span
                    className="stat-meta-dot"
                    style={{ background: totalLate > 0 ? 'var(--late)' : 'var(--text-muted)' }}
                  />
                  <span>
                    {totalLate > 0 ? 'Admitted with late record' : 'Zero recorded late arrivals'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Class Breakdown Table */}
          <div className="reports-table-card card" style={{ padding: 0 }}>
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
                          <span
                            className={`badge ${isSubmitted ? 'badge-present' : 'badge-late'}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isSubmitted ? 'var(--present)' : 'var(--late)' }} />
                            <span>{isSubmitted ? 'Submitted' : 'Pending'}</span>
                          </span>
                        </td>
                        <td>{enrolled}</td>
                        <td style={{ color: 'var(--present)', fontWeight: 600 }}>{present}</td>
                        <td style={{ color: 'var(--absent)', fontWeight: 600 }}>{absent}</td>
                        <td style={{ color: 'var(--late)', fontWeight: 600 }}>{late}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div
                              style={{
                                width: 80,
                                height: 6,
                                background: 'var(--border-color)',
                                borderRadius: 'var(--radius-full)',
                                overflow: 'hidden'
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: pct >= 80 ? 'var(--present)' : 'var(--absent)'
                                }}
                              />
                            </div>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Absent Students Contact Directory */}
          <div className="reports-table-card card" style={{ padding: 0 }}>
            <div className="reports-card-header">
              <div>
                <h3 className="reports-card-title">Absent Students Action Directory</h3>
                <p className="reports-card-subtext">
                  Guardian telephone numbers for immediate school administrative verification
                </p>
              </div>
              <span
                className="badge badge-absent"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--absent)' }} />
                <span>{dailyData?.absentStudents?.length || 0} Absentees</span>
              </span>
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
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        No absent students recorded for this date.
                      </td>
                    </tr>
                  ) : (
                    dailyData?.absentStudents?.map((st: any) => (
                      <tr key={st.id}>
                        <td><strong>{st.admission_no}</strong></td>
                        <td>{st.full_name}</td>
                        <td><span className="badge" style={{ background: 'var(--bg-subtle)' }}>{st.class_name}</span></td>
                        <td>{st.guardian_name}</td>
                        <td>
                          <a
                            href={`tel:${st.guardian_phone}`}
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}
                          >
                            <Phone size={13} />
                            <span>{st.guardian_phone}</span>
                          </a>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {st.remarks || 'No reason specified'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'monthly' && (
        <div className="reports-table-card card" style={{ padding: 0 }}>
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
                        let badgeClass = '';

                        if (status === 'present') {
                          letter = 'P';
                          badgeClass = 'badge-present';
                          presentCount++;
                        } else if (status === 'absent') {
                          letter = 'A';
                          badgeClass = 'badge-absent';
                        } else if (status === 'late') {
                          letter = 'L';
                          badgeClass = 'badge-late';
                          presentCount++;
                        } else if (status === 'excused') {
                          letter = 'E';
                          badgeClass = 'badge-excused';
                        }

                        return (
                          <td key={sess.id} style={{ textAlign: 'center', padding: '0.4rem 0.2rem' }}>
                            <span
                              className={`badge ${badgeClass}`}
                              style={{ minWidth: 26, justifyContent: 'center', padding: '0.15rem 0.35rem' }}
                            >
                              {letter}
                            </span>
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
        </div>
      )}
    </div>
  );
};

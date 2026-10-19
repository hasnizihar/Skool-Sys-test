import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Calendar,
  Phone,
  CheckCircle,
  AlertCircle,
  Clock,
  Printer,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { api } from '../api/client';

export const AttendanceReports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>('2026-10-17');

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

  // Calculate daily totals
  let totalEnrolled = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLate = 0;

  if (dailyData?.classes) {
    dailyData.classes.forEach((c: any) => {
      totalEnrolled += Number(c.enrolled_count || 0);
      totalPresent += Number(c.present_count || 0);
      totalAbsent += Number(c.absent_count || 0);
      totalLate += Number(c.late_count || 0);
    });
  }

  const schoolPercentage =
    totalEnrolled > 0 ? Math.round(((totalPresent + totalLate) / totalEnrolled) * 100) : 0;

  return (
    <div>
      {/* Top Header */}
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
          <h2>Attendance Reports & Registry</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Daily breakdown, absent student follow-up directory, and monthly attendance matrix.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={() => setActiveTab('daily')}
            className={`btn btn-sm ${activeTab === 'daily' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Daily Summary
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`btn btn-sm ${activeTab === 'monthly' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Monthly Register
          </button>
          <button onClick={() => window.print()} className="btn btn-secondary btn-sm btn-no-print">
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {activeTab === 'daily' && (
        <>
          {/* Daily Controls & Date Selector */}
          <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={18} style={{ color: 'var(--primary)' }} />
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Select Report Date:
                </label>
              </div>
              <input
                type="date"
                className="form-input"
                style={{ width: '180px' }}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>

          {/* Daily Summary Stats */}
          <div className="stats-grid">
            <div className="stat-card" style={{ borderLeft: '4px solid var(--present)' }}>
              <div className="stat-icon" style={{ background: 'var(--present-bg)', color: 'var(--present)' }}>
                <CheckCircle size={24} />
              </div>
              <div>
                <div className="stat-val">{schoolPercentage}%</div>
                <div className="stat-label">Overall Attendance</div>
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
              <div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                <UserCheck size={24} />
              </div>
              <div>
                <div className="stat-val">{totalPresent}</div>
                <div className="stat-label">Students Present</div>
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: '4px solid var(--absent)' }}>
              <div className="stat-icon" style={{ background: 'var(--absent-bg)', color: 'var(--absent)' }}>
                <AlertCircle size={24} />
              </div>
              <div>
                <div className="stat-val">{totalAbsent}</div>
                <div className="stat-label">Students Absent</div>
              </div>
            </div>

            <div className="stat-card" style={{ borderLeft: '4px solid var(--late)' }}>
              <div className="stat-icon" style={{ background: 'var(--late-bg)', color: 'var(--late)' }}>
                <Clock size={24} />
              </div>
              <div>
                <div className="stat-val">{totalLate}</div>
                <div className="stat-label">Students Late</div>
              </div>
            </div>
          </div>

          {/* Class Breakdown Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.75rem' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '1.1rem' }}>Class-wise Attendance Breakdown</h3>
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
                          {c.class_teacher_name || 'Unassigned'}
                        </td>
                        <td>
                          {isSubmitted ? (
                            <span className="badge badge-present">Submitted</span>
                          ) : (
                            <span className="badge badge-late">Pending</span>
                          )}
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
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.1rem' }}>Absent Students Action Directory</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Guardian telephone numbers for immediate school administrative verification
                </p>
              </div>
              <span className="badge badge-absent">
                {dailyData?.absentStudents?.length || 0} Absentees
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
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
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
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary)' }}
                          >
                            <Phone size={12} /> {st.guardian_phone}
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
        <>
          {/* Monthly Controls */}
          <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ width: '220px' }}>
                <label className="form-label">Select Class</label>
                <select
                  className="form-select"
                  value={monthlyClassId || ''}
                  onChange={(e) => setMonthlyClassId(Number(e.target.value))}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ width: '130px' }}>
                <label className="form-label">Month</label>
                <select
                  className="form-select"
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

              <div style={{ width: '110px' }}>
                <label className="form-label">Year</label>
                <select
                  className="form-select"
                  value={monthlyYear}
                  onChange={(e) => setMonthlyYear(Number(e.target.value))}
                >
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                </select>
              </div>
            </div>
          </div>

          {/* Monthly Register Grid */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '1.1rem' }}>
                Monthly Attendance Register — {classes.find((c) => c.id === monthlyClassId)?.name}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Legend: <strong>P</strong> (Present) • <strong>A</strong> (Absent) • <strong>L</strong> (Late) • <strong>E</strong> (Excused)
              </p>
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
        </>
      )}
    </div>
  );
};

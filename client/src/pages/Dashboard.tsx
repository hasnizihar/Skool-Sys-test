import React, { useState, useEffect } from 'react';
import {
  Users,
  CalendarCheck,
  GraduationCap,
  TrendingUp,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertTriangle,
  UserCheck,
  UserX,
  PhoneCall,
  School,
  FileSpreadsheet,
  Award,
  ClipboardCheck,
  ShieldAlert,
  Send,
  Eye,
  CheckCheck,
  History
} from 'lucide-react';
import { api } from '../api/client';
import { getColomboCivilDate } from '../utils/dateUtils';
import { SCHOOL_PROFILE } from '../config/schoolConfig';
import { SchoolCrest } from '../components/common/SchoolCrest';
import { StatusBadge } from '../components/common/StatusBadge';

interface DashboardProps {
  onNavigate: (tab: string) => void;
  user: any;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, user }) => {
  const [stats, setStats] = useState<{
    totalStudents: number;
    classesCount: number;
    attendanceRate: number | null;
    presentCount: number;
    absentCount: number;
    pendingExamSheets: number;
  }>({
    totalStudents: 0,
    classesCount: 0,
    attendanceRate: null,
    presentCount: 0,
    absentCount: 0,
    pendingExamSheets: 0
  });

  const [dailyReport, setDailyReport] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [pendingSheets, setPendingSheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState<'all' | 'pending'>('all');

  const role = user?.role || 'teacher';
  const isAdmin = role === 'admin';
  const isClassTeacher = role === 'class_teacher';
  const isSubjectTeacher = role === 'subject_teacher';
  const isSectionHead = role === 'section_head';

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const today = getColomboCivilDate();
      const [studentsRes, classesRes, dailyRes] = await Promise.all([
        api.getStudents(),
        api.getClasses(),
        api.getDailyAttendanceReport(today)
      ]);

      let totalPresent = 0;
      let totalAbsent = 0;
      let totalEnrolled = studentsRes.count || 0;
      let recordedClasses = 0;

      if (dailyRes.classes) {
        setDailyReport(dailyRes.classes);
        dailyRes.classes.forEach((c: any) => {
          if (c.session_id) {
            recordedClasses++;
            totalPresent += Number(c.present_count || 0);
            totalAbsent += Number(c.absent_count || 0);
          }
        });
      }

      const totalMarked = totalPresent + totalAbsent;
      const rate = recordedClasses > 0 && totalMarked > 0
        ? Math.round((totalPresent / totalMarked) * 100)
        : null;

      // Fetch pending marks sheets for leadership or teachers
      let pendingCount = 0;
      let sheetsList: any[] = [];
      try {
        const sheetsRes = await api.getMarksSheets();
        if (sheetsRes.sheets) {
          sheetsList = sheetsRes.sheets;
          pendingCount = sheetsList.filter(
            (s: any) => s.status === 'submitted' || s.status === 'reviewed'
          ).length;
          setPendingSheets(sheetsList);
        }
      } catch {
        // Marks sheets endpoint may require specific scope
      }

      setStats({
        totalStudents: totalEnrolled,
        classesCount: classesRes.classes?.length || 18,
        attendanceRate: rate,
        presentCount: totalPresent,
        absentCount: totalAbsent,
        pendingExamSheets: pendingCount
      });

      if (isAdmin) {
        try {
          const logsRes = await api.getAuditLogs();
          setRecentLogs((logsRes.logs || []).slice(0, 5));
        } catch {}
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredDailyReport = classFilter === 'pending'
    ? dailyReport.filter((c) => !c.session_id)
    : dailyReport;

  const hour = new Date().getHours();
  const greetingTime = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const cleanName = user?.full_name?.replace(/\s*\([^)]*\)/g, '').trim() || user?.username || 'Faculty Member';

  return (
    <div>
      {/* Header Banner Card with School Brand Identity */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.75rem',
          flexWrap: 'wrap',
          gap: '1.25rem',
          padding: '1.5rem 1.75rem',
          background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--kcc-primary-soft) 100%)',
          border: '1px solid var(--kcc-border)',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <SchoolCrest size={48} showBorder={true} alt={SCHOOL_PROFILE.name} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--kcc-text)', letterSpacing: '-0.02em' }}>
                {greetingTime}, {cleanName}
              </h2>
              <span
                className="badge"
                style={{
                  background: 'var(--kcc-primary)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.65rem'
                }}
              >
                Academic Year 2026
              </span>
            </div>

            <p style={{ color: 'var(--kcc-text-muted)', fontSize: '0.85rem', margin: 0 }}>
              <strong style={{ color: 'var(--kcc-text)' }}>{SCHOOL_PROFILE.name}</strong> ({SCHOOL_PROFILE.nameTamil}) • {SCHOOL_PROFILE.type} (Census {SCHOOL_PROFILE.censusNo})
            </p>

            <p style={{ color: 'var(--kcc-text-muted)', fontSize: '0.78rem', marginTop: '0.25rem' }}>
              {isAdmin
                ? `Principal Profile: ${SCHOOL_PROFILE.principalName} • Executive institutional overview across Grades 6 to 13`
                : isClassTeacher
                ? `Assigned Role: Class Teacher • Homeroom Roll-Call & Classroom Register`
                : isSubjectTeacher
                ? `Assigned Role: Subject Teacher • Curriculum & Assessment Operations`
                : isSectionHead
                ? `Assigned Role: Section Head • Grade Division Moderation & Review Queue`
                : `Assigned Role: ${user?.role?.replace('_', ' ').toUpperCase()} • Grade 6–13 Portal`}
            </p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          {(isClassTeacher || isAdmin) && (
            <button
              onClick={() => onNavigate('attendance')}
              className="btn btn-primary"
              aria-label="Take daily class attendance"
            >
              <CalendarCheck size={16} />
              <span>Take Attendance</span>
            </button>
          )}

          <button
            onClick={() => onNavigate('marks')}
            className="btn btn-secondary"
            aria-label="Enter examination marks"
          >
            <GraduationCap size={16} />
            <span>Enter Marks</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Metric Cards (Role-Adaptive Bento Style) */}
      <div className="stats-grid">
        {/* Card 1: Total Enrolled */}
        <div className="stat-card" style={{ borderLeft: '4px solid var(--kcc-primary)' }}>
          <div className="stat-icon" style={{ background: 'var(--kcc-primary-soft)', color: 'var(--kcc-primary)' }}>
            <Users size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-val">{stats.totalStudents}</div>
            <div className="stat-label">Total Enrolled Students</div>
            <div className="stat-trend" style={{ background: 'var(--bg-subtle)', color: 'var(--kcc-text-muted)' }}>
              <span>Grades 6 to 13</span>
            </div>
          </div>
        </div>

        {/* Card 2: Attendance Rate (Truthful Representation) */}
        <div className="stat-card" style={{ borderLeft: '4px solid var(--present)' }}>
          <div className="stat-icon" style={{ background: 'var(--present-bg)', color: 'var(--present)' }}>
            <TrendingUp size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-val" style={{ fontSize: stats.attendanceRate !== null ? undefined : '1.35rem' }}>
              {stats.attendanceRate !== null ? `${stats.attendanceRate}%` : 'Not Recorded'}
            </div>
            <div className="stat-label">Today's Attendance Rate</div>
            <div
              className="stat-trend"
              style={{
                background: stats.attendanceRate === null
                  ? 'var(--bg-subtle)'
                  : stats.attendanceRate >= 80
                  ? 'var(--present-bg)'
                  : 'var(--late-bg)',
                color: stats.attendanceRate === null
                  ? 'var(--kcc-text-muted)'
                  : stats.attendanceRate >= 80
                  ? 'var(--present)'
                  : 'var(--late)'
              }}
            >
              <span>
                {stats.attendanceRate !== null
                  ? `${stats.presentCount} present • ${stats.absentCount} absent`
                  : 'No registers submitted yet today'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Active Classes */}
        <div className="stat-card" style={{ borderLeft: '4px solid var(--kcc-gold)' }}>
          <div className="stat-icon" style={{ background: 'var(--kcc-gold-soft)', color: '#92400E' }}>
            <School size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-val">{stats.classesCount}</div>
            <div className="stat-label">Active School Classes</div>
            <div className="stat-trend" style={{ background: 'var(--bg-subtle)', color: 'var(--kcc-text-muted)' }}>
              <span>A & B Streams</span>
            </div>
          </div>
        </div>

        {/* Card 4: Absentees / Follow-up */}
        <div
          className="stat-card card-interactive"
          onClick={() => onNavigate('attendance-reports')}
          style={{ borderLeft: '4px solid var(--absent)' }}
          title="Jump to absent student phone follow-up directory"
        >
          <div className="stat-icon" style={{ background: 'var(--absent-bg)', color: 'var(--absent)' }}>
            <PhoneCall size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-val">{stats.absentCount}</div>
            <div className="stat-label">Absentees Today</div>
            <div
              className="stat-trend"
              style={{ background: 'var(--absent-bg)', color: 'var(--absent)' }}
            >
              <span>Call Directory →</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Bento Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
        {/* Left Column: Daily Attendance Register Status */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Daily Attendance Register Status</div>
              <div className="card-subtitle">Class roll-call completion across school divisions</div>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setClassFilter('all')}
                className={`btn btn-sm ${classFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              >
                All ({dailyReport.length})
              </button>
              <button
                type="button"
                onClick={() => setClassFilter('pending')}
                className={`btn btn-sm ${classFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Pending ({dailyReport.filter((c) => !c.session_id).length})
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {filteredDailyReport.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--kcc-text-muted)' }}>
                <CheckCircle size={36} style={{ color: 'var(--present)', margin: '0 auto 0.75rem' }} />
                <p style={{ fontWeight: 600 }}>All classes have submitted attendance for today!</p>
              </div>
            ) : (
              filteredDailyReport.slice(0, 8).map((c) => {
                const present = Number(c.present_count || 0);
                const total = Number(c.enrolled_count || 0);
                const pct = total > 0 ? Math.round((present / total) * 100) : 0;
                const isSubmitted = !!c.session_id;

                return (
                  <div
                    key={c.class_id}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--kcc-text)' }}>
                        {c.class_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--kcc-text-muted)' }}>
                        Teacher: {c.teacher_name || 'Assigned Staff'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {isSubmitted ? (
                        <>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--present)' }}>
                              {present} / {total} ({pct}%)
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--kcc-text-muted)' }}>
                              Recorded
                            </div>
                          </div>
                          <span
                            className="badge badge-present"
                            style={{ fontSize: '0.7rem' }}
                          >
                            Submitted
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            className="badge badge-unmarked"
                            style={{ fontSize: '0.7rem' }}
                          >
                            Pending Roll-Call
                          </span>
                          {(isClassTeacher || isAdmin) && (
                            <button
                              type="button"
                              onClick={() => onNavigate('attendance')}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.725rem' }}
                            >
                              Mark
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Role-Specific Operational Hub */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                {isAdmin
                  ? 'Examination Moderation & Approvals'
                  : isSectionHead
                  ? 'Section Review Queue'
                  : isSubjectTeacher
                  ? 'My Examination Marks Sheets'
                  : 'Homeroom Academic Overview'}
              </div>
              <div className="card-subtitle">
                {isAdmin
                  ? 'Endorsed marks sheets ready for Principal approval and publication'
                  : isSectionHead
                  ? 'Submitted subject marks sheets awaiting Section Head endorsement'
                  : isSubjectTeacher
                  ? 'Marks sheets assigned for your subject curriculum'
                  : 'Student performance and examination readiness'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('marks')}
              className="btn btn-secondary btn-sm"
            >
              Open Workspace →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
            {pendingSheets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--kcc-text-muted)' }}>
                <CheckCheck size={36} style={{ color: 'var(--present)', margin: '0 auto 0.75rem' }} />
                <p style={{ fontWeight: 600 }}>All examination marks sheets are up to date!</p>
              </div>
            ) : (
              pendingSheets.slice(0, 6).map((sheet: any) => (
                <div
                  key={sheet.id}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--kcc-text)' }}>
                      {sheet.class_name} • {sheet.subject_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--kcc-text-muted)' }}>
                      {sheet.examination_title || 'Term 1 Assessment 2026'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <StatusBadge status={sheet.status} size="sm" />
                    <button
                      type="button"
                      onClick={() => onNavigate('marks')}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.725rem' }}
                    >
                      View
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent System Audit Logs (Admin / Leadership) */}
      {isAdmin && recentLogs.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Recent System Audit Trail</div>
              <div className="card-subtitle">Verified immutable security logs of administrative activity</div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('audit')}
              className="btn btn-secondary btn-sm"
            >
              View Full Audit Log →
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.775rem', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td style={{ fontWeight: 600 }}>{log.username}</td>
                    <td>
                      <span className="badge" style={{ background: 'var(--kcc-primary-soft)', color: 'var(--kcc-primary)' }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.825rem', color: 'var(--kcc-text-muted)' }}>
                      {log.details || log.target || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

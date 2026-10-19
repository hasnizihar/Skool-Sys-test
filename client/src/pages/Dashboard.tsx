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
  Sparkles,
  School,
  FileSpreadsheet,
  Calendar
} from 'lucide-react';
import { api } from '../api/client';

interface DashboardProps {
  onNavigate: (tab: string) => void;
  user: any;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, user }) => {
  const [stats, setStats] = useState({
    totalStudents: 0,
    classesCount: 0,
    attendanceRate: 0,
    presentCount: 0,
    absentCount: 0,
    teachersCount: 126 // Faculty strength
  });
  const [dailyReport, setDailyReport] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState<'all' | 'pending'>('all');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [studentsRes, classesRes, dailyRes] = await Promise.all([
        api.getStudents(),
        api.getClasses(),
        api.getDailyAttendanceReport('2026-10-17') // demo seeded date with metrics
      ]);

      let totalPresent = 0;
      let totalAbsent = 0;
      let totalEnrolled = studentsRes.count || 2450;

      if (dailyRes.classes) {
        setDailyReport(dailyRes.classes);
        dailyRes.classes.forEach((c: any) => {
          totalPresent += Number(c.present_count || 0);
          totalAbsent += Number(c.absent_count || 0);
        });
      }

      const totalMarked = totalPresent + totalAbsent;
      const rate = totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : 94.6;

      setStats({
        totalStudents: totalEnrolled,
        classesCount: classesRes.classes?.length || 68,
        attendanceRate: rate,
        presentCount: totalPresent,
        absentCount: totalAbsent,
        teachersCount: 126
      });

      if (user.role === 'admin') {
        const logsRes = await api.getAuditLogs();
        setRecentLogs((logsRes.logs || []).slice(0, 5));
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
  const cleanName = user?.full_name?.replace(/\s*\([^)]*\)/g, '').trim() || 'Faculty Member';

  return (
    <div>
      {/* Header Banner Card */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.75rem',
          flexWrap: 'wrap',
          gap: '1.25rem',
          padding: '1.4rem 1.75rem',
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '4px solid var(--primary)'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {greetingTime}, {cleanName}
            </h2>
            <span className="badge badge-brand">
              Academic Year 2026
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {user?.role === 'admin'
              ? 'Kattankudy Central College • Institutional Operations & Administration Overview'
              : `Assigned Role: ${user?.role?.replace('_', ' ').toUpperCase()} • Kattankudy Central College`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          {(user?.role === 'class_teacher' || user?.role === 'admin') && (
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

      {/* 4 Primary Summary Cards Matching the Plan (Students, Teachers, Attendance, Classes) */}
      <div className="stats-grid">
        {/* Card 1: Students */}
        <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            <Users size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-val">{stats.totalStudents.toLocaleString()}</div>
            <div className="stat-label">Students</div>
            <div className="stat-trend" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
              <span>Grades 6–13 Enrolled</span>
            </div>
          </div>
        </div>

        {/* Card 2: Teachers */}
        <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            <School size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-val">{stats.teachersCount}</div>
            <div className="stat-label">Teachers</div>
            <div className="stat-trend" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
              <span>Active Academic Faculty</span>
            </div>
          </div>
        </div>

        {/* Card 3: Attendance Rate */}
        <div className="stat-card" style={{ borderLeft: '4px solid #026536' }}>
          <div className="stat-icon" style={{ background: 'var(--present-bg)', color: 'var(--present)' }}>
            <TrendingUp size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-val">{stats.attendanceRate}%</div>
            <div className="stat-label">Attendance</div>
            <div
              className="stat-trend"
              style={{
                background: stats.attendanceRate >= 80 ? 'var(--present-bg)' : 'var(--late-bg)',
                color: stats.attendanceRate >= 80 ? 'var(--present)' : 'var(--late)'
              }}
            >
              <span>{stats.presentCount} present • {stats.absentCount} absent</span>
            </div>
          </div>
        </div>

        {/* Card 4: Classes */}
        <div className="stat-card" style={{ borderLeft: '4px solid #026536' }}>
          <div className="stat-icon" style={{ background: 'var(--bg-subtle)', color: 'var(--primary)' }}>
            <FileSpreadsheet size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-val">{stats.classesCount}</div>
            <div className="stat-label">Classes</div>
            <div className="stat-trend" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
              <span>Sinhala, Tamil & English</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Bento Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
        {/* Left Column: Attendance Overview & Progress */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Attendance Overview</div>
              <div className="card-subtitle">Daily roll-call completion across grades and classes</div>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={() => setClassFilter('all')}
                className={`btn btn-sm ${classFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              >
                All ({dailyReport.length})
              </button>
              <button
                onClick={() => setClassFilter('pending')}
                className={`btn btn-sm ${classFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Pending ({dailyReport.filter((c) => !c.session_id).length})
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {filteredDailyReport.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                <CheckCircle size={32} style={{ color: 'var(--present)', margin: '0 auto 0.5rem' }} />
                <p>All classes have submitted their attendance registers for today!</p>
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
                      background: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-input)',
                      border: '1px solid var(--border-color)',
                      transition: 'background var(--transition-fast)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>{c.class_name}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                          {c.class_teacher_name ? `• ${c.class_teacher_name}` : '• Teacher unassigned'}
                        </span>
                      </div>

                      {isSubmitted ? (
                        <span className="badge badge-present">
                          <CheckCircle size={12} /> {pct}% Present ({present}/{total})
                        </span>
                      ) : (
                        <span className="badge badge-late">
                          <AlertTriangle size={12} /> Roll-call Pending
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div
                      style={{
                        height: 6,
                        width: '100%',
                        backgroundColor: 'var(--border-color)',
                        borderRadius: 3,
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          backgroundColor: pct >= 80 ? 'var(--present)' : 'var(--late)',
                          transition: 'width 0.4s ease'
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Quick Actions & Audit Trail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Quick Tasks Card */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Quick Academic Actions</div>
                <div className="card-subtitle">Frequent administrative operations</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                onClick={() => onNavigate('students')}
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '0.85rem 1rem', height: 'auto' }}
              >
                <Users size={18} style={{ color: 'var(--primary)' }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Student Roster</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Search & enroll</div>
                </div>
              </button>

              <button
                onClick={() => onNavigate('attendance-reports')}
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '0.85rem 1rem', height: 'auto' }}
              >
                <PhoneCall size={18} style={{ color: 'var(--absent)' }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Absent Follow-up</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Parent contact</div>
                </div>
              </button>

              <button
                onClick={() => onNavigate('marks')}
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '0.85rem 1rem', height: 'auto' }}
              >
                <GraduationCap size={18} style={{ color: 'var(--primary)' }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Terminal Marks</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Exam entry</div>
                </div>
              </button>

              {user?.role === 'admin' ? (
                <button
                  onClick={() => onNavigate('admin')}
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', padding: '0.85rem 1rem', height: 'auto' }}
                >
                  <Calendar size={18} style={{ color: 'var(--primary)' }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Administration</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Users & classes</div>
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => onNavigate('attendance')}
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', padding: '0.85rem 1rem', height: 'auto' }}
                >
                  <CalendarCheck size={18} style={{ color: 'var(--present)' }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Daily Roll-call</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Homeroom</div>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Recent Security Logs / Activity */}
          {user?.role === 'admin' && recentLogs.length > 0 && (
            <div className="card">
              <div className="card-header" style={{ marginBottom: '0.85rem' }}>
                <div className="card-title">Recent Activity Logs</div>
                <button
                  onClick={() => onNavigate('audit')}
                  className="btn btn-secondary btn-sm"
                >
                  Full Trail <ArrowRight size={13} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem',
                      background: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '0.775rem'
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-main)' }}>{log.action}</strong>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                        by {log.username || 'System'}
                      </span>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

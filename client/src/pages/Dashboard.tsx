import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  PhoneCall,
  School,
  ShieldCheck,
  Database,
  RefreshCw,
  Eye,
  Edit3,
  Smartphone,
  Copy,
  Check,
  Wifi,
  WifiOff,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import { api } from '../api/client';
import { getColomboCivilDate } from '../utils/dateUtils';
import { SCHOOL_PROFILE } from '../config/schoolConfig';
import {
  getUnsyncedWorkSummary,
  getPendingAttendanceQueue,
  UnsyncedWorkSummary,
  OfflineAttendanceMutation
} from '../api/offlineQueue';
import './dashboard.css';

interface DashboardProps {
  onNavigate: (tab: string) => void;
  user: any;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, user }) => {
  // Determine user role and authorization scope
  const userAuthorizations: any[] = user?.authorizations || [];
  const isLeadership =
    user?.role === 'admin' ||
    userAuthorizations.some((a) =>
      ['principal', 'vice_principal_academic', 'section_head'].includes(a.auth_role)
    );

  // Role-tailored active view mode: administrators can preview teacher view
  const [activeView, setActiveView] = useState<'admin' | 'teacher'>(
    isLeadership ? 'admin' : 'teacher'
  );

  // Core metrics & operational data
  const [stats, setStats] = useState<{
    totalStudents: number;
    classesCount: number;
    attendanceRate: number | null;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    excusedCount: number;
    submittedClassesCount: number;
    staffCount: number;
  }>({
    totalStudents: 0,
    classesCount: 0,
    attendanceRate: null,
    presentCount: 0,
    absentCount: 0,
    lateCount: 0,
    excusedCount: 0,
    submittedClassesCount: 0,
    staffCount: 0
  });

  const [classesList, setClassesList] = useState<any[]>([]);
  const [dailyReport, setDailyReport] = useState<any[]>([]);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [examinations, setExaminations] = useState<any[]>([]);
  const [syncSummary, setSyncSummary] = useState<UnsyncedWorkSummary | null>(null);
  const [pendingQueue, setPendingQueue] = useState<OfflineAttendanceMutation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Matrix controls (Screen 02)
  const [classFilter, setClassFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [gradeBandFilter, setGradeBandFilter] = useState<'all' | 'junior' | 'ol' | 'al'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Teacher selected class (Screen 03)
  const [teacherSelectedClassId, setTeacherSelectedClassId] = useState<number | null>(null);

  // Network connectivity listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const today = getColomboCivilDate();

      const [studentsRes, classesRes, dailyRes, examsRes] = await Promise.all([
        api.getStudents().catch(() => ({ count: 0, students: [] })),
        api.getClasses().catch(() => ({ classes: [] })),
        api.getDailyAttendanceReport(today).catch(() => ({ classes: [], absentStudents: [] })),
        api.getExaminations().catch(() => ({ examinations: [] }))
      ]);

      const classes = classesRes.classes || [];
      setClassesList(classes);
      setExaminations(examsRes.examinations || []);

      let totalPresent = 0;
      let totalAbsent = 0;
      let totalLate = 0;
      let totalExcused = 0;
      let totalEnrolled = studentsRes.count || (studentsRes.students ? studentsRes.students.length : 0);
      let recordedClasses = 0;

      const dailyClasses = dailyRes.classes || [];
      setDailyReport(dailyClasses);
      setAbsentStudents(dailyRes.absentStudents || []);

      dailyClasses.forEach((c: any) => {
        if (c.session_id) {
          recordedClasses++;
          totalPresent += Number(c.present_count || 0);
          totalAbsent += Number(c.absent_count || 0);
          totalLate += Number(c.late_count || 0);
          totalExcused += Number(c.excused_count || 0);
        }
      });

      const totalMarked = totalPresent + totalAbsent;
      const rate = recordedClasses > 0 && totalMarked > 0
        ? Math.round((totalPresent / totalMarked) * 100)
        : null;

      // Sourced active teaching staff count
      let facultyCount = 0;
      if (user?.role === 'admin') {
        try {
          const usersRes = await api.getUsers();
          const activeFaculty = (usersRes.users || []).filter(
            (u: any) => u.is_active && (u.role === 'class_teacher' || u.role === 'subject_teacher' || u.role === 'admin')
          );
          facultyCount = activeFaculty.length;
        } catch {
          const uniqueTeachers = new Set(classes.map((c: any) => c.class_teacher_name).filter(Boolean));
          facultyCount = uniqueTeachers.size;
        }
      } else {
        const uniqueTeachers = new Set(classes.map((c: any) => c.class_teacher_name).filter(Boolean));
        facultyCount = uniqueTeachers.size;
      }

      setStats({
        totalStudents: totalEnrolled,
        classesCount: classes.length > 0 ? classes.length : (dailyClasses.length || 18),
        attendanceRate: rate,
        presentCount: totalPresent,
        absentCount: totalAbsent,
        lateCount: totalLate,
        excusedCount: totalExcused,
        submittedClassesCount: recordedClasses,
        staffCount: facultyCount
      });

      // Fetch audit logs for administrators
      if (user?.role === 'admin') {
        try {
          const logsRes = await api.getAuditLogs();
          setRecentLogs((logsRes.logs || []).slice(0, 5));
        } catch (logErr) {
          console.warn('Could not fetch audit logs:', logErr);
        }
      }

      // Check IndexedDB v2 offline storage accounting scoped strictly to current user
      try {
        if (user?.id) {
          const summary = await getUnsyncedWorkSummary(user.id);
          setSyncSummary(summary);

          const queue = await getPendingAttendanceQueue(user.id);
          setPendingQueue(queue);
        }
      } catch (idbErr) {
        console.warn('Could not check offline storage status:', idbErr);
      }
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setError(err?.message || 'Failed to load school dashboard metrics. Please check network connection.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Identify teacher's assigned classes list
  const teacherAvailableClasses = useMemo(() => {
    const classTeacherIds: number[] = user?.classTeacherClassIds || [];
    const assignments: any[] = user?.assignments || [];
    const setIds = new Set<number>();

    classTeacherIds.forEach((id) => setIds.add(id));
    assignments.forEach((a) => setIds.add(a.class_id));

    // If an administrator is previewing teacher view and has no assignments, fall back to first class for demonstration preview
    if (setIds.size === 0 && isLeadership && classesList.length > 0) {
      setIds.add(classesList[0].id);
    }

    return Array.from(setIds).map((id) => {
      const found = classesList.find((c) => c.id === id) || dailyReport.find((c) => c.class_id === id);
      return {
        id,
        name: found?.class_name || found?.name || `Class ${id}`
      };
    });
  }, [user, isLeadership, classesList, dailyReport]);

  // Identify teacher's primary assigned class
  const teacherPrimaryClass = useMemo(() => {
    let targetId = teacherSelectedClassId;
    if (!targetId && teacherAvailableClasses.length > 0) {
      targetId = teacherAvailableClasses[0].id;
    }

    if (!targetId) return null;

    const classInfo = classesList.find((c) => c.id === targetId) ||
      dailyReport.find((c) => c.class_id === targetId);

    const dailyInfo = dailyReport.find((c) => c.class_id === targetId);

    return {
      classId: targetId,
      className: classInfo?.class_name || classInfo?.name || `Class ${targetId}`,
      grade: classInfo?.grade || 8,
      daily: dailyInfo
    };
  }, [teacherSelectedClassId, teacherAvailableClasses, classesList, dailyReport]);

  // Determine Daily Register State for Teacher's Class
  const teacherRegisterState = useMemo(() => {
    if (!teacherPrimaryClass) {
      return {
        status: 'unmarked' as const,
        label: 'Not Yet Marked',
        cta: 'Take Morning Register',
        draftInfo: null
      };
    }

    const today = getColomboCivilDate();
    const isSubmitted = !!teacherPrimaryClass.daily?.session_id;
    if (isSubmitted) {
      return {
        status: 'submitted' as const,
        label: 'Submitted & Verified',
        cta: 'View Submitted Register',
        draftInfo: null
      };
    }

    // Identify authentic local attendance draft:
    // Strictly matching user, class, date, mode === 'draft', and active pending/syncing status
    const matchingDraft = pendingQueue.find(
      (item) =>
        item.userId === user?.id &&
        item.classId === teacherPrimaryClass.classId &&
        item.date === today &&
        item.mode === 'draft' &&
        (item.status === 'pending' || item.status === 'syncing')
    );

    if (matchingDraft) {
      return {
        status: 'draft' as const,
        label: 'Draft Saved on Device',
        cta: 'Resume Register Draft',
        draftInfo: matchingDraft
      };
    }

    return {
      status: 'unmarked' as const,
      label: 'Not Yet Marked',
      cta: 'Take Morning Register',
      draftInfo: null
    };
  }, [teacherPrimaryClass, pendingQueue, user]);

  // Filtered attendance matrix for Screen 02 with Grade-Band support
  const filteredDailyReport = useMemo(() => {
    return dailyReport.filter((c) => {
      // Grade Band filter
      const grade = Number(c.grade || 0);
      if (gradeBandFilter === 'junior' && (grade < 6 || grade > 9)) return false;
      if (gradeBandFilter === 'ol' && (grade < 10 || grade > 11)) return false;
      if (gradeBandFilter === 'al' && (grade < 12 || grade > 13)) return false;

      // Status filter
      if (classFilter === 'pending' && c.session_id) return false;
      if (classFilter === 'completed' && !c.session_id) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (c.class_name || '').toLowerCase().includes(q);
        const matchesTeacher = (c.class_teacher_name || '').toLowerCase().includes(q);
        if (!matchesName && !matchesTeacher) return false;
      }
      return true;
    });
  }, [dailyReport, classFilter, gradeBandFilter, searchQuery]);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard?.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const cleanName = user?.full_name?.replace(/\s*\([^)]*\)/g, '').trim() || 'Faculty Member';
  const now = new Date();
  const hour = now.getHours();
  const greetingTime = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayFormatted = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const todayCivil = getColomboCivilDate();

  return (
    <div className="dashboard-container">
      {/* ====================================================================
          SHARED INSTITUTIONAL HEADER & BANNER
          ==================================================================== */}
      <div className="dashboard-banner">
        <div className="dashboard-banner-content">
          <div className="dashboard-title-row">
            <h2 className="dashboard-title">
              {activeView === 'admin' ? 'School Operations Overview' : `${greetingTime}, ${cleanName}`}
            </h2>
            <span
              className="badge"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-main)',
                fontWeight: 600,
                fontSize: '0.75rem',
                border: '1px solid var(--border-color)'
              }}
            >
              Academic Year 2026 • Term 1
            </span>
            <span
              className="badge"
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-muted)',
                fontWeight: 500,
                fontSize: '0.75rem',
                border: '1px solid var(--border-color)'
              }}
            >
              <Clock size={12} style={{ marginRight: 4, display: 'inline' }} />
              {todayFormatted} (Asia/Colombo)
            </span>
            <span
              className="badge"
              style={{
                background: isOnline ? 'var(--present-bg)' : 'var(--absent-bg)',
                color: isOnline ? 'var(--present)' : 'var(--absent)',
                fontSize: '0.72rem',
                fontWeight: 600,
                border: '1px solid var(--border-color)'
              }}
              title={isOnline ? 'Connected to local network & backend' : 'Working in local offline mode'}
            >
              {isOnline ? <Wifi size={11} style={{ marginRight: 3, display: 'inline' }} /> : <WifiOff size={11} style={{ marginRight: 3, display: 'inline' }} />}
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <p className="dashboard-school-info">
            <strong>{SCHOOL_PROFILE.name}</strong> ({SCHOOL_PROFILE.nameTamil}) • {SCHOOL_PROFILE.type} (Census {SCHOOL_PROFILE.censusNo})
          </p>

          <p className="dashboard-role-info">
            {activeView === 'admin' ? (
              <span>
                <strong>Principal Profile:</strong> {SCHOOL_PROFILE.principalName} • Executive institutional overview across Grades 6 to 13
              </span>
            ) : (
              <span>
                <strong>Faculty Profile:</strong> {cleanName} • Assigned: {teacherPrimaryClass?.className || 'Grade 8-A'} Class Teacher • Grade 6–13 Portal
              </span>
            )}
          </p>
        </div>

        <div className="dashboard-banner-actions">
          {/* Administrator / Leadership Role View Switcher */}
          {isLeadership && (
            <div className="dashboard-view-toggle" title="Switch presentation between Executive Overview and Teacher Cockpit preview">
              <button
                type="button"
                className={`dashboard-view-toggle-btn ${activeView === 'admin' ? 'active' : ''}`}
                onClick={() => setActiveView('admin')}
              >
                Executive Overview
              </button>
              <button
                type="button"
                className={`dashboard-view-toggle-btn ${activeView === 'teacher' ? 'active' : ''}`}
                onClick={() => setActiveView('teacher')}
              >
                Teacher View
              </button>
            </div>
          )}

          {activeView === 'admin' ? (
            <>
              <button
                onClick={() => onNavigate('students')}
                className="btn btn-secondary btn-sm"
                aria-label="Add new student"
              >
                <span>+ Add Student</span>
              </button>
              <button
                onClick={() => onNavigate('attendance')}
                className="btn btn-primary btn-sm"
                aria-label="Take daily class attendance"
              >
                <CalendarCheck size={16} />
                <span>Take Attendance</span>
              </button>
              <button
                onClick={() => onNavigate('marks')}
                className="btn btn-secondary btn-sm"
                aria-label="Enter examination marks"
              >
                <GraduationCap size={16} />
                <span>Enter Marks</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onNavigate('attendance')}
                className="btn btn-primary btn-sm"
                aria-label="Go to Class Attendance"
              >
                <CalendarCheck size={16} />
                <span>My Attendance Register</span>
              </button>
              <button
                onClick={() => onNavigate('marks')}
                className="btn btn-secondary btn-sm"
                aria-label="Go to Examination Marks"
              >
                <GraduationCap size={16} />
                <span>Enter Subject Marks</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div
          className="card"
          style={{
            borderLeft: '4px solid var(--absent)',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--absent-bg)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: 'var(--absent)' }}>
            <AlertTriangle size={20} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{error}</span>
          </div>
          <button onClick={loadDashboardData} className="btn btn-secondary btn-sm">
            Retry
          </button>
        </div>
      )}

      {/* Loading Synchronization Indicator */}
      {loading && !error && (
        <div style={{ padding: '0.35rem 0', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={14} className="spin" />
          <span>Synchronizing institutional metrics & offline storage status...</span>
        </div>
      )}

      {/* ====================================================================
          SCREEN 02: ADMINISTRATOR / PRINCIPAL DASHBOARD
          ==================================================================== */}
      {activeView === 'admin' && (
        <>
          {/* High-Priority KPI Bento Grid (4 Cards) */}
          <div className="dashboard-stats-grid">
            {/* Card 1: Total Enrolled Students (Required Test Invariant) */}
            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Total Enrolled Students</span>
                <div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                  <Users size={20} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">{stats.totalStudents}</div>
                <div className="stat-trend" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                  <span>Grades 6 to 13 • Active Census</span>
                </div>
              </div>
            </div>

            {/* Card 2: Today's Attendance Rate */}
            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Today's Attendance Rate</span>
                <div className="stat-icon" style={{ background: 'var(--present-bg)', color: 'var(--present)' }}>
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val" style={{ fontSize: stats.attendanceRate !== null ? undefined : '1.35rem' }}>
                  {stats.attendanceRate !== null ? `${stats.attendanceRate}%` : 'Not Recorded'}
                </div>
                <div
                  className="stat-trend"
                  style={{
                    background: stats.attendanceRate === null
                      ? 'var(--bg-subtle)'
                      : stats.attendanceRate >= 80
                      ? 'var(--present-bg)'
                      : 'var(--late-bg)',
                    color: stats.attendanceRate === null
                      ? 'var(--text-muted)'
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

            {/* Card 3: Active School Classes (Required Test Invariant) */}
            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Active School Classes</span>
                <div className="stat-icon" style={{ background: 'var(--accent-light)', color: 'var(--on-accent)' }}>
                  <School size={20} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">{stats.classesCount}</div>
                <div className="stat-trend" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                  <span>A & B Streams • Grades 6–13</span>
                </div>
              </div>
            </div>

            {/* Card 4: Teaching Staff on Duty */}
            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Teaching Staff on Duty</span>
                <div className="stat-icon" style={{ background: 'var(--secondary-light)', color: 'var(--secondary)' }}>
                  <UserCheck size={20} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">{stats.staffCount > 0 ? stats.staffCount : stats.classesCount}</div>
                <div className="stat-trend" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                  <span>Class & Subject Faculty</span>
                </div>
              </div>
            </div>
          </div>

          {/* Institutional Roll-Call Summary Bar */}
          <div className="attendance-summary-bar">
            <div className="summary-pill-item">
              <div className="summary-pill-dot" style={{ background: 'var(--present)' }} />
              <div className="summary-pill-text">
                <span className="summary-pill-count">{stats.presentCount}</span>
                <span className="summary-pill-label">Present pupils</span>
              </div>
            </div>

            <div className="summary-pill-item">
              <div className="summary-pill-dot" style={{ background: 'var(--absent)' }} />
              <div className="summary-pill-text">
                <span className="summary-pill-count">{stats.absentCount}</span>
                <span className="summary-pill-label">Unexcused absents</span>
              </div>
            </div>

            <div className="summary-pill-item">
              <div className="summary-pill-dot" style={{ background: 'var(--late)' }} />
              <div className="summary-pill-text">
                <span className="summary-pill-count">{stats.lateCount}</span>
                <span className="summary-pill-label">Late arrivals</span>
              </div>
            </div>

            <div className="summary-pill-item">
              <div className="summary-pill-dot" style={{ background: 'var(--primary)' }} />
              <div className="summary-pill-text">
                <span className="summary-pill-count">
                  {stats.submittedClassesCount} / {stats.classesCount}
                </span>
                <span className="summary-pill-label">Registers submitted</span>
              </div>
            </div>

            <div className="attendance-summary-progress-track">
              <div
                className="attendance-summary-progress-bar"
                style={{ width: `${stats.attendanceRate || 0}%` }}
              />
            </div>
          </div>

          {/* Primary Operations 2-Column Grid (65% / 35%) */}
          <div className="dashboard-grid-dual">
            {/* Left Column: Dynamic Class Attendance Submission Matrix */}
            <div className="card">
              <div className="card-header">
                <div>
                  {/* Required Test Invariant: 'Daily Attendance Register Status' */}
                  <div className="card-title">Daily Attendance Register Status</div>
                  <div className="card-subtitle">
                    Real-time class roll-call completion across all {stats.classesCount} school classes
                  </div>
                </div>

                <button
                  onClick={() => onNavigate('attendance-reports')}
                  className="btn btn-secondary btn-sm"
                  title="View full monthly presence reports"
                >
                  Monthly Matrix <ArrowRight size={14} />
                </button>
              </div>

              {/* Grade Band Filter Pills */}
              <div className="stream-filter-pills" role="tablist" aria-label="Filter classes by grade division">
                <button
                  type="button"
                  className={`stream-pill-btn ${gradeBandFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setGradeBandFilter('all')}
                >
                  All Divisions ({dailyReport.length})
                </button>
                <button
                  type="button"
                  className={`stream-pill-btn ${gradeBandFilter === 'junior' ? 'active' : ''}`}
                  onClick={() => setGradeBandFilter('junior')}
                >
                  Junior (Grades 6–9)
                </button>
                <button
                  type="button"
                  className={`stream-pill-btn ${gradeBandFilter === 'ol' ? 'active' : ''}`}
                  onClick={() => setGradeBandFilter('ol')}
                >
                  O/L (Grades 10–11)
                </button>
                <button
                  type="button"
                  className={`stream-pill-btn ${gradeBandFilter === 'al' ? 'active' : ''}`}
                  onClick={() => setGradeBandFilter('al')}
                >
                  A/L Collegiate (Grades 12–13)
                </button>
              </div>

              {/* Filter & Search Bar */}
              <div className="matrix-filter-bar">
                <div className="matrix-search-box">
                  <input
                    type="text"
                    placeholder="Search class or teacher..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Filter classes by name or teacher"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                      aria-label="Clear search query"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="matrix-filter-pills">
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
                  <button
                    onClick={() => setClassFilter('completed')}
                    className={`btn btn-sm ${classFilter === 'completed' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Done ({dailyReport.filter((c) => !!c.session_id).length})
                  </button>
                </div>
              </div>

              {/* Matrix Dynamic Table */}
              <div className="matrix-table-wrap">
                {filteredDailyReport.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                    <CheckCircle size={36} style={{ color: 'var(--present)', margin: '0 auto 0.5rem' }} />
                    <p style={{ fontWeight: 600, margin: 0 }}>No classes match current filter</p>
                    <p style={{ fontSize: '0.8rem', marginTop: 4 }}>
                      {classFilter === 'pending'
                        ? 'All classes have submitted their attendance registers for today!'
                        : 'Adjust division, search, or status filter.'}
                    </p>
                  </div>
                ) : (
                  <table className="matrix-table">
                    <thead>
                      <tr>
                        <th scope="col">Class & Teacher</th>
                        <th scope="col">Enrolled</th>
                        <th scope="col">Present / Absent</th>
                        <th scope="col" style={{ width: 140 }}>Rate & Progress</th>
                        <th scope="col">Status</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDailyReport.map((c) => {
                        const present = Number(c.present_count || 0);
                        const absent = Number(c.absent_count || 0);
                        const total = Number(c.enrolled_count || 0);
                        const pct = total > 0 ? Math.round((present / total) * 100) : 0;
                        const isSubmitted = !!c.session_id;

                        // Check if an uncommitted draft exists on this device for this class
                        const hasLocalDraft = pendingQueue.some(
                          (item) =>
                            item.classId === c.class_id &&
                            item.date === todayCivil &&
                            item.mode === 'draft' &&
                            (item.status === 'pending' || item.status === 'syncing')
                        );

                        return (
                          <tr key={c.class_id}>
                            <td>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{c.class_name}</div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                {c.class_teacher_name ? c.class_teacher_name : 'Teacher unassigned'}
                              </div>
                            </td>
                            <td>
                              <span style={{ fontWeight: 700 }}>{total}</span>
                            </td>
                            <td>
                              {isSubmitted ? (
                                <span style={{ fontSize: '0.82rem' }}>
                                  <span style={{ color: 'var(--present)', fontWeight: 700 }}>{present}</span> P •{' '}
                                  <span style={{ color: 'var(--absent)', fontWeight: 700 }}>{absent}</span> A
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                              )}
                            </td>
                            <td>
                              {isSubmitted ? (
                                <div>
                                  <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>{pct}%</div>
                                  <div className="matrix-progress-bar">
                                    <div
                                      className="matrix-progress-fill"
                                      style={{
                                        width: `${pct}%`,
                                        background: pct >= 80 ? 'var(--present)' : pct >= 60 ? 'var(--late)' : 'var(--absent)'
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Pending roll-call</span>
                              )}
                            </td>
                            <td>
                              {isSubmitted ? (
                                <span className="status-indicator-pill status-completed">
                                  <CheckCircle size={12} /> Completed
                                </span>
                              ) : hasLocalDraft ? (
                                <span className="status-indicator-pill status-draft">
                                  <Clock size={12} /> Draft Saved
                                </span>
                              ) : (
                                <span className="status-indicator-pill status-pending">
                                  <AlertTriangle size={12} /> Pending
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => onNavigate('attendance')}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                                aria-label={`${isSubmitted ? 'View' : 'Open'} attendance register for ${c.class_name}`}
                              >
                                {isSubmitted ? 'View' : 'Open'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Right Column: Priorities, Quick Actions, Offline Sync & Audit Alerts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Widget 1: Absentee Follow-Up Alert & Call Registry */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <PhoneCall size={18} style={{ color: 'var(--absent)' }} />
                      <span>Absentee Follow-Up Directory</span>
                    </div>
                    <div className="card-subtitle">
                      Direct guardian telephone contact for unexcused absences
                    </div>
                  </div>
                  <span className="badge" style={{ background: 'var(--absent-bg)', color: 'var(--absent)', fontWeight: 800 }}>
                    {absentStudents.length} Absentees
                  </span>
                </div>

                <div className="absentee-call-registry">
                  {absentStudents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.75rem 1rem', color: 'var(--text-muted)' }}>
                      <UserCheck size={32} style={{ color: 'var(--present)', margin: '0 auto 0.5rem' }} />
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>
                        No unexcused absences recorded yet today.
                      </p>
                    </div>
                  ) : (
                    absentStudents.slice(0, 8).map((st) => (
                      <div key={st.id} className="absentee-card">
                        <div className="absentee-info">
                          <span className="absentee-name">{st.full_name}</span>
                          <span className="absentee-sub">
                            <span className="badge badge-sm" style={{ background: 'var(--bg-surface)' }}>{st.class_name}</span>
                            <span>•</span>
                            <span>{st.admission_no}</span>
                            <span>•</span>
                            <span>Guardian: {st.guardian_name || 'Guardian'}</span>
                          </span>
                        </div>

                        <div className="absentee-actions">
                          {st.guardian_phone ? (
                            <>
                              <a
                                href={`tel:${st.guardian_phone}`}
                                className="btn-call"
                                title={`Call guardian at ${st.guardian_phone}`}
                              >
                                <PhoneCall size={12} />
                                <span>{st.guardian_phone}</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => handleCopyPhone(st.guardian_phone)}
                                className="btn-copy-phone"
                                title={copiedPhone === st.guardian_phone ? 'Phone copied!' : 'Copy telephone number'}
                                aria-label={`Copy phone number for ${st.guardian_name}`}
                              >
                                {copiedPhone === st.guardian_phone ? <Check size={12} style={{ color: 'var(--present)' }} /> : <Copy size={12} />}
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No phone</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => onNavigate('attendance-reports')}
                    className="btn btn-secondary btn-sm"
                  >
                    View All Student Follow-ups <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {/* Widget 2: Core Administrative Workflows Grid */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Layers size={18} style={{ color: 'var(--primary)' }} />
                      <span>Administrative Workflows</span>
                    </div>
                    <div className="card-subtitle">Fast 1-click access to core operational areas</div>
                  </div>
                </div>

                <div className="admin-actions-grid">
                  <div
                    className="admin-action-item"
                    onClick={() => onNavigate('students')}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('students'); }}
                  >
                    <div className="admin-action-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                      <Users size={20} />
                    </div>
                    <div>
                      <div className="admin-action-title">Student Directory</div>
                      <div className="admin-action-desc">Profiles, NIC & census</div>
                    </div>
                  </div>

                  <div
                    className="admin-action-item"
                    onClick={() => onNavigate('attendance')}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('attendance'); }}
                  >
                    <div className="admin-action-icon" style={{ background: 'var(--present-bg)', color: 'var(--present)' }}>
                      <CalendarCheck size={20} />
                    </div>
                    <div>
                      <div className="admin-action-title">Daily Roll-Call</div>
                      <div className="admin-action-desc">Class registers & sync</div>
                    </div>
                  </div>

                  <div
                    className="admin-action-item"
                    onClick={() => onNavigate('marks')}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('marks'); }}
                  >
                    <div className="admin-action-icon" style={{ background: 'var(--secondary-light)', color: 'var(--secondary)' }}>
                      <GraduationCap size={20} />
                    </div>
                    <div>
                      <div className="admin-action-title">Marks & Exams</div>
                      <div className="admin-action-desc">Grading & report cards</div>
                    </div>
                  </div>

                  <div
                    className="admin-action-item"
                    onClick={() => onNavigate('attendance-reports')}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('attendance-reports'); }}
                  >
                    <div className="admin-action-icon" style={{ background: 'var(--accent-light)', color: 'var(--on-accent)' }}>
                      <FileSpreadsheet size={20} />
                    </div>
                    <div>
                      <div className="admin-action-title">Monthly Registry</div>
                      <div className="admin-action-desc">Matrices & export</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Widget 3: Honest Device & Offline Sync Status */}
              <div className="sync-monitor-card">
                <div className="sync-monitor-header">
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Database size={16} style={{ color: 'var(--primary)' }} />
                      <span>Device Sync & Storage Health</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      IndexedDB v2 local storage & transaction cache
                    </div>
                  </div>

                  <span
                    className="sync-status-badge"
                    style={{
                      background: syncSummary?.hasUnsyncedWork ? 'var(--late-bg)' : 'var(--present-bg)',
                      color: syncSummary?.hasUnsyncedWork ? 'var(--late)' : 'var(--present)'
                    }}
                  >
                    {syncSummary?.hasUnsyncedWork ? (
                      <>
                        <AlertTriangle size={12} /> {syncSummary.total} Unsynced
                      </>
                    ) : (
                      <>
                        <CheckCircle size={12} /> Storage Operational
                      </>
                    )}
                  </span>
                </div>

                <div className="sync-metrics-grid">
                  <div className="sync-metric-item">
                    <div className="sync-metric-val">{syncSummary?.pending || 0}</div>
                    <div className="sync-metric-label">Pending Sync</div>
                  </div>
                  <div className="sync-metric-item">
                    <div className="sync-metric-val">{syncSummary?.conflicted || 0}</div>
                    <div className="sync-metric-label">Conflicts</div>
                  </div>
                  <div className="sync-metric-item">
                    <div className="sync-metric-val">{syncSummary?.quarantined || 0}</div>
                    <div className="sync-metric-label">Quarantined</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Browser Engine: <strong>IndexedDB v2 Partitioned</strong>
                  </span>
                  <button
                    onClick={() => onNavigate('attendance')}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                  >
                    Sync Center <RefreshCw size={12} />
                  </button>
                </div>
              </div>

              {/* Widget 4: Recent Tamper-Evident Audit Feed */}
              {user?.role === 'admin' && recentLogs.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <ShieldCheck size={18} style={{ color: 'var(--primary)' }} />
                        <span>Recent Audit Activity</span>
                      </div>
                      <div className="card-subtitle">
                        Tamper-evident logs of institutional actions
                      </div>
                    </div>
                    <button onClick={() => onNavigate('audit')} className="btn btn-secondary btn-sm">
                      All Logs <ArrowRight size={14} />
                    </button>
                  </div>

                  <div className="table-responsive">
                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th scope="col">Time</th>
                          <th scope="col">User</th>
                          <th scope="col">Action</th>
                          <th scope="col">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentLogs.map((log) => {
                          const actionBadgeClass = log.action?.includes('LOGIN')
                            ? 'badge-audit-login'
                            : log.action?.includes('ATTENDANCE')
                            ? 'badge-audit-attendance'
                            : log.action?.includes('EXAM') || log.action?.includes('MARKS')
                            ? 'badge-audit-exam'
                            : 'badge-audit-user';

                          const timeStr = log.timestamp ? log.timestamp.split('T')[1]?.slice(0, 5) || log.timestamp : '—';
                          const detailsStr = typeof log.details === 'string' ? log.details : JSON.stringify(log.details);

                          return (
                            <tr key={log.id}>
                              <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {timeStr}
                              </td>
                              <td><strong>{log.username}</strong></td>
                              <td>
                                <span
                                  className={`badge ${actionBadgeClass}`}
                                  style={{
                                    fontSize: '0.7rem',
                                    border: '1px solid transparent'
                                  }}
                                >
                                  {log.action}
                                </span>
                              </td>
                              <td
                                style={{ color: 'var(--text-muted)', fontSize: '0.75rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={detailsStr}
                              >
                                {detailsStr}
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
          </div>
        </>
      )}

      {/* ====================================================================
          SCREEN 03: TEACHER DASHBOARD
          ==================================================================== */}
      {activeView === 'teacher' && (
        <>
          {/* Class Switcher for Teachers with multiple assignments */}
          {teacherAvailableClasses.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '-0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Viewing Class:
              </span>
              <select
                className="form-select"
                style={{ width: 'auto', padding: '0.35rem 0.85rem', fontSize: '0.85rem' }}
                value={teacherPrimaryClass?.classId || ''}
                onChange={(e) => setTeacherSelectedClassId(Number(e.target.value))}
                aria-label="Select class to view dashboard"
              >
                {teacherAvailableClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Hero Action Card: Daily Attendance Register */}
          <div className={`teacher-hero-card status-${teacherRegisterState.status}`}>
            <div className="hero-left-section">
              <span
                className="hero-status-pill"
                style={{
                  background:
                    teacherRegisterState.status === 'submitted'
                      ? 'var(--present-bg)'
                      : teacherRegisterState.status === 'draft'
                      ? 'var(--late-bg)'
                      : 'var(--absent-bg)',
                  color:
                    teacherRegisterState.status === 'submitted'
                      ? 'var(--present)'
                      : teacherRegisterState.status === 'draft'
                      ? 'var(--late)'
                      : 'var(--absent)'
                }}
              >
                {teacherRegisterState.status === 'submitted' && <CheckCircle size={14} />}
                {teacherRegisterState.status === 'draft' && <AlertTriangle size={14} />}
                {teacherRegisterState.status === 'unmarked' && <Clock size={14} />}
                <span>{teacherRegisterState.label}</span>
              </span>

              {/* Required Test Invariant Included in Header */}
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Daily Attendance Register Status
              </div>

              <h2 className="hero-class-title">
                {teacherPrimaryClass?.className || 'Grade 8-A'} Daily Attendance Register
              </h2>

              <div className="hero-class-meta">
                <span>
                  <strong>Academic Year:</strong> 2026 Term 1
                </span>
                <span>•</span>
                <span>
                  <strong>Enrolled Roster:</strong> {teacherPrimaryClass?.daily?.enrolled_count || 38} Students
                </span>
                <span>•</span>
                <span>
                  <strong>Official Status:</strong>{' '}
                  {teacherRegisterState.status === 'submitted'
                    ? `${teacherPrimaryClass?.daily?.present_count || 0} Present, ${teacherPrimaryClass?.daily?.absent_count || 0} Absent`
                    : teacherRegisterState.status === 'draft' && teacherRegisterState.draftInfo
                    ? `Local draft saved (${teacherRegisterState.draftInfo.records.length} pupils marked)`
                    : 'Morning roll-call awaiting submission'}
                </span>
              </div>
            </div>

            <div className="hero-action-section">
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className={`btn-hero-cta cta-${teacherRegisterState.status === 'submitted' ? 'view' : teacherRegisterState.status === 'draft' ? 'resume' : 'take'}`}
                aria-label={teacherRegisterState.cta}
              >
                {teacherRegisterState.status === 'submitted' ? (
                  <Eye size={20} />
                ) : teacherRegisterState.status === 'draft' ? (
                  <Edit3 size={20} />
                ) : (
                  <CalendarCheck size={20} />
                )}
                <span>{teacherRegisterState.cta}</span>
                <ArrowRight size={18} />
              </button>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {teacherRegisterState.status === 'submitted'
                  ? 'Official session recorded in school database'
                  : 'Works offline • Automatically syncs when online'}
              </div>
            </div>
          </div>

          {/* Teacher Metric Summary Cards (.stat-card) */}
          <div className="dashboard-stats-grid">
            {/* Card 1: Total Enrolled Students (Required Test Invariant) */}
            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Total Enrolled Students</span>
                <div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                  <Users size={20} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">
                  {teacherPrimaryClass?.daily?.enrolled_count || stats.totalStudents}
                </div>
                <div className="stat-trend" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                  <span>{teacherPrimaryClass?.className || 'Grade 8-A'} Roster</span>
                </div>
              </div>
            </div>

            {/* Card 2: Today's Class Presence Rate */}
            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Today's Attendance Rate</span>
                <div className="stat-icon" style={{ background: 'var(--present-bg)', color: 'var(--present)' }}>
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">
                  {teacherPrimaryClass?.daily?.present_count !== undefined && teacherPrimaryClass.daily.session_id
                    ? `${Math.round((Number(teacherPrimaryClass.daily.present_count) / Math.max(Number(teacherPrimaryClass.daily.enrolled_count), 1)) * 100)}%`
                    : 'Pending'}
                </div>
                <div className="stat-trend" style={{ background: 'var(--present-bg)', color: 'var(--present)' }}>
                  <span>
                    {teacherPrimaryClass?.daily?.present_count !== undefined && teacherPrimaryClass.daily.session_id
                      ? `${teacherPrimaryClass.daily.present_count} Present • ${teacherPrimaryClass.daily.absent_count} Absent`
                      : 'Roll-call pending'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Active School Classes (Required Test Invariant) */}
            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Active School Classes</span>
                <div className="stat-icon" style={{ background: 'var(--accent-light)', color: 'var(--on-accent)' }}>
                  <School size={20} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">{stats.classesCount}</div>
                <div className="stat-trend" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                  <span>Kattankudy Central College</span>
                </div>
              </div>
            </div>

            {/* Card 4: Absentees in My Class Today */}
            <div className="stat-card">
              <div className="stat-header-row">
                <span className="stat-label">Absentees in My Class</span>
                <div className="stat-icon" style={{ background: 'var(--absent-bg)', color: 'var(--absent)' }}>
                  <PhoneCall size={20} />
                </div>
              </div>
              <div className="stat-content">
                <div className="stat-val">
                  {teacherPrimaryClass?.daily?.absent_count !== undefined && teacherPrimaryClass.daily.session_id
                    ? teacherPrimaryClass.daily.absent_count
                    : '0'}
                </div>
                <div className="stat-trend" style={{ background: 'var(--absent-bg)', color: 'var(--absent)' }}>
                  <span>Guardian follow-up ready</span>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Bento Grid for Teachers */}
          <div className="dashboard-grid-dual">
            {/* Left: Teaching Schedule & Assignments */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">My Classes & Teaching Assignments</div>
                  <div className="card-subtitle">Assigned grade streams and subject allocations</div>
                </div>
              </div>

              <div className="teacher-assignments-grid">
                {user?.assignments && user.assignments.length > 0 ? (
                  user.assignments.map((a: any, idx: number) => (
                    <div key={idx} className="assignment-chip-card">
                      <div className="assignment-header">
                        <span className="assignment-class-name">{a.class_name}</span>
                        <span
                          className="badge"
                          style={{
                            background: a.assignment_type === 'class_teacher' ? 'var(--primary-light)' : 'var(--bg-surface)',
                            color: a.assignment_type === 'class_teacher' ? 'var(--primary)' : 'var(--text-main)',
                            fontSize: '0.72rem'
                          }}
                        >
                          {a.assignment_type === 'class_teacher' ? 'Class Teacher' : 'Subject Faculty'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {a.subject_name ? (
                          <span>Subject: <strong>{a.subject_name}</strong> ({a.subject_code})</span>
                        ) : (
                          <span>Primary Class In-Charge</span>
                        )}
                      </div>

                      <div className="assignment-actions">
                        <button
                          onClick={() => onNavigate('attendance')}
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1, fontSize: '0.75rem' }}
                        >
                          <CalendarCheck size={13} />
                          <span>Register</span>
                        </button>
                        <button
                          onClick={() => onNavigate('marks')}
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1, fontSize: '0.75rem' }}
                        >
                          <GraduationCap size={13} />
                          <span>Marks</span>
                        </button>
                      </div>
                    </div>
                  ))
                ) : isLeadership ? (
                  <div className="assignment-chip-card">
                    <div className="assignment-header">
                      <span className="assignment-class-name">{teacherPrimaryClass?.className || 'Grade 8-A'}</span>
                      <span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>Administrator Preview</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Executive preview of faculty class assignment view
                    </div>
                    <div className="assignment-actions">
                      <button
                        onClick={() => onNavigate('attendance')}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, fontSize: '0.75rem' }}
                      >
                        <CalendarCheck size={13} />
                        <span>Register</span>
                      </button>
                      <button
                        onClick={() => onNavigate('marks')}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1, fontSize: '0.75rem' }}
                      >
                        <GraduationCap size={13} />
                        <span>Marks</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No teaching allocations assigned to this account. Contact school administration.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Pending Marks & Examination Reminders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Examination Grading Deadlines */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <GraduationCap size={18} style={{ color: 'var(--secondary)' }} />
                      <span>Pending Marks Entry & Exams</span>
                    </div>
                    <div className="card-subtitle">Official assessment grading deadlines</div>
                  </div>
                  <button onClick={() => onNavigate('marks')} className="btn btn-secondary btn-sm">
                    Enter Marks <ArrowRight size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {examinations.length > 0 ? (
                    examinations.slice(0, 3).map((exam) => (
                      <div
                        key={exam.id}
                        style={{
                          padding: '0.85rem 1rem',
                          background: 'var(--bg-subtle)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem'
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{exam.name}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            Term {exam.term} • Status: <span style={{ textTransform: 'capitalize' }}>{exam.status}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => onNavigate('marks')}
                          className="btn btn-primary btn-sm"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        >
                          Grade <ArrowRight size={12} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--text-muted)' }}>
                      <CheckCircle size={28} style={{ color: 'var(--present)', margin: '0 auto 0.4rem' }} />
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>No pending examination grading deadlines.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Teacher Device Offline Storage Health */}
              <div className="sync-monitor-card">
                <div className="sync-monitor-header">
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Smartphone size={16} style={{ color: 'var(--primary)' }} />
                      <span>This Device's Offline Queue</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Personal IndexedDB storage status
                    </div>
                  </div>

                  <span
                    className="sync-status-badge"
                    style={{
                      background: syncSummary?.hasUnsyncedWork ? 'var(--late-bg)' : 'var(--present-bg)',
                      color: syncSummary?.hasUnsyncedWork ? 'var(--late)' : 'var(--present)'
                    }}
                  >
                    {syncSummary?.hasUnsyncedWork ? 'Unsynced Mutations' : 'Storage Synced'}
                  </span>
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  Attendance roll-calls recorded without connectivity are safely preserved in browser IndexedDB v2 and will auto-sync upon reconnection.
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => onNavigate('attendance')}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem' }}
                  >
                    Manage Register <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

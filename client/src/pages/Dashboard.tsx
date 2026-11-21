import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  CalendarCheck,
  School,
  TrendingUp,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  ShieldCheck,
  RefreshCw,
  Smartphone,
  Layers,
  FileSpreadsheet,
  Activity,
  Calendar,
  ChevronRight,
  Info
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

  // Role-tailored active view mode: administrators can preview teacher cockpit
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
    unsubmittedClassesCount: number;
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
    unsubmittedClassesCount: 0,
    staffCount: 0
  });

  const [classesList, setClassesList] = useState<any[]>([]);
  const [dailyReport, setDailyReport] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [classroomOverview, setClassroomOverview] = useState<any | null>(null);
  const [syncSummary, setSyncSummary] = useState<UnsyncedWorkSummary | null>(null);
  const [pendingQueue, setPendingQueue] = useState<OfflineAttendanceMutation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<any | null>(null);

  // Teacher selected class (for teachers with multiple classes)
  const [teacherSelectedClassId, setTeacherSelectedClassId] = useState<number | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const today = getColomboCivilDate();

      const [studentsRes, classesRes, dailyRes, summaryRes, classroomRes] = await Promise.all([
        api.getStudents().catch(() => ({ count: 0, students: [] })),
        api.getClasses().catch(() => ({ classes: [] })),
        api.getDailyAttendanceReport(today).catch(() => ({ classes: [], absentStudents: [] })),
        api.getDashboardSummary(today).catch(() => null),
        api.getClassroomStatusOverview().catch(() => null)
      ]);

      const classes = classesRes.classes || [];
      setClassesList(classes);
      setDashboardSummary(summaryRes);
      if (classroomRes) {
        setClassroomOverview(classroomRes);
      }

      let totalPresent = 0;
      let totalAbsent = 0;
      let totalLate = 0;
      let totalExcused = 0;
      const totalEnrolled = summaryRes?.stats?.totalStudents ??
        (studentsRes.count || (studentsRes.students ? studentsRes.students.length : 220));
      let recordedClasses = 0;

      const dailyClasses = dailyRes.classes || [];
      setDailyReport(dailyClasses);

      if (summaryRes?.stats) {
        totalPresent = summaryRes.stats.presentCount || 0;
        totalAbsent = summaryRes.stats.absentCount || 0;
        totalLate = summaryRes.stats.lateCount || 0;
        totalExcused = summaryRes.stats.excusedCount || 0;
        recordedClasses = summaryRes.stats.submittedClassesCount || 0;
      } else {
        dailyClasses.forEach((c: any) => {
          if (c.session_id) {
            recordedClasses++;
            totalPresent += Number(c.present_count || 0);
            totalAbsent += Number(c.absent_count || 0);
            totalLate += Number(c.late_count || 0);
            totalExcused += Number(c.excused_count || 0);
          }
        });
      }

      const totalMarked = totalPresent + totalAbsent;
      const rate = summaryRes?.stats?.attendanceRate !== undefined
        ? summaryRes.stats.attendanceRate
        : (recordedClasses > 0 && totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : null);

      // Sourced active teaching faculty count
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

      const totalClassCount = summaryRes?.stats?.totalClasses || (classes.length > 0 ? classes.length : 18);
      const unsubmittedCount = Math.max(0, totalClassCount - recordedClasses);

      setStats({
        totalStudents: totalEnrolled,
        classesCount: totalClassCount,
        attendanceRate: rate,
        presentCount: totalPresent,
        absentCount: totalAbsent,
        lateCount: totalLate,
        excusedCount: totalExcused,
        submittedClassesCount: recordedClasses,
        unsubmittedClassesCount: unsubmittedCount,
        staffCount: facultyCount || 12
      });

      // Recent audit activity logs
      if (user?.role === 'admin') {
        if (summaryRes?.recentLogs && summaryRes.recentLogs.length > 0) {
          setRecentLogs(summaryRes.recentLogs.slice(0, 6));
        } else {
          try {
            const logsRes = await api.getAuditLogs();
            setRecentLogs((logsRes.logs || []).slice(0, 6));
          } catch (logErr) {
            console.warn('Could not fetch audit logs:', logErr);
          }
        }
      }

      // Check IndexedDB v2 offline storage accounting
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
      setError(err?.message || 'Failed to load school dashboard metrics. Please check connection.');
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
        cta: 'Take Morning Register'
      };
    }

    const today = getColomboCivilDate();
    const isSubmitted = !!teacherPrimaryClass.daily?.session_id;
    if (isSubmitted) {
      return {
        status: 'submitted' as const,
        label: 'Submitted & Verified',
        cta: 'View Submitted Register'
      };
    }

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
        cta: 'Resume Register Draft'
      };
    }

    return {
      status: 'unmarked' as const,
      label: 'Not Yet Marked',
      cta: 'Take Morning Register'
    };
  }, [teacherPrimaryClass, pendingQueue, user]);

  const cleanName = user?.full_name?.replace(/^DEMO ONLY:\s*/i, '').replace(/\s*\([^)]*\)/g, '').trim() || 'Faculty Member';
  const todayCivil = getColomboCivilDate();

  // Formatted date string for header
  const formattedTodayDate = useMemo(() => {
    try {
      const [year, month, day] = todayCivil.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return todayCivil;
    }
  }, [todayCivil]);

  // Classroom Monitoring State Derivation
  const classroomMonitoringState = useMemo(() => {
    const ctx = classroomOverview?.context;
    if (!ctx || !ctx.configured) {
      return {
        statusBadge: 'Setup Required',
        badgeColor: 'neutral',
        headline: 'Setup Required',
        meta: 'Official period timetable pending',
        isActivePeriod: false,
        isConfigured: false
      };
    }

    if (ctx.state === 'weekend') {
      return {
        statusBadge: 'Weekend',
        badgeColor: 'neutral',
        headline: 'Outside Hours',
        meta: 'Non-school day (Classes resume Monday)',
        isActivePeriod: false,
        isConfigured: true
      };
    }

    if (ctx.state === 'after_school') {
      return {
        statusBadge: 'Concluded',
        badgeColor: 'neutral',
        headline: 'Outside Hours',
        meta: 'School day concluded at 14:10',
        isActivePeriod: false,
        isConfigured: true
      };
    }

    if (ctx.state === 'before_school') {
      return {
        statusBadge: 'Before School',
        badgeColor: 'neutral',
        headline: 'Before School',
        meta: 'Period 1 commences at 07:50',
        isActivePeriod: false,
        isConfigured: true
      };
    }

    if (ctx.state === 'break') {
      return {
        statusBadge: 'Recess',
        badgeColor: 'warning',
        headline: 'Interval / Recess',
        meta: 'Morning interval in progress',
        isActivePeriod: false,
        isConfigured: true
      };
    }

    // Active teaching period
    const periodNum = ctx.periodNumber || 1;
    const teachingCount = classroomOverview?.summary?.teaching ?? 0;
    const totalClasses = classroomOverview?.summary?.totalClasses ?? stats.classesCount;

    return {
      statusBadge: `Period ${periodNum} Active`,
      badgeColor: 'success',
      headline: `Period ${periodNum}`,
      meta: `${teachingCount} of ${totalClasses} classes in instruction`,
      isActivePeriod: true,
      isConfigured: true
    };
  }, [classroomOverview, stats.classesCount]);

  // Operational Attention Items
  const attentionItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      description: string;
      type: 'warning' | 'danger' | 'info';
      actionLabel?: string;
      onAction?: () => void;
    }> = [];

    // 1. Unsubmitted attendance registers
    if (stats.unsubmittedClassesCount > 0) {
      items.push({
        id: 'unsubmitted-attendance',
        title: `${stats.unsubmittedClassesCount} Class Registers Pending`,
        description: `Attendance has not yet been submitted for ${stats.unsubmittedClassesCount} of ${stats.classesCount} classes today.`,
        type: 'warning',
        actionLabel: 'View Classes',
        onAction: () => onNavigate('attendance')
      });
    }

    // 2. Classrooms flagged as Not Teaching
    const unattendedCount = classroomOverview?.summary?.notTeaching || 0;
    if (classroomMonitoringState.isActivePeriod && unattendedCount > 0) {
      items.push({
        id: 'unattended-classrooms',
        title: `${unattendedCount} Classroom(s) Flagged Unattended`,
        description: `Walkthrough identified ${unattendedCount} class without active instruction in ${classroomMonitoringState.headline}. Immediate relief recommended.`,
        type: 'danger',
        actionLabel: 'View Classrooms',
        onAction: () => onNavigate('classroom-status')
      });
    }

    // 3. Timetable unconfigured notice
    if (!classroomMonitoringState.isConfigured) {
      items.push({
        id: 'timetable-unconfigured',
        title: 'Official Bell Schedule Not Configured',
        description: 'Live walkthrough tracking requires configured period start and end times.',
        type: 'info',
        actionLabel: 'Configure',
        onAction: () => onNavigate('admin')
      });
    }

    // 4. Offline unsynced work alert
    if (syncSummary && syncSummary.hasUnsyncedWork && syncSummary.total > 0) {
      items.push({
        id: 'unsynced-offline',
        title: `${syncSummary.total} Offline Record(s) Pending Sync`,
        description: 'Locally captured attendance records are waiting for network synchronization.',
        type: 'info',
        actionLabel: 'Sync Now',
        onAction: () => onNavigate('attendance')
      });
    }

    return items;
  }, [stats, classroomOverview, classroomMonitoringState, syncSummary, onNavigate]);

  // Human-readable formatting for recent audit activity
  const formattedLogs = useMemo(() => {
    return recentLogs.map((log) => {
      const action = log.action || '';
      let title = '';
      let detailText = '';

      if (action === 'ATTENDANCE_SUBMIT') {
        title = 'Submitted class attendance register';
        detailText = log.details?.className || (log.entity_id ? `Class #${log.entity_id}` : 'Class register');
      } else if (action === 'ATTENDANCE_UPDATE') {
        title = 'Corrected attendance register';
        detailText = log.details?.className || (log.entity_id ? `Class #${log.entity_id}` : 'Class register');
      } else if (action === 'CLASSROOM_STATUS_RECORD') {
        title = 'Recorded live classroom status';
        detailText = log.details?.className ? `${log.details.className} • ${log.details.status}` : 'Class walkthrough';
      } else if (action === 'TEACHER_ASSIGN') {
        title = 'Updated teacher assignment';
        detailText = log.details?.teacherName || 'Faculty role assignment';
      } else if (action === 'USER_CREATE') {
        title = 'Provisioned user account';
        detailText = log.details?.username || 'Staff member';
      } else if (action === 'STUDENT_CREATE') {
        title = 'Enrolled new student';
        detailText = log.details?.admissionNo ? `Index #${log.details.admissionNo}` : 'Student record';
      } else if (action === 'STUDENT_UPDATE') {
        title = 'Updated student record';
        detailText = log.details?.admissionNo ? `Index #${log.details.admissionNo}` : 'Student profile';
      } else if (action === 'TIMETABLE_UPDATE') {
        title = 'Updated school timetable';
        detailText = 'Nine-period bell schedule';
      } else if (action === 'USER_LOGIN') {
        title = 'User signed in';
        detailText = 'Web portal session';
      } else {
        title = action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase());
        detailText = typeof log.details === 'string' ? log.details : '';
      }

      let timeDisplay = '—';
      if (log.timestamp) {
        try {
          const d = new Date(log.timestamp.includes('Z') ? log.timestamp : `${log.timestamp}Z`);
          timeDisplay = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        } catch {
          timeDisplay = log.timestamp.split('T')[1]?.slice(0, 5) || log.timestamp;
        }
      }

      return {
        id: log.id,
        title,
        detailText,
        username: log.username || 'System',
        timeDisplay
      };
    });
  }, [recentLogs]);

  return (
    <div className="kcc-dashboard">
      {/* ====================================================================
          SECTION A: CLEAN MINIMAL PAGE HEADER
          ==================================================================== */}
      <header className="kcc-dash-header">
        <div className="kcc-dash-header-main">
          <div className="kcc-dash-title-group">
            <h1 className="kcc-dash-title">
              {activeView === 'admin' ? 'School Overview' : `Welcome, ${cleanName}`}
            </h1>
            <p className="kcc-dash-subtitle">
              Daily operations and attendance monitoring
            </p>
          </div>

          <div className="kcc-dash-header-actions">
            {/* Today Date Pill */}
            <div className="kcc-dash-date-pill" title="Colombo Civil Date">
              <Calendar size={14} className="kcc-dash-date-icon" />
              <span>{formattedTodayDate}</span>
            </div>

            {/* Contextual Action Button */}
            {activeView === 'admin' ? (
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className="btn btn-primary btn-sm kcc-dash-primary-btn"
                aria-label="Take daily class attendance"
              >
                <CalendarCheck size={15} />
                <span>Take Attendance</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className="btn btn-primary btn-sm kcc-dash-primary-btn"
                aria-label="Open my class attendance register"
              >
                <CalendarCheck size={15} />
                <span>My Class Register</span>
              </button>
            )}

            {/* View Switcher for Administrators */}
            {isLeadership && (
              <div className="kcc-dash-view-switcher" role="radiogroup" aria-label="Dashboard presentation view">
                <button
                  type="button"
                  className={`kcc-dash-view-btn ${activeView === 'admin' ? 'active' : ''}`}
                  onClick={() => setActiveView('admin')}
                  role="radio"
                  aria-checked={activeView === 'admin'}
                >
                  Executive
                </button>
                <button
                  type="button"
                  className={`kcc-dash-view-btn ${activeView === 'teacher' ? 'active' : ''}`}
                  onClick={() => setActiveView('teacher')}
                  role="radio"
                  aria-checked={activeView === 'teacher'}
                >
                  My Classes
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Error Feedback */}
      {error && (
        <div className="kcc-alert kcc-alert--danger" role="alert">
          <div className="kcc-alert-content">
            <AlertTriangle size={18} className="kcc-alert-icon" />
            <span className="kcc-alert-text">{error}</span>
          </div>
          <button onClick={loadDashboardData} className="btn btn-secondary btn-sm">
            Retry
          </button>
        </div>
      )}

      {/* Synchronizing Indicator */}
      {loading && !error && (
        <div className="kcc-dash-sync-indicator" role="status">
          <RefreshCw size={13} className="spin" />
          <span>Synchronizing institutional metrics...</span>
        </div>
      )}

      {/* ====================================================================
          ADMINISTRATOR / PRINCIPAL DASHBOARD
          ==================================================================== */}
      {activeView === 'admin' && (
        <>
          {/* ====================================================================
              SECTION B: PRIMARY KPI ROW (4 DISCIPLINED CARDS)
              ==================================================================== */}
          <section className="kcc-kpi-grid" aria-label="Primary institutional metrics">
            {/* KPI 1: Total Students */}
            <div className="kcc-kpi-card">
              <div className="kcc-kpi-header">
                <span className="kcc-kpi-label">Total Students</span>
                <span className="kcc-kpi-icon-wrap" aria-hidden="true">
                  <Users size={16} />
                </span>
              </div>
              <div className="kcc-kpi-body">
                <div className="kcc-kpi-value">{stats.totalStudents}</div>
                <div className="kcc-kpi-meta">Active enrollment (Grades 6–13)</div>
              </div>
            </div>

            {/* KPI 2: Recorded Attendance Rate */}
            <div className="kcc-kpi-card">
              <div className="kcc-kpi-header">
                <span className="kcc-kpi-label">Recorded Attendance Rate</span>
                <span className="kcc-kpi-icon-wrap" aria-hidden="true">
                  <TrendingUp size={16} />
                </span>
              </div>
              <div className="kcc-kpi-body">
                <div className="kcc-kpi-value">
                  {stats.attendanceRate !== null ? `${stats.attendanceRate}%` : 'Pending'}
                </div>
                <div className="kcc-kpi-meta">
                  {stats.attendanceRate !== null
                    ? `${stats.presentCount} of ${stats.presentCount + stats.absentCount} recorded students present`
                    : 'Awaiting morning register submissions'}
                </div>
              </div>
            </div>

            {/* KPI 3: Attendance Submission Progress */}
            <div className="kcc-kpi-card">
              <div className="kcc-kpi-header">
                <span className="kcc-kpi-label">Registers Submitted</span>
                <span className="kcc-kpi-icon-wrap" aria-hidden="true">
                  <CalendarCheck size={16} />
                </span>
              </div>
              <div className="kcc-kpi-body">
                <div className="kcc-kpi-value">
                  {stats.submittedClassesCount}{' '}
                  <span className="kcc-kpi-denom">/ {stats.classesCount} Classes</span>
                </div>
                <div className="kcc-kpi-meta">
                  {stats.unsubmittedClassesCount === 0
                    ? '100% of class registers finalized'
                    : `${stats.unsubmittedClassesCount} classes pending morning roll-call`}
                </div>
                {/* Subtle progress indicator */}
                <div className="kcc-kpi-progress-track" aria-hidden="true">
                  <div
                    className="kcc-kpi-progress-fill"
                    style={{
                      width: `${stats.classesCount > 0 ? (stats.submittedClassesCount / stats.classesCount) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            </div>

            {/* KPI 4: Classroom Monitoring */}
            <div className="kcc-kpi-card">
              <div className="kcc-kpi-header">
                <span className="kcc-kpi-label">Classroom Monitoring</span>
                <span className="kcc-kpi-icon-wrap" aria-hidden="true">
                  <Activity size={16} />
                </span>
              </div>
              <div className="kcc-kpi-body">
                <div className="kcc-kpi-value">{classroomMonitoringState.headline}</div>
                <div className="kcc-kpi-meta">{classroomMonitoringState.meta}</div>
              </div>
            </div>
          </section>

          {/* ====================================================================
              SECTION C: REQUIRES ATTENTION SECTION
              ==================================================================== */}
          <section className="kcc-attention-section" aria-label="Operational attention items">
            <div className="kcc-section-header-row">
              <h2 className="kcc-section-heading">Requires Attention</h2>
              <span className="kcc-attention-badge">
                {attentionItems.length === 0 ? 'All Clear' : `${attentionItems.length} Action Items`}
              </span>
            </div>

            {attentionItems.length === 0 ? (
              <div className="kcc-attention-clear-card">
                <CheckCircle2 size={18} className="kcc-clear-icon" />
                <span className="kcc-clear-text">
                  All daily operational checks are in order. No pending alerts or blocked registers.
                </span>
              </div>
            ) : (
              <div className="kcc-attention-list">
                {attentionItems.map((item) => (
                  <div key={item.id} className={`kcc-attention-item kcc-attention-item--${item.type}`}>
                    <div className="kcc-attention-item-content">
                      <div className="kcc-attention-item-title-row">
                        <span className={`kcc-attention-dot kcc-attention-dot--${item.type}`} />
                        <span className="kcc-attention-item-title">{item.title}</span>
                      </div>
                      <p className="kcc-attention-item-desc">{item.description}</p>
                    </div>

                    {item.actionLabel && item.onAction && (
                      <button
                        type="button"
                        onClick={item.onAction}
                        className="btn btn-secondary btn-sm kcc-attention-action-btn"
                      >
                        <span>{item.actionLabel}</span>
                        <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ====================================================================
              SECTIONS D & E: ATTENDANCE BY SECTION & CLASSROOM PREVIEW (7/5 SPLIT)
              ==================================================================== */}
          <div className="kcc-main-dashboard-grid">
            {/* Left Main Column: Section-Wise Attendance Breakdown */}
            <section className="kcc-section-attendance-panel" aria-label="Section attendance monitoring">
              <div className="kcc-card-header">
                <div>
                  <h2 className="kcc-card-title">Attendance by Section</h2>
                  <p className="kcc-card-subtitle">
                    Recorded attendance rates and register submission progress
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('sections')}
                  className="btn btn-secondary btn-sm kcc-link-btn"
                >
                  <span>Manage Sections</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              {/* Desktop Table View */}
              <div className="kcc-table-container">
                <table className="kcc-data-table">
                  <thead>
                    <tr>
                      <th scope="col">Section</th>
                      <th scope="col">Section Head</th>
                      <th scope="col" className="text-right">Enrolled</th>
                      <th scope="col" className="text-right">Present</th>
                      <th scope="col" className="text-right">Absent</th>
                      <th scope="col" className="text-center">Rate</th>
                      <th scope="col">Registers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardSummary?.sections && dashboardSummary.sections.length > 0 ? (
                      dashboardSummary.sections.map((sec: any) => {
                        const headNames = sec.section_heads && sec.section_heads.length > 0
                          ? sec.section_heads
                              .map((h: any) => h.full_name.replace(/^DEMO ONLY:\s*/i, '').replace(/\s*\([^)]*\)/g, '').trim())
                              .join(', ')
                          : 'Unassigned';

                        const rateDisplay = sec.attendance_rate !== null ? `${sec.attendance_rate}%` : '—';
                        const isAllSubmitted = sec.classes_count > 0 && sec.submitted_classes === sec.classes_count;

                        return (
                          <tr key={sec.id}>
                            <td>
                              <div className="kcc-sec-name">{sec.name}</div>
                              <div className="kcc-sec-sub">{sec.grade_range || 'Grades 6–13'}</div>
                            </td>
                            <td className="kcc-sec-head">{headNames}</td>
                            <td className="text-right font-medium">{sec.student_count}</td>
                            <td className="text-right font-medium text-present">{sec.present}</td>
                            <td className="text-right font-medium text-absent">{sec.absent}</td>
                            <td className="text-center">
                              {sec.attendance_rate !== null ? (
                                <span className={`kcc-rate-badge ${sec.attendance_rate >= 80 ? 'good' : 'fair'}`}>
                                  {rateDisplay}
                                </span>
                              ) : (
                                <span className="kcc-rate-pending">Pending</span>
                              )}
                            </td>
                            <td>
                              <div className="kcc-submission-cell">
                                <span className={`kcc-sub-badge ${isAllSubmitted ? 'completed' : 'pending'}`}>
                                  {sec.submitted_classes} / {sec.classes_count}
                                </span>
                                <div className="kcc-mini-bar-track" aria-hidden="true">
                                  <div
                                    className={`kcc-mini-bar-fill ${isAllSubmitted ? 'completed' : ''}`}
                                    style={{
                                      width: `${sec.classes_count > 0 ? (sec.submitted_classes / sec.classes_count) * 100 : 0}%`
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="kcc-table-empty">
                          No school sections found in academic structure.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Stack View */}
              <div className="kcc-section-mobile-cards">
                {dashboardSummary?.sections?.map((sec: any) => {
                  const headNames = sec.section_heads && sec.section_heads.length > 0
                    ? sec.section_heads
                        .map((h: any) => h.full_name.replace(/^DEMO ONLY:\s*/i, '').replace(/\s*\([^)]*\)/g, '').trim())
                        .join(', ')
                    : 'Unassigned';

                  return (
                    <div key={sec.id} className="kcc-sec-mobile-card">
                      <div className="kcc-sec-mobile-header">
                        <div>
                          <div className="kcc-sec-mobile-title">{sec.name}</div>
                          <div className="kcc-sec-mobile-sub">{sec.grade_range} • {headNames}</div>
                        </div>
                        <span className={`kcc-sub-badge ${sec.submitted_classes === sec.classes_count ? 'completed' : 'pending'}`}>
                          {sec.submitted_classes} / {sec.classes_count} Classes
                        </span>
                      </div>

                      <div className="kcc-sec-mobile-stats">
                        <div className="kcc-sec-mobile-stat">
                          <span className="kcc-sec-stat-label">Enrolled</span>
                          <span className="kcc-sec-stat-val">{sec.student_count}</span>
                        </div>
                        <div className="kcc-sec-mobile-stat">
                          <span className="kcc-sec-stat-label">Present</span>
                          <span className="kcc-sec-stat-val text-present">{sec.present}</span>
                        </div>
                        <div className="kcc-sec-mobile-stat">
                          <span className="kcc-sec-stat-label">Absent</span>
                          <span className="kcc-sec-stat-val text-absent">{sec.absent}</span>
                        </div>
                        <div className="kcc-sec-mobile-stat">
                          <span className="kcc-sec-stat-label">Rate</span>
                          <span className="kcc-sec-stat-val">
                            {sec.attendance_rate !== null ? `${sec.attendance_rate}%` : 'Pending'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Right Column: Classroom Monitoring Preview */}
            <section className="kcc-classroom-preview-panel" aria-label="Live classroom monitoring preview">
              <div className="kcc-card-header">
                <div>
                  <h2 className="kcc-card-title">Classroom Status</h2>
                  <p className="kcc-card-subtitle">Live walkthrough preview</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('classroom-status')}
                  className="btn btn-secondary btn-sm kcc-link-btn"
                >
                  <span>Full Grid</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              {/* Status Context Content */}
              {classroomMonitoringState.isActivePeriod ? (
                /* Active School Period Walkthrough Preview */
                <div className="kcc-classroom-active-view">
                  <div className="kcc-active-period-banner">
                    <span className="kcc-active-period-name">{classroomMonitoringState.headline}</span>
                    <span className="kcc-active-period-meta">Walkthrough Reporting Active</span>
                  </div>

                  <div className="kcc-walkthrough-counts-grid">
                    <div className="kcc-walkthrough-count-card teaching">
                      <div className="kcc-walkthrough-count-val">
                        {classroomOverview?.summary?.teaching ?? 0}
                      </div>
                      <div className="kcc-walkthrough-count-label">In Instruction</div>
                    </div>

                    <div className="kcc-walkthrough-count-card not-teaching">
                      <div className="kcc-walkthrough-count-val">
                        {classroomOverview?.summary?.notTeaching ?? 0}
                      </div>
                      <div className="kcc-walkthrough-count-label">Not Teaching</div>
                    </div>

                    <div className="kcc-walkthrough-count-card alternative">
                      <div className="kcc-walkthrough-count-val">
                        {classroomOverview?.summary?.otherActivity ?? 0}
                      </div>
                      <div className="kcc-walkthrough-count-label">Alternative</div>
                    </div>

                    <div className="kcc-walkthrough-count-card pending">
                      <div className="kcc-walkthrough-count-val">
                        {classroomOverview?.summary?.pending ?? stats.classesCount}
                      </div>
                      <div className="kcc-walkthrough-count-label">Pending Report</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate('classroom-status')}
                    className="btn btn-secondary btn-sm kcc-full-grid-cta"
                  >
                    <Activity size={14} />
                    <span>View All {stats.classesCount} Classrooms</span>
                  </button>
                </div>
              ) : !classroomMonitoringState.isConfigured ? (
                /* Timetable Unconfigured State */
                <div className="kcc-classroom-inactive-view">
                  <div className="kcc-inactive-icon-wrap neutral">
                    <Clock size={24} />
                  </div>
                  <h3 className="kcc-inactive-title">Timetable Pending</h3>
                  <p className="kcc-inactive-desc">
                    Live classroom monitoring will become active once the official nine-period bell schedule is configured.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('admin')}
                    className="btn btn-primary btn-sm"
                  >
                    Configure Timetable
                  </button>
                </div>
              ) : (
                /* Outside School Hours State (Weekend or Post-School) */
                <div className="kcc-classroom-inactive-view">
                  <div className="kcc-inactive-icon-wrap neutral">
                    <Clock size={24} />
                  </div>
                  <h3 className="kcc-inactive-title">Outside School Hours</h3>
                  <p className="kcc-inactive-desc">
                    Live walkthrough reporting operates during active school teaching periods (Monday–Friday). Current period tracking is inactive.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('classroom-status')}
                    className="btn btn-secondary btn-sm"
                  >
                    <span>View Historical Logs</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* ====================================================================
              SECTION F: RECENT ACTIVITY FEED (CLEAN & HUMAN-READABLE)
              ==================================================================== */}
          <section className="kcc-activity-section" aria-label="Recent institutional audit activity">
            <div className="kcc-card-header">
              <div>
                <h2 className="kcc-card-title">Recent Activity</h2>
                <p className="kcc-card-subtitle">
                  Tamper-evident record of daily operational actions
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('audit')}
                className="btn btn-secondary btn-sm kcc-link-btn"
              >
                <span>Full Audit Trail</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {formattedLogs.length === 0 ? (
              <div className="kcc-activity-empty">
                <Info size={16} />
                <span>No recent administrative or attendance events logged today.</span>
              </div>
            ) : (
              <div className="kcc-activity-feed">
                {formattedLogs.map((log) => (
                  <div key={log.id} className="kcc-activity-item">
                    <div className="kcc-activity-user-initial" aria-hidden="true">
                      {log.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="kcc-activity-details">
                      <div className="kcc-activity-primary-line">
                        <span className="kcc-activity-title">{log.title}</span>
                        {log.detailText && (
                          <span className="kcc-activity-entity"> • {log.detailText}</span>
                        )}
                      </div>
                      <div className="kcc-activity-meta-line">
                        <span className="kcc-activity-user">{log.username}</span>
                        <span className="kcc-activity-dot">·</span>
                        <span className="kcc-activity-time">{log.timeDisplay}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ====================================================================
          TEACHER & SECTION HEAD ROLE COCKPIT VIEW
          ==================================================================== */}
      {activeView === 'teacher' && (
        <div className="kcc-teacher-view-container">
          {/* Section Head Supervisory Scoped Overview (if assigned) */}
          {dashboardSummary?.is_section_head && (
            <section className="kcc-sh-supervisory-card" aria-label="Section Head supervisory overview">
              <div className="kcc-card-header">
                <div>
                  <h2 className="kcc-card-title" style={{ color: '#1e3a8a' }}>
                    Section Head Supervisory Overview
                  </h2>
                  <p className="kcc-card-subtitle">
                    Instructional walkthrough and attendance completion for your assigned section(s)
                  </p>
                </div>
                <div className="kcc-header-button-group">
                  <button
                    type="button"
                    onClick={() => onNavigate('mobile-classroom-status')}
                    className="btn btn-secondary btn-sm"
                  >
                    <Smartphone size={14} />
                    <span>Section Walkthrough</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('classroom-status')}
                    className="btn btn-primary btn-sm"
                  >
                    <Activity size={14} />
                    <span>Classroom Status</span>
                  </button>
                </div>
              </div>

              {/* Scoped KPI row */}
              <div className="kcc-sh-kpi-row">
                <div className="kcc-sh-kpi-item">
                  <div className="kcc-sh-kpi-label">Section Students</div>
                  <div className="kcc-sh-kpi-val">{dashboardSummary.stats?.totalStudents || 0}</div>
                </div>
                <div className="kcc-sh-kpi-item">
                  <div className="kcc-sh-kpi-label">Present Today</div>
                  <div className="kcc-sh-kpi-val text-present">{dashboardSummary.stats?.presentCount || 0}</div>
                </div>
                <div className="kcc-sh-kpi-item">
                  <div className="kcc-sh-kpi-label">Absent Today</div>
                  <div className="kcc-sh-kpi-val text-absent">{dashboardSummary.stats?.absentCount || 0}</div>
                </div>
                <div className="kcc-sh-kpi-item">
                  <div className="kcc-sh-kpi-label">Attendance Rate</div>
                  <div className="kcc-sh-kpi-val text-primary">
                    {dashboardSummary.stats?.attendanceRate !== null ? `${dashboardSummary.stats?.attendanceRate}%` : 'Pending'}
                  </div>
                </div>
                <div className="kcc-sh-kpi-item">
                  <div className="kcc-sh-kpi-label">Registers Submitted</div>
                  <div className="kcc-sh-kpi-val">
                    {dashboardSummary.stats?.submittedClassesCount || 0} / {dashboardSummary.stats?.totalClasses || 0}
                  </div>
                </div>
              </div>

              {/* Assigned Sections Pills */}
              <div className="kcc-sh-sections-strip">
                <span className="kcc-sh-strip-title">Assigned Sections:</span>
                {dashboardSummary.sections?.map((sec: any) => (
                  <span key={sec.id} className="kcc-sh-section-pill">
                    <strong>{sec.name}</strong> ({sec.grade_range}) — {sec.submitted_classes} of {sec.classes_count} submitted
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Dual-Role Homeroom Class Card */}
          {dashboardSummary?.homeroom_classes && dashboardSummary.homeroom_classes.length > 0 && (
            <section className="kcc-homeroom-card" aria-label="Assigned homeroom classes">
              <div className="kcc-card-header">
                <div>
                  <h2 className="kcc-card-title">My Homeroom Classes</h2>
                  <p className="kcc-card-subtitle">
                    Direct roll-call action for classes assigned to you as Class Teacher
                  </p>
                </div>
              </div>

              <div className="kcc-homeroom-grid">
                {dashboardSummary.homeroom_classes.map((hc: any) => (
                  <div key={hc.id} className={`kcc-homeroom-item ${hc.is_submitted ? 'submitted' : 'pending'}`}>
                    <div>
                      <div className="kcc-homeroom-class-name">Class {hc.name}</div>
                      <div className="kcc-homeroom-meta">
                        Grade {hc.grade} • {hc.student_count} Enrolled Pupils
                      </div>
                      <div className="kcc-homeroom-badge-row">
                        <span className={`kcc-sub-badge ${hc.is_submitted ? 'completed' : 'pending'}`}>
                          {hc.is_submitted ? 'Attendance Finalized' : 'Roll-Call Pending'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('mobile-attendance')}
                      className={`btn ${hc.is_submitted ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                    >
                      {hc.is_submitted ? 'View Register' : 'Start Roll-Call'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Single / Primary Class Teacher Action Card */}
          <section className="kcc-teacher-cockpit-card" aria-label="Class Teacher attendance action">
            <div className="kcc-teacher-cockpit-content">
              <div className="kcc-teacher-badge-row">
                <span className={`kcc-sub-badge ${teacherRegisterState.status === 'submitted' ? 'completed' : 'pending'}`}>
                  {teacherRegisterState.label}
                </span>
                <span className="kcc-teacher-class-name">
                  {teacherPrimaryClass?.className || 'Assigned Class'}
                </span>
              </div>

              <h2 className="kcc-teacher-hero-title">
                {teacherRegisterState.status === 'submitted'
                  ? 'Morning Attendance Verified'
                  : 'Daily Roll-Call Required'}
              </h2>
              <p className="kcc-teacher-hero-desc">
                {teacherRegisterState.status === 'submitted'
                  ? `Finalized attendance register for ${teacherPrimaryClass?.className || 'class'} is recorded on the school server.`
                  : `Please record and submit student attendance for ${teacherPrimaryClass?.className || 'your homeroom class'} today.`}
              </p>

              <div className="kcc-teacher-actions-bar">
                <button
                  type="button"
                  onClick={() => onNavigate('mobile-attendance')}
                  className="btn btn-primary btn-md"
                >
                  <UserCheck size={16} />
                  <span>{teacherRegisterState.cta}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('attendance-reports')}
                  className="btn btn-secondary btn-md"
                >
                  <FileSpreadsheet size={16} />
                  <span>Monthly Attendance Summary</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

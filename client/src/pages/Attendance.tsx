import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  Save,
  WifiOff,
  AlertTriangle,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { api } from '../api/client';
import {
  cacheClassRoster,
  getCachedClassRoster,
  queueOfflineAttendance
} from '../api/offlineQueue';

interface AttendanceProps {
  user: any;
}

export const Attendance: React.FC<AttendanceProps> = ({ user }) => {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const [students, setStudents] = useState<any[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<number, { status: string; remarks: string }>>({});
  const [existingSession, setExistingSession] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);

  useEffect(() => {
    loadClasses();

    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (selectedClassId && selectedDate) {
      loadAttendanceSession(selectedClassId, selectedDate);
    }
  }, [selectedClassId, selectedDate]);

  const loadClasses = async () => {
    try {
      const res = await api.getClasses();
      let availableClasses = res.classes || [];

      // If user is class teacher, prioritize their assigned classes
      if (user.role === 'class_teacher' && user.assignedClassIds?.length > 0) {
        const filtered = availableClasses.filter((c: any) =>
          user.assignedClassIds.includes(c.id)
        );
        if (filtered.length > 0) {
          availableClasses = filtered;
        }
      }

      setClasses(availableClasses);
      if (availableClasses.length > 0 && !selectedClassId) {
        setSelectedClassId(availableClasses[0].id);
      }
    } catch (err) {
      console.error('Failed to load classes:', err);
    }
  };

  const loadAttendanceSession = async (classId: number, date: string) => {
    try {
      setLoading(true);
      setSaveSuccessMsg(null);

      // Check online or offline
      if (navigator.onLine) {
        const res = await api.getAttendanceSession(classId, date);
        setExistingSession(res.session);
        setStudents(res.students || []);

        // Cache roster for offline use
        cacheClassRoster(classId, res.students || []);

        // Initialize attendance map
        const newMap: Record<number, { status: string; remarks: string }> = {};
        res.students.forEach((st: any) => {
          newMap[st.student_id] = {
            status: st.attendance_status || 'present', // Default to present for speed
            remarks: st.attendance_remarks || ''
          };
        });
        setAttendanceMap(newMap);
      } else {
        // Offline: Load from IndexedDB cache
        setIsOfflineMode(true);
        const cachedRoster = await getCachedClassRoster(classId);
        if (cachedRoster) {
          setStudents(cachedRoster);
          const newMap: Record<number, { status: string; remarks: string }> = {};
          cachedRoster.forEach((st: any) => {
            newMap[st.student_id] = {
              status: 'present',
              remarks: ''
            };
          });
          setAttendanceMap(newMap);
        } else {
          setStudents([]);
        }
      }
    } catch (err: any) {
      console.warn('Network error loading session, trying offline cache:', err);
      setIsOfflineMode(true);
      const cachedRoster = await getCachedClassRoster(classId);
      if (cachedRoster) {
        setStudents(cachedRoster);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (studentId: number, status: string) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status
      }
    }));
  };

  const handleRemarksChange = (studentId: number, remarks: string) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks
      }
    }));
  };

  const handleMarkAll = (status: string) => {
    const newMap: Record<number, { status: string; remarks: string }> = {};
    students.forEach((st: any) => {
      newMap[st.student_id] = {
        status,
        remarks: prevRemarks(st.student_id)
      };
    });
    setAttendanceMap(newMap);
  };

  const prevRemarks = (id: number) => attendanceMap[id]?.remarks || '';

  const handleSaveAttendance = async () => {
    if (!selectedClassId || students.length === 0) return;

    const records = students.map((st) => ({
      student_id: st.student_id,
      status: attendanceMap[st.student_id]?.status || 'present',
      remarks: attendanceMap[st.student_id]?.remarks || ''
    }));

    const targetClass = classes.find((c) => c.id === selectedClassId);

    try {
      setSaving(true);

      if (navigator.onLine) {
        await api.saveAttendanceSession({
          classId: selectedClassId,
          date: selectedDate,
          records
        });
        setSaveSuccessMsg(`Daily register for ${selectedDate} submitted and recorded!`);
        setExistingSession({ date: selectedDate });
      } else {
        // Offline: save to IndexedDB queue
        await queueOfflineAttendance(
          selectedClassId,
          targetClass?.name || `Class #${selectedClassId}`,
          selectedDate,
          records
        );
        setSaveSuccessMsg(
          'Offline Mode: Register saved to device storage and queued for synchronization!'
        );
      }

      setTimeout(() => setSaveSuccessMsg(null), 6000);
    } catch (err: any) {
      // Fallback to offline queue if server is unreachable
      await queueOfflineAttendance(
        selectedClassId,
        targetClass?.name || `Class #${selectedClassId}`,
        selectedDate,
        records
      );
      setSaveSuccessMsg(
        'Server unreachable: Register queued in offline browser storage!'
      );
    } finally {
      setSaving(false);
    }
  };

  // Real-time Counts
  let countPresent = 0;
  let countAbsent = 0;
  let countLate = 0;
  let countExcused = 0;

  students.forEach((st) => {
    const s = attendanceMap[st.student_id]?.status;
    if (s === 'present') countPresent++;
    else if (s === 'absent') countAbsent++;
    else if (s === 'late') countLate++;
    else if (s === 'excused') countExcused++;
  });

  const total = students.length;
  const attendancePercentage = total > 0 ? Math.round(((countPresent + countLate) / total) * 100) : 0;

  return (
    <div>
      {/* Header */}
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
          <h2>Daily Class Attendance Register</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Fast roster marking with one-tap statuses, duplicate prevention, and offline backup.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button
            onClick={handleSaveAttendance}
            disabled={saving || students.length === 0}
            className="btn btn-primary"
            style={{ minWidth: '150px' }}
          >
            <Save size={16} />
            <span>{saving ? 'Saving...' : existingSession ? 'Update Register' : 'Submit Register'}</span>
          </button>
        </div>
      </div>

      {/* Class & Date Controls */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: '220px', flex: '1 1 200px' }}>
            <label className="form-label">Select Class (Grade 6–13)</label>
            <select
              className="form-select"
              value={selectedClassId || ''}
              onChange={(e) => setSelectedClassId(Number(e.target.value))}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.class_teacher_name ? `• ${c.class_teacher_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '180px' }}>
            <label className="form-label">Register Date</label>
            <input
              type="date"
              className="form-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleMarkAll('present')}
              className="btn btn-secondary btn-sm"
              title="Mark all as Present"
            >
              <CheckCircle2 size={14} style={{ color: 'var(--present)' }} />
              <span>Mark All Present</span>
            </button>

            <button
              onClick={() => handleMarkAll('absent')}
              className="btn btn-secondary btn-sm"
              title="Mark all as Absent"
            >
              <XCircle size={14} style={{ color: 'var(--absent)' }} />
              <span>Mark All Absent</span>
            </button>
          </div>
        </div>

        {/* Status Feedback Messages */}
        {saveSuccessMsg && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: 'var(--present-bg)',
              color: 'var(--present)',
              border: '1px solid var(--present-border)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem'
            }}
          >
            <CheckCircle2 size={18} />
            <strong>{saveSuccessMsg}</strong>
          </div>
        )}

        {existingSession && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.6rem 0.9rem',
              background: 'rgba(79, 70, 229, 0.08)',
              color: 'var(--primary)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.8rem'
            }}
          >
            <span>
              ✓ An attendance register was already submitted for this date. Any changes will update the existing register.
            </span>
            <span className="badge" style={{ background: 'var(--primary)', color: 'white', fontSize: '0.7rem' }}>
              Submitted
            </span>
          </div>
        )}
      </div>

      {/* Live Attendance Summary Banner */}
      <div
        className="card"
        style={{
          padding: '0.85rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'var(--bg-subtle)'
        }}
      >
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Class Roster:</span>
            <strong style={{ marginLeft: 6, fontSize: '0.95rem' }}>{total} Students</strong>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <span className="badge badge-present" style={{ fontSize: '0.8rem' }}>
              Present: {countPresent}
            </span>
            <span className="badge badge-absent" style={{ fontSize: '0.8rem' }}>
              Absent: {countAbsent}
            </span>
            <span className="badge badge-late" style={{ fontSize: '0.8rem' }}>
              Late: {countLate}
            </span>
            <span className="badge badge-excused" style={{ fontSize: '0.8rem' }}>
              Excused: {countExcused}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Attendance Rate:</span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.3rem',
              fontWeight: 800,
              color: attendancePercentage >= 80 ? 'var(--present)' : 'var(--absent)'
            }}
          >
            {attendancePercentage}%
          </span>
        </div>
      </div>

      {/* Attendance Roster Grid / List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Roll</th>
                <th>Admission & Student</th>
                <th style={{ width: 280, textAlign: 'center' }}>Attendance Status (Touch / Click)</th>
                <th>Remarks / Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    Loading class roster...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>
                      No students enrolled in this class yet.
                    </div>
                  </td>
                </tr>
              ) : (
                students.map((st) => {
                  const currentStatus = attendanceMap[st.student_id]?.status || 'present';
                  const currentRemark = attendanceMap[st.student_id]?.remarks || '';

                  return (
                    <tr key={st.student_id}>
                      <td>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                          #{st.roll_number || '-'}
                        </strong>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            className="user-avatar"
                            style={{
                              width: 34,
                              height: 34,
                              fontSize: '0.75rem',
                              background: currentStatus === 'present' ? 'var(--present)' : currentStatus === 'absent' ? 'var(--absent)' : '#64748b'
                            }}
                          >
                            {st.calling_name?.charAt(0) || 'S'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.925rem' }}>{st.full_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {st.admission_no} • {st.calling_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {/* 4-Way Large Touch Segmented Control */}
                        <div className="attendance-btn-group" style={{ margin: '0 auto' }}>
                          <button
                            type="button"
                            className={`att-btn present ${currentStatus === 'present' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'present')}
                            title="Mark Present"
                          >
                            P • Present
                          </button>

                          <button
                            type="button"
                            className={`att-btn absent ${currentStatus === 'absent' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'absent')}
                            title="Mark Absent"
                          >
                            A • Absent
                          </button>

                          <button
                            type="button"
                            className={`att-btn late ${currentStatus === 'late' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'late')}
                            title="Mark Late"
                          >
                            L • Late
                          </button>

                          <button
                            type="button"
                            className={`att-btn excused ${currentStatus === 'excused' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'excused')}
                            title="Mark Excused"
                          >
                            E • Excused
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-input"
                          style={{
                            padding: '0.45rem 0.75rem',
                            fontSize: '0.825rem',
                            backgroundColor: currentStatus === 'absent' ? 'var(--absent-bg)' : 'transparent'
                          }}
                          placeholder={currentStatus === 'absent' ? 'Reason for absence...' : 'Optional notes...'}
                          value={currentRemark}
                          onChange={(e) => handleRemarksChange(st.student_id, e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

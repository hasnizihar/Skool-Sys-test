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
  Sparkles,
  Search,
  Filter,
  Check,
  Wifi
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

  const [searchQuery, setSearchQuery] = useState('');
  const [filterView, setFilterView] = useState<'all' | 'absent' | 'late'>('all');

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

      // If user is class teacher, prioritize assigned classes
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

      if (navigator.onLine) {
        const res = await api.getAttendanceSession(classId, date);
        setExistingSession(res.session);
        setStudents(res.students || []);

        // Cache roster for offline use
        cacheClassRoster(classId, res.students || []);

        // Initialize attendance map (default to 'present' for fast roll-call)
        const newMap: Record<number, { status: string; remarks: string }> = {};
        res.students.forEach((st: any) => {
          newMap[st.student_id] = {
            status: st.attendance_status || 'present',
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

  const handleQuickRemark = (studentId: number, tag: string) => {
    const existing = attendanceMap[studentId]?.remarks || '';
    const updated = existing ? `${existing}; ${tag}` : tag;
    handleRemarksChange(studentId, updated);
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
        setSaveSuccessMsg(`Daily register for ${selectedDate} saved and synced successfully!`);
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
          'Offline Mode: Register safely saved to browser storage and queued for background synchronization.'
        );
      }

      setTimeout(() => setSaveSuccessMsg(null), 6000);
    } catch (err: any) {
      // Fallback to offline queue
      await queueOfflineAttendance(
        selectedClassId,
        targetClass?.name || `Class #${selectedClassId}`,
        selectedDate,
        records
      );
      setSaveSuccessMsg(
        'Server unreachable: Register safely queued in offline browser storage!'
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
  const targetClass = classes.find((c) => c.id === selectedClassId);

  // Formatted date string for display (e.g. "Monday, 19 October 2026")
  const dateFormatted = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Filter students by search and status tab
  const filteredStudents = students.filter((st) => {
    const s = attendanceMap[st.student_id]?.status || 'present';
    if (filterView === 'absent' && s !== 'absent') return false;
    if (filterView === 'late' && s !== 'late') return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      st.full_name?.toLowerCase().includes(q) ||
      st.calling_name?.toLowerCase().includes(q) ||
      st.admission_no?.toLowerCase().includes(q) ||
      String(st.roll_number || '').includes(q)
    );
  });

  return (
    <div>
      {/* Top Title & Immediate Save Action */}
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
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
            Daily Class Attendance
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Touch-friendly roll call register with bulk actions, offline capability, and instant sync.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <button
            onClick={handleSaveAttendance}
            disabled={saving || students.length === 0}
            className="btn btn-primary"
            style={{ minWidth: '160px' }}
            aria-label="Save attendance register"
          >
            <Save size={16} />
            <span>{saving ? 'Saving...' : existingSession ? 'Update Register' : 'Save Attendance'}</span>
          </button>
        </div>
      </div>

      {/* Class & Date Selector Card */}
      <div className="card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: '220px', flex: '1 1 240px' }}>
            <label className="form-label">Select Class (Grades 6–13)</label>
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

          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleMarkAll('present')}
              className="btn btn-secondary btn-sm"
              title="Bulk mark all students as Present"
            >
              <CheckCircle2 size={14} style={{ color: 'var(--present)' }} />
              <span>Mark All Present</span>
            </button>

            <button
              onClick={() => handleMarkAll('absent')}
              className="btn btn-secondary btn-sm"
              title="Bulk mark all students as Absent"
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
              marginTop: '1.25rem',
              padding: '0.85rem 1.15rem',
              background: 'var(--present-bg)',
              color: 'var(--present)',
              border: '1px solid var(--present-border)',
              borderRadius: 'var(--radius-input)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              fontSize: '0.875rem'
            }}
          >
            <CheckCircle2 size={18} />
            <strong>{saveSuccessMsg}</strong>
          </div>
        )}

        {existingSession && !saveSuccessMsg && (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '0.75rem 1.15rem',
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              borderRadius: 'var(--radius-input)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.825rem',
              border: '1px solid rgba(2, 101, 54, 0.2)'
            }}
          >
            <span>
              ✓ An attendance register has already been recorded for this class on {selectedDate}. Edits will update the official register.
            </span>
            <span className="badge badge-brand" style={{ fontSize: '0.72rem' }}>
              Recorded
            </span>
          </div>
        )}
      </div>

      {/* Prominent Real-Time Header Summary (Matching Plan Section 4) */}
      <div
        className="card"
        style={{
          padding: '1.25rem 1.5rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          backgroundColor: '#FFFFFF',
          borderLeft: '4px solid var(--primary)'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {targetClass?.name || 'Class Attendance'} • {dateFormatted}
            </h3>

            {isOfflineMode ? (
              <span className="badge badge-late">
                <WifiOff size={12} /> Offline (Local Storage)
              </span>
            ) : (
              <span className="badge badge-present">
                <Check size={12} /> Synced
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--primary)' }}>
              {countPresent} / {total} Present
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--absent)', fontWeight: 600 }}>
              {countAbsent} {countAbsent === 1 ? 'student' : 'students'} absent
            </span>
            {countLate > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--late)', fontWeight: 600 }}>
                {countLate} late
              </span>
            )}
            {countExcused > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--excused)', fontWeight: 600 }}>
                {countExcused} excused
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Class Attendance:</span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.75rem',
              fontWeight: 800,
              color: attendancePercentage >= 80 ? 'var(--present)' : 'var(--absent)'
            }}
          >
            {attendancePercentage}%
          </span>
        </div>
      </div>

      {/* Search & Audit Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div style={{ position: 'relative', width: '280px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }}
          />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '36px', height: 38 }}
            placeholder="Search student or roll #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={() => setFilterView('all')}
            className={`btn btn-sm ${filterView === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          >
            All Students ({students.length})
          </button>
          <button
            onClick={() => setFilterView('absent')}
            className={`btn btn-sm ${filterView === 'absent' ? 'btn-danger' : 'btn-secondary'}`}
          >
            Absentees Only ({countAbsent})
          </button>
          <button
            onClick={() => setFilterView('late')}
            className={`btn btn-sm ${filterView === 'late' ? 'btn-secondary' : 'btn-secondary'}`}
            style={{
              background: filterView === 'late' ? 'var(--late)' : undefined,
              color: filterView === 'late' ? 'white' : undefined
            }}
          >
            Late ({countLate})
          </button>
        </div>
      </div>

      {/* Attendance Roster Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 65, textAlign: 'center' }}>Roll #</th>
                <th>Admission & Student Name</th>
                <th style={{ width: 330, textAlign: 'center' }}>Attendance Status (Touch / Tap)</th>
                <th>Remarks & Quick Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '3.5rem' }}>
                    <div className="animate-spin" style={{ display: 'inline-block', width: 26, height: 26, border: '3px solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
                    <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading class roster...</p>
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '3.5rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>
                      No students found matching current filter or search criteria.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => {
                  const currentStatus = attendanceMap[st.student_id]?.status || 'present';
                  const currentRemark = attendanceMap[st.student_id]?.remarks || '';

                  return (
                    <tr key={st.student_id}>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            color: 'var(--text-muted)',
                            background: 'var(--bg-subtle)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-xs)'
                          }}
                        >
                          #{st.roll_number || '-'}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            className="user-avatar"
                            style={{
                              width: 36,
                              height: 36,
                              fontSize: '0.8rem',
                              background:
                                currentStatus === 'present'
                                  ? 'var(--present)'
                                  : currentStatus === 'absent'
                                  ? 'var(--absent)'
                                  : currentStatus === 'late'
                                  ? 'var(--late)'
                                  : 'var(--excused)',
                              color: 'white',
                              border: 'none'
                            }}
                          >
                            {st.calling_name?.charAt(0) || 'S'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.925rem', color: 'var(--text-main)' }}>
                              {st.full_name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {st.admission_no} • {st.calling_name}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {/* 4-Way Large Touch Segmented Control (Min 44px Touch Target) */}
                        <div className="attendance-btn-group" style={{ margin: '0 auto' }}>
                          <button
                            type="button"
                            className={`att-btn present ${currentStatus === 'present' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'present')}
                            title="Mark Present"
                            aria-pressed={currentStatus === 'present'}
                          >
                            P • Present
                          </button>

                          <button
                            type="button"
                            className={`att-btn absent ${currentStatus === 'absent' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'absent')}
                            title="Mark Absent"
                            aria-pressed={currentStatus === 'absent'}
                          >
                            A • Absent
                          </button>

                          <button
                            type="button"
                            className={`att-btn late ${currentStatus === 'late' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'late')}
                            title="Mark Late"
                            aria-pressed={currentStatus === 'late'}
                          >
                            L • Late
                          </button>

                          <button
                            type="button"
                            className={`att-btn excused ${currentStatus === 'excused' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(st.student_id, 'excused')}
                            title="Mark Excused"
                            aria-pressed={currentStatus === 'excused'}
                          >
                            E • Excused
                          </button>
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{
                              padding: '0.45rem 0.75rem',
                              fontSize: '0.825rem',
                              backgroundColor: currentStatus === 'absent' ? 'var(--absent-bg)' : 'transparent',
                              borderColor: currentStatus === 'absent' ? 'var(--absent-border)' : undefined
                            }}
                            placeholder={currentStatus === 'absent' ? 'Reason for absence...' : 'Optional notes...'}
                            value={currentRemark}
                            onChange={(e) => handleRemarksChange(st.student_id, e.target.value)}
                          />

                          {/* Quick Reason Chips for Absentees / Late */}
                          {(currentStatus === 'absent' || currentStatus === 'late' || currentStatus === 'excused') && (
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                              {['Sick Leave', 'Medical', 'Transport', 'Family Event', 'Duty'].map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => handleQuickRemark(st.student_id, tag)}
                                  style={{
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-subtle)',
                                    borderRadius: 'var(--radius-xs)',
                                    fontSize: '0.675rem',
                                    padding: '0.1rem 0.4rem',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer'
                                  }}
                                  title={`Append reason: ${tag}`}
                                >
                                  +{tag}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Sticky Save Bar (Specified in UIUX 1.md) */}
      {students.length > 0 && (
        <div className="attendance-sticky-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-main)' }}>
              {targetClass?.name || 'Class'}: {countPresent} / {total} Present
            </span>
            <span style={{ fontSize: '0.825rem', color: countAbsent > 0 ? 'var(--absent)' : 'var(--text-muted)', fontWeight: 600 }}>
              {countAbsent} Absent
            </span>
            {isOfflineMode && (
              <span className="badge badge-late" style={{ fontSize: '0.72rem' }}>
                <WifiOff size={11} /> Queued locally
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
            <button
              onClick={handleSaveAttendance}
              disabled={saving}
              className="btn btn-primary"
              style={{ minWidth: '170px' }}
              aria-label="Save attendance register"
            >
              <Save size={16} />
              <span>{saving ? 'Saving...' : existingSession ? 'Update Attendance' : 'Save Attendance'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

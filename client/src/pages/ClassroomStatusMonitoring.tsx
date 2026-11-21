import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  RotateCw,
  Clock,
  Calendar,
  Settings,
  Coffee,
  Building2,
  Users
} from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { useToast } from '../ui/useToast';
import './classroomStatusMonitoring.css';

interface Props {
  user: any;
  onNavigate?: (tab: string) => void;
}

export const ClassroomStatusMonitoring: React.FC<Props> = ({ user, onNavigate }) => {
  const { showToast: addToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Timetable Configuration Modal State
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [periodsForm, setPeriodsForm] = useState<Array<{ periodNumber: number; name: string; startTime: string; endTime: string }>>([
    { periodNumber: 1, name: 'Period 1', startTime: '07:50', endTime: '08:30' },
    { periodNumber: 2, name: 'Period 2', startTime: '08:30', endTime: '09:10' },
    { periodNumber: 3, name: 'Period 3', startTime: '09:10', endTime: '09:50' },
    { periodNumber: 4, name: 'Period 4', startTime: '09:50', endTime: '10:30' },
    { periodNumber: 5, name: 'Period 5', startTime: '10:50', endTime: '11:30' },
    { periodNumber: 6, name: 'Period 6', startTime: '11:30', endTime: '12:10' },
    { periodNumber: 7, name: 'Period 7', startTime: '12:10', endTime: '12:50' },
    { periodNumber: 8, name: 'Period 8', startTime: '12:50', endTime: '13:30' },
    { periodNumber: 9, name: 'Period 9', startTime: '13:30', endTime: '14:10' }
  ]);
  const [breakStartTime, setBreakStartTime] = useState('10:30');
  const [breakEndTime, setBreakEndTime] = useState('10:50');
  const [breakName, setBreakName] = useState('Interval / Recess');

  const pollIntervalRef = useRef<any>(null);

  const fetchOverview = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api.getClassroomStatusOverview(
        undefined,
        selectedPeriod !== null ? selectedPeriod : undefined
      );
      setData(res);
      setIsLiveConnected(true);
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: any) {
      setIsLiveConnected(false);
      if (!isSilent) {
        addToast({
          title: 'Connection Notice',
          message: err.message || 'Unable to fetch classroom status overview.',
          type: 'error'
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPeriod, addToast]);

  // Initial load and period change fetch
  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Automatic Polling (every 5 seconds, pauses when tab is hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      } else {
        fetchOverview(true);
        pollIntervalRef.current = setInterval(() => fetchOverview(true), 5000);
      }
    };

    pollIntervalRef.current = setInterval(() => {
      if (!document.hidden) {
        fetchOverview(true);
      }
    }, 5000);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchOverview]);

  // Load existing timetable config if modal opens
  const openTimetableConfig = async () => {
    try {
      setConfigLoading(true);
      const res = await api.getTimetableConfig();
      if (res?.config?.periods?.length === 9) {
        setPeriodsForm(res.config.periods.map((p: any) => ({
          periodNumber: p.period_number,
          name: p.name,
          startTime: p.start_time,
          endTime: p.end_time
        })));
        if (res.config.breakStartTime) setBreakStartTime(res.config.breakStartTime);
        if (res.config.breakEndTime) setBreakEndTime(res.config.breakEndTime);
        if (res.config.breakName) setBreakName(res.config.breakName);
      }
    } catch {
      // Use defaults
    } finally {
      setConfigLoading(false);
      setShowConfigModal(true);
    }
  };

  const handleSaveTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setConfigLoading(true);
      await api.updateTimetableConfig({
        periods: periodsForm,
        breakAfterPeriod: 4,
        breakStartTime,
        breakEndTime,
        breakName,
        schoolDays: [1, 2, 3, 4, 5]
      });

      addToast({
        title: 'Timetable Saved',
        message: 'The official 9-period timetable has been configured successfully.',
        type: 'success'
      });
      setShowConfigModal(false);
      fetchOverview();
    } catch (err: any) {
      addToast({
        title: 'Configuration Error',
        message: err.message || 'Failed to update timetable configuration.',
        type: 'error'
      });
    } finally {
      setConfigLoading(false);
    }
  };

  const loadStandardSriLankanPreset = () => {
    setPeriodsForm([
      { periodNumber: 1, name: 'Period 1', startTime: '07:50', endTime: '08:30' },
      { periodNumber: 2, name: 'Period 2', startTime: '08:30', endTime: '09:10' },
      { periodNumber: 3, name: 'Period 3', startTime: '09:10', endTime: '09:50' },
      { periodNumber: 4, name: 'Period 4', startTime: '09:50', endTime: '10:30' },
      { periodNumber: 5, name: 'Period 5', startTime: '10:50', endTime: '11:30' },
      { periodNumber: 6, name: 'Period 6', startTime: '11:30', endTime: '12:10' },
      { periodNumber: 7, name: 'Period 7', startTime: '12:10', endTime: '12:50' },
      { periodNumber: 8, name: 'Period 8', startTime: '12:50', endTime: '13:30' },
      { periodNumber: 9, name: 'Period 9', startTime: '13:30', endTime: '14:10' }
    ]);
    setBreakStartTime('10:30');
    setBreakEndTime('10:50');
    setBreakName('Interval / Recess');
  };

  const context = data?.context;
  const summary = data?.summary || { total: 0, teaching: 0, notTeaching: 0, otherActivity: 0, pending: 0 };
  const sections = data?.sections || [];
  const unassignedClasses = data?.unassignedClasses || [];

  return (
    <div className="csm-container">
      {/* 1. Header & Live Indicator */}
      <header className="csm-header">
        <div className="csm-title-area">
          <h1>
            <Activity className="text-emerald-700" size={26} aria-hidden="true" />
            Classroom Status Monitoring
          </h1>
          <p className="csm-subtitle">
            Live school-wide teaching status tracking across school sections &middot; Kattankudy Central College
          </p>
        </div>

        <div className="csm-actions">
          <div className={`csm-live-indicator ${isLiveConnected ? '' : 'error'}`} title={lastSyncTime ? `Last synced: ${lastSyncTime}` : undefined}>
            <span className="csm-pulse-dot" aria-hidden="true" />
            {isLiveConnected ? `Live Updates (5s) ${lastSyncTime ? `· ${lastSyncTime}` : ''}` : 'Connecting...'}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOverview(false)}
            disabled={refreshing}
            leftIcon={<RotateCw className={refreshing ? 'animate-spin' : ''} size={15} />}
          >
            Refresh
          </Button>

          {user?.role === 'admin' && (
            <Button
              variant="outline"
              size="sm"
              onClick={openTimetableConfig}
              leftIcon={<Settings size={15} />}
            >
              Timetable
            </Button>
          )}

          {/* Quick link for Section Heads to Mobile Mode */}
          {onNavigate && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigate('mobile-classroom-status')}
            >
              Mobile Walkthrough
            </Button>
          )}
        </div>
      </header>

      {/* 2. Status Banners (Unconfigured / Break / Non-School Hours) */}
      {context && !context.configured && (
        <div className="csm-banner warning" role="alert">
          <div className="csm-banner-content">
            <AlertTriangle size={20} aria-hidden="true" />
            <div>
              <strong>Timetable Configuration Pending:</strong> The official 9-period timetable has not been configured yet.
              Classroom statuses will default to unconfirmed until period times are set.
            </div>
          </div>
          {user?.role === 'admin' && (
            <Button size="sm" variant="primary" onClick={openTimetableConfig}>
              Configure Timetable
            </Button>
          )}
        </div>
      )}

      {context && context.configured && context.isBreak && (
        <div className="csm-banner break" role="status">
          <div className="csm-banner-content">
            <Coffee size={20} aria-hidden="true" />
            <div>
              <strong>{context.periodName || 'School Break'}:</strong> {context.message}
              {context.startTime && context.endTime && ` (${context.startTime} - ${context.endTime})`}. No teaching periods are active during the interval.
            </div>
          </div>
        </div>
      )}

      {context && context.configured && (context.state === 'before_school' || context.state === 'after_school' || context.state === 'weekend') && (
        <div className="csm-banner info" role="status">
          <div className="csm-banner-content">
            <Clock size={20} aria-hidden="true" />
            <div>
              <strong>Current Status:</strong> {context.message}. You may select a period below to inspect recorded historical statuses.
            </div>
          </div>
        </div>
      )}

      {/* 3. Period Selector Pills */}
      <nav className="csm-period-bar" aria-label="School Period Selection">
        <span className="csm-period-label">Period:</span>
        <button
          type="button"
          className={`csm-period-btn ${selectedPeriod === null ? 'active' : ''}`}
          onClick={() => setSelectedPeriod(null)}
          title="Current active period as resolved by school civil time"
        >
          <span className="csm-pbtn-name">Current</span>
          <span className="csm-pbtn-time">{context?.currentTime || 'Active'}</span>
        </button>

        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((pNum) => {
          const isCurrentActive = context?.periodNumber === pNum;
          const pInfo = context?.availablePeriods?.find((p: any) => p.periodNumber === pNum);

          return (
            <button
              key={pNum}
              type="button"
              className={`csm-period-btn ${selectedPeriod === pNum ? 'active' : ''}`}
              onClick={() => setSelectedPeriod(pNum)}
              aria-current={selectedPeriod === pNum ? 'page' : undefined}
            >
              <span className="csm-pbtn-name">Period {pNum}</span>
              <span className="csm-pbtn-time">{pInfo ? `${pInfo.startTime} - ${pInfo.endTime}` : `P${pNum}`}</span>
              {isCurrentActive && <span className="csm-pbtn-badge">Now</span>}
            </button>
          );
        })}
      </nav>

      {/* 4. KPI Stat Summary Cards */}
      <section className="csm-summary-grid" aria-label="School Status Overview Summary">
        <div className="csm-kpi-card csm-kpi-green">
          <div className="csm-kpi-icon" aria-hidden="true">
            <CheckCircle2 size={24} />
          </div>
          <div className="csm-kpi-info">
            <h3>Teaching</h3>
            <div className="csm-kpi-value">
              {summary.teaching}
              <span className="csm-kpi-pct">
                ({summary.total > 0 ? Math.round((summary.teaching / summary.total) * 100) : 0}%)
              </span>
            </div>
          </div>
        </div>

        <div className="csm-kpi-card csm-kpi-red">
          <div className="csm-kpi-icon" aria-hidden="true">
            <XCircle size={24} />
          </div>
          <div className="csm-kpi-info">
            <h3>Not Teaching</h3>
            <div className="csm-kpi-value">
              {summary.notTeaching}
              <span className="csm-kpi-pct">
                ({summary.total > 0 ? Math.round((summary.notTeaching / summary.total) * 100) : 0}%)
              </span>
            </div>
          </div>
        </div>

        <div className="csm-kpi-card csm-kpi-yellow">
          <div className="csm-kpi-icon" aria-hidden="true">
            <AlertTriangle size={24} />
          </div>
          <div className="csm-kpi-info">
            <h3>Other Activity</h3>
            <div className="csm-kpi-value">
              {summary.otherActivity}
              <span className="csm-kpi-pct">
                ({summary.total > 0 ? Math.round((summary.otherActivity / summary.total) * 100) : 0}%)
              </span>
            </div>
          </div>
        </div>

        <div className="csm-kpi-card csm-kpi-white">
          <div className="csm-kpi-icon" aria-hidden="true">
            <HelpCircle size={24} />
          </div>
          <div className="csm-kpi-info">
            <h3>Pending / Unconfirmed</h3>
            <div className="csm-kpi-value">
              {summary.pending}
              <span className="csm-kpi-pct">
                ({summary.total > 0 ? Math.round((summary.pending / summary.total) * 100) : 0}%)
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Status Legend */}
      <div className="csm-legend" aria-label="Status Color Code Legend">
        <strong>Legend:</strong>
        <div className="csm-legend-item">
          <span className="csm-legend-chip csm-chip-green" aria-hidden="true" />
          <span>Teaching (Assigned teaching taking place)</span>
        </div>
        <div className="csm-legend-item">
          <span className="csm-legend-chip csm-chip-red" aria-hidden="true" />
          <span>Not Teaching (Confirmed not teaching)</span>
        </div>
        <div className="csm-legend-item">
          <span className="csm-legend-chip csm-chip-yellow" aria-hidden="true" />
          <span>Other Activity (Substitute / School event)</span>
        </div>
        <div className="csm-legend-item">
          <span className="csm-legend-chip csm-chip-white" aria-hidden="true" />
          <span>Pending (Awaiting reading for this period)</span>
        </div>
      </div>

      {/* 6. Sections and Classrooms Grid */}
      <main className="csm-sections-container">
        {loading ? (
          <div className="p-8 text-center text-slate-500">
            <RotateCw className="animate-spin inline-block mr-2" size={20} />
            Loading classroom status data...
          </div>
        ) : sections.length === 0 ? (
          <div className="p-8 text-center border rounded-lg bg-white text-slate-500">
            <Building2 className="mx-auto mb-2 text-slate-400" size={32} />
            <p className="font-semibold">No Sections Available</p>
            <p className="text-sm mt-1">School sections must be configured by the Principal in School Administration.</p>
          </div>
        ) : (
          sections.map((section: any) => {
            const sectionTotal = section.classes.length;
            const sectionTeaching = section.classes.filter((c: any) => c.status === 'teaching').length;

            return (
              <section key={section.id} className="csm-section-card" aria-labelledby={`sec-title-${section.id}`}>
                <div className="csm-section-header">
                  <div className="csm-section-title-group">
                    <h2 id={`sec-title-${section.id}`}>
                      {section.name}
                      <span className="csm-sec-badge">{section.code}</span>
                      {section.gradeRange && <span className="csm-sec-badge">Grades {section.gradeRange}</span>}
                    </h2>
                  </div>
                  <div className="csm-section-stats">
                    {sectionTeaching} of {sectionTotal} Classrooms Teaching
                  </div>
                </div>

                <div className="csm-classroom-grid">
                  {section.classes.map((cls: any) => (
                    <article
                      key={cls.id}
                      className={`csm-class-box ${cls.status}`}
                      aria-label={`${cls.name}, status: ${cls.status.replace('_', ' ')}`}
                    >
                      <div className="csm-box-top">
                        <div>
                          <div className="csm-box-classname">{cls.name}</div>
                          {cls.roomNumber && <div className="csm-box-room">Room {cls.roomNumber}</div>}
                        </div>
                        <span className="csm-status-pill">
                          {cls.status === 'teaching' && <CheckCircle2 size={12} aria-hidden="true" />}
                          {cls.status === 'not_teaching' && <XCircle size={12} aria-hidden="true" />}
                          {cls.status === 'other_activity' && <AlertTriangle size={12} aria-hidden="true" />}
                          {cls.status === 'pending' && <HelpCircle size={12} aria-hidden="true" />}
                          {cls.status === 'teaching' && 'Teaching'}
                          {cls.status === 'not_teaching' && 'Not Teaching'}
                          {cls.status === 'other_activity' && 'Other Activity'}
                          {cls.status === 'pending' && 'Pending'}
                        </span>
                      </div>

                      <div className="csm-box-middle">
                        <div className="csm-box-teacher">
                          {cls.classTeacherName ? `Teacher: ${cls.classTeacherName}` : 'No Class Teacher'}
                        </div>
                        {cls.activityNote && (
                          <div className="csm-box-note" title={cls.activityNote}>
                            {cls.activityNote}
                          </div>
                        )}
                      </div>

                      <div className="csm-box-footer">
                        {cls.recordedBy ? (
                          <span>By {cls.recordedBy} &middot; {new Date(cls.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        ) : (
                          <span>Awaiting period status</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })
        )}

        {/* 7. Unassigned Classes Alert Container (Principal Only) */}
        {user?.role === 'admin' && unassignedClasses.length > 0 && (
          <section className="csm-section-card csm-unassigned-section" aria-labelledby="unassigned-title">
            <div className="csm-section-header csm-unassigned-header">
              <div className="csm-section-title-group">
                <h2 id="unassigned-title">
                  <AlertTriangle size={18} aria-hidden="true" />
                  Unassigned Classrooms ({unassignedClasses.length})
                </h2>
              </div>
              <div className="csm-section-stats">
                These classes lack a section assignment and must be linked in School Administration.
              </div>
            </div>

            <div className="csm-classroom-grid">
              {unassignedClasses.map((cls: any) => (
                <article key={cls.id} className={`csm-class-box ${cls.status}`}>
                  <div className="csm-box-top">
                    <div>
                      <div className="csm-box-classname">{cls.name}</div>
                      {cls.roomNumber && <div className="csm-box-room">Room {cls.roomNumber}</div>}
                    </div>
                    <span className="csm-status-pill">
                      {cls.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="csm-box-middle">
                    <div className="csm-box-teacher">
                      {cls.classTeacherName || 'No Class Teacher'}
                    </div>
                  </div>
                  <div className="csm-box-footer">
                    <span className="text-amber-800 font-medium">Missing Section Assignment</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* 8. Timetable Configuration Modal (Principal Only) */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="Configure 9-Period School Timetable"
      >
        <form onSubmit={handleSaveTimetable} className="csm-tt-form">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-slate-600">
              Configure standard start and end times for all 9 periods and the interval.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadStandardSriLankanPreset}
            >
              Load Sri Lankan Preset
            </Button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {periodsForm.slice(0, 4).map((p, idx) => (
              <div key={p.periodNumber} className="csm-tt-row">
                <strong className="text-sm text-slate-700">Period {p.periodNumber}</strong>
                <Input
                  type="time"
                  label="Start"
                  value={p.startTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPeriodsForm((prev) => prev.map((item, i) => i === idx ? { ...item, startTime: val } : item));
                  }}
                  required
                />
                <Input
                  type="time"
                  label="End"
                  value={p.endTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPeriodsForm((prev) => prev.map((item, i) => i === idx ? { ...item, endTime: val } : item));
                  }}
                  required
                />
              </div>
            ))}

            {/* Break after Period 4 */}
            <div className="csm-tt-break">
              <strong className="text-xs text-blue-900 col-span-3">
                <Coffee className="inline mr-1" size={14} /> Break / Interval (After Period 4)
              </strong>
              <Input
                type="text"
                label="Name"
                value={breakName}
                onChange={(e) => setBreakName(e.target.value)}
                required
              />
              <Input
                type="time"
                label="Break Start"
                value={breakStartTime}
                onChange={(e) => setBreakStartTime(e.target.value)}
                required
              />
              <Input
                type="time"
                label="Break End"
                value={breakEndTime}
                onChange={(e) => setBreakEndTime(e.target.value)}
                required
              />
            </div>

            {periodsForm.slice(4).map((p, idx) => {
              const realIdx = idx + 4;
              return (
                <div key={p.periodNumber} className="csm-tt-row">
                  <strong className="text-sm text-slate-700">Period {p.periodNumber}</strong>
                  <Input
                    type="time"
                    label="Start"
                    value={p.startTime}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPeriodsForm((prev) => prev.map((item, i) => i === realIdx ? { ...item, startTime: val } : item));
                    }}
                    required
                  />
                  <Input
                    type="time"
                    label="End"
                    value={p.endTime}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPeriodsForm((prev) => prev.map((item, i) => i === realIdx ? { ...item, endTime: val } : item));
                    }}
                    required
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setShowConfigModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={configLoading}>
              {configLoading ? 'Saving...' : 'Save 9-Period Timetable'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

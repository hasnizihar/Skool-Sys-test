import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  RotateCw,
  Clock,
  Coffee,
  Building2,
  Settings,
  Smartphone
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
  Modal,
  Box,
  ScrollArea,
  Alert,
  Tooltip
} from '@mantine/core';
import { api } from '../api/client';
import { Input } from '../ui/Input';
import { useToast } from '../ui/useToast';
import { LoadingState, EmptyState } from '../ui/mantine';
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
      if (!isSilent) setRefreshing(false);
    }
  }, [selectedPeriod, addToast]);

  // Initial load and period change fetch
  useEffect(() => {
    fetchOverview(true);
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
      <Paper p="md" radius="lg" withBorder shadow="xs" className="csm-header-card">
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <div className="csm-title-area">
            <Group gap="xs" align="center">
              <Activity className="csm-title-icon" size={26} aria-hidden="true" />
              <Title order={2} className="csm-title">
                Classroom Status Monitoring
              </Title>
            </Group>
            <Text size="sm" c="dimmed" mt={2} className="csm-subtitle">
              Live school-wide teaching status tracking across school sections · Kattankudy Central College
            </Text>
          </div>

          <Group gap="sm" wrap="wrap" className="csm-actions">
            <div
              className={`csm-live-indicator ${isLiveConnected ? '' : 'error'}`}
              title={lastSyncTime ? `Last synced: ${lastSyncTime}` : undefined}
            >
              <span className="csm-pulse-dot" aria-hidden="true" />
              <span>
                {isLiveConnected
                  ? `Live Updates (5s) ${lastSyncTime ? `· ${lastSyncTime}` : ''}`
                  : 'Connecting...'}
              </span>
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={() => fetchOverview(false)}
              disabled={refreshing}
              leftSection={<RotateCw className={refreshing ? 'animate-spin' : ''} size={15} />}
            >
              Refresh
            </Button>

            {user?.role === 'admin' && (
              <Button
                variant="default"
                size="sm"
                onClick={openTimetableConfig}
                leftSection={<Settings size={15} />}
              >
                Timetable
              </Button>
            )}

            {/* Quick link for Section Heads to Mobile Mode */}
            {onNavigate && (
              <Button
                color="blue"
                size="sm"
                onClick={() => onNavigate('mobile-classroom-status')}
                leftSection={<Smartphone size={15} />}
              >
                Mobile Walkthrough
              </Button>
            )}
          </Group>
        </Group>
      </Paper>

      {/* 2. Status Banners (Unconfigured / Break / Non-School Hours) */}
      {context && !context.configured && (
        <Alert
          icon={<AlertTriangle size={20} />}
          title="Timetable Configuration Pending"
          color="yellow"
          radius="md"
        >
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Text size="sm">
              The official 9-period timetable has not been configured yet. Classroom statuses will default to unconfirmed until period times are set.
            </Text>
            {user?.role === 'admin' && (
              <Button size="xs" color="yellow" variant="filled" onClick={openTimetableConfig}>
                Configure Timetable
              </Button>
            )}
          </Group>
        </Alert>
      )}

      {context && context.configured && context.isBreak && (
        <Alert
          icon={<Coffee size={20} />}
          title={context.periodName || 'School Break'}
          color="teal"
          radius="md"
        >
          <Text size="sm">
            {context.message}
            {context.startTime && context.endTime && ` (${context.startTime} - ${context.endTime})`}. No teaching periods are active during the interval.
          </Text>
        </Alert>
      )}

      {context && context.configured && (context.state === 'before_school' || context.state === 'after_school' || context.state === 'weekend') && (
        <Alert
          icon={<Clock size={20} />}
          title="Current Period Status"
          color="blue"
          radius="md"
        >
          <Text size="sm">
            {context.message}. You may select a period below to inspect recorded historical statuses.
          </Text>
        </Alert>
      )}

      {/* 3. Period Selector Ribbon */}
      <Paper p="xs" radius="md" withBorder shadow="xs">
        <ScrollArea type="auto" offsetScrollbars>
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
        </ScrollArea>
      </Paper>

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
      <Paper p="xs" radius="md" withBorder shadow="xs">
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
      </Paper>

      {/* 6. Sections and Classrooms Grid */}
      <main className="csm-sections-container">
        {loading ? (
          <LoadingState message="Loading classroom status data..." minHeight={240} />
        ) : sections.length === 0 ? (
          <EmptyState
            icon={<Building2 size={36} />}
            title="No Sections Available"
            description="School sections must be configured by the Principal in School Administration."
          />
        ) : (
          sections.map((section: any) => {
            const sectionTotal = section.classes.length;
            const sectionTeaching = section.classes.filter((c: any) => c.status === 'teaching').length;

            return (
              <Paper key={section.id} radius="lg" withBorder shadow="xs" className="csm-section-card" aria-labelledby={`sec-title-${section.id}`}>
                <div className="csm-section-header">
                  <div className="csm-section-title-group">
                    <h2 id={`sec-title-${section.id}`}>
                      {section.name}
                      <span className="csm-sec-badge">{section.code}</span>
                      {section.gradeRange && <span className="csm-sec-badge">Grades {section.gradeRange}</span>}
                    </h2>
                  </div>
                  <div className="csm-section-stats">
                    <Badge color="blue" variant="light" size="sm">
                      {sectionTeaching} of {sectionTotal} Classrooms Teaching
                    </Badge>
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
              </Paper>
            );
          })
        )}

        {/* 7. Unassigned Classes Alert Container (Principal Only) */}
        {user?.role === 'admin' && unassignedClasses.length > 0 && (
          <Paper radius="lg" withBorder shadow="xs" className="csm-section-card csm-unassigned-section" aria-labelledby="unassigned-title">
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
          </Paper>
        )}
      </main>

      {/* 8. Timetable Configuration Modal (Principal Only) */}
      <Modal
        opened={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title={<Title order={4}>Configure 9-Period School Timetable</Title>}
        size="lg"
        radius="md"
      >
        <form onSubmit={handleSaveTimetable} className="csm-tt-form">
          <Group justify="space-between" align="center" mb="xs">
            <Text size="sm" c="dimmed">
              Configure standard start and end times for all 9 periods and the interval.
            </Text>
            <Button
              type="button"
              variant="light"
              color="blue"
              size="xs"
              onClick={loadStandardSriLankanPreset}
            >
              Load Sri Lankan Preset
            </Button>
          </Group>

          <Stack gap="xs" mah={380} style={{ overflowY: 'auto' }} pr={4}>
            {periodsForm.slice(0, 4).map((p, idx) => (
              <div key={p.periodNumber} className="csm-tt-row">
                <Text size="sm" fw={700} c="dark.7">Period {p.periodNumber}</Text>
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
                  <Text size="sm" fw={700} c="dark.7">Period {p.periodNumber}</Text>
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
          </Stack>

          <Group justify="flex-end" gap="sm" pt="md" style={{ borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
            <Button type="button" variant="default" onClick={() => setShowConfigModal(false)}>
              Cancel
            </Button>
            <Button type="submit" color="blue" loading={configLoading}>
              Save 9-Period Timetable
            </Button>
          </Group>
        </form>
      </Modal>
    </div>
  );
};

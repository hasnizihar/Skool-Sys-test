import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  RotateCw,
  Coffee,
  Building2,
  Smartphone,
  School,
  Moon,
  RotateCcw
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
  Box,
  Alert,
  Tooltip
} from '@mantine/core';
import { api } from '../api/client';
import { useToast } from '../ui/useToast';
import { LoadingState, EmptyState } from '../ui/mantine';
import './classroomStatusMonitoring.css';

interface Props {
  user: any;
  onNavigate?: (tab: string) => void;
}

const cleanTeacherName = (name?: string | null): string => {
  if (!name) return 'No Class Teacher';
  return name
    .replace(/^DEMO ONLY:\s*/i, '')
    .replace(/\s*\(Synthetic[^)]*\)/i, '')
    .trim();
};

export const ClassroomStatusMonitoring: React.FC<Props> = ({ user, onNavigate }) => {
  const { showToast: addToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

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

  const context = data?.context;
  const summary = data?.summary || { total: 0, teaching: 0, notTeaching: 0, otherActivity: 0, pending: 0 };
  const sections = data?.sections || [];
  const unassignedClasses = data?.unassignedClasses || [];

  // Organize sections into a cohesive Bento Grid layout:
  // A/L Stream sections (Arts, Commerce, Science, Technology) first,
  // followed by Secondary Sections (Secondary 1, 2, 3)
  const sortedSections = useMemo(() => {
    return [...sections].sort((a: any, b: any) => {
      const aIsSec = /secondary/i.test(a.name) || (a.gradeRange && a.gradeRange.includes('6'));
      const bIsSec = /secondary/i.test(b.name) || (b.gradeRange && b.gradeRange.includes('6'));
      if (aIsSec && !bIsSec) return 1;
      if (!aIsSec && bIsSec) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [sections]);

  const getBentoSpanClass = (classCount: number, sectionName: string) => {
    if (classCount >= 10 || /secondary/i.test(sectionName)) {
      return 'csm-bento-span-4';
    }
    return 'csm-bento-span-6';
  };

  const isSchoolEnded = context?.state === 'after_school' || context?.state === 'weekend';
  const isViewingLive = selectedPeriod === null;

  // Enforce: only Teaching Periods are selectable for status monitoring
  const teachingPeriods = useMemo(() => {
    const list = context?.availablePeriods || [];
    const filtered = list.filter((p: any) => p.isTeaching !== false && p.periodType === 'teaching');
    if (filtered.length > 0) return filtered;
    const nonBreaks = list.filter(
      (p: any) =>
        p.periodType !== 'interval' &&
        p.periodType !== 'prayer' &&
        p.periodType !== 'assembly' &&
        p.periodType !== 'extra_curricular' &&
        p.periodType !== 'other'
    );
    if (nonBreaks.length > 0) return nonBreaks;
    return [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      periodNumber: n,
      name: `Period ${n}`,
      startTime: '',
      endTime: '',
      isTeaching: true,
      periodType: 'teaching'
    }));
  }, [context?.availablePeriods]);

  // Current schedule status indicator on the right side of the ribbon (only when reviewing a period)
  const renderCurrentStatusSide = () => {
    if (selectedPeriod !== null) {
      return (
        <Group gap={6}>
          <Badge color="blue" size="sm" variant="filled">
            Reviewing: Period {selectedPeriod}
          </Badge>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => setSelectedPeriod(null)}
            title="Return to real-time status"
          >
            Live View &times;
          </Button>
        </Group>
      );
    }
    return null;
  };

  return (
    <div className="csm-container">
      {/* 1. Header & Live Indicator */}
      <Paper p="sm" radius="lg" withBorder shadow="xs" className="csm-header-card">
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <div className="csm-title-area">
            <Group gap="xs" align="center">
              <Activity className="csm-title-icon" size={24} aria-hidden="true" />
              <Title order={2} className="csm-title">
                Classroom Status Monitoring
              </Title>
            </Group>
          </div>

          <Group gap="sm" wrap="wrap" className="csm-actions" align="center">
            <div
              className={`csm-live-indicator ${isLiveConnected ? '' : 'error'}`}
              title={lastSyncTime ? `Last synced: ${lastSyncTime}` : undefined}
            >
              <span className="csm-pulse-dot" aria-hidden="true" />
              <span>
                {isLiveConnected
                  ? `Live (5s)${lastSyncTime ? ` · ${lastSyncTime}` : ''}`
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

      {/* 2. Status Banners (Unconfigured / Break) */}
      {context && !context.configured && (
        <Alert
          icon={<AlertTriangle size={20} />}
          title="Timetable Configuration Pending"
          color="yellow"
          radius="md"
        >
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Text size="sm">
              The official 9-period timetable has not been configured yet. Classroom statuses will default to unconfirmed until period times are set in School Settings.
            </Text>
            {user?.role === 'admin' && onNavigate && (
              <Button size="xs" color="yellow" variant="filled" onClick={() => onNavigate('settings')}>
                Go to School Settings
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

      {/* 3. Period Selector Ribbon */}
      <Paper p="xs" radius="md" withBorder shadow="xs" className="csm-period-ribbon-card">
        <div className="csm-period-ribbon-wrapper">
          <div className="csm-period-bar-container">
            {/* Real-time Live Mode Toggle Button */}
            <button
              type="button"
              className={`csm-live-btn ${selectedPeriod === null ? 'active' : ''} ${isSchoolEnded ? 'ended' : context?.isBreak ? 'break' : 'live'}`}
              onClick={() => setSelectedPeriod(null)}
              aria-current={selectedPeriod === null ? 'page' : undefined}
              title={selectedPeriod !== null ? 'Click to return to real-time status' : 'Viewing real-time status'}
            >
              {selectedPeriod === null ? (
                <>
                  {isSchoolEnded ? (
                    <>
                      <Moon size={14} aria-hidden="true" />
                      <span>Live Status</span>
                    </>
                  ) : context?.isBreak ? (
                    <>
                      <Coffee size={14} aria-hidden="true" />
                      <span>Live &middot; {context?.periodName || 'Interval'}</span>
                    </>
                  ) : (
                    <>
                      <span className="csm-pulse-dot" aria-hidden="true" />
                      <span>Live &middot; Period {context?.periodNumber || 1}</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <RotateCcw size={13} aria-hidden="true" />
                  <span>Return to Live</span>
                </>
              )}
            </button>

            <div className="csm-ribbon-divider" aria-hidden="true" />

            <nav className="csm-period-bar" aria-label="School Period Selection">
              {teachingPeriods.map((pInfo: any, index: number) => {
                const pNum = pInfo.periodNumber;
                const isSelected = selectedPeriod === pNum;
                const label = pInfo.name && /^Period\s+\d+$/i.test(pInfo.name)
                  ? pInfo.name
                  : `Period ${index + 1}`;

                return (
                  <button
                    key={pNum}
                    type="button"
                    className={`csm-period-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedPeriod(selectedPeriod === pNum ? null : pNum)}
                    aria-current={isSelected ? 'page' : undefined}
                    title={isSelected ? 'Click again to return to live view' : `Inspect ${label} records`}
                  >
                    <span className="csm-pbtn-name">{label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {selectedPeriod !== null && (
            <div className="csm-current-status-side">
              {renderCurrentStatusSide()}
            </div>
          )}
        </div>
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

        {isSchoolEnded && isViewingLive ? (
          <div className="csm-kpi-card csm-kpi-grey">
            <div className="csm-kpi-icon" aria-hidden="true">
              <Moon size={24} />
            </div>
            <div className="csm-kpi-info">
              <h3>School Ended</h3>
              <div className="csm-kpi-value">
                {summary.schoolEnded ?? summary.pending ?? summary.total}
                <span className="csm-kpi-pct">
                  ({summary.total > 0 ? Math.round(((summary.schoolEnded ?? summary.pending ?? summary.total) / summary.total) * 100) : 0}%)
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="csm-kpi-card csm-kpi-white">
            <div className="csm-kpi-icon" aria-hidden="true">
              <HelpCircle size={24} />
            </div>
            <div className="csm-kpi-info">
              <h3>Pending</h3>
              <div className="csm-kpi-value">
                {summary.pending}
                <span className="csm-kpi-pct">
                  ({summary.total > 0 ? Math.round((summary.pending / summary.total) * 100) : 0}%)
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 5. Status Legend */}
      <Paper p="xs" radius="md" withBorder shadow="xs">
        <div className="csm-legend" aria-label="Status Color Code Legend">
          <strong className="csm-legend-title">Legend:</strong>
          <Tooltip label="Assigned teaching taking place in classroom" withArrow position="top">
            <div className="csm-legend-item">
              <span className="csm-legend-chip csm-chip-green" aria-hidden="true" />
              <span>Teaching</span>
            </div>
          </Tooltip>
          <Tooltip label="Confirmed teacher absent or not teaching" withArrow position="top">
            <div className="csm-legend-item">
              <span className="csm-legend-chip csm-chip-red" aria-hidden="true" />
              <span>Not Teaching</span>
            </div>
          </Tooltip>
          <Tooltip label="Substitute teacher, assembly, or school event" withArrow position="top">
            <div className="csm-legend-item">
              <span className="csm-legend-chip csm-chip-yellow" aria-hidden="true" />
              <span>Other Activity</span>
            </div>
          </Tooltip>
          <Tooltip label="Classes dismissed for the day / after school hours" withArrow position="top">
            <div className="csm-legend-item">
              <span className="csm-legend-chip csm-chip-grey" aria-hidden="true" />
              <span>School Ended</span>
            </div>
          </Tooltip>
          <Tooltip label="Awaiting walkthrough status confirmation" withArrow position="top">
            <div className="csm-legend-item">
              <span className="csm-legend-chip csm-chip-white" aria-hidden="true" />
              <span>Pending</span>
            </div>
          </Tooltip>
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
          sortedSections.map((section: any) => {
            const sectionTotal = section.classes.length;
            const sectionTeaching = section.classes.filter((c: any) => c.status === 'teaching').length;
            const spanClass = getBentoSpanClass(sectionTotal, section.name);

            return (
              <Paper
                key={section.id}
                radius="lg"
                withBorder
                shadow="xs"
                className={`csm-section-card ${spanClass}`}
                aria-labelledby={`sec-title-${section.id}`}
              >
                <div className="csm-section-header">
                  <div className="csm-section-title-group">
                    <h2 id={`sec-title-${section.id}`}>
                      {section.name}
                      {section.gradeRange && <span className="csm-sec-badge">Grades {section.gradeRange}</span>}
                    </h2>
                  </div>
                  <div className="csm-section-stats">
                    {isSchoolEnded && isViewingLive ? (
                      <Badge color="gray" variant="light" size="sm">
                        School Ended &middot; {sectionTotal} Classrooms Dismissed
                      </Badge>
                    ) : (
                      <Badge color="blue" variant="light" size="sm">
                        {sectionTeaching} of {sectionTotal} Classrooms Teaching
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="csm-classroom-grid">
                  {section.classes.map((cls: any) => {
                    const effectiveStatus =
                      (isSchoolEnded && isViewingLive) || cls.status === 'school_ended'
                        ? 'school_ended'
                        : cls.status;

                    return (
                      <article
                        key={cls.id}
                        className={`csm-class-box ${effectiveStatus}`}
                        aria-label={`${cls.name}, status: ${effectiveStatus.replace('_', ' ')}`}
                      >
                        <div className="csm-box-top">
                          <div className="csm-box-classname">{cls.name}</div>
                          {effectiveStatus !== 'pending' && effectiveStatus !== 'school_ended' && (
                            <span className="csm-status-pill">
                              {effectiveStatus === 'teaching' && <CheckCircle2 size={12} aria-hidden="true" />}
                              {effectiveStatus === 'not_teaching' && <XCircle size={12} aria-hidden="true" />}
                              {effectiveStatus === 'other_activity' && <AlertTriangle size={12} aria-hidden="true" />}
                              {effectiveStatus === 'teaching' && 'Teaching'}
                              {effectiveStatus === 'not_teaching' && 'Not Teaching'}
                              {effectiveStatus === 'other_activity' && 'Other Activity'}
                            </span>
                          )}
                        </div>

                        {cls.activityNote && (
                          <div className="csm-box-middle">
                            <div className="csm-box-note" title={cls.activityNote}>
                              {cls.activityNote}
                            </div>
                          </div>
                        )}

                        {cls.recordedBy && (
                          <div className="csm-box-footer">
                            <span>By {cleanTeacherName(cls.recordedBy)} &middot; {new Date(cls.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </Paper>
            );
          })
        )}

        {/* 7. Unassigned Classes Alert Container (Principal Only) */}
        {user?.role === 'admin' && unassignedClasses.length > 0 && (
          <Paper radius="lg" withBorder shadow="xs" className="csm-section-card csm-bento-span-12 csm-unassigned-section" aria-labelledby="unassigned-title">
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
              {unassignedClasses.map((cls: any) => {
                const effectiveStatus =
                  (isSchoolEnded && isViewingLive) || cls.status === 'school_ended'
                    ? 'school_ended'
                    : cls.status;

                return (
                  <article key={cls.id} className={`csm-class-box ${effectiveStatus}`}>
                    <div className="csm-box-top">
                      <div className="csm-box-classname">{cls.name}</div>
                      {effectiveStatus !== 'pending' && effectiveStatus !== 'school_ended' && (
                        <span className="csm-status-pill">
                          {effectiveStatus === 'teaching' && <CheckCircle2 size={12} aria-hidden="true" />}
                          {effectiveStatus === 'not_teaching' && <XCircle size={12} aria-hidden="true" />}
                          {effectiveStatus === 'other_activity' && <AlertTriangle size={12} aria-hidden="true" />}
                          {effectiveStatus === 'teaching' && 'Teaching'}
                          {effectiveStatus === 'not_teaching' && 'Not Teaching'}
                          {effectiveStatus === 'other_activity' && 'Other Activity'}
                        </span>
                      )}
                    </div>
                    <div className="csm-box-footer">
                      <span className="text-amber-800 font-medium">Missing Section Assignment</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </Paper>
        )}
      </main>
    </div>
  );
};

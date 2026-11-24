import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  RotateCw,
  Clock,
  X,
  ShieldAlert,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Activity,
  Moon,
  Layers,
  Lock,
  Coffee
} from 'lucide-react';
import {
  Paper,
  Badge,
  Button,
  Group,
  Stack,
  Text,
  Title,
  Progress,
  Modal,
  Box,
  SimpleGrid,
  Alert
} from '@mantine/core';
import { api } from '../api/client';
import { EmptyState, LoadingState } from '../ui/mantine';
import { useToast } from '../ui/useToast';
import './mobileClassroomStatus.css';

interface Props {
  user: any;
  onNavigate?: (tab: string) => void;
}

export const MobileClassroomStatus: React.FC<Props> = ({ user, onNavigate }) => {
  const { showToast: addToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  // Status Action Sheet Modal State
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [pendingStatus, setPendingStatus] = useState<'teaching' | 'not_teaching' | 'other_activity'>('teaching');
  const [activityNote, setActivityNote] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [conflictData, setConflictData] = useState<any | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.getClassroomStatusOverview();
      setData(res);

      // Reset selectedSectionId if the selected section no longer exists in refreshed data
      if (selectedSectionId !== null && res.sections && !res.sections.some((s: any) => s.id === selectedSectionId)) {
        setSelectedSectionId(null);
      }
    } catch (err: any) {
      addToast({
        title: 'Error loading classrooms',
        message: err.message || 'Unable to connect to school server.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [selectedSectionId, addToast]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const sections: any[] = data?.sections || [];
  const activeSection = selectedSectionId !== null ? sections.find((s: any) => s.id === selectedSectionId) || null : null;
  const context = data?.context;
  const classes: any[] = activeSection?.classes || [];

  // Helper: check if a class has an actual recorded database status for the active period
  const isRecordedClass = (c: any) =>
    Boolean(c?.statusRecordId !== null && c?.statusRecordId !== undefined) ||
    c?.status === 'teaching' ||
    c?.status === 'not_teaching' ||
    c?.status === 'other_activity';

  const completedCount = classes.filter(isRecordedClass).length;
  const totalCount = classes.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Overall school/supervisor metrics across all assigned sections based on verified records
  const totalSchoolClasses = sections.reduce((acc: number, s: any) => acc + (s.classes?.length || 0), 0);
  const totalSchoolCompleted = sections.reduce(
    (acc: number, s: any) => acc + (s.classes?.filter(isRecordedClass)?.length || 0),
    0
  );
  const overallProgressPct = totalSchoolClasses > 0 ? Math.round((totalSchoolCompleted / totalSchoolClasses) * 100) : 0;

  // Enforce: Walkthrough status can only be taken during active teaching periods
  const isTeachingPeriodActive = Boolean(
    context?.configured &&
    context?.state === 'active' &&
    context?.periodNumber &&
    !context?.isBreak
  );

  const openClassSheet = (cls: any) => {
    if (!isTeachingPeriodActive) {
      addToast({
        title: 'Walkthrough Unavailable',
        message: 'Walkthrough status can only be taken during active teaching periods.',
        type: 'warning'
      });
      return;
    }
    setSelectedClass(cls);
    setPendingStatus(cls.status === 'pending' ? 'teaching' : cls.status);
    setActivityNote(cls.activityNote || '');
    setConflictData(null);
  };

  const closeClassSheet = () => {
    setSelectedClass(null);
    setConflictData(null);
    setActivityNote('');
  };

  const handleSaveStatus = async (goToNext = false) => {
    if (!selectedClass) return;

    if (!isTeachingPeriodActive) {
      addToast({
        title: 'Walkthrough Inactive',
        message: 'Walkthrough status can only be recorded during active teaching periods.',
        type: 'warning'
      });
      return;
    }

    setSaving(true);
    try {
      const res = await api.recordClassroomStatus({
        classId: selectedClass.id,
        status: pendingStatus,
        periodNumber: context?.periodNumber || undefined,
        schoolDate: context?.schoolDate || undefined,
        activityNote: pendingStatus === 'other_activity' ? activityNote : undefined,
        expectedRevision: conflictData ? undefined : selectedClass.revision
      });

      addToast({
        title: 'Status Recorded',
        message: `${selectedClass.name}: ${pendingStatus.replace('_', ' ')}`,
        type: 'success'
      });

      // Update local state optimistically
      setData((prev: any) => {
        if (!prev) return prev;
        const newSections = prev.sections.map((sec: any) => {
          if (sec.id !== selectedSectionId) return sec;
          return {
            ...sec,
            classes: sec.classes.map((c: any) => {
              if (c.id !== selectedClass.id) return c;
              return {
                ...c,
                status: pendingStatus,
                revision: res.record?.revision || c.revision + 1,
                activityNote: pendingStatus === 'other_activity' ? activityNote : null,
                recordedBy: user.full_name,
                recordedAt: new Date().toISOString()
              };
            })
          };
        });
        return { ...prev, sections: newSections };
      });

      if (goToNext) {
        // Find next classroom in current section
        const currentIndex = classes.findIndex((c) => c.id === selectedClass.id);
        if (currentIndex >= 0 && currentIndex < classes.length - 1) {
          const nextClass = classes[currentIndex + 1];
          openClassSheet(nextClass);
        } else {
          closeClassSheet();
          addToast({
            title: 'Walkthrough Complete',
            message: `All classrooms in ${activeSection.name} checked!`,
            type: 'info'
          });
        }
      } else {
        closeClassSheet();
      }
    } catch (err: any) {
      if (err.status === 409 || err.code === 'STATUS_REVISION_CONFLICT') {
        setConflictData(err.currentStatus);
        addToast({
          title: 'Update Conflict',
          message: 'Another user modified this classroom status. Review below.',
          type: 'warning'
        });
      } else {
        addToast({
          title: 'Recording Failed',
          message: err.message || 'Could not save classroom status.',
          type: 'error'
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const renderPeriodBadge = () => {
    if (isTeachingPeriodActive) {
      return (
        <Badge
          color="green"
          variant="filled"
          size="md"
          leftSection={<Clock size={13} aria-hidden="true" />}
        >
          {context?.periodNumber ? `Period ${context.periodNumber} • Teaching Active` : 'Teaching Active'}
        </Badge>
      );
    }

    if (!context?.configured) {
      return (
        <Badge color="yellow" variant="light" size="md" leftSection={<AlertTriangle size={13} />}>
          Timetable Unconfigured
        </Badge>
      );
    }

    if (context?.isBreak) {
      return (
        <Badge color="yellow" variant="filled" size="md" leftSection={<Coffee size={13} />}>
          {context?.periodName || 'Break / Interval'}
        </Badge>
      );
    }

    if (context?.state === 'after_school') {
      return (
        <Badge color="gray" variant="filled" size="md" leftSection={<Moon size={13} />}>
          School Day Ended
        </Badge>
      );
    }

    if (context?.state === 'before_school') {
      return (
        <Badge color="blue" variant="filled" size="md" leftSection={<Clock size={13} />}>
          Before School
        </Badge>
      );
    }

    if (context?.state === 'weekend') {
      return (
        <Badge color="gray" variant="filled" size="md" leftSection={<Clock size={13} />}>
          Weekend
        </Badge>
      );
    }

    return (
      <Badge color="gray" variant="filled" size="md" leftSection={<Lock size={13} />}>
        Walkthrough Inactive
      </Badge>
    );
  };

  const renderPeriodNotice = () => {
    if (isTeachingPeriodActive) return null;

    let icon = <Clock size={18} />;
    let color = 'gray';
    let title = 'Walkthrough Status Closed';
    let desc = 'Walkthrough status can only be taken during active teaching periods.';

    if (!context?.configured) {
      icon = <AlertTriangle size={18} />;
      color = 'yellow';
      title = 'Timetable Not Configured';
      desc = 'Official bell schedule has not been configured yet. Walkthrough status can only be recorded during teaching periods.';
    } else if (context?.isBreak) {
      icon = <Coffee size={18} />;
      color = 'yellow';
      title = `Break in Progress: ${context.periodName || 'Interval'}`;
      desc = `${context.message || 'School break interval in progress'}. Walkthrough status can only be recorded during teaching periods.`;
    } else if (context?.state === 'before_school') {
      icon = <Clock size={18} />;
      color = 'blue';
      title = 'Before School Hours';
      desc = `${context.message || 'School has not commenced yet'}. Walkthrough status can only be recorded during active teaching periods.`;
    } else if (context?.state === 'after_school') {
      icon = <Moon size={18} />;
      color = 'gray';
      title = 'School Day Concluded';
      desc = 'Scheduled teaching periods have concluded for today. Walkthrough status can only be recorded during active teaching periods.';
    } else if (context?.state === 'weekend') {
      icon = <Clock size={18} />;
      color = 'gray';
      title = 'Weekend (School Closed)';
      desc = 'Live walkthrough reporting operates during active school teaching periods (Monday–Friday).';
    }

    return (
      <Alert icon={icon} color={color} radius="md">
        <Text size="xs" fw={700} mb={2}>
          {title}
        </Text>
        <Text size="xs" fw={500}>
          {desc}
        </Text>
      </Alert>
    );
  };

  return (
    <div className="mcs-container" role="region" aria-label="Mobile Classroom Status Walkthrough">
      {/* =========================================================================
          VIEW A: Assigned Sections List (When no section is currently active)
          ========================================================================= */}
      {selectedSectionId === null ? (
        <>
          {/* Header Card for Sections View */}
          <Paper p="sm" radius="md" withBorder className="mcs-header" shadow="xs">
            <Group justify="space-between" align="center" className="mcs-top-row">
              <Group gap="xs" align="center">
                {onNavigate && (
                  <Button
                    variant="subtle"
                    color="gray"
                    size="xs"
                    p={4}
                    onClick={() => onNavigate('classroom-status')}
                    title="Back to Classroom Status Overview"
                    aria-label="Back to Classroom Status Overview"
                  >
                    <ChevronLeft size={18} />
                  </Button>
                )}
                <Title order={3} className="mcs-title">
                  Walkthrough Status
                </Title>
              </Group>

              {renderPeriodBadge()}
            </Group>

            {/* Overall School / Supervisor Walkthrough Progress */}
            <div className="mcs-progress-bar-wrap">
              <Progress
                value={overallProgressPct}
                color={overallProgressPct === 100 ? 'green' : 'blue'}
                size="sm"
                radius="xl"
                style={{ flex: 1 }}
              />
              <Text size="xs" fw={700} c="dimmed" className="mcs-progress-text">
                {totalSchoolCompleted} / {totalSchoolClasses} Checked ({overallProgressPct}%)
              </Text>
            </div>
          </Paper>

          {/* Period Notice Banner (if inactive or break) */}
          {renderPeriodNotice()}

          {/* Section Cards */}
          {loading ? (
            <LoadingState message="Loading assigned school sections..." minHeight={200} />
          ) : sections.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert size={36} />}
              title="No Sections Assigned"
              description="You currently have no school sections assigned for walkthrough monitoring."
            />
          ) : (
            <div className="mcs-sections-overview-wrap">
              <div className="mcs-sections-header-title">
                <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Assigned Sections ({sections.length})
                </Text>
                <Text size="xs" c="dimmed">
                  Tap a section to view classrooms
                </Text>
              </div>

              <div className="mcs-section-list" role="list" aria-label="Assigned School Sections">
                {sections.map((sec: any) => {
                  const secClasses: any[] = sec.classes || [];
                  const secTotal = secClasses.length;
                  const secTeaching = secClasses.filter((c: any) => c.status === 'teaching').length;
                  const secNotTeaching = secClasses.filter((c: any) => c.status === 'not_teaching').length;
                  const secOther = secClasses.filter((c: any) => c.status === 'other_activity').length;
                  const secChecked = secClasses.filter(isRecordedClass).length;
                  const secPending = secTotal - secChecked;
                  const secProgress = secTotal > 0 ? Math.round((secChecked / secTotal) * 100) : 0;

                  return (
                    <div
                      key={sec.id}
                      className="mcs-section-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedSectionId(sec.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedSectionId(sec.id);
                        }
                      }}
                      aria-label={`Section ${sec.name}, ${secChecked} of ${secTotal} classrooms checked. Tap to open.`}
                    >
                      <div className="mcs-section-card-header">
                        <div>
                          <div className="mcs-section-card-title">{sec.name}</div>
                          <div className="mcs-section-card-meta">
                            {sec.gradeRange ? `Grades ${sec.gradeRange}` : ''}
                            {sec.gradeRange && (sec.description || secTotal > 0) ? ' • ' : ''}
                            {sec.description || `${secTotal} Classroom${secTotal !== 1 ? 's' : ''}`}
                          </div>
                        </div>
                        <div className="mcs-section-card-action">
                          <Badge
                            color={secProgress === 100 && secTotal > 0 ? 'green' : secProgress > 0 ? 'blue' : 'gray'}
                            variant={secProgress === 100 && secTotal > 0 ? 'filled' : 'light'}
                            size="sm"
                          >
                            {secProgress === 100 && secTotal > 0 ? 'Complete' : `${secChecked}/${secTotal} Checked`}
                          </Badge>
                          <ChevronRight size={18} className="mcs-section-chevron" />
                        </div>
                      </div>

                      {/* Section Progress Bar */}
                      <div className="mcs-section-progress-wrap">
                        <div className="mcs-section-progress-meta">
                          <span>Walkthrough Progress</span>
                          <span>{secProgress}%</span>
                        </div>
                        <Progress
                          value={secProgress}
                          color={secProgress === 100 && secTotal > 0 ? 'green' : secProgress > 0 ? 'blue' : 'gray'}
                          size="xs"
                          radius="xl"
                        />
                      </div>

                      {/* Status Chips Row */}
                      <div className="mcs-section-chips-row">
                        <span className="mcs-sec-chip chip-teaching">
                          <CheckCircle2 size={12} />
                          <span>{secTeaching} Teaching</span>
                        </span>
                        <span className="mcs-sec-chip chip-not-teaching">
                          <XCircle size={12} />
                          <span>{secNotTeaching} Not Teaching</span>
                        </span>
                        {secOther > 0 && (
                          <span className="mcs-sec-chip chip-other">
                            <AlertTriangle size={12} />
                            <span>{secOther} Other</span>
                          </span>
                        )}
                        <span className="mcs-sec-chip chip-pending">
                          <span>{secPending} Pending</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        /* =========================================================================
           VIEW B: Classrooms Grid in Selected Section
           ========================================================================= */
        <>
          {/* Header Card for Selected Section */}
          <Paper p="sm" radius="md" withBorder className="mcs-header" shadow="xs">
            <Group justify="space-between" align="center" className="mcs-top-row">
              <Group gap="xs" align="center">
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  p={4}
                  onClick={() => setSelectedSectionId(null)}
                  title="Back to All Sections"
                  aria-label="Back to All Sections"
                >
                  <ChevronLeft size={18} />
                </Button>
                <div>
                  <Title order={3} className="mcs-title" style={{ fontSize: '1.05rem' }}>
                    {activeSection?.name || 'Classroom Walkthrough'}
                  </Title>
                  <Text size="xs" c="dimmed">
                    Classroom Walkthrough Status
                  </Text>
                </div>
              </Group>

              {renderPeriodBadge()}
            </Group>

            {/* Section Walkthrough Progress */}
            <div className="mcs-progress-bar-wrap">
              <Progress
                value={progressPct}
                color={progressPct === 100 ? 'green' : 'blue'}
                size="sm"
                radius="xl"
                style={{ flex: 1 }}
              />
              <Text size="xs" fw={700} c="dimmed" className="mcs-progress-text">
                {completedCount} / {totalCount} Checked ({progressPct}%)
              </Text>
            </div>
          </Paper>

          {/* Period Notice Banner (if inactive or break) */}
          {renderPeriodNotice()}

          {/* Classrooms Grid for Selected Section */}
          {classes.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert size={36} />}
              title="No Classrooms In This Section"
              description="There are currently no classrooms assigned to this section."
            />
          ) : (
            <main className="mcs-grid" aria-label="Classroom Status Selection Grid">
              {classes.map((cls) => {
                const isRecorded = isRecordedClass(cls);
                const effectiveStatus = isRecorded ? cls.status : 'pending';
                return (
                  <div
                    key={cls.id}
                    role="button"
                    tabIndex={0}
                    className={`mcs-class-card ${effectiveStatus} ${!isTeachingPeriodActive ? 'readonly' : ''}`}
                    onClick={() => openClassSheet(cls)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openClassSheet(cls);
                      }
                    }}
                    aria-label={`Class ${cls.name}, status: ${effectiveStatus.replace('_', ' ')}.`}
                  >
                    <div>
                      <div className="mcs-card-name">{cls.name}</div>
                    </div>

                    <div className="mcs-card-badge">
                      {effectiveStatus === 'teaching' && <CheckCircle2 size={12} aria-hidden="true" />}
                      {effectiveStatus === 'not_teaching' && <XCircle size={12} aria-hidden="true" />}
                      {effectiveStatus === 'other_activity' && <AlertTriangle size={12} aria-hidden="true" />}
                      {!isRecorded && (isTeachingPeriodActive ? <HelpCircle size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />)}
                      <span>
                        {effectiveStatus === 'teaching' && 'Teaching'}
                        {effectiveStatus === 'not_teaching' && 'Not Teaching'}
                        {effectiveStatus === 'other_activity' && 'Other Activity'}
                        {!isRecorded && (isTeachingPeriodActive ? 'Tap to Record' : 'Walkthrough Closed')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </main>
          )}
        </>
      )}

      {/* 4. Action Sheet Modal (Tap Classroom) */}
      {selectedClass && (
        <div className="mcs-sheet-overlay" onClick={closeClassSheet}>
          <div
            className="mcs-sheet-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-class-title"
          >
            <div className="mcs-sheet-header">
              <div className="mcs-sheet-title">
                <h2 id="sheet-class-title">{selectedClass.name}</h2>
                <p>
                  Period {context?.periodNumber || 'Active'}
                </p>
              </div>
              <button
                type="button"
                className="mcs-sheet-close"
                onClick={closeClassSheet}
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            {/* Conflict Warning */}
            {conflictData && (
              <div className="mcs-conflict-banner">
                <ShieldAlert size={16} className="inline mr-1" />
                <strong>Status Conflict:</strong> Modified by {conflictData.recordedBy} to "{conflictData.status.replace('_', ' ')}".
                You may overwrite with your confirmed observation.
              </div>
            )}

            {/* 3 Large Action Buttons */}
            <div className="mcs-button-group">
              <button
                type="button"
                className={`mcs-action-btn btn-green ${pendingStatus === 'teaching' ? 'selected' : ''}`}
                onClick={() => setPendingStatus('teaching')}
              >
                <CheckCircle2 size={24} aria-hidden="true" />
                <span>Normal Teaching (Green)</span>
              </button>

              <button
                type="button"
                className={`mcs-action-btn btn-red ${pendingStatus === 'not_teaching' ? 'selected' : ''}`}
                onClick={() => setPendingStatus('not_teaching')}
              >
                <XCircle size={24} aria-hidden="true" />
                <span>Not Teaching (Red)</span>
              </button>

              <button
                type="button"
                className={`mcs-action-btn btn-yellow ${pendingStatus === 'other_activity' ? 'selected' : ''}`}
                onClick={() => setPendingStatus('other_activity')}
              >
                <AlertTriangle size={24} aria-hidden="true" />
                <span>Other Activity (Yellow)</span>
              </button>
            </div>

            {/* Optional Note for Other Activity */}
            {pendingStatus === 'other_activity' && (
              <div className="mcs-note-box">
                <label htmlFor="activity-note-input">Optional Activity Details</label>
                <input
                  id="activity-note-input"
                  type="text"
                  className="mcs-note-input"
                  placeholder="e.g. Substitute teacher, School event, Library"
                  value={activityNote}
                  onChange={(e) => setActivityNote(e.target.value)}
                />
                <div className="mcs-quick-tags">
                  {['Substitute Teacher', 'School Event', 'Library Period', 'Group Study'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="mcs-tag-btn"
                      onClick={() => setActivityNote(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Save Buttons */}
            <div className="mcs-save-row">
              <Button
                variant="default"
                size="md"
                onClick={() => handleSaveStatus(false)}
                loading={saving}
                disabled={!isTeachingPeriodActive}
                style={{ height: 48 }}
              >
                Save
              </Button>

              <Button
                color="blue"
                size="md"
                onClick={() => handleSaveStatus(true)}
                loading={saving}
                disabled={!isTeachingPeriodActive}
                rightSection={<ArrowRight size={18} />}
                style={{ height: 48 }}
              >
                Save & Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

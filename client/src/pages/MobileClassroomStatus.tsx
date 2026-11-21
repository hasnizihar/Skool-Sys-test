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
  Activity
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

      if (res.sections?.length > 0 && selectedSectionId === null) {
        setSelectedSectionId(res.sections[0].id);
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

  const activeSection = data?.sections?.find((s: any) => s.id === selectedSectionId) || data?.sections?.[0];
  const context = data?.context;
  const classes: any[] = activeSection?.classes || [];

  const completedCount = classes.filter((c) => c.status !== 'pending').length;
  const totalCount = classes.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const openClassSheet = (cls: any) => {
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

  return (
    <div className="mcs-container" role="region" aria-label="Mobile Classroom Status Walkthrough">
      {/* 1. Mobile Header Card */}
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

          <Badge
            color={context?.isBreak ? 'yellow' : 'blue'}
            variant="filled"
            size="md"
            leftSection={<Clock size={13} aria-hidden="true" />}
          >
            {context?.periodNumber ? `Period ${context.periodNumber}` : (context?.periodName || 'No Active Period')}
          </Badge>
        </Group>

        {/* Section Selector */}
        {data?.sections?.length > 1 && (
          <div className="mcs-section-selector">
            <label htmlFor="section-select">Assigned Section</label>
            <select
              id="section-select"
              className="mcs-select"
              value={selectedSectionId || ''}
              onChange={(e) => setSelectedSectionId(Number(e.target.value))}
            >
              {data.sections.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Walkthrough Progress */}
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

      {/* 2. Notice if unconfigured / break */}
      {context && !context.configured && (
        <Alert icon={<AlertTriangle size={18} />} color="yellow" radius="md">
          <Text size="xs" fw={600}>
            Timetable Notice: School period times have not been configured yet.
          </Text>
        </Alert>
      )}

      {context && context.isBreak && (
        <Alert icon={<Clock size={18} />} color="blue" radius="md">
          <Text size="xs" fw={600}>
            Break in Progress: {context.message}.
          </Text>
        </Alert>
      )}

      {/* 3. Classrooms Grid */}
      {loading ? (
        <LoadingState message="Loading assigned classrooms..." minHeight={200} />
      ) : classes.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={36} />}
          title="No Classrooms In Assigned Section"
          description="There are currently no classrooms assigned to this section, or you do not have permission to view them."
        />
      ) : (
        <main className="mcs-grid" aria-label="Classroom Status Selection Grid">
          {classes.map((cls) => (
            <div
              key={cls.id}
              role="button"
              tabIndex={0}
              className={`mcs-class-card ${cls.status}`}
              onClick={() => openClassSheet(cls)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openClassSheet(cls);
                }
              }}
              aria-label={`Class ${cls.name}, status: ${cls.status.replace('_', ' ')}. Tap to record status.`}
            >
              <div>
                <div className="mcs-card-name">{cls.name}</div>
                {cls.roomNumber && <div className="mcs-card-room">Room {cls.roomNumber}</div>}
              </div>

              <div className="mcs-card-badge">
                {cls.status === 'teaching' && <CheckCircle2 size={12} aria-hidden="true" />}
                {cls.status === 'not_teaching' && <XCircle size={12} aria-hidden="true" />}
                {cls.status === 'other_activity' && <AlertTriangle size={12} aria-hidden="true" />}
                {cls.status === 'pending' && <HelpCircle size={12} aria-hidden="true" />}
                <span>
                  {cls.status === 'teaching' && 'Teaching'}
                  {cls.status === 'not_teaching' && 'Not Teaching'}
                  {cls.status === 'other_activity' && 'Other Activity'}
                  {cls.status === 'pending' && 'Tap to Record'}
                </span>
              </div>
            </div>
          ))}
        </main>
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
                  {selectedClass.roomNumber ? `Room ${selectedClass.roomNumber} · ` : ''}
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
                  {['Substitute Teacher', 'School Event', 'Library Period', 'Exam Preparation'].map((tag) => (
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
                style={{ height: 48 }}
              >
                Save
              </Button>

              <Button
                color="blue"
                size="md"
                onClick={() => handleSaveStatus(true)}
                loading={saving}
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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  School,
  Clock,
  Save,
  RotateCcw,
  Copy,
  Plus,
  Trash2,
  AlertTriangle,
  MapPin,
  UserCheck,
  Mail,
  Phone,
  ShieldCheck,
  Layers,
  Calendar,
  Edit2,
  X
} from 'lucide-react';
import {
  Tabs,
  Card,
  Group,
  Stack,
  TextInput,
  Select,
  Button,
  Badge,
  Switch,
  ActionIcon,
  Text,
  Title,
  Alert,
  Modal,
  Checkbox,
  SegmentedControl,
  Divider,
  Tooltip,
  Paper,
  SimpleGrid,
  LoadingOverlay
} from '@mantine/core';
import { useForm, isNotEmpty, isEmail } from '@mantine/form';
import { api } from '../api/client';
import { useToast } from '../ui';
import { ErrorState, PageContainer } from '../ui/mantine';

interface SchoolSettingsProps {
  user: any;
  onNavigate?: (tab: string) => void;
}

const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' }
];

const PERIOD_TYPES = [
  { value: 'teaching', label: 'Teaching Period' },
  { value: 'assembly', label: 'Morning Assembly' },
  { value: 'interval', label: 'Interval / Recess' }
];

function getPeriodTypeBadgeColor(type: string): string {
  switch (type) {
    case 'assembly':
      return 'cyan';
    case 'interval':
      return 'orange';
    case 'teaching':
    default:
      return 'blue';
  }
}

function getPeriodBadgeLabel(p: any, index: number, list: any[]): string {
  if (p.period_type === 'assembly') return 'A';
  if (p.period_type === 'interval') return 'I';
  let teachingCount = 0;
  for (let i = 0; i <= index; i++) {
    if (list[i]?.period_type === 'teaching' || !list[i]?.period_type) {
      teachingCount++;
    }
  }
  return `P${teachingCount}`;
}

function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return -1;
  const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

function computePeriodDuration(start: string, end: string): string {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s < 0 || e < 0 || e <= s) return '—';
  const diff = e - s;
  return `${diff} min`;
}

export const SchoolSettings: React.FC<SchoolSettingsProps> = ({ user, onNavigate }) => {
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<string | null>('profile');
  const [loadingProfile, setLoadingProfile] = useState<boolean>(true);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const savedProfileRef = useRef<any>(null);

  // Timetable State
  const [selectedDay, setSelectedDay] = useState<string>('monday');
  const [allSchedules, setAllSchedules] = useState<Record<string, any[]>>({});
  const [loadingTimetable, setLoadingTimetable] = useState<boolean>(true);
  const [savingTimetable, setSavingTimetable] = useState<boolean>(false);
  const [isEditingTimetable, setIsEditingTimetable] = useState<boolean>(false);
  const savedSchedulesRef = useRef<Record<string, any[]>>({});

  // Copy Schedule Modal
  const [copyModalOpen, setCopyModalOpen] = useState<boolean>(false);
  const [targetDays, setTargetDays] = useState<string[]>([]);
  const [copyingSchedule, setCopyingSchedule] = useState<boolean>(false);

  // Mantine Form for School Profile & Metadata (uncontrolled mode)
  const profileForm = useForm({
    mode: 'uncontrolled',
    initialValues: {
      school_name_en: '',
      school_name_ta: '',
      school_name_si: '',
      secondary_title: '',
      census_no: '',
      school_type: 'National School (1AB)',
      address_line1: '',
      address_line2: '',
      district: 'Batticaloa District',
      province: 'Eastern Province',
      country: 'Sri Lanka',
      postal_code: '30130',
      zone: 'Batticaloa Central',
      division: 'Kattankudy',
      phone: '',
      email: '',
      principal_name: '',
      principal_notes: '',
      founded_year: 1930,
      student_category: 'Boys',
      medium: 'Tamil / English',
      supported_grades: 'Grades 6–13'
    },
    validate: {
      school_name_en: isNotEmpty('School English name is required'),
      census_no: isNotEmpty('Ministry of Education Census number is required'),
      address_line1: isNotEmpty('Address Line 1 is required'),
      district: isNotEmpty('District is required'),
      province: isNotEmpty('Province is required'),
      zone: isNotEmpty('Educational Zone is required'),
      division: isNotEmpty('Educational Division is required'),
      phone: isNotEmpty('Official phone number is required'),
      email: isEmail('A valid institutional email address is required'),
      principal_name: isNotEmpty('Principal full name is required')
    }
  });

  // Fetch School Profile
  const fetchProfile = async () => {
    try {
      setLoadingProfile(true);
      const res = await api.getSchoolProfile();
      if (res?.profile) {
        const vals = {
          school_name_en: res.profile.school_name_en || '',
          school_name_ta: res.profile.school_name_ta || '',
          school_name_si: res.profile.school_name_si || '',
          secondary_title: res.profile.secondary_title || '',
          census_no: res.profile.census_no || '',
          school_type: res.profile.school_type || 'National School (1AB)',
          address_line1: res.profile.address_line1 || '',
          address_line2: res.profile.address_line2 || '',
          district: res.profile.district || 'Batticaloa District',
          province: res.profile.province || 'Eastern Province',
          country: res.profile.country || 'Sri Lanka',
          postal_code: res.profile.postal_code || '30130',
          zone: res.profile.zone || 'Batticaloa Central',
          division: res.profile.division || 'Kattankudy',
          phone: res.profile.phone || '',
          email: res.profile.email || '',
          principal_name: res.profile.principal_name || '',
          principal_notes: res.profile.principal_notes || '',
          founded_year: res.profile.founded_year || 1930,
          student_category: res.profile.student_category || 'Boys',
          medium: res.profile.medium || 'Tamil / English',
          supported_grades: res.profile.supported_grades || 'Grades 6–13'
        };
        profileForm.setValues(vals);
        savedProfileRef.current = vals;
        profileForm.resetDirty();
        setIsEditingProfile(false);
      }
    } catch (err: any) {
      toast.showError('Failed to load school profile: ' + (err.message || 'Network error'));
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleCancelEditProfile = () => {
    if (savedProfileRef.current) {
      profileForm.setValues(savedProfileRef.current);
    }
    profileForm.resetDirty();
    setIsEditingProfile(false);
  };

  // Fetch Daily Timetable Schedules
  const fetchTimetables = async () => {
    try {
      setLoadingTimetable(true);
      const res = await api.getTimetableSchedules();
      if (res?.schedules) {
        setAllSchedules(res.schedules);
        savedSchedulesRef.current = JSON.parse(JSON.stringify(res.schedules));
        setIsEditingTimetable(false);
      }
    } catch (err: any) {
      toast.showError('Failed to load timetable schedules: ' + (err.message || 'Network error'));
    } finally {
      setLoadingTimetable(false);
    }
  };

  const handleCancelEditTimetable = () => {
    if (savedSchedulesRef.current && savedSchedulesRef.current[selectedDay]) {
      setAllSchedules((prev) => ({
        ...prev,
        [selectedDay]: JSON.parse(JSON.stringify(savedSchedulesRef.current[selectedDay]))
      }));
    }
    setIsEditingTimetable(false);
  };

  const handleSelectDay = (day: string) => {
    if (isEditingTimetable) {
      if (savedSchedulesRef.current && savedSchedulesRef.current[selectedDay]) {
        setAllSchedules((prev) => ({
          ...prev,
          [selectedDay]: JSON.parse(JSON.stringify(savedSchedulesRef.current[selectedDay]))
        }));
      }
      setIsEditingTimetable(false);
    }
    setSelectedDay(day);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchProfile();
      fetchTimetables();
    }
  }, [isAdmin]);

  // Handle Save School Profile
  const handleSaveProfile = async (values: typeof profileForm.values) => {
    try {
      setSavingProfile(true);
      const res = await api.updateSchoolProfile(values);
      if (res?.success) {
        toast.showSuccess('School profile and institutional metadata saved successfully!');
        savedProfileRef.current = { ...values };
        profileForm.resetDirty();
        setIsEditingProfile(false);
      }
    } catch (err: any) {
      toast.showError(err.message || 'Failed to update school profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Current day periods
  const currentDayPeriods = useMemo(() => {
    return allSchedules[selectedDay] || [];
  }, [allSchedules, selectedDay]);

  // Timetable Validation: Overlaps and Start >= End
  const timetableValidation = useMemo(() => {
    const errors: string[] = [];
    const activeList: Array<{ name: string; startMin: number; endMin: number; periodNumber: number }> = [];

    for (const p of currentDayPeriods) {
      const pName = p.name?.trim() || (p.period_type === 'interval' ? 'Interval / Recess' : `Period ${p.period_number}`);
      const sMin = timeToMinutes(p.start_time);
      const eMin = timeToMinutes(p.end_time);
      if (sMin < 0 || eMin < 0) {
        errors.push(`Period ${p.period_number} has an invalid time format.`);
      } else if (sMin >= eMin) {
        errors.push(`Period ${p.period_number} start time (${p.start_time}) must be earlier than end time (${p.end_time}).`);
      } else if (p.is_active !== 0) {
        activeList.push({ name: pName, startMin: sMin, endMin: eMin, periodNumber: p.period_number });
      }
    }

    activeList.sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < activeList.length; i++) {
      const prev = activeList[i - 1];
      const curr = activeList[i];
      if (curr.startMin < prev.endMin) {
        errors.push(`Time conflict: "Period ${curr.periodNumber}" starts before "Period ${prev.periodNumber}" concludes.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, [currentDayPeriods]);

  // Timetable Summary Metrics
  const timetableSummary = useMemo(() => {
    const active = currentDayPeriods.filter((p) => p.is_active !== 0);
    if (active.length === 0) {
      return { totalPeriods: 0, startTime: '—', endTime: '—', totalTeachingMins: 0, intervalMins: 0 };
    }

    const sorted = [...active].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    let teachingMins = 0;
    let intervalMins = 0;

    for (const p of active) {
      const s = timeToMinutes(p.start_time);
      const e = timeToMinutes(p.end_time);
      if (s >= 0 && e > s) {
        const dur = e - s;
        if (p.period_type === 'interval') {
          intervalMins += dur;
        } else if (p.period_type === 'teaching') {
          teachingMins += dur;
        }
      }
    }

    return {
      totalPeriods: active.length,
      startTime: first.start_time || '—',
      endTime: last.end_time || '—',
      totalTeachingMins: teachingMins,
      intervalMins
    };
  }, [currentDayPeriods]);

  // Update Period Field for Selected Day & Auto-Sync Adjacent Period Times
  const handleUpdatePeriod = (index: number, field: string, value: any) => {
    setAllSchedules((prev) => {
      const updatedDayList = (prev[selectedDay] || []).map((p) => ({ ...p }));
      updatedDayList[index] = {
        ...updatedDayList[index],
        [field]: value
      };

      // Auto-sync adjacent boundary times between periods
      if (field === 'end_time' && value) {
        // When a period's end time changes, sync the next period's start time
        if (index + 1 < updatedDayList.length) {
          const nextPeriod = updatedDayList[index + 1];
          const oldNextStartMins = timeToMinutes(nextPeriod.start_time);
          const oldNextEndMins = timeToMinutes(nextPeriod.end_time);
          const nextDuration = (oldNextStartMins > 0 && oldNextEndMins > oldNextStartMins)
            ? (oldNextEndMins - oldNextStartMins)
            : 40;

          nextPeriod.start_time = value;
          const newNextStartMins = timeToMinutes(value);

          // If the new start time pushes past or matches the existing end time, shift the next end time to maintain duration
          if (newNextStartMins >= oldNextEndMins && newNextStartMins > 0) {
            const newNextEndMins = newNextStartMins + nextDuration;
            const h = Math.floor(newNextEndMins / 60).toString().padStart(2, '0');
            const m = (newNextEndMins % 60).toString().padStart(2, '0');
            nextPeriod.end_time = `${h}:${m}`;

            // Sync subsequent period start time if exists
            if (index + 2 < updatedDayList.length) {
              updatedDayList[index + 2].start_time = `${h}:${m}`;
            }
          }
        }
      } else if (field === 'start_time' && value) {
        // When a period's start time changes, sync the previous period's end time
        if (index > 0) {
          updatedDayList[index - 1].end_time = value;
        }
      }

      // Automatically keep period name synchronized with classification
      if (field === 'period_type') {
        if (value === 'interval') {
          updatedDayList[index].name = 'Interval / Recess';
        } else if (value === 'assembly') {
          updatedDayList[index].name = 'Morning Assembly';
        } else {
          updatedDayList[index].name = 'Teaching Period';
        }
      }

      return {
        ...prev,
        [selectedDay]: updatedDayList
      };
    });
  };

  // Add Period to Selected Day
  const handleAddPeriod = () => {
    const list = currentDayPeriods;
    const nextNumber = list.length > 0 ? Math.max(...list.map((p) => p.period_number)) + 1 : 1;
    if (nextNumber > 12) {
      toast.showWarning('Maximum 12 periods can be scheduled in a single day.');
      return;
    }

    let nextStartTime = '13:30';
    let nextEndTime = '14:10';
    if (list.length > 0) {
      const last = list[list.length - 1];
      if (last.end_time) {
        nextStartTime = last.end_time;
        const eMins = timeToMinutes(last.end_time);
        if (eMins > 0) {
          const newEMins = eMins + 40;
          const h = Math.floor(newEMins / 60).toString().padStart(2, '0');
          const m = (newEMins % 60).toString().padStart(2, '0');
          nextEndTime = `${h}:${m}`;
        }
      }
    }

    const newPeriod = {
      period_number: nextNumber,
      name: `Period ${nextNumber}`,
      start_time: nextStartTime,
      end_time: nextEndTime,
      period_type: 'teaching',
      is_active: 1
    };

    setAllSchedules((prev) => ({
      ...prev,
      [selectedDay]: [...(prev[selectedDay] || []), newPeriod]
    }));
  };

  // Remove Period
  const handleRemovePeriod = (index: number) => {
    setAllSchedules((prev) => {
      const updated = [...(prev[selectedDay] || [])];
      updated.splice(index, 1);
      // Re-number periods sequentially
      const renumbered = updated.map((p, idx) => ({
        ...p,
        period_number: idx + 1
      }));
      return {
        ...prev,
        [selectedDay]: renumbered
      };
    });
  };

  // Save Schedule for Selected Day
  const handleSaveDaySchedule = async () => {
    if (!timetableValidation.isValid) {
      toast.showError('Please resolve all schedule conflicts before saving.');
      return;
    }

    try {
      setSavingTimetable(true);
      let teachingCount = 0;
      const sanitizedPeriods = currentDayPeriods.map((p) => {
        let name = p.name?.trim();
        if (p.period_type === 'interval') {
          name = 'Interval / Recess';
        } else if (p.period_type === 'assembly') {
          name = 'Morning Assembly';
        } else {
          teachingCount++;
          name = `Period ${teachingCount}`;
        }
        return {
          ...p,
          period_type: p.period_type || 'teaching',
          name
        };
      });

      const res = await api.updateTimetableSchedule(selectedDay, {
        periods: sanitizedPeriods
      });
      if (res?.success) {
        toast.showSuccess(res.message || `Schedule for ${selectedDay} saved successfully!`);
        savedSchedulesRef.current[selectedDay] = JSON.parse(JSON.stringify(sanitizedPeriods));
        setIsEditingTimetable(false);
      }
    } catch (err: any) {
      toast.showError(err.message || 'Failed to save timetable schedule.');
    } finally {
      setSavingTimetable(false);
    }
  };

  // Open Copy Modal
  const handleOpenCopyModal = () => {
    const otherDays = DAYS_OF_WEEK
      .map((d) => d.value)
      .filter((d) => d !== selectedDay && d !== 'saturday' && d !== 'sunday');
    setTargetDays(otherDays);
    setCopyModalOpen(true);
  };

  // Execute Copy Schedule
  const handleExecuteCopy = async () => {
    if (targetDays.length === 0) {
      toast.showWarning('Please select at least one destination day.');
      return;
    }

    try {
      setCopyingSchedule(true);
      const res = await api.copyTimetableSchedule({
        sourceDay: selectedDay,
        targetDays
      });
      if (res?.success) {
        toast.showSuccess(res.message);
        setCopyModalOpen(false);
        fetchTimetables();
      }
    } catch (err: any) {
      toast.showError(err.message || 'Failed to copy timetable schedule.');
    } finally {
      setCopyingSchedule(false);
    }
  };

  // Reset Day to Default
  const handleResetDay = async () => {
    const dayLabel = DAYS_OF_WEEK.find((d) => d.value === selectedDay)?.label || selectedDay;
    if (!confirm(`Are you sure you want to reset the timetable schedule for ${dayLabel} to official standard defaults?`)) {
      return;
    }

    try {
      setSavingTimetable(true);
      const res = await api.resetTimetableSchedule({ day: selectedDay });
      if (res?.success) {
        toast.showSuccess(res.message);
        fetchTimetables();
      }
    } catch (err: any) {
      toast.showError(err.message || 'Failed to reset timetable schedule.');
    } finally {
      setSavingTimetable(false);
    }
  };

  // Strict Admin Role Guard
  if (!isAdmin) {
    return (
      <PageContainer>
        <ErrorState
          title="Administrative Access Required"
          message="Institutional school settings, Ministry of Education metadata, and daily timetable schedules are restricted to authorized school administrators."
          onRetry={() => onNavigate?.('dashboard')}
          retryLabel="Return to Dashboard"
        />
      </PageContainer>
    );
  }

  const currentDayLabel = DAYS_OF_WEEK.find((d) => d.value === selectedDay)?.label || selectedDay;

  return (
    <PageContainer>
      <div style={{ paddingBottom: '2.5rem' }}>
        {/* Header Banner */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.25rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border-color, #e2e8f0)'
          }}
        >
          <div>
            <Group gap="xs" align="center">
              <School size={24} color="var(--primary-color, #2563eb)" />
              <Title order={2} style={{ margin: 0, fontWeight: 700, fontSize: '1.4rem', letterSpacing: '-0.02em' }}>
                School Settings & Institutional Configuration
              </Title>
            </Group>
          </div>

          <Group gap="xs">
            <Badge size="md" variant="light" color="blue" leftSection={<ShieldCheck size={14} />}>
              Principal / Administrator
            </Badge>
          </Group>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onChange={setActiveTab} variant="outline" radius="md">
          <Tabs.List style={{ marginBottom: '1.5rem', backgroundColor: 'var(--bg-surface, #fff)' }}>
            <Tabs.Tab
              value="profile"
              leftSection={<School size={16} />}
              style={{ fontWeight: 600, fontSize: '0.95rem' }}
            >
              School Information & Metadata
            </Tabs.Tab>
            <Tabs.Tab
              value="timetable"
              leftSection={<Clock size={16} />}
              style={{ fontWeight: 600, fontSize: '0.95rem' }}
            >
              Daily Timetables & Period Schedules
            </Tabs.Tab>
          </Tabs.List>

          {/* ================================================================ */}
          {/* TAB 1: SCHOOL PROFILE & INSTITUTIONAL METADATA                   */}
          {/* ================================================================ */}
          <Tabs.Panel value="profile">
            <Paper p="xl" radius="md" withBorder style={{ position: 'relative' }}>
              <LoadingOverlay visible={loadingProfile || savingProfile} />

              <form
                onSubmit={profileForm.onSubmit(
                  (values) => handleSaveProfile(values),
                  (validationErrors) => {
                    const firstKey = Object.keys(validationErrors)[0];
                    const msg = validationErrors[firstKey];
                    toast.showError(`Please fix validation error: ${msg || 'Required field missing'}`);
                  }
                )}
                className="institutional-profile-form"
              >
                <Stack gap="xl">
                  {/* Top Action Bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      paddingBottom: '1rem',
                      borderBottom: '1px solid var(--border-color, #e2e8f0)'
                    }}
                  >
                    <div>
                      <Text fw={700} size="md" c="#0f172a">
                        Institutional Profile & Official Registration
                      </Text>
                    </div>

                    <Group gap="xs">
                      {!isEditingProfile ? (
                        <Group gap="xs" key="profile-view-actions">
                          <Button
                            key="btn-reload"
                            type="button"
                            variant="default"
                            size="sm"
                            leftSection={<RotateCcw size={14} />}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              fetchProfile();
                            }}
                            disabled={loadingProfile || savingProfile}
                          >
                            Reload
                          </Button>
                          <Button
                            key="btn-edit"
                            type="button"
                            color="blue"
                            size="sm"
                            leftSection={<Edit2 size={14} />}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsEditingProfile(true);
                            }}
                            disabled={loadingProfile || savingProfile}
                          >
                            Edit
                          </Button>
                        </Group>
                      ) : (
                        <Group gap="xs" key="profile-edit-actions">
                          <Button
                            key="btn-cancel"
                            type="button"
                            variant="default"
                            size="sm"
                            leftSection={<X size={14} />}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCancelEditProfile();
                            }}
                            disabled={savingProfile}
                          >
                            Cancel
                          </Button>
                          <Button
                            key="btn-save"
                            type="submit"
                            color="blue"
                            size="sm"
                            leftSection={<Save size={14} />}
                            loading={savingProfile}
                          >
                            Save
                          </Button>
                        </Group>
                      )}
                    </Group>
                  </div>

                  {/* Section A: Institutional Identity */}
                  <div>
                    <Group gap="xs" mb="md">
                      <School size={17} color="#334155" />
                      <Text fw={700} size="sm" c="#1e293b">
                        Institutional Identity
                      </Text>
                    </Group>

                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                      <TextInput
                        label="School Name (English)"
                        placeholder="e.g. Kattankudy Central College"
                        required
                        disabled={!isEditingProfile}
                        key={profileForm.key('school_name_en')}
                        {...profileForm.getInputProps('school_name_en')}
                      />

                      <TextInput
                        label="School Name (Tamil)"
                        placeholder="e.g. காத்தான்குடி மத்திய கல்லூரி"
                        disabled={!isEditingProfile}
                        key={profileForm.key('school_name_ta')}
                        {...profileForm.getInputProps('school_name_ta')}
                      />

                      <TextInput
                        label="School Name (Sinhala)"
                        placeholder="e.g. කාත්තන්කුඩි මධ්‍ය මහා විද්‍යාලය"
                        disabled={!isEditingProfile}
                        key={profileForm.key('school_name_si')}
                        {...profileForm.getInputProps('school_name_si')}
                      />

                      <TextInput
                        label="Secondary Title / Tagline"
                        placeholder="e.g. National School — Kattankudy (1AB)"
                        disabled={!isEditingProfile}
                        key={profileForm.key('secondary_title')}
                        {...profileForm.getInputProps('secondary_title')}
                      />
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mt="md">
                      <TextInput
                        label="MOE Census Number"
                        placeholder="e.g. 14145"
                        required
                        disabled={!isEditingProfile}
                        key={profileForm.key('census_no')}
                        {...profileForm.getInputProps('census_no')}
                      />

                      <TextInput
                        label="School Classification / Type"
                        placeholder="e.g. National School (1AB)"
                        required
                        disabled={!isEditingProfile}
                        key={profileForm.key('school_type')}
                        {...profileForm.getInputProps('school_type')}
                      />

                      <TextInput
                        label="Founded Year"
                        placeholder="e.g. 1930"
                        type="number"
                        disabled={!isEditingProfile}
                        key={profileForm.key('founded_year')}
                        {...profileForm.getInputProps('founded_year')}
                      />
                    </SimpleGrid>
                  </div>

                  <Divider my="sm" />

                  {/* Section B: Location & Educational Region */}
                  <div>
                    <Group gap="xs" mb="md">
                      <MapPin size={17} color="#334155" />
                      <Text fw={700} size="sm" c="#1e293b">
                        Physical Location & Educational Administration
                      </Text>
                    </Group>

                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                      <TextInput
                        label="Address Line 1"
                        placeholder="e.g. No. 322, Beach Road"
                        required
                        disabled={!isEditingProfile}
                        key={profileForm.key('address_line1')}
                        {...profileForm.getInputProps('address_line1')}
                      />

                      <TextInput
                        label="Address Line 2"
                        placeholder="e.g. New Kattankudy 06"
                        disabled={!isEditingProfile}
                        key={profileForm.key('address_line2')}
                        {...profileForm.getInputProps('address_line2')}
                      />
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md" mt="md">
                      <TextInput
                        label="District"
                        placeholder="e.g. Batticaloa District"
                        required
                        disabled={!isEditingProfile}
                        key={profileForm.key('district')}
                        {...profileForm.getInputProps('district')}
                      />

                      <TextInput
                        label="Province"
                        placeholder="e.g. Eastern Province"
                        required
                        disabled={!isEditingProfile}
                        key={profileForm.key('province')}
                        {...profileForm.getInputProps('province')}
                      />

                      <TextInput
                        label="Country"
                        placeholder="Sri Lanka"
                        disabled={!isEditingProfile}
                        key={profileForm.key('country')}
                        {...profileForm.getInputProps('country')}
                      />

                      <TextInput
                        label="Postal Code"
                        placeholder="e.g. 30130"
                        disabled={!isEditingProfile}
                        key={profileForm.key('postal_code')}
                        {...profileForm.getInputProps('postal_code')}
                      />
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="md">
                      <TextInput
                        label="Educational Zone"
                        placeholder="e.g. Batticaloa Central"
                        required
                        disabled={!isEditingProfile}
                        key={profileForm.key('zone')}
                        {...profileForm.getInputProps('zone')}
                      />

                      <TextInput
                        label="Educational Division"
                        placeholder="e.g. Kattankudy"
                        required
                        disabled={!isEditingProfile}
                        key={profileForm.key('division')}
                        {...profileForm.getInputProps('division')}
                      />
                    </SimpleGrid>
                  </div>

                  <Divider my="sm" />

                  {/* Section C: Leadership & Official Communications */}
                  <div>
                    <Group gap="xs" mb="md">
                      <UserCheck size={17} color="#334155" />
                      <Text fw={700} size="sm" c="#1e293b">
                        Leadership & Official Communications
                      </Text>
                    </Group>

                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                      <TextInput
                        label="Principal's Full Name"
                        placeholder="e.g. Mr. A. L. M. Sabry"
                        required
                        disabled={!isEditingProfile}
                        key={profileForm.key('principal_name')}
                        {...profileForm.getInputProps('principal_name')}
                      />

                      <TextInput
                        label="Principal Title / Spelling Notes"
                        placeholder="e.g. Confirmed Ministry of Education 1AB Principal"
                        disabled={!isEditingProfile}
                        key={profileForm.key('principal_notes')}
                        {...profileForm.getInputProps('principal_notes')}
                      />

                      <TextInput
                        label="Official Telephone / Contact"
                        placeholder="e.g. +94 65 224 5321"
                        required
                        disabled={!isEditingProfile}
                        leftSection={<Phone size={14} />}
                        key={profileForm.key('phone')}
                        {...profileForm.getInputProps('phone')}
                      />

                      <TextInput
                        label="Official Email Address"
                        placeholder="e.g. info@kcc.sch.lk"
                        required
                        disabled={!isEditingProfile}
                        leftSection={<Mail size={14} />}
                        key={profileForm.key('email')}
                        {...profileForm.getInputProps('email')}
                      />
                    </SimpleGrid>
                  </div>

                  <Divider my="sm" />

                  {/* Section D: Academic Structure */}
                  <div>
                    <Group gap="xs" mb="md">
                      <Layers size={17} color="#334155" />
                      <Text fw={700} size="sm" c="#1e293b">
                        Academic Structure & Student Demographics
                      </Text>
                    </Group>

                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                      <Select
                        label="Student Gender Category"
                        data={[
                          { value: 'Boys', label: 'Boys School' },
                          { value: 'Girls', label: 'Girls School' },
                          { value: 'Mixed', label: 'Co-Educational (Mixed)' }
                        ]}
                        disabled={!isEditingProfile}
                        key={profileForm.key('student_category')}
                        {...profileForm.getInputProps('student_category')}
                      />

                      <TextInput
                        label="Medium of Instruction"
                        placeholder="e.g. Tamil / English"
                        disabled={!isEditingProfile}
                        key={profileForm.key('medium')}
                        {...profileForm.getInputProps('medium')}
                      />

                      <TextInput
                        label="Supported Grade Range"
                        placeholder="e.g. Grades 6–13"
                        disabled={!isEditingProfile}
                        key={profileForm.key('supported_grades')}
                        {...profileForm.getInputProps('supported_grades')}
                      />
                    </SimpleGrid>
                  </div>
                </Stack>
              </form>
            </Paper>
          </Tabs.Panel>

          {/* ================================================================ */}
          {/* TAB 2: DAILY TIMETABLE & PERIOD SCHEDULE BUILDER                 */}
          {/* ================================================================ */}
          <Tabs.Panel value="timetable">
            <Paper p="lg" radius="md" withBorder style={{ position: 'relative' }}>
              <LoadingOverlay visible={loadingTimetable || savingTimetable} />

              <Stack gap="lg">
                {/* Day Selector */}
                <div>
                  <Text fw={600} size="sm" mb="xs">
                    Select Day of the Week to Customize:
                  </Text>
                  <SegmentedControl
                    value={selectedDay}
                    onChange={handleSelectDay}
                    data={DAYS_OF_WEEK.map((d) => ({
                      value: d.value,
                      label: (
                        <Group gap={6} justify="center" wrap="nowrap">
                          <span>{d.label}</span>
                          {allSchedules[d.value]?.length > 0 && (
                            <Badge size="xs" color="gray" variant="light">
                              {allSchedules[d.value].length}p
                            </Badge>
                          )}
                        </Group>
                      )
                    }))}
                    fullWidth
                    size="md"
                    radius="md"
                  />
                </div>

                {/* Day Summary & Metrics Banner */}
                <Card withBorder padding="md" radius="sm" style={{ backgroundColor: 'var(--mantine-color-blue-light, #f8fafc)' }}>
                  <Group justify="space-between" align="center" wrap="wrap" gap="md">
                    <div>
                      <Group gap="xs">
                        <Calendar size={20} color="var(--mantine-color-blue-7, #1d4ed8)" />
                        <Title order={4} style={{ margin: 0 }}>
                          {currentDayLabel} Timetable Schedule
                        </Title>
                        {selectedDay === 'friday' ? (
                          <Badge color="blue" variant="light" size="md">
                            Friday Schedule
                          </Badge>
                        ) : (
                          <Badge color="blue" variant="light" size="md">
                            Regular Weekday Schedule
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed" mt={4}>
                        Configured Periods: <b>{timetableSummary.totalPeriods}</b> • School Hours: <b>{timetableSummary.startTime}</b> to <b>{timetableSummary.endTime}</b> • Total Teaching: <b>{timetableSummary.totalTeachingMins} mins</b> • Interval: <b>{timetableSummary.intervalMins} mins</b>
                      </Text>
                    </div>

                    <Group gap="xs">
                      {!isEditingTimetable ? (
                        <Group gap="xs" key="timetable-view-actions">
                          <Button
                            key="btn-copy-schedule"
                            type="button"
                            variant="default"
                            size="xs"
                            leftSection={<Copy size={14} />}
                            onClick={handleOpenCopyModal}
                            disabled={currentDayPeriods.length === 0 || loadingTimetable || savingTimetable}
                          >
                            Copy Schedule...
                          </Button>
                          <Button
                            key="btn-edit-timetable"
                            type="button"
                            color="blue"
                            size="xs"
                            leftSection={<Edit2 size={14} />}
                            onClick={() => setIsEditingTimetable(true)}
                            disabled={loadingTimetable || savingTimetable}
                          >
                            Edit Schedule
                          </Button>
                        </Group>
                      ) : (
                        <Group gap="xs" key="timetable-edit-actions">
                          <Button
                            key="btn-cancel-timetable"
                            type="button"
                            variant="default"
                            size="xs"
                            leftSection={<X size={14} />}
                            onClick={handleCancelEditTimetable}
                            disabled={savingTimetable}
                          >
                            Cancel
                          </Button>
                          <Button
                            key="btn-reset-day"
                            type="button"
                            variant="default"
                            size="xs"
                            color="red"
                            leftSection={<RotateCcw size={14} />}
                            onClick={handleResetDay}
                            disabled={savingTimetable}
                          >
                            Reset Day
                          </Button>
                          <Button
                            key="btn-add-period"
                            type="button"
                            color="blue"
                            size="xs"
                            leftSection={<Plus size={14} />}
                            onClick={handleAddPeriod}
                            disabled={savingTimetable}
                          >
                            Add Period
                          </Button>
                          <Button
                            key="btn-save-timetable"
                            type="button"
                            color="teal"
                            size="xs"
                            leftSection={<Save size={14} />}
                            onClick={handleSaveDaySchedule}
                            loading={savingTimetable}
                            disabled={!timetableValidation.isValid}
                          >
                            Save {currentDayLabel}
                          </Button>
                        </Group>
                      )}
                    </Group>
                  </Group>
                </Card>

                {/* Conflict / Validation Alert */}
                {!timetableValidation.isValid && (
                  <Alert
                    icon={<AlertTriangle size={18} />}
                    title="Timetable Schedule Conflicts Detected"
                    color="red"
                    variant="light"
                  >
                    <Stack gap={4}>
                      {timetableValidation.errors.map((err, idx) => (
                        <Text size="xs" key={idx}>
                          • {err}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                )}

                {/* Period Cards / Table */}
                {currentDayPeriods.length === 0 ? (
                  <Paper withBorder p="xl" radius="sm" style={{ textAlign: 'center' }}>
                    <Clock size={36} color="#94a3b8" style={{ margin: '0 auto 0.75rem auto' }} />
                    <Title order={5} c="dimmed">
                      No periods configured for {currentDayLabel}
                    </Title>
                    <Text size="xs" c="dimmed" mb="md">
                      Click "Add Period" to build a custom timetable or "Reset Day" to load standard defaults.
                    </Text>
                    <Group justify="center" gap="sm">
                      <Button size="xs" color="blue" leftSection={<Plus size={14} />} onClick={handleAddPeriod}>
                        Add First Period
                      </Button>
                      <Button size="xs" variant="default" leftSection={<RotateCcw size={14} />} onClick={handleResetDay}>
                        Load Default Schedule
                      </Button>
                    </Group>
                  </Paper>
                ) : (
                  <Stack gap="xs">
                    {/* Header Row */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '60px 1.8fr 130px 130px 90px 70px 50px',
                        gap: '0.75rem',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--text-muted, #64748b)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}
                    >
                      <div>#</div>
                      <div>Classification</div>
                      <div>Start Time</div>
                      <div>End Time</div>
                      <div>Duration</div>
                      <div>Active</div>
                      <div>Action</div>
                    </div>

                    {/* Period Items */}
                    {currentDayPeriods.map((period, index) => {
                      const duration = computePeriodDuration(period.start_time, period.end_time);
                      const isInvalidTime =
                        timeToMinutes(period.start_time) < 0 ||
                        timeToMinutes(period.end_time) < 0 ||
                        timeToMinutes(period.start_time) >= timeToMinutes(period.end_time);

                      return (
                        <Paper
                          key={period.period_number}
                          withBorder
                          p="xs"
                          radius="sm"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '60px 1.8fr 130px 130px 90px 70px 50px',
                            gap: '0.75rem',
                            alignItems: 'center',
                            backgroundColor:
                              period.is_active === 0
                                ? 'var(--bg-muted, #f8fafc)'
                                : isInvalidTime
                                ? '#fef2f2'
                                : 'var(--bg-surface, #ffffff)',
                            opacity: period.is_active === 0 ? 0.65 : 1
                          }}
                        >
                          {/* Period Number Badge */}
                          <div>
                            <Badge size="lg" variant="light" color={getPeriodTypeBadgeColor(period.period_type)}>
                              {getPeriodBadgeLabel(period, index, currentDayPeriods)}
                            </Badge>
                          </div>

                          {/* Classification */}
                          <div>
                            <Select
                              size="xs"
                              data={PERIOD_TYPES}
                              value={period.period_type}
                              disabled={!isEditingTimetable}
                              onChange={(val) => handleUpdatePeriod(index, 'period_type', val || 'teaching')}
                            />
                          </div>

                          {/* Start Time */}
                          <div>
                            <TextInput
                              size="xs"
                              type="time"
                              value={period.start_time}
                              disabled={!isEditingTimetable}
                              error={isInvalidTime}
                              onChange={(e) => handleUpdatePeriod(index, 'start_time', e.currentTarget.value)}
                            />
                          </div>

                          {/* End Time */}
                          <div>
                            <TextInput
                              size="xs"
                              type="time"
                              value={period.end_time}
                              disabled={!isEditingTimetable}
                              error={isInvalidTime}
                              onChange={(e) => handleUpdatePeriod(index, 'end_time', e.currentTarget.value)}
                            />
                          </div>

                          {/* Duration Badge */}
                          <div>
                            <Text size="xs" fw={600} c={duration === '—' ? 'red' : 'dimmed'}>
                              {duration}
                            </Text>
                          </div>

                          {/* Active Switch */}
                          <div>
                            <Switch
                              size="xs"
                              checked={period.is_active !== 0}
                              disabled={!isEditingTimetable}
                              onChange={(e) =>
                                handleUpdatePeriod(index, 'is_active', e.currentTarget.checked ? 1 : 0)
                              }
                            />
                          </div>

                          {/* Remove Action */}
                          <div>
                            <Tooltip label={isEditingTimetable ? "Delete period" : "Click Edit Schedule to modify periods"}>
                              <ActionIcon
                                color="red"
                                variant="subtle"
                                size="sm"
                                disabled={!isEditingTimetable}
                                onClick={() => handleRemovePeriod(index)}
                              >
                                <Trash2 size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </div>
                        </Paper>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </Paper>
          </Tabs.Panel>
        </Tabs>
      </div>

      {/* Copy Schedule Modal */}
      <Modal
        opened={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
        title={
          <Group gap="xs">
            <Copy size={18} color="#2563eb" />
            <Text fw={600}>Copy {currentDayLabel} Schedule to Other Days</Text>
          </Group>
        }
        radius="md"
        centered
      >
        <Stack gap="md">
          <Text size="xs" c="dimmed">
            This will overwrite the destination day(s) period timetable with the {currentDayPeriods.length} periods currently defined for <b>{currentDayLabel}</b>.
          </Text>

          <div>
            <Text size="xs" fw={600} mb="xs">
              Select Destination Days:
            </Text>
            <SimpleGrid cols={2} spacing="xs">
              {DAYS_OF_WEEK.filter((d) => d.value !== selectedDay).map((d) => {
                const isChecked = targetDays.includes(d.value);
                return (
                  <Paper
                    key={d.value}
                    withBorder
                    p="xs"
                    radius="sm"
                    style={{
                      cursor: 'pointer',
                      backgroundColor: isChecked ? 'var(--mantine-color-blue-light, #eff6ff)' : undefined
                    }}
                    onClick={() => {
                      setTargetDays((prev) =>
                        isChecked ? prev.filter((x) => x !== d.value) : [...prev, d.value]
                      );
                    }}
                  >
                    <Checkbox
                      label={d.label}
                      checked={isChecked}
                      onChange={() => {}}
                      style={{ pointerEvents: 'none' }}
                    />
                  </Paper>
                );
              })}
            </SimpleGrid>
          </div>

          <Group justify="flex-end" mt="md">
            <Button variant="default" size="sm" onClick={() => setCopyModalOpen(false)}>
              Cancel
            </Button>
            <Button
              color="blue"
              size="sm"
              leftSection={<Copy size={14} />}
              onClick={handleExecuteCopy}
              loading={copyingSchedule}
              disabled={targetDays.length === 0}
            >
              Apply Copy ({targetDays.length} days)
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageContainer>
  );
};

export default SchoolSettings;

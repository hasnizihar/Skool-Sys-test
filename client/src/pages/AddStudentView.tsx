import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  UserPlus,
  School,
  User,
  Shield,
  Phone,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Hash,
  MapPin,
  Briefcase,
  Mail
} from 'lucide-react';
import {
  Paper,
  Text,
  Title,
  Group,
  Stack,
  SimpleGrid,
  Divider,
  Alert,
  Button,
  TextInput,
  Select,
  SegmentedControl,
  Badge,
  Textarea
} from '@mantine/core';
import { useForm, isNotEmpty } from '@mantine/form';
import { api } from '../api/client';
import { UnsavedChangesModal } from '../components/UnsavedChangesModal';

interface AddStudentViewProps {
  onBack: () => void;
  onSuccess: (studentId: number) => void;
  classes: any[];
  onNavigate?: (tab: string) => void;
  registerNavGuard?: (guard: ((targetTab: string) => boolean) | null) => void;
}

export const AddStudentView: React.FC<AddStudentViewProps> = ({
  onBack,
  onSuccess,
  classes,
  onNavigate,
  registerNavGuard
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ studentId: number; rollNumber?: number; className?: string } | null>(null);

  // Unsaved changes modal state & navigation guards
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);
  const isBypassingGuardRef = useRef(false);

  // Grade selection (Grades 6 to 13)
  const gradeOptions = useMemo(() => {
    return [6, 7, 8, 9, 10, 11, 12, 13].map((g) => ({
      value: String(g),
      label: `Grade ${g}`
    }));
  }, []);

  const form = useForm({
    mode: 'controlled',
    initialValues: {
      admission_no: '',
      full_name: '',
      name_with_initials: '',
      dob: '2012-05-15',
      gender: 'Male',
      address: '',
      grade: '6',
      class_id: '',
      guardian_name: '',
      guardian_relation: 'Father',
      guardian_occupation: '',
      guardian_phone: '',
      guardian_phone_2: '',
      guardian_email: ''
    },
    validate: {
      admission_no: (val) =>
        !val?.trim()
          ? 'Index number is required'
          : !/^\d{5}$/.test(val.trim())
          ? 'Index number must be exactly 5 digits (e.g. 16087)'
          : null,
      full_name: isNotEmpty('Full name is required'),
      name_with_initials: isNotEmpty('Name with initials is required (e.g. M.R. Shihab)'),
      dob: isNotEmpty('Date of birth is required'),
      gender: (val) => (val === 'Male' || val === 'Female' ? null : 'Gender must be Male or Female'),
      address: isNotEmpty('Residential address is required'),
      grade: isNotEmpty('Grade selection is required'),
      class_id: isNotEmpty('Class assignment is required'),
      guardian_name: isNotEmpty('Guardian name is required'),
      guardian_relation: isNotEmpty('Guardian relationship is required'),
      guardian_phone: (val) =>
        !val?.trim()
          ? 'Phone Number 1 is required'
          : !/^\+?[0-9\s-]{9,15}$/.test(val.trim())
          ? 'Please enter a valid phone number (e.g. 0771234567)'
          : null,
      guardian_phone_2: (val) =>
        val && val.trim() && !/^\+?[0-9\s-]{9,15}$/.test(val.trim())
          ? 'Please enter a valid secondary phone number'
          : null,
      guardian_email: (val) =>
        val && val.trim() && !/^\S+@\S+\.\S+$/.test(val.trim()) ? 'Please enter a valid email address' : null
    }
  });

  // Filter classes according to selected Grade and the class table
  const availableClasses = useMemo(() => {
    if (!form.values.grade) return [];
    return classes
      .filter((c) => String(c.grade) === String(form.values.grade))
      .map((c) => ({
        value: String(c.id),
        label: c.name
      }));
  }, [classes, form.values.grade]);

  // Handle grade change and reset class if it doesn't belong to the selected grade
  const handleGradeChange = (gradeVal: string | null) => {
    form.setFieldValue('grade', gradeVal || '');
    form.setFieldValue('class_id', '');
  };

  const handleSubmit = async (values: typeof form.values) => {
    setServerError(null);
    setSubmitting(true);

    try {
      const payload = {
        admission_no: values.admission_no.trim(),
        full_name: values.full_name.trim(),
        name_with_initials: values.name_with_initials.trim(),
        dob: values.dob,
        gender: values.gender,
        address: values.address.trim(),
        class_id: Number(values.class_id),
        guardian_name: values.guardian_name.trim(),
        guardian_relation: values.guardian_relation.trim(),
        guardian_occupation: values.guardian_occupation.trim() || undefined,
        guardian_phone: values.guardian_phone.trim(),
        guardian_phone_2: values.guardian_phone_2.trim() || undefined,
        guardian_email: values.guardian_email.trim() || undefined
      };

      const res = await api.createStudent(payload);
      const chosenClass = classes.find((c) => String(c.id) === String(values.class_id));

      setSuccessInfo({
        studentId: res.studentId,
        rollNumber: res.roll_number,
        className: chosenClass?.name
      });
    } catch (err: any) {
      console.error('Failed to register student:', err);
      setServerError(err.message || 'Failed to create student admission record.');
    } finally {
      setSubmitting(false);
    }
  };

  // Track unsaved modifications
  const isFormDirty = useMemo(() => {
    if (successInfo) return false;
    const v = form.values;
    return (
      form.isDirty() ||
      !!(
        v.admission_no.trim() ||
        v.full_name.trim() ||
        v.name_with_initials.trim() ||
        v.address.trim() ||
        v.class_id ||
        v.guardian_name.trim() ||
        v.guardian_occupation.trim() ||
        v.guardian_phone.trim() ||
        v.guardian_phone_2.trim() ||
        v.guardian_email.trim()
      )
    );
  }, [form.values, successInfo]);

  const handleAttemptLeave = (action: () => void) => {
    if (isFormDirty) {
      setPendingLeaveAction(() => action);
      setShowConfirmModal(true);
    } else {
      action();
    }
  };

  const handleConfirmDiscard = () => {
    setShowConfirmModal(false);
    form.reset();
    if (pendingLeaveAction) {
      const act = pendingLeaveAction;
      setPendingLeaveAction(null);
      act();
    } else {
      onBack();
    }
  };

  const handleCloseConfirmModal = () => {
    setShowConfirmModal(false);
    setPendingLeaveAction(null);
  };

  // Browser reload / close guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isFormDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isFormDirty]);

  // Tab switch navigation guard
  useEffect(() => {
    if (!registerNavGuard) return;
    registerNavGuard((targetTab: string) => {
      if (isBypassingGuardRef.current) return true;
      if (isFormDirty) {
        setPendingLeaveAction(() => () => {
          isBypassingGuardRef.current = true;
          onNavigate?.(targetTab);
        });
        setShowConfirmModal(true);
        return false;
      }
      return true;
    });
    return () => registerNavGuard(null);
  }, [registerNavGuard, isFormDirty, onNavigate]);

  return (
    <div className="add-student-page" style={{ maxWidth: 960, margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Top Header & Breadcrumb */}
      <Paper p="md" radius="lg" withBorder shadow="xs" mb="lg" style={{ background: 'var(--bg-card, #ffffff)' }}>
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Group gap="sm">
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              leftSection={<ArrowLeft size={16} />}
              onClick={() => handleAttemptLeave(onBack)}
            >
              Back to Students
            </Button>
            <Divider orientation="vertical" />
            <div>
              <Title order={2} style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #0f172a)' }}>
                New Student Admission
              </Title>
              <Text size="xs" c="dimmed">
                Official pupil registration & automatic roll number assignment
              </Text>
            </div>
          </Group>

          <Badge variant="light" color="blue" size="lg">
            Academic Year 2026
          </Badge>
        </Group>
      </Paper>

      {/* Success Notification Banner */}
      {successInfo && (
        <Alert
          icon={<CheckCircle2 size={20} />}
          title="Student Successfully Admitted & Enrolled!"
          color="green"
          radius="lg"
          mb="lg"
          withCloseButton
          onClose={() => setSuccessInfo(null)}
        >
          <Text size="sm" mb="xs">
            Student index <strong>{form.values.admission_no}</strong> has been enrolled into class{' '}
            <strong>{successInfo.className || form.values.class_id}</strong>.
          </Text>
          {successInfo.rollNumber && (
            <Badge color="green" size="lg" variant="filled">
              Automatically Assigned Roll Number: #{successInfo.rollNumber}
            </Badge>
          )}
          <Group mt="md">
            <Button size="xs" color="green" onClick={() => onSuccess(successInfo.studentId)}>
              View Student Dossier
            </Button>
            <Button size="xs" variant="default" onClick={onBack}>
              Return to Directory
            </Button>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => {
                form.reset();
                setSuccessInfo(null);
              }}
            >
              Enroll Another Student
            </Button>
          </Group>
        </Alert>
      )}

      {/* Server Error Alert */}
      {serverError && (
        <Alert
          icon={<AlertCircle size={18} />}
          title="Admission Failed"
          color="red"
          radius="md"
          mb="lg"
          withCloseButton
          onClose={() => setServerError(null)}
        >
          {serverError}
        </Alert>
      )}

      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="lg">
          {/* Card 1: Academic & Class Placement */}
          <Paper p="xl" radius="lg" withBorder shadow="xs" style={{ background: 'var(--bg-card, #ffffff)' }}>
            <Group gap="xs" mb="md">
              <School size={19} color="var(--primary, #2563eb)" />
              <Title order={3} style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                1. Academic & Class Placement
              </Title>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <TextInput
                label="Index Number"
                placeholder="e.g. 16087"
                required
                leftSection={<Hash size={15} />}
                maxLength={5}
                {...form.getInputProps('admission_no')}
              />

              <Select
                label="Grade"
                placeholder="Select Grade"
                required
                data={gradeOptions}
                value={form.values.grade}
                onChange={handleGradeChange}
              />

              <Select
                label="Class"
                placeholder={availableClasses.length === 0 ? 'No classes for Grade' : 'Select Class'}
                required
                disabled={availableClasses.length === 0}
                data={availableClasses}
                {...form.getInputProps('class_id')}
              />
            </SimpleGrid>
          </Paper>

          {/* Card 2: Student Personal Information */}
          <Paper p="xl" radius="lg" withBorder shadow="xs" style={{ background: 'var(--bg-card, #ffffff)' }}>
            <Group gap="xs" mb="md">
              <User size={19} color="var(--primary, #2563eb)" />
              <Title order={3} style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                2. Personal Information
              </Title>
            </Group>

            <Stack gap="md">
              <TextInput
                label="Full Name"
                placeholder="e.g. Mohamed Rinas Shihab"
                required
                {...form.getInputProps('full_name')}
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Name with Initial"
                  placeholder="e.g. M.R. Shihab"
                  required
                  {...form.getInputProps('name_with_initials')}
                />

                <TextInput
                  type="date"
                  label="Date of Birth"
                  required
                  leftSection={<Calendar size={15} />}
                  {...form.getInputProps('dob')}
                />
              </SimpleGrid>

              <div>
                <Text size="sm" fw={500} mb={4}>
                  Gender <span style={{ color: 'var(--mantine-color-red-filled, #fa5252)' }}>*</span>
                </Text>
                <SegmentedControl
                  fullWidth
                  data={[
                    { label: 'Male', value: 'Male' },
                    { label: 'Female', value: 'Female' }
                  ]}
                  value={form.values.gender}
                  onChange={(val) => form.setFieldValue('gender', val)}
                />
              </div>

              <Textarea
                label="Residential Address"
                placeholder="e.g. No 45 Beach Road Kattankudy"
                required
                minRows={2}
                {...form.getInputProps('address')}
              />
            </Stack>
          </Paper>

          {/* Card 3: Guardian Details */}
          <Paper p="xl" radius="lg" withBorder shadow="xs" style={{ background: 'var(--bg-card, #ffffff)' }}>
            <Group gap="xs" mb="md">
              <Shield size={19} color="var(--primary, #2563eb)" />
              <Title order={3} style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                3. Guardian Details
              </Title>
            </Group>

            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Guardian Name"
                  placeholder="e.g. Mohamed Shihab"
                  required
                  {...form.getInputProps('guardian_name')}
                />

                <Select
                  label="Guardian Relationship"
                  required
                  data={[
                    { value: 'Father', label: 'Father' },
                    { value: 'Mother', label: 'Mother' },
                    { value: 'Guardian', label: 'Guardian' },
                    { value: 'Relative', label: 'Relative' }
                  ]}
                  {...form.getInputProps('guardian_relation')}
                />
              </SimpleGrid>

              <TextInput
                label="Guardian Occupation"
                placeholder="e.g. Businessman, Civil Servant, Teacher"
                leftSection={<Briefcase size={15} />}
                {...form.getInputProps('guardian_occupation')}
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  type="tel"
                  label="Phone Number 1 *"
                  placeholder="e.g. 0771234567"
                  required
                  leftSection={<Phone size={15} />}
                  {...form.getInputProps('guardian_phone')}
                />

                <TextInput
                  type="tel"
                  label="Phone Number 2 (Optional)"
                  placeholder="e.g. 0652245678"
                  leftSection={<Phone size={15} />}
                  {...form.getInputProps('guardian_phone_2')}
                />
              </SimpleGrid>

              <TextInput
                type="email"
                label="Guardian Email (Optional)"
                placeholder="guardian@example.com"
                leftSection={<Mail size={15} />}
                {...form.getInputProps('guardian_email')}
              />
            </Stack>
          </Paper>

          {/* Action Footer */}
          <Paper p="md" radius="lg" withBorder shadow="sm" style={{ background: 'var(--bg-card, #ffffff)' }}>
            <Group justify="space-between" align="center">
              <Button variant="default" size="md" onClick={() => handleAttemptLeave(onBack)} disabled={submitting}>
                Cancel
              </Button>

              <Group gap="sm">
                <Button variant="subtle" size="md" onClick={() => handleAttemptLeave(() => form.reset())} disabled={submitting}>
                  Clear Form
                </Button>
                <Button
                  type="submit"
                  size="md"
                  color="blue"
                  loading={submitting}
                  leftSection={<UserPlus size={18} />}
                >
                  Register & Enroll Student
                </Button>
              </Group>
            </Group>
          </Paper>
        </Stack>
      </form>

      {/* Unsaved Changes Exit Confirmation Modal */}
      <UnsavedChangesModal
        opened={showConfirmModal}
        onClose={handleCloseConfirmModal}
        onDiscard={handleConfirmDiscard}
        title="Discard New Admission Data?"
        message="You have unsaved information filled in this student admission form. Leaving now will discard all student and guardian details you entered."
      />
    </div>
  );
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Table,
  Badge,
  Button,
  Group,
  Stack,
  TextInput,
  Select,
  Modal,
  Text,
  ActionIcon,
  Tooltip,
  Paper,
  SimpleGrid,
  Alert,
  Box
} from '@mantine/core';
import {
  School,
  Plus,
  Search,
  Edit2,
  Trash2,
  Users,
  Layers,
  AlertCircle,
  UserCheck,
  Check,
  X
} from 'lucide-react';
import { api } from '../api/client';
import {
  SectionHeader,
  ConfirmModal,
  EmptyState,
  LoadingState,
  ErrorState,
  showAppNotification
} from '../ui/mantine';

interface ClassItem {
  id: number;
  grade: number;
  name: string;
  room_number?: string | null;
  section_id?: number | null;
  section_name?: string | null;
  section_code?: string | null;
  class_teacher_id?: number | null;
  class_teacher_name?: string | null;
  student_count?: number;
  class_teachers?: Array<{ id: number; full_name: string; email: string }>;
}

export interface ClassManagementProps {
  onClassChanged?: () => void;
}

export const ClassManagement: React.FC<ClassManagementProps> = ({ onClassChanged }) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    grade: '8',
    name: '',
    room_number: '',
    section_id: '',
    class_teacher_id: ''
  });

  // Edit Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [editForm, setEditForm] = useState({
    grade: '8',
    name: '',
    room_number: '',
    section_id: '',
    class_teacher_id: ''
  });

  // Delete Confirm Modal
  const [deletingClass, setDeletingClass] = useState<ClassItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Manage Teachers Modal
  const [showTeachersModal, setShowTeachersModal] = useState(false);
  const [selectedClassForTeachers, setSelectedClassForTeachers] = useState<ClassItem | null>(null);
  const [newTeacherId, setNewTeacherId] = useState<string>('');
  const [teacherAssignLoading, setTeacherAssignLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [classesRes, sectionsRes, usersRes] = await Promise.all([
        api.getClasses(),
        api.getSections().catch(() => ({ sections: [] })),
        api.getUsers().catch(() => ({ users: [] }))
      ]);

      setClasses(classesRes.classes || []);
      setSections(sectionsRes.sections || []);
      setTeachers(
        (usersRes.users || []).filter(
          (u: any) => u.is_active && ['class_teacher', 'subject_teacher', 'admin'].includes(u.role)
        )
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load school classes and sections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered classes
  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.name?.toLowerCase().includes(q);
        const matchesRoom = c.room_number?.toLowerCase().includes(q);
        const matchesSection = c.section_name?.toLowerCase().includes(q);
        if (!matchesName && !matchesRoom && !matchesSection) return false;
      }
      if (selectedGrade && Number(selectedGrade) !== c.grade) {
        return false;
      }
      if (selectedSection) {
        if (selectedSection === 'unassigned') {
          if (c.section_id) return false;
        } else if (Number(selectedSection) !== c.section_id) {
          return false;
        }
      }
      return true;
    });
  }, [classes, searchQuery, selectedGrade, selectedSection]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = classes.length;
    const withSection = classes.filter((c) => c.section_id).length;
    const unassigned = total - withSection;
    const totalStudents = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);
    return { total, withSection, unassigned, totalStudents };
  }, [classes]);

  // Handle Create Class
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      showAppNotification.error('Validation Error', 'Class name is required (e.g. Grade 8-C).');
      return;
    }

    try {
      setCreateLoading(true);
      await api.createClass({
        grade: Number(createForm.grade),
        name: createForm.name.trim(),
        room_number: createForm.room_number.trim() || undefined,
        section_id: createForm.section_id ? Number(createForm.section_id) : undefined,
        class_teacher_id: createForm.class_teacher_id ? Number(createForm.class_teacher_id) : undefined
      });

      showAppNotification.success('Class Created', `Class "${createForm.name}" created successfully.`);
      setShowCreateModal(false);
      setCreateForm({
        grade: '8',
        name: '',
        room_number: '',
        section_id: '',
        class_teacher_id: ''
      });
      loadData();
      onClassChanged?.();
    } catch (err: any) {
      showAppNotification.error('Failed to Create Class', err.message || 'An error occurred.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (c: ClassItem) => {
    setEditingClass(c);
    setEditForm({
      grade: String(c.grade),
      name: c.name,
      room_number: c.room_number || '',
      section_id: c.section_id ? String(c.section_id) : '',
      class_teacher_id: c.class_teacher_id ? String(c.class_teacher_id) : ''
    });
    setShowEditModal(true);
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;
    if (!editForm.name.trim()) {
      showAppNotification.error('Validation Error', 'Class name cannot be empty.');
      return;
    }

    try {
      setEditLoading(true);
      await api.updateClass(editingClass.id, {
        grade: Number(editForm.grade),
        name: editForm.name.trim(),
        room_number: editForm.room_number.trim() || null,
        section_id: editForm.section_id ? Number(editForm.section_id) : null,
        class_teacher_id: editForm.class_teacher_id ? Number(editForm.class_teacher_id) : null
      });

      showAppNotification.success('Class Updated', `Class "${editForm.name}" updated successfully.`);
      setShowEditModal(false);
      setEditingClass(null);
      loadData();
      onClassChanged?.();
    } catch (err: any) {
      showAppNotification.error('Update Failed', err.message || 'Failed to update class details.');
    } finally {
      setEditLoading(false);
    }
  };

  // Handle Safe Delete
  const handleConfirmDelete = async () => {
    if (!deletingClass) return;

    try {
      setDeleteLoading(true);
      await api.deleteClass(deletingClass.id);
      showAppNotification.success('Class Deleted', `Class "${deletingClass.name}" was safely removed.`);
      setDeletingClass(null);
      loadData();
      onClassChanged?.();
    } catch (err: any) {
      showAppNotification.error(
        'Deletion Blocked',
        err.message || 'Cannot delete class due to existing student or historical records.'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  // Manage Class Teachers: Add teacher
  const handleAddClassTeacher = async () => {
    if (!selectedClassForTeachers || !newTeacherId) return;

    try {
      setTeacherAssignLoading(true);
      await api.assignClassTeacher(selectedClassForTeachers.id, Number(newTeacherId));
      showAppNotification.success('Teacher Assigned', 'Class teacher assigned successfully.');
      setNewTeacherId('');
      const updatedClasses = await api.getClasses();
      setClasses(updatedClasses.classes || []);
      const ref = (updatedClasses.classes || []).find((c: any) => c.id === selectedClassForTeachers.id);
      if (ref) setSelectedClassForTeachers(ref);
      onClassChanged?.();
    } catch (err: any) {
      showAppNotification.error('Assignment Error', err.message || 'Failed to assign class teacher.');
    } finally {
      setTeacherAssignLoading(false);
    }
  };

  // Manage Class Teachers: Remove teacher
  const handleRemoveClassTeacher = async (teacherId: number) => {
    if (!selectedClassForTeachers) return;

    try {
      setTeacherAssignLoading(true);
      await api.removeClassTeacher(selectedClassForTeachers.id, teacherId);
      showAppNotification.success('Teacher Removed', 'Class teacher unassigned.');
      const updatedClasses = await api.getClasses();
      setClasses(updatedClasses.classes || []);
      const ref = (updatedClasses.classes || []).find((c: any) => c.id === selectedClassForTeachers.id);
      if (ref) setSelectedClassForTeachers(ref);
      onClassChanged?.();
    } catch (err: any) {
      showAppNotification.error('Error', err.message || 'Failed to remove class teacher.');
    } finally {
      setTeacherAssignLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading classes and school organizational structure..." />;
  }

  if (error) {
    return <ErrorState title="Error Loading Classes" message={error} onRetry={loadData} />;
  }

  return (
    <Stack gap="lg">
      {/* 1. Summary Metrics Cards */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <Paper p="md" radius="md" withBorder bg="white">
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">
            Total Classes
          </Text>
          <Text size="xl" fw={700} c="refinedBlue.8" mt={4}>
            {metrics.total}
          </Text>
        </Paper>

        <Paper p="md" radius="md" withBorder bg="white">
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">
            Section Assigned
          </Text>
          <Text size="xl" fw={700} c="statusGreen.7" mt={4}>
            {metrics.withSection}
          </Text>
        </Paper>

        <Paper p="md" radius="md" withBorder bg="white">
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">
            Unassigned Classes
          </Text>
          <Text size="xl" fw={700} c={metrics.unassigned > 0 ? 'statusAmber.7' : 'slate.6'} mt={4}>
            {metrics.unassigned}
          </Text>
        </Paper>

        <Paper p="md" radius="md" withBorder bg="white">
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">
            Total Enrollment
          </Text>
          <Text size="xl" fw={700} c="slate.8" mt={4}>
            {metrics.totalStudents} <Text component="span" size="xs" fw={400} c="dimmed">pupils</Text>
          </Text>
        </Paper>
      </SimpleGrid>

      {/* 2. Main Directory Card */}
      <Card radius="md" withBorder p={0} bg="white">
        <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-slate-2, #e2e8f0)' }}>
          <Group justify="space-between" wrap="wrap" gap="md">
            <SectionHeader
              title="Class Directory & Grade Assignments"
              description="Principal management of classroom divisions, section linkages, and homeroom teachers."
              badge={<Badge size="sm" variant="light" color="refinedBlue">{filteredClasses.length} Classes</Badge>}
            />

            <Button
              color="refinedBlue"
              leftSection={<Plus size={16} />}
              onClick={() => setShowCreateModal(true)}
            >
              Add New Class
            </Button>
          </Group>

          {/* Filters Row */}
          <Group mt="md" gap="sm" wrap="wrap">
            <TextInput
              placeholder="Search class or room..."
              leftSection={<Search size={14} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
              size="sm"
            />

            <Select
              placeholder="All Grades (6–13)"
              data={[
                { value: '', label: 'All Grades' },
                ...[6, 7, 8, 9, 10, 11, 12, 13].map((g) => ({
                  value: String(g),
                  label: `Grade ${g}`
                }))
              ]}
              value={selectedGrade || ''}
              onChange={(val) => setSelectedGrade(val || null)}
              clearable
              size="sm"
              style={{ width: 160 }}
            />

            <Select
              placeholder="All Sections"
              data={[
                { value: '', label: 'All Sections' },
                { value: 'unassigned', label: 'Unassigned Only' },
                ...sections.map((s) => ({
                  value: String(s.id),
                  label: s.name
                }))
              ]}
              value={selectedSection || ''}
              onChange={(val) => setSelectedSection(val || null)}
              clearable
              size="sm"
              style={{ width: 220 }}
            />

            {(searchQuery || selectedGrade || selectedSection) && (
              <Button
                variant="subtle"
                color="slate"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedGrade(null);
                  setSelectedSection(null);
                }}
              >
                Clear Filters
              </Button>
            )}
          </Group>
        </Box>

        {/* 3. Table */}
        {filteredClasses.length === 0 ? (
          <Box p="xl">
            <EmptyState
              icon={<School size={36} />}
              title="No Classes Match Filters"
              description="Try adjusting your grade, section, or search query filter to view classes."
              withBorder={false}
            />
          </Box>
        ) : (
          <Table.ScrollContainer minWidth={700}>
            <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
              <Table.Thead bg="slate.0">
                <Table.Tr>
                  <Table.Th style={{ width: 140 }}>Class Name</Table.Th>
                  <Table.Th style={{ width: 90 }}>Grade</Table.Th>
                  <Table.Th>Assigned Section</Table.Th>
                  <Table.Th style={{ width: 130 }}>Room Number</Table.Th>
                  <Table.Th style={{ width: 110 }}>Students</Table.Th>
                  <Table.Th>Class Teacher(s)</Table.Th>
                  <Table.Th style={{ textAlign: 'right', width: 160 }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredClasses.map((cls) => {
                  const hasStudents = Boolean(cls.student_count && cls.student_count > 0);
                  const teachersList = cls.class_teachers || [];

                  return (
                    <Table.Tr key={cls.id}>
                      <Table.Td>
                        <Text fw={600} size="sm" c="slate.9">
                          {cls.name}
                        </Text>
                      </Table.Td>

                      <Table.Td>
                        <Badge size="sm" variant="outline" color="slate">
                          Grade {cls.grade}
                        </Badge>
                      </Table.Td>

                      <Table.Td>
                        {cls.section_id ? (
                          <Badge size="sm" variant="light" color="statusGreen">
                            {cls.section_name}
                          </Badge>
                        ) : (
                          <Badge size="sm" variant="dot" color="statusAmber">
                            Unassigned
                          </Badge>
                        )}
                      </Table.Td>

                      <Table.Td>
                        <Text size="xs" c={cls.room_number ? 'slate.7' : 'dimmed'}>
                          {cls.room_number || '—'}
                        </Text>
                      </Table.Td>

                      <Table.Td>
                        <Badge
                          size="sm"
                          variant="light"
                          color={hasStudents ? 'refinedBlue' : 'slate'}
                        >
                          {cls.student_count || 0} pupils
                        </Badge>
                      </Table.Td>

                      <Table.Td>
                        {teachersList.length > 0 ? (
                          <Group gap={4} wrap="wrap">
                            {teachersList.map((t) => (
                              <Badge key={t.id} size="xs" variant="outline" color="refinedBlue">
                                {t.full_name}
                              </Badge>
                            ))}
                          </Group>
                        ) : (
                          <Text size="xs" c="dimmed" fs="italic">
                            No teacher assigned
                          </Text>
                        )}
                      </Table.Td>

                      <Table.Td style={{ textAlign: 'right' }}>
                        <Group gap={6} justify="flex-end">
                          <Tooltip label="Edit class details & section">
                            <ActionIcon
                              variant="subtle"
                              color="refinedBlue"
                              size="sm"
                              onClick={() => openEditModal(cls)}
                            >
                              <Edit2 size={15} />
                            </ActionIcon>
                          </Tooltip>

                          <Tooltip label="Manage class teachers">
                            <ActionIcon
                              variant="subtle"
                              color="slate"
                              size="sm"
                              onClick={() => {
                                setSelectedClassForTeachers(cls);
                                setShowTeachersModal(true);
                              }}
                            >
                              <UserCheck size={15} />
                            </ActionIcon>
                          </Tooltip>

                          <Tooltip
                            label={
                              hasStudents
                                ? `Cannot delete: Class has ${cls.student_count} enrolled student(s)`
                                : 'Delete empty class'
                            }
                          >
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="sm"
                              disabled={hasStudents}
                              onClick={() => setDeletingClass(cls)}
                            >
                              <Trash2 size={15} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      {/* 4. Create Class Modal */}
      <Modal
        opened={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={
          <Group gap="xs">
            <School size={18} />
            <Text fw={600}>Create New Class</Text>
          </Group>
        }
        centered
        size="md"
      >
        <form onSubmit={handleCreateSubmit}>
          <Stack gap="sm">
            <Select
              label="Grade Level"
              required
              data={[6, 7, 8, 9, 10, 11, 12, 13].map((g) => ({
                value: String(g),
                label: `Grade ${g}`
              }))}
              value={createForm.grade}
              onChange={(val) => setCreateForm((prev) => ({ ...prev, grade: val || '8' }))}
            />

            <TextInput
              label="Class Name"
              required
              placeholder="e.g. Grade 8-C"
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
            />

            <TextInput
              label="Room Number"
              placeholder="e.g. Block B - 203"
              value={createForm.room_number}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, room_number: e.target.value }))}
            />

            <Select
              label="School Section"
              placeholder="Select containing section (optional)"
              data={[
                { value: '', label: 'None (Unassigned)' },
                ...sections.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} (${s.code})`
                }))
              ]}
              value={createForm.section_id}
              onChange={(val) => setCreateForm((prev) => ({ ...prev, section_id: val || '' }))}
              clearable
            />

            <Select
              label="Primary Class Teacher"
              placeholder="Select assigned teacher (optional)"
              data={[
                { value: '', label: 'None (Assign later)' },
                ...teachers.map((t) => ({
                  value: String(t.id),
                  label: `${t.full_name} (${t.email})`
                }))
              ]}
              value={createForm.class_teacher_id}
              onChange={(val) => setCreateForm((prev) => ({ ...prev, class_teacher_id: val || '' }))}
              clearable
            />

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" color="refinedBlue" loading={createLoading}>
                Create Class
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* 5. Edit Class Modal */}
      <Modal
        opened={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={
          <Group gap="xs">
            <Edit2 size={18} />
            <Text fw={600}>Edit Class: {editingClass?.name}</Text>
          </Group>
        }
        centered
        size="md"
      >
        <form onSubmit={handleEditSubmit}>
          <Stack gap="sm">
            <Select
              label="Grade Level"
              required
              data={[6, 7, 8, 9, 10, 11, 12, 13].map((g) => ({
                value: String(g),
                label: `Grade ${g}`
              }))}
              value={editForm.grade}
              onChange={(val) => setEditForm((prev) => ({ ...prev, grade: val || '8' }))}
            />

            <TextInput
              label="Class Name"
              required
              placeholder="e.g. Grade 8-C"
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            />

            <TextInput
              label="Room Number"
              placeholder="e.g. Block B - 203"
              value={editForm.room_number}
              onChange={(e) => setEditForm((prev) => ({ ...prev, room_number: e.target.value }))}
            />

            <Select
              label="School Section"
              placeholder="Assign to section"
              data={[
                { value: '', label: 'None (Unassigned)' },
                ...sections.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} (${s.code})`
                }))
              ]}
              value={editForm.section_id}
              onChange={(val) => setEditForm((prev) => ({ ...prev, section_id: val || '' }))}
              clearable
            />

            <Select
              label="Primary Class Teacher"
              placeholder="Select assigned teacher"
              data={[
                { value: '', label: 'None (Unassigned)' },
                ...teachers.map((t) => ({
                  value: String(t.id),
                  label: `${t.full_name} (${t.email})`
                }))
              ]}
              value={editForm.class_teacher_id}
              onChange={(val) => setEditForm((prev) => ({ ...prev, class_teacher_id: val || '' }))}
              clearable
            />

            {editingClass?.student_count && editingClass.student_count > 0 ? (
              <Alert color="blue" variant="light" icon={<AlertCircle size={16} />}>
                This class currently has {editingClass.student_count} enrolled student(s). Updating class details preserves all student records and historical attendance.
              </Alert>
            ) : null}

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button type="submit" color="refinedBlue" loading={editLoading}>
                Save Changes
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* 6. Manage Class Teachers Modal */}
      <Modal
        opened={showTeachersModal}
        onClose={() => setShowTeachersModal(false)}
        title={
          <Group gap="xs">
            <UserCheck size={18} />
            <Text fw={600}>Class Teachers: {selectedClassForTeachers?.name}</Text>
          </Group>
        }
        centered
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            A class may have multiple assigned class teachers for co-homeroom and attendance duties.
          </Text>

          {/* Currently Assigned Teachers List */}
          <Stack gap="xs">
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              Assigned Teachers ({(selectedClassForTeachers?.class_teachers || []).length})
            </Text>

            {(selectedClassForTeachers?.class_teachers || []).length === 0 ? (
              <Paper p="sm" withBorder bg="slate.0" radius="sm">
                <Text size="xs" c="dimmed" fs="italic">
                  No class teachers currently assigned.
                </Text>
              </Paper>
            ) : (
              (selectedClassForTeachers?.class_teachers || []).map((t) => (
                <Paper key={t.id} p="xs" withBorder radius="sm">
                  <Group justify="space-between" align="center">
                    <Stack gap={1}>
                      <Text size="sm" fw={600}>
                        {t.full_name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t.email}
                      </Text>
                    </Stack>

                    <Button
                      size="xs"
                      color="red"
                      variant="subtle"
                      leftSection={<X size={12} />}
                      loading={teacherAssignLoading}
                      onClick={() => handleRemoveClassTeacher(t.id)}
                    >
                      Remove
                    </Button>
                  </Group>
                </Paper>
              ))
            )}
          </Stack>

          {/* Add New Teacher Form */}
          <Stack gap="xs" pt="xs" style={{ borderTop: '1px solid var(--mantine-color-slate-2, #e2e8f0)' }}>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              Assign Another Teacher
            </Text>
            <Group align="flex-end" gap="xs">
              <Select
                placeholder="Select faculty member..."
                data={teachers
                  .filter(
                    (t) => !(selectedClassForTeachers?.class_teachers || []).some((ct) => ct.id === t.id)
                  )
                  .map((t) => ({
                    value: String(t.id),
                    label: `${t.full_name} (${t.role.replace('_', ' ')})`
                  }))}
                value={newTeacherId}
                onChange={(val) => setNewTeacherId(val || '')}
                style={{ flex: 1 }}
                size="sm"
              />
              <Button
                size="sm"
                color="refinedBlue"
                leftSection={<Plus size={14} />}
                disabled={!newTeacherId}
                loading={teacherAssignLoading}
                onClick={handleAddClassTeacher}
              >
                Assign
              </Button>
            </Group>
          </Stack>

          <Group justify="flex-end" mt="sm">
            <Button variant="default" size="sm" onClick={() => setShowTeachersModal(false)}>
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 7. Safe Delete Confirmation Modal */}
      {deletingClass && (
        <ConfirmModal
          opened={Boolean(deletingClass)}
          onClose={() => setDeletingClass(null)}
          onConfirm={handleConfirmDelete}
          title="Delete Class"
          confirmLabel="Delete Class"
          confirmColor="red"
          loading={deleteLoading}
          message={
            <Stack gap="xs">
              <Text size="sm">
                Are you sure you want to delete class <strong>{deletingClass.name}</strong>?
              </Text>
              <Text size="xs" c="dimmed">
                This class currently has 0 enrolled students and 0 attendance registers. Empty classes can be safely removed without data loss.
              </Text>
            </Stack>
          }
        />
      )}
    </Stack>
  );
};

export default ClassManagement;

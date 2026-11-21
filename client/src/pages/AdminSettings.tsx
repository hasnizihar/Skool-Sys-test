import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Badge,
  Button,
  Group,
  Stack,
  TextInput,
  PasswordInput,
  Select,
  Textarea,
  Checkbox,
  Modal,
  Text,
  ActionIcon,
  Paper,
  SimpleGrid,
  Alert,
  Box,
  ScrollArea,
  Code,
  Title,
  Tabs
} from '@mantine/core';
import {
  ShieldCheck,
  UserPlus,
  Users,
  BookOpen,
  Database,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Plus,
  X,
  Layers,
  Edit3,
  UserCheck,
  School,
  GraduationCap,
  Lock,
  RefreshCw
} from 'lucide-react';
import { api } from '../api/client';
import { ClassManagement } from './ClassManagement';
import { TeacherDirectory } from './TeacherDirectory';
import {
  SectionHeader,
  EmptyState,
  ConfirmModal,
  showAppNotification
} from '../ui/mantine';

interface AdminSettingsProps {
  initialTab?: 'teachers' | 'sections' | 'classes' | 'users' | 'assignments' | 'backup';
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ initialTab = 'sections' }) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Loading & Data States
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  // 1. Section Modal State
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingSection, setEditingSection] = useState<any | null>(null);
  const [sectionFormData, setSectionFormData] = useState({
    name: '',
    code: '',
    description: ''
  });
  const [sectionSaving, setSectionSaving] = useState(false);

  // Confirm Delete Section State
  const [deletingSection, setDeletingSection] = useState<any | null>(null);
  const [deleteSectionLoading, setDeleteSectionLoading] = useState(false);

  // 2. Assign Classes to Section Modal State
  const [showAssignClassesModal, setShowAssignClassesModal] = useState(false);
  const [targetSectionForClasses, setTargetSectionForClasses] = useState<any | null>(null);
  const [selectedClassIdsForSection, setSelectedClassIdsForSection] = useState<number[]>([]);
  const [assignClassesLoading, setAssignClassesLoading] = useState(false);

  // 3. Assign Section Head Modal State
  const [showAssignHeadModal, setShowAssignHeadModal] = useState(false);
  const [targetSectionForHead, setTargetSectionForHead] = useState<any | null>(null);
  const [selectedHeadUserId, setSelectedHeadUserId] = useState<string>('');
  const [assignHeadLoading, setAssignHeadLoading] = useState(false);

  // 4. Class Teachers Management Modal State
  const [showClassTeachersModal, setShowClassTeachersModal] = useState(false);
  const [targetClassForTeachers, setTargetClassForTeachers] = useState<any | null>(null);
  const [selectedTeacherIdForClass, setSelectedTeacherIdForClass] = useState<string>('');
  const [currentClassTeachers, setCurrentClassTeachers] = useState<any[]>([]);
  const [classTeacherLoading, setClassTeacherLoading] = useState(false);

  // 5. Add User Modal State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [userFormData, setUserFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'class_teacher'
  });
  const [createUserLoading, setCreateUserLoading] = useState(false);

  // 6. Add Assignment Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignFormData, setAssignFormData] = useState({
    teacher_id: '',
    class_id: '',
    subject_id: '',
    assignment_type: 'class_teacher'
  });
  const [createAssignLoading, setCreateAssignLoading] = useState(false);

  // Confirm Delete Assignment State
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<number | null>(null);
  const [deleteAssignLoading, setDeleteAssignLoading] = useState(false);

  // Backup State
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupExporting, setBackupExporting] = useState(false);

  const loadAllAdminData = useCallback(async () => {
    try {
      setLoading(true);
      const [uRes, aRes, cRes, sRes, secRes] = await Promise.all([
        api.getUsers(),
        api.getAssignments(),
        api.getClasses(),
        api.getSubjects(),
        api.getSections().catch(() => ({ sections: [] }))
      ]);
      setUsers(uRes.users || []);
      setAssignments(aRes.assignments || []);
      setClasses(cRes.classes || []);
      setSubjects(sRes.subjects || []);
      setSections(secRes.sections || []);
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
      showAppNotification.error('Data Loading Error', err.message || 'Failed to fetch administration data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadSections = async () => {
    try {
      const [secRes, cRes] = await Promise.all([
        api.getSections(),
        api.getClasses()
      ]);
      setSections(secRes.sections || []);
      setClasses(cRes.classes || []);
    } catch (err: any) {
      console.error('Failed to reload sections:', err);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  // Section Handlers
  const handleOpenAddSection = () => {
    setEditingSection(null);
    setSectionFormData({ name: '', code: '', description: '' });
    setShowSectionModal(true);
  };

  const handleOpenEditSection = (sec: any) => {
    setEditingSection(sec);
    setSectionFormData({
      name: sec.name,
      code: sec.code,
      description: sec.description || ''
    });
    setShowSectionModal(true);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionFormData.name.trim() || !sectionFormData.code.trim()) {
      showAppNotification.error('Validation Error', 'Section name and code are required.');
      return;
    }
    try {
      setSectionSaving(true);
      if (editingSection) {
        await api.updateSection(editingSection.id, sectionFormData);
        showAppNotification.success('Section Updated', `Section "${sectionFormData.name}" updated successfully.`);
      } else {
        await api.createSection(sectionFormData);
        showAppNotification.success('Section Created', `Section "${sectionFormData.name}" created successfully.`);
      }
      setShowSectionModal(false);
      await reloadSections();
    } catch (err: any) {
      showAppNotification.error('Failed to Save Section', err.message || 'Operation failed.');
    } finally {
      setSectionSaving(false);
    }
  };

  const handleConfirmDeleteSection = async () => {
    if (!deletingSection) return;
    try {
      setDeleteSectionLoading(true);
      await api.deleteSection(deletingSection.id);
      showAppNotification.success('Section Deleted', `Section "${deletingSection.name}" was removed. Linked classes were unassigned.`);
      setDeletingSection(null);
      await reloadSections();
    } catch (err: any) {
      showAppNotification.error('Deletion Failed', err.message || 'Unable to delete section.');
    } finally {
      setDeleteSectionLoading(false);
    }
  };

  // Section Classes Handlers
  const handleOpenAssignClasses = (sec: any) => {
    setTargetSectionForClasses(sec);
    const existingIds = (sec.classes || []).map((c: any) => c.id);
    setSelectedClassIdsForSection(existingIds);
    setShowAssignClassesModal(true);
  };

  const handleSaveAssignedClasses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSectionForClasses) return;
    try {
      setAssignClassesLoading(true);
      await api.assignSectionClasses(targetSectionForClasses.id, selectedClassIdsForSection);
      showAppNotification.success('Classes Linked', `${selectedClassIdsForSection.length} classes linked to ${targetSectionForClasses.name}.`);
      setShowAssignClassesModal(false);
      await reloadSections();
    } catch (err: any) {
      showAppNotification.error('Link Error', err.message || 'Failed to link classes to section.');
    } finally {
      setAssignClassesLoading(false);
    }
  };

  const handleUnassignClassFromSection = async (sectionId: number, classId: number) => {
    try {
      await api.unassignSectionClass(sectionId, classId);
      showAppNotification.success('Class Unlinked', 'Class successfully unlinked from section.');
      await reloadSections();
    } catch (err: any) {
      showAppNotification.error('Unlink Failed', err.message || 'Unable to unlink class.');
    }
  };

  // Section Head Handlers
  const handleOpenAssignHead = (sec: any) => {
    setTargetSectionForHead(sec);
    setSelectedHeadUserId('');
    setShowAssignHeadModal(true);
  };

  const handleSaveSectionHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSectionForHead || !selectedHeadUserId) {
      showAppNotification.error('Validation Error', 'Please select a faculty member.');
      return;
    }
    try {
      setAssignHeadLoading(true);
      await api.assignSectionHead(targetSectionForHead.id, Number(selectedHeadUserId));
      showAppNotification.success('Section Head Assigned', 'Supervisor assigned to section successfully.');
      setShowAssignHeadModal(false);
      await reloadSections();
    } catch (err: any) {
      showAppNotification.error('Assignment Error', err.message || 'Failed to assign section head.');
    } finally {
      setAssignHeadLoading(false);
    }
  };

  const handleRemoveSectionHead = async (sectionId: number, userId: number) => {
    try {
      await api.removeSectionHead(sectionId, userId);
      showAppNotification.success('Section Head Removed', 'Supervisory assignment removed.');
      await reloadSections();
    } catch (err: any) {
      showAppNotification.error('Removal Error', err.message || 'Failed to remove section head.');
    }
  };

  // Class Teachers Management Handlers
  const handleOpenClassTeachers = async (cls: any) => {
    setTargetClassForTeachers(cls);
    setSelectedTeacherIdForClass('');
    try {
      const res = await api.getClassTeachers(cls.id);
      setCurrentClassTeachers(res.teachers || []);
    } catch {
      setCurrentClassTeachers(cls.class_teachers || []);
    }
    setShowClassTeachersModal(true);
  };

  const handleAddClassTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetClassForTeachers || !selectedTeacherIdForClass) return;
    try {
      setClassTeacherLoading(true);
      await api.assignClassTeacher(targetClassForTeachers.id, Number(selectedTeacherIdForClass));
      setSelectedTeacherIdForClass('');
      const res = await api.getClassTeachers(targetClassForTeachers.id);
      setCurrentClassTeachers(res.teachers || []);
      showAppNotification.success('Class Teacher Assigned', 'Faculty member assigned to class.');
      await reloadSections();
    } catch (err: any) {
      showAppNotification.error('Assignment Error', err.message || 'Failed to assign class teacher.');
    } finally {
      setClassTeacherLoading(false);
    }
  };

  const handleRemoveClassTeacher = async (teacherId: number) => {
    if (!targetClassForTeachers) return;
    try {
      setClassTeacherLoading(true);
      await api.removeClassTeacher(targetClassForTeachers.id, teacherId);
      const res = await api.getClassTeachers(targetClassForTeachers.id);
      setCurrentClassTeachers(res.teachers || []);
      showAppNotification.success('Teacher Removed', 'Class teacher assignment removed.');
      await reloadSections();
    } catch (err: any) {
      showAppNotification.error('Removal Error', err.message || 'Failed to remove class teacher.');
    } finally {
      setClassTeacherLoading(false);
    }
  };

  // Users Handlers
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userFormData.password.length < 8) {
      showAppNotification.error('Password Validation', 'Password must be at least 8 characters long.');
      return;
    }
    try {
      setCreateUserLoading(true);
      await api.createUser(userFormData);
      setShowAddUserModal(false);
      setUserFormData({
        username: '',
        email: '',
        password: '',
        full_name: '',
        role: 'class_teacher'
      });
      const res = await api.getUsers();
      setUsers(res.users || []);
      showAppNotification.success('Account Created', 'Faculty user account created successfully.');
    } catch (err: any) {
      showAppNotification.error('Account Creation Error', err.message || 'Failed to create user account.');
    } finally {
      setCreateUserLoading(false);
    }
  };

  const handleToggleUserStatus = async (user: any) => {
    const nextStatus = !user.is_active;
    try {
      await api.updateUser(user.id, { is_active: nextStatus });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: nextStatus ? 1 : 0 } : u))
      );
      showAppNotification.success(
        'User Status Updated',
        `User ${user.username} was ${nextStatus ? 'activated' : 'deactivated and logged out'}.`
      );
    } catch (err: any) {
      showAppNotification.error('Status Update Failed', err.message || 'Unable to modify user status.');
    }
  };

  // Assignments Handlers
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreateAssignLoading(true);
      await api.createAssignment(assignFormData);
      setShowAssignModal(false);
      setAssignFormData({
        teacher_id: '',
        class_id: '',
        subject_id: '',
        assignment_type: 'class_teacher'
      });
      const res = await api.getAssignments();
      setAssignments(res.assignments || []);
      showAppNotification.success('Assignment Saved', 'Teacher assignment saved successfully.');
    } catch (err: any) {
      showAppNotification.error('Assignment Error', err.message || 'Failed to record assignment.');
    } finally {
      setCreateAssignLoading(false);
    }
  };

  const handleConfirmDeleteAssignment = async () => {
    if (!deletingAssignmentId) return;
    try {
      setDeleteAssignLoading(true);
      await api.deleteAssignment(deletingAssignmentId);
      setAssignments((prev) => prev.filter((a) => a.id !== deletingAssignmentId));
      showAppNotification.success('Assignment Removed', 'Teacher assignment removed.');
      setDeletingAssignmentId(null);
    } catch (err: any) {
      showAppNotification.error('Deletion Failed', err.message || 'Failed to remove assignment.');
    } finally {
      setDeleteAssignLoading(false);
    }
  };

  // Backup Export Handler
  const handleDownloadBackup = async () => {
    try {
      setBackupExporting(true);
      setBackupStatus('Generating full database JSON backup...');
      const data = await api.getBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `skoolsys-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setBackupStatus('Backup exported and downloaded successfully!');
      showAppNotification.success('Backup Exported', 'Full institutional JSON backup file generated.');
      setTimeout(() => setBackupStatus(null), 4000);
    } catch (err: any) {
      showAppNotification.error('Backup Error', err.message || 'Failed to export database.');
      setBackupStatus(null);
    } finally {
      setBackupExporting(false);
    }
  };

  return (
    <Stack gap="lg">
      {/* 1. Page Header with Navigation Tabs */}
      <Paper p="lg" radius="md" withBorder bg="white">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Box>
            <Group gap="xs" mb={4}>
              <ShieldCheck size={22} style={{ color: 'var(--mantine-color-refinedBlue-6, #2563eb)' }} />
              <Title order={3} fw={700} c="slate.8">
                School Administration & Security
              </Title>
            </Group>
            <Text size="sm" c="dimmed">
              Configure school sections, homeroom divisions, faculty accounts, teaching assignments, and immutable database backups.
            </Text>
          </Box>

          <Button
            variant="default"
            size="sm"
            leftSection={<RefreshCw size={14} className={loading ? 'spin' : ''} />}
            onClick={() => loadAllAdminData()}
            disabled={loading}
          >
            Refresh
          </Button>
        </Group>

        {/* Tab Switcher */}
        <Box mt="md">
          <Tabs
            value={activeTab}
            onChange={(val) => setActiveTab(val || 'sections')}
            variant="outline"
            radius="md"
          >
            <Tabs.List>
              <Tabs.Tab value="sections" leftSection={<Layers size={15} />}>
                Sections & Structure
              </Tabs.Tab>
              <Tabs.Tab value="classes" leftSection={<School size={15} />}>
                Class Management
              </Tabs.Tab>
              <Tabs.Tab value="teachers" leftSection={<GraduationCap size={15} />}>
                Faculty & Teachers
              </Tabs.Tab>
              <Tabs.Tab value="users" leftSection={<Users size={15} />}>
                User Accounts
              </Tabs.Tab>
              <Tabs.Tab value="assignments" leftSection={<BookOpen size={15} />}>
                Teacher Assignments
              </Tabs.Tab>
              <Tabs.Tab value="backup" leftSection={<Database size={15} />}>
                Backup & Security
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </Box>
      </Paper>

      {/* TAB 1: FACULTY & TEACHERS DIRECTORY (Phase 3 Task 2) */}
      {activeTab === 'teachers' && (
        <TeacherDirectory
          onAddUser={() => {
            setActiveTab('users');
            setShowAddUserModal(true);
          }}
          onManageAssignments={() => setActiveTab('assignments')}
        />
      )}

      {/* TAB 2: SCHOOL SECTIONS & STRUCTURE */}
      {activeTab === 'sections' && (
        <Stack gap="md">
          {/* Header Action Card */}
          <Paper p="md" radius="md" withBorder bg="white">
            <Group justify="space-between" wrap="wrap" gap="md">
              <SectionHeader
                title="School Sections & Leadership Structure"
                description="Define divisional boundaries (Junior, Senior, A/L), assign sectional heads, and link classroom units."
                badge={<Badge size="sm" variant="light" color="refinedBlue">{sections.length} Sections</Badge>}
              />

              <Button
                color="refinedBlue"
                leftSection={<Plus size={16} />}
                onClick={handleOpenAddSection}
              >
                Add New Section
              </Button>
            </Group>
          </Paper>

          {/* Unassigned Classes Notice */}
          {classes.filter((c) => !c.section_id).length > 0 && (
            <Alert
              icon={<AlertTriangle size={18} />}
              title="Unassigned Classes Detected"
              color="statusAmber"
              radius="md"
            >
              <Text size="sm">
                <strong>{classes.filter((c) => !c.section_id).length} classes</strong> are currently unassigned to any organizational section. Link them to a section below for accurate Section Head walkthrough monitoring.
              </Text>
            </Alert>
          )}

          {/* Sections List */}
          {sections.length === 0 ? (
            <Paper p="xl" radius="md" withBorder bg="white">
              <EmptyState
                icon={<School size={36} />}
                title="No School Sections Configured"
                description="Get started by creating your primary school sections (e.g. 'Junior Secondary', 'Senior Secondary', 'A/L Collegiate')."
                action={
                  <Button color="refinedBlue" leftSection={<Plus size={16} />} onClick={handleOpenAddSection}>
                    Create First Section
                  </Button>
                }
              />
            </Paper>
          ) : (
            <Stack gap="md">
              {sections.map((sec) => (
                <Paper key={sec.id} p="lg" radius="md" withBorder bg="white">
                  {/* Section Title & Actions */}
                  <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm" pb="sm" style={{ borderBottom: '1px solid var(--mantine-color-slate-2, #e2e8f0)' }}>
                    <Box>
                      <Group gap="xs">
                        <Title order={4} fw={700} c="slate.8">
                          {sec.name}
                        </Title>
                        <Badge color="refinedBlue" variant="filled" size="sm">
                          {sec.code}
                        </Badge>
                        {sec.academic_year_name && (
                          <Badge color="slate" variant="light" size="sm">
                            {sec.academic_year_name}
                          </Badge>
                        )}
                      </Group>
                      {sec.description && (
                        <Text size="xs" c="dimmed" mt={4}>
                          {sec.description}
                        </Text>
                      )}
                    </Box>

                    <Group gap="xs">
                      <Button
                        variant="default"
                        size="xs"
                        leftSection={<BookOpen size={13} />}
                        onClick={() => handleOpenAssignClasses(sec)}
                      >
                        Link Classes
                      </Button>
                      <Button
                        variant="default"
                        size="xs"
                        leftSection={<UserCheck size={13} />}
                        onClick={() => handleOpenAssignHead(sec)}
                      >
                        Assign Head
                      </Button>
                      <Button
                        variant="default"
                        size="xs"
                        leftSection={<Edit3 size={13} />}
                        onClick={() => handleOpenEditSection(sec)}
                      >
                        Edit
                      </Button>
                      <ActionIcon
                        variant="subtle"
                        color="statusRed"
                        size="sm"
                        onClick={() => setDeletingSection(sec)}
                        title="Delete Section"
                      >
                        <Trash2 size={15} />
                      </ActionIcon>
                    </Group>
                  </Group>

                  {/* Sectional Heads Sub-Card */}
                  <Paper p="sm" radius="sm" withBorder bg="slate.0" mt="md">
                    <Group justify="space-between" mb={6}>
                      <Text size="xs" fw={700} c="slate.7" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
                        Sectional Heads ({sec.section_heads?.length || 0})
                      </Text>
                      <Button
                        variant="subtle"
                        size="xs"
                        color="refinedBlue"
                        onClick={() => handleOpenAssignHead(sec)}
                      >
                        + Add Head
                      </Button>
                    </Group>

                    {(!sec.section_heads || sec.section_heads.length === 0) ? (
                      <Text size="xs" c="dimmed" fs="italic">
                        No sectional heads assigned. Click "+ Add Head" to assign a supervisor with live walkthrough access.
                      </Text>
                    ) : (
                      <Group gap="xs" wrap="wrap">
                        {sec.section_heads.map((head: any) => (
                          <Badge
                            key={head.id}
                            size="md"
                            variant="default"
                            rightSection={
                              <ActionIcon
                                size={14}
                                variant="transparent"
                                c="dimmed"
                                onClick={() => handleRemoveSectionHead(sec.id, head.id)}
                                title="Remove section head"
                              >
                                <X size={10} />
                              </ActionIcon>
                            }
                            leftSection={<UserCheck size={12} color="var(--mantine-color-refinedBlue-6, #2563eb)" />}
                          >
                            {head.full_name}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </Paper>

                  {/* Linked Classes Table */}
                  <Box mt="md">
                    <Group justify="space-between" mb={6}>
                      <Text size="xs" fw={700} c="slate.7" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
                        Linked Classroom Divisions ({sec.classes?.length || 0})
                      </Text>
                      <Button
                        variant="subtle"
                        size="xs"
                        color="refinedBlue"
                        onClick={() => handleOpenAssignClasses(sec)}
                      >
                        + Link More Classes
                      </Button>
                    </Group>

                    {(!sec.classes || sec.classes.length === 0) ? (
                      <Paper p="md" radius="sm" withBorder bg="slate.0" style={{ textAlign: 'center' }}>
                        <Text size="xs" c="dimmed">
                          No classes linked to this section yet. Click "+ Link More Classes" to assign classrooms.
                        </Text>
                      </Paper>
                    ) : (
                      <Table.ScrollContainer minWidth={600}>
                        <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm">
                          <Table.Thead bg="slate.0">
                            <Table.Tr>
                              <Table.Th style={{ width: 140 }}>Class Division</Table.Th>
                              <Table.Th style={{ width: 90 }}>Grade</Table.Th>
                              <Table.Th style={{ width: 90 }}>Enrolled</Table.Th>
                              <Table.Th>Assigned Homeroom Teacher(s)</Table.Th>
                              <Table.Th style={{ textAlign: 'right', width: 170 }}>Actions</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {sec.classes.map((cls: any) => (
                              <Table.Tr key={cls.id}>
                                <Table.Td>
                                  <Text size="sm" fw={700} c="slate.8">
                                    {cls.name}
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  <Badge size="xs" variant="light" color="refinedBlue">
                                    Grade {cls.grade}
                                  </Badge>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs" c="slate.7">
                                    {cls.student_count || 0} pupils
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  {(!cls.class_teachers || cls.class_teachers.length === 0) ? (
                                    <Text size="xs" c="statusAmber.8" fs="italic">
                                      Unassigned
                                    </Text>
                                  ) : (
                                    <Group gap={6} wrap="wrap">
                                      {cls.class_teachers.map((t: any) => (
                                        <Badge key={t.id} size="xs" variant="light" color="statusGreen">
                                          {t.full_name}
                                        </Badge>
                                      ))}
                                    </Group>
                                  )}
                                </Table.Td>
                                <Table.Td style={{ textAlign: 'right' }}>
                                  <Group gap={6} justify="flex-end">
                                    <Button
                                      variant="default"
                                      size="xs"
                                      onClick={() => handleOpenClassTeachers(cls)}
                                    >
                                      Teachers ({cls.class_teachers?.length || 0})
                                    </Button>
                                    <Button
                                      variant="subtle"
                                      color="slate"
                                      size="xs"
                                      onClick={() => handleUnassignClassFromSection(sec.id, cls.id)}
                                    >
                                      Unlink
                                    </Button>
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    )}
                  </Box>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      )}

      {/* TAB 3: CLASS MANAGEMENT (Phase 2 Component) */}
      {activeTab === 'classes' && (
        <ClassManagement onClassChanged={loadAllAdminData} />
      )}

      {/* TAB 4: FACULTY & STAFF ACCOUNTS */}
      {activeTab === 'users' && (
        <Card radius="md" withBorder p={0} bg="white">
          <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-slate-2, #e2e8f0)' }}>
            <Group justify="space-between" wrap="wrap" gap="md">
              <SectionHeader
                title="Faculty & Administrative Accounts"
                description="Role-based credential management, session invalidation, and privileged access control."
                badge={<Badge size="sm" variant="light" color="refinedBlue">{users.length} Users</Badge>}
              />

              <Button
                color="refinedBlue"
                leftSection={<UserPlus size={16} />}
                onClick={() => setShowAddUserModal(true)}
              >
                Add User Account
              </Button>
            </Group>
          </Box>

          <Table.ScrollContainer minWidth={700}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead bg="slate.0">
                <Table.Tr>
                  <Table.Th>Full Name</Table.Th>
                  <Table.Th>Username</Table.Th>
                  <Table.Th>Email Address</Table.Th>
                  <Table.Th>System Role</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((u) => (
                  <Table.Tr key={u.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <Box
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'var(--mantine-color-refinedBlue-1, #dbeafe)',
                            color: 'var(--mantine-color-refinedBlue-8, #1e40af)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            fontWeight: 700
                          }}
                        >
                          {u.full_name?.charAt(0)?.toUpperCase() || 'U'}
                        </Box>
                        <Text size="sm" fw={600} c="slate.8">
                          {u.full_name}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Code c="slate.7">{u.username}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {u.email}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        variant="light"
                        color={u.role === 'admin' ? 'indigo' : u.role === 'section_head' ? 'statusGreen' : 'refinedBlue'}
                      >
                        {u.role.replace('_', ' ')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        variant="light"
                        color={u.is_active ? 'statusGreen' : 'statusRed'}
                      >
                        {u.is_active ? 'Active' : 'Deactivated'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {u.created_at?.slice(0, 10)}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Button
                        variant={u.is_active ? 'default' : 'filled'}
                        color={u.is_active ? undefined : 'refinedBlue'}
                        size="xs"
                        onClick={() => handleToggleUserStatus(u)}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      {/* TAB 5: TEACHER ASSIGNMENTS */}
      {activeTab === 'assignments' && (
        <Card radius="md" withBorder p={0} bg="white">
          <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-slate-2, #e2e8f0)' }}>
            <Group justify="space-between" wrap="wrap" gap="md">
              <SectionHeader
                title="Teacher Class & Subject Assignments"
                description="Designate class teachers and subject instructors across Grades 6 to 13."
                badge={<Badge size="sm" variant="light" color="refinedBlue">{assignments.length} Assignments</Badge>}
              />

              <Button
                color="refinedBlue"
                leftSection={<Plus size={16} />}
                onClick={() => setShowAssignModal(true)}
              >
                New Assignment
              </Button>
            </Group>
          </Box>

          <Table.ScrollContainer minWidth={700}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead bg="slate.0">
                <Table.Tr>
                  <Table.Th>Teacher Name</Table.Th>
                  <Table.Th>Class Division</Table.Th>
                  <Table.Th>Assignment Type</Table.Th>
                  <Table.Th>Assigned Subject</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {assignments.map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td>
                      <Text size="sm" fw={600} c="slate.8">
                        {a.teacher_name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="default">
                        {a.class_name}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        variant="light"
                        color={a.assignment_type === 'class_teacher' ? 'statusGreen' : 'refinedBlue'}
                      >
                        {a.assignment_type === 'class_teacher' ? 'Class Teacher' : 'Subject Teacher'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="slate.7">
                        {a.subject_name ? `${a.subject_name} (${a.subject_code})` : 'Whole Class Register'}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <ActionIcon
                        variant="subtle"
                        color="statusRed"
                        size="sm"
                        onClick={() => setDeletingAssignmentId(a.id)}
                        title="Remove Assignment"
                      >
                        <Trash2 size={15} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      {/* TAB 6: BACKUP & RECOVERY */}
      {activeTab === 'backup' && (
        <Stack gap="md">
          {/* Safety Notice Banner */}
          <Alert
            icon={<AlertTriangle size={18} />}
            title="Emergency Data Protection Notice (PR-002 Safety Baseline)"
            color="statusAmber"
            radius="md"
          >
            <Text size="sm">
              Destructive Database Restore and Demo Re-seed endpoints are <strong>disabled</strong> to prevent data corruption and accidental table wiping. Read-only backup JSON export is fully operational.
            </Text>
          </Alert>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            {/* Export Card */}
            <Paper p="lg" radius="md" withBorder bg="white">
              <Group gap="xs" mb="xs">
                <Download size={20} style={{ color: 'var(--mantine-color-refinedBlue-6, #2563eb)' }} />
                <Title order={4} fw={700} c="slate.8">
                  System Database Backup
                </Title>
              </Group>
              <Text size="sm" c="dimmed" mb="md">
                Download an immutable JSON snapshot of all tables, including student registries, historical attendance logs, examination marks, and leadership authorisations.
              </Text>

              <Button
                color="refinedBlue"
                leftSection={<Download size={16} />}
                onClick={handleDownloadBackup}
                loading={backupExporting}
              >
                Export & Download Backup
              </Button>

              {backupStatus && (
                <Text size="xs" c="statusGreen.8" mt="xs" fw={600}>
                  {backupStatus}
                </Text>
              )}

              <Box mt="xl" pt="md" style={{ borderTop: '1px solid var(--mantine-color-slate-2, #e2e8f0)' }}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  Pilot Demonstration Reset (Disabled)
                </Text>
                <Text size="xs" c="dimmed" mt={4} mb="sm">
                  Reset endpoint is locked. Database reset operations must be run strictly via authenticated offline CLI scripts in staging environments.
                </Text>
                <Button
                  variant="default"
                  size="xs"
                  disabled
                  leftSection={<RotateCcw size={14} />}
                >
                  Re-seed Demo Database (Disabled)
                </Button>
              </Box>
            </Paper>

            {/* Restore Card (Safety Locked) */}
            <Paper p="lg" radius="md" withBorder bg="slate.0" style={{ opacity: 0.9 }}>
              <Group justify="space-between" mb="xs">
                <Group gap="xs">
                  <Lock size={20} style={{ color: 'var(--mantine-color-statusAmber-7, #d97706)' }} />
                  <Title order={4} fw={700} c="slate.8">
                    Restore Snapshot (Locked)
                  </Title>
                </Group>
                <Badge color="statusAmber" variant="filled" size="sm">
                  Safety Locked
                </Badge>
              </Group>

              <Text size="sm" c="dimmed" mb="md">
                Restoration operations are locked to prevent unrecoverable data loss in production environments.
              </Text>

              <Textarea
                rows={6}
                disabled
                placeholder="Restore operations are locked to prevent unrecoverable data loss..."
                style={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.6 }}
                mb="md"
              />

              <Button
                variant="default"
                disabled
                leftSection={<Upload size={16} />}
              >
                Restore Endpoint Disabled (Safety Containment)
              </Button>
            </Paper>
          </SimpleGrid>
        </Stack>
      )}

      {/* ----------------- MODALS ----------------- */}

      {/* 1. Add / Edit Section Modal */}
      <Modal
        opened={showSectionModal}
        onClose={() => setShowSectionModal(false)}
        title={
          <Text fw={700} size="md" c="slate.8">
            {editingSection ? 'Edit School Section' : 'Create New School Section'}
          </Text>
        }
        radius="md"
      >
        <form onSubmit={handleSaveSection}>
          <Stack gap="sm">
            <TextInput
              label="Section Name"
              placeholder="e.g. Junior Secondary (Grades 6–9)"
              required
              value={sectionFormData.name}
              onChange={(e) => setSectionFormData({ ...sectionFormData, name: e.target.value })}
            />

            <TextInput
              label="Section Code"
              placeholder="e.g. SEC-JUNIOR"
              required
              value={sectionFormData.code}
              onChange={(e) => setSectionFormData({ ...sectionFormData, code: e.target.value.toUpperCase() })}
            />

            <Textarea
              label="Description (Optional)"
              placeholder="Administrative scope, building wings, or target grades..."
              rows={3}
              value={sectionFormData.description}
              onChange={(e) => setSectionFormData({ ...sectionFormData, description: e.target.value })}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setShowSectionModal(false)}>
                Cancel
              </Button>
              <Button color="refinedBlue" type="submit" loading={sectionSaving}>
                {editingSection ? 'Save Changes' : 'Create Section'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* 2. Assign Classes to Section Modal */}
      <Modal
        opened={showAssignClassesModal && !!targetSectionForClasses}
        onClose={() => setShowAssignClassesModal(false)}
        title={
          <Box>
            <Text fw={700} size="md" c="slate.8">
              Link Classes to Section
            </Text>
            <Text size="xs" c="dimmed">
              Section: <strong>{targetSectionForClasses?.name}</strong> ({targetSectionForClasses?.code})
            </Text>
          </Box>
        }
        size="lg"
        radius="md"
      >
        <form onSubmit={handleSaveAssignedClasses}>
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              Select all class divisions belonging to this section:
            </Text>

            <ScrollArea.Autosize mah={300} type="always">
              <Stack gap={6} p={4}>
                {classes.map((cls) => {
                  const isChecked = selectedClassIdsForSection.includes(cls.id);
                  const isOtherSection = cls.section_id && cls.section_id !== targetSectionForClasses?.id;
                  return (
                    <Paper
                      key={cls.id}
                      p="xs"
                      radius="sm"
                      withBorder
                      bg={isChecked ? 'refinedBlue.0' : 'white'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        if (isChecked) {
                          setSelectedClassIdsForSection(selectedClassIdsForSection.filter((id) => id !== cls.id));
                        } else {
                          setSelectedClassIdsForSection([...selectedClassIdsForSection, cls.id]);
                        }
                      }}
                    >
                      <Group justify="space-between">
                        <Group gap="xs">
                          <Checkbox
                            checked={isChecked}
                            onChange={() => {}} // handled by paper onClick
                          />
                          <Text size="sm" fw={600} c="slate.8">{cls.name}</Text>
                          <Badge size="xs" variant="light" color="slate">Grade {cls.grade}</Badge>
                        </Group>
                        {isOtherSection && (
                          <Badge size="xs" variant="light" color="statusAmber">
                            Currently in {cls.section_name || 'another section'}
                          </Badge>
                        )}
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            </ScrollArea.Autosize>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setShowAssignClassesModal(false)}>
                Cancel
              </Button>
              <Button color="refinedBlue" type="submit" loading={assignClassesLoading}>
                Save Linked Classes ({selectedClassIdsForSection.length})
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* 3. Assign Section Head Modal */}
      <Modal
        opened={showAssignHeadModal && !!targetSectionForHead}
        onClose={() => setShowAssignHeadModal(false)}
        title={
          <Box>
            <Text fw={700} size="md" c="slate.8">
              Assign Sectional Head
            </Text>
            <Text size="xs" c="dimmed">
              Section: <strong>{targetSectionForHead?.name}</strong>
            </Text>
          </Box>
        }
        radius="md"
      >
        <form onSubmit={handleSaveSectionHead}>
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              Select a faculty or staff member to assign supervisory inspection access for this section:
            </Text>

            <Select
              label="Faculty Member"
              placeholder="Select Supervisor..."
              required
              value={selectedHeadUserId}
              onChange={(val) => setSelectedHeadUserId(val || '')}
              data={users.map((u) => ({
                value: String(u.id),
                label: `${u.full_name} (${u.username} • ${u.role})`
              }))}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setShowAssignHeadModal(false)}>
                Cancel
              </Button>
              <Button color="refinedBlue" type="submit" loading={assignHeadLoading}>
                Assign as Section Head
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* 4. Manage Class Teachers Modal */}
      <Modal
        opened={showClassTeachersModal && !!targetClassForTeachers}
        onClose={() => setShowClassTeachersModal(false)}
        title={
          <Box>
            <Text fw={700} size="md" c="slate.8">
              Manage Homeroom Class Teachers
            </Text>
            <Text size="xs" c="dimmed">
              Class: <strong>{targetClassForTeachers?.name}</strong> (Grade {targetClassForTeachers?.grade})
            </Text>
          </Box>
        }
        radius="md"
      >
        <Stack gap="md">
          <Box>
            <Text size="xs" fw={700} c="slate.7" mb="xs" tt="uppercase">
              Currently Assigned Teachers ({currentClassTeachers.length})
            </Text>

            {currentClassTeachers.length === 0 ? (
              <Paper p="sm" radius="sm" withBorder bg="slate.0">
                <Text size="xs" c="statusAmber.8" fs="italic">
                  No class teachers currently assigned.
                </Text>
              </Paper>
            ) : (
              <Stack gap={6}>
                {currentClassTeachers.map((t: any) => (
                  <Paper key={t.id} p="xs" radius="sm" withBorder bg="slate.0">
                    <Group justify="space-between">
                      <Box>
                        <Text size="sm" fw={600} c="slate.8">{t.full_name}</Text>
                        <Text size="xs" c="dimmed">{t.email || t.username}</Text>
                      </Box>
                      <Button
                        variant="subtle"
                        color="statusRed"
                        size="xs"
                        onClick={() => handleRemoveClassTeacher(t.id)}
                        loading={classTeacherLoading}
                      >
                        Remove
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>

          <Box pt="sm" style={{ borderTop: '1px solid var(--mantine-color-slate-2, #e2e8f0)' }}>
            <form onSubmit={handleAddClassTeacher}>
              <Text size="xs" fw={700} c="slate.7" mb="xs" tt="uppercase">
                Assign Additional Teacher
              </Text>
              <Group align="flex-end" gap="xs">
                <Select
                  placeholder="Select Faculty Member..."
                  required
                  value={selectedTeacherIdForClass}
                  onChange={(val) => setSelectedTeacherIdForClass(val || '')}
                  data={users
                    .filter((u) => !currentClassTeachers.some((ct: any) => ct.id === u.id))
                    .map((u) => ({
                      value: String(u.id),
                      label: `${u.full_name} (${u.username})`
                    }))}
                  style={{ flex: 1 }}
                />
                <Button color="refinedBlue" type="submit" loading={classTeacherLoading}>
                  Assign
                </Button>
              </Group>
            </form>
          </Box>

          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setShowClassTeachersModal(false)}>
              Done
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 5. Add User Account Modal */}
      <Modal
        opened={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        title={
          <Text fw={700} size="md" c="slate.8">
            Create Faculty User Account
          </Text>
        }
        radius="md"
      >
        <form onSubmit={handleCreateUser}>
          <Stack gap="sm">
            <TextInput
              label="Full Name"
              placeholder="e.g. Mrs. Sunethra Jayasinghe"
              required
              value={userFormData.full_name}
              onChange={(e) => setUserFormData({ ...userFormData, full_name: e.target.value })}
            />

            <TextInput
              label="Username"
              placeholder="e.g. teacher_sunethra"
              required
              value={userFormData.username}
              onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
            />

            <TextInput
              label="Email Address"
              type="email"
              placeholder="teacher@kcc.edu.lk"
              required
              value={userFormData.email}
              onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
            />

            <PasswordInput
              label="Temporary Password"
              placeholder="••••••••"
              required
              minLength={8}
              value={userFormData.password}
              onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
              description="Minimum 8 characters with letters and numbers."
            />

            <Select
              label="System Role"
              required
              value={userFormData.role}
              onChange={(val) => setUserFormData({ ...userFormData, role: val || 'class_teacher' })}
              data={[
                { value: 'class_teacher', label: 'Class Teacher' },
                { value: 'subject_teacher', label: 'Subject Teacher' },
                { value: 'admin', label: 'Administrator / Principal' }
              ]}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setShowAddUserModal(false)}>
                Cancel
              </Button>
              <Button color="refinedBlue" type="submit" loading={createUserLoading}>
                Create Account
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* 6. Add Assignment Modal */}
      <Modal
        opened={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title={
          <Text fw={700} size="md" c="slate.8">
            Assign Teacher to Class / Subject
          </Text>
        }
        radius="md"
      >
        <form onSubmit={handleCreateAssignment}>
          <Stack gap="sm">
            <Select
              label="Select Faculty Member"
              placeholder="Select Teacher..."
              required
              value={assignFormData.teacher_id}
              onChange={(val) => setAssignFormData({ ...assignFormData, teacher_id: val || '' })}
              data={users.map((u) => ({
                value: String(u.id),
                label: `${u.full_name} (${u.username})`
              }))}
            />

            <Select
              label="Assignment Type"
              required
              value={assignFormData.assignment_type}
              onChange={(val) => setAssignFormData({ ...assignFormData, assignment_type: val || 'class_teacher' })}
              data={[
                { value: 'class_teacher', label: 'Class Teacher (Daily Attendance & Roster)' },
                { value: 'subject_teacher', label: 'Subject Teacher (Marks Entry)' }
              ]}
            />

            <Select
              label="Class Division (Grade 6–13)"
              placeholder="Select Class..."
              required
              value={assignFormData.class_id}
              onChange={(val) => setAssignFormData({ ...assignFormData, class_id: val || '' })}
              data={classes.map((c) => ({
                value: String(c.id),
                label: c.name
              }))}
            />

            {assignFormData.assignment_type === 'subject_teacher' && (
              <Select
                label="Assigned Subject"
                placeholder="Select Subject..."
                required
                value={assignFormData.subject_id}
                onChange={(val) => setAssignFormData({ ...assignFormData, subject_id: val || '' })}
                data={subjects.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} (${s.code})`
                }))}
              />
            )}

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setShowAssignModal(false)}>
                Cancel
              </Button>
              <Button color="refinedBlue" type="submit" loading={createAssignLoading}>
                Save Assignment
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Confirm Delete Section Modal */}
      <ConfirmModal
        opened={!!deletingSection}
        onClose={() => setDeletingSection(null)}
        onConfirm={handleConfirmDeleteSection}
        title="Delete School Section"
        message={`Are you sure you want to delete section "${deletingSection?.name}"? Linked classroom units will be unassigned, but their student enrollments and records will remain completely intact.`}
        confirmLabel="Delete Section"
        confirmColor="statusRed"
        loading={deleteSectionLoading}
      />

      {/* Confirm Delete Assignment Modal */}
      <ConfirmModal
        opened={!!deletingAssignmentId}
        onClose={() => setDeletingAssignmentId(null)}
        onConfirm={handleConfirmDeleteAssignment}
        title="Remove Teacher Assignment"
        message="Are you sure you want to remove this teacher assignment? Historical attendance and submitted marks will remain untouched."
        confirmLabel="Remove"
        confirmColor="statusRed"
        loading={deleteAssignLoading}
      />
    </Stack>
  );
};

export default AdminSettings;

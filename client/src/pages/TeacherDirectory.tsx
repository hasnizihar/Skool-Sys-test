import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Mail,
  School,
  BookOpen,
  Layers,
  CheckCircle2,
  XCircle,
  Eye,
  RotateCcw,
  ShieldCheck,
  GraduationCap,
  AlertCircle,
  Filter
} from 'lucide-react';
import {
  Paper,
  Text,
  Title,
  Group,
  Stack,
  SimpleGrid,
  Box,
  Badge,
  Button,
  ScrollArea,
  Modal,
  Divider,
  Alert,
  Tooltip,
  ActionIcon
} from '@mantine/core';
import { api } from '../api/client';
import { EmptyState, LoadingState, ErrorState } from '../ui/mantine';

interface TeacherDirectoryProps {
  onAddUser?: () => void;
  onManageAssignments?: () => void;
}

export const TeacherDirectory: React.FC<TeacherDirectoryProps> = ({
  onAddUser,
  onManageAssignments
}) => {
  const [users, setUsers] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedResponsibility, setSelectedResponsibility] = useState<string>('all');

  // Teacher Profile / Detail Modal
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    loadFacultyData();
  }, []);

  const loadFacultyData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [uRes, aRes, cRes, secRes] = await Promise.all([
        api.getUsers(),
        api.getAssignments().catch(() => ({ assignments: [] })),
        api.getClasses().catch(() => ({ classes: [] })),
        api.getSections().catch(() => ({ sections: [] }))
      ]);

      setUsers(uRes.users || []);
      setAssignments(aRes.assignments || []);
      setClasses(cRes.classes || []);
      setSections(secRes.sections || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load faculty and teacher records.');
    } finally {
      setLoading(false);
    }
  };

  // Build aggregated teacher model with multi-responsibility mappings
  const facultyMembers = useMemo(() => {
    return users.map((u) => {
      // 1. Class Teacher roles from classes and assignments
      const ctClasses = new Set<string>();
      classes.forEach((c) => {
        if (c.class_teacher_id === u.id || (c.class_teachers && c.class_teachers.some((t: any) => t.id === u.id))) {
          ctClasses.add(c.name);
        }
      });
      assignments.forEach((a) => {
        if (a.teacher_id === u.id && a.assignment_type === 'class_teacher' && a.class_name) {
          ctClasses.add(a.class_name);
        }
      });

      // 2. Subject assignments
      const subjectList: Array<{ subject_name: string; subject_code?: string; class_name: string }> = [];
      assignments.forEach((a) => {
        if (a.teacher_id === u.id && a.assignment_type === 'subject_teacher') {
          subjectList.push({
            subject_name: a.subject_name || 'Subject',
            subject_code: a.subject_code,
            class_name: a.class_name || 'Class'
          });
        }
      });

      // 3. Section Head roles
      const sectionHeadList: string[] = [];
      sections.forEach((sec) => {
        if (sec.section_heads && sec.section_heads.some((h: any) => h.id === u.id)) {
          sectionHeadList.push(sec.name);
        }
      });

      return {
        ...u,
        classTeacherClasses: Array.from(ctClasses),
        subjectAssignments: subjectList,
        sectionHeadSections: sectionHeadList,
        isClassTeacher: ctClasses.size > 0,
        isSectionHead: sectionHeadList.length > 0,
        isSubjectTeacher: subjectList.length > 0
      };
    });
  }, [users, assignments, classes, sections]);

  // Filtered teachers
  const filteredTeachers = useMemo(() => {
    return facultyMembers.filter((t) => {
      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = t.full_name?.toLowerCase().includes(q);
        const matchesUser = t.username?.toLowerCase().includes(q);
        const matchesEmail = t.email?.toLowerCase().includes(q);
        const matchesSubject = t.subjectAssignments.some((s: any) =>
          s.subject_name.toLowerCase().includes(q) || s.class_name.toLowerCase().includes(q)
        );
        const matchesClass = t.classTeacherClasses.some((c: string) => c.toLowerCase().includes(q));
        if (!matchesName && !matchesUser && !matchesEmail && !matchesSubject && !matchesClass) {
          return false;
        }
      }

      // Role filter
      if (selectedRole !== 'all' && t.role !== selectedRole) {
        return false;
      }

      // Status filter
      if (selectedStatus === 'active' && !t.is_active) return false;
      if (selectedStatus === 'deactivated' && t.is_active) return false;

      // Responsibility filter
      if (selectedResponsibility === 'class_teacher' && !t.isClassTeacher) return false;
      if (selectedResponsibility === 'section_head' && !t.isSectionHead) return false;
      if (selectedResponsibility === 'subject_teacher' && !t.isSubjectTeacher) return false;

      return true;
    });
  }, [facultyMembers, searchQuery, selectedRole, selectedStatus, selectedResponsibility]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = facultyMembers.length;
    const active = facultyMembers.filter((t) => t.is_active).length;
    const classTeachers = facultyMembers.filter((t) => t.isClassTeacher).length;
    const sectionHeads = facultyMembers.filter((t) => t.isSectionHead).length;
    return { total, active, classTeachers, sectionHeads };
  }, [facultyMembers]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || selectedRole !== 'all' || selectedStatus !== 'all' || selectedResponsibility !== 'all'
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedRole('all');
    setSelectedStatus('all');
    setSelectedResponsibility('all');
  };

  const handleToggleStatus = async (teacher: any) => {
    const action = teacher.is_active ? 'deactivate' : 'activate';
    const confirm = window.confirm(
      `Are you sure you want to ${action} the account for "${teacher.full_name}"?\n` +
      (teacher.is_active
        ? 'Deactivating this user will revoke their active session tokens immediately.'
        : 'Activating this user will restore their system login privileges.')
    );
    if (!confirm) return;

    try {
      setTogglingId(teacher.id);
      await api.updateUser(teacher.id, { is_active: !teacher.is_active });
      await loadFacultyData();
      if (selectedTeacher && selectedTeacher.id === teacher.id) {
        setSelectedTeacher({ ...selectedTeacher, is_active: !teacher.is_active });
      }
    } catch (err: any) {
      alert(`Failed to update account status: ${err.message}`);
    } finally {
      setTogglingId(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge color="refinedBlue" variant="light" size="sm">Administrator</Badge>;
      case 'class_teacher':
        return <Badge color="statusGreen" variant="light" size="sm">Teacher</Badge>;
      default:
        return <Badge color="slate" variant="light" size="sm">{role.replace('_', ' ')}</Badge>;
    }
  };

  if (loading) {
    return (
      <Box py="xl">
        <LoadingState message="Loading faculty directory, class teachers, and subject allocations..." minHeight={200} />
      </Box>
    );
  }

  if (error) {
    return (
      <Paper withBorder p="xl" radius="md">
        <ErrorState
          title="Failed to Load Teachers Directory"
          message={error}
          onRetry={loadFacultyData}
        />
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {/* KPI Metric Summary Cards */}
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="sm">
        <Paper withBorder radius="md" p="md" bg="var(--bg-surface, #ffffff)">
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.04em">
                Total Faculty
              </Text>
              <Text size="xl" fw={800} c="slate.9" style={{ fontSize: '1.65rem', lineHeight: 1.1 }}>
                {metrics.total}
              </Text>
            </Stack>
            <Box
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: 'var(--primary-light, #eff6ff)',
                color: 'var(--primary, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Users size={22} />
            </Box>
          </Group>
        </Paper>

        <Paper withBorder radius="md" p="md" bg="var(--bg-surface, #ffffff)">
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.04em">
                Active Staff
              </Text>
              <Text size="xl" fw={800} c="statusGreen.7" style={{ fontSize: '1.65rem', lineHeight: 1.1 }}>
                {metrics.active}
              </Text>
            </Stack>
            <Box
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: 'var(--present-bg, #ecfdf5)',
                color: 'var(--present, #10b981)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <CheckCircle2 size={22} />
            </Box>
          </Group>
        </Paper>

        <Paper withBorder radius="md" p="md" bg="var(--bg-surface, #ffffff)">
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.04em">
                Class Teachers
              </Text>
              <Text size="xl" fw={800} c="refinedBlue.7" style={{ fontSize: '1.65rem', lineHeight: 1.1 }}>
                {metrics.classTeachers}
              </Text>
            </Stack>
            <Box
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: 'var(--primary-light, #eff6ff)',
                color: 'var(--primary, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <School size={22} />
            </Box>
          </Group>
        </Paper>

        <Paper withBorder radius="md" p="md" bg="var(--bg-surface, #ffffff)">
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.04em">
                Section Heads
              </Text>
              <Text size="xl" fw={800} c="statusAmber.7" style={{ fontSize: '1.65rem', lineHeight: 1.1 }}>
                {metrics.sectionHeads}
              </Text>
            </Stack>
            <Box
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: 'var(--late-bg, #fffbeb)',
                color: 'var(--late, #d97706)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Layers size={22} />
            </Box>
          </Group>
        </Paper>
      </SimpleGrid>

      {/* Filter Toolbar */}
      <Paper withBorder radius="md" p="md" bg="var(--bg-surface, #ffffff)">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Group gap="sm" style={{ flex: '1 1 280px' }}>
            <Box style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Search by faculty name, username, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.25rem', height: 38, width: '100%' }}
              />
            </Box>

            <select
              className="form-select"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              style={{ height: 38, width: 'auto', minWidth: 140 }}
            >
              <option value="all">All Roles</option>
              <option value="class_teacher">Teacher</option>
              <option value="admin">Administrator</option>
            </select>

            <select
              className="form-select"
              value={selectedResponsibility}
              onChange={(e) => setSelectedResponsibility(e.target.value)}
              style={{ height: 38, width: 'auto', minWidth: 160 }}
            >
              <option value="all">All Responsibilities</option>
              <option value="class_teacher">Class Teachers Only</option>
              <option value="section_head">Section Heads Only</option>
            </select>

            <select
              className="form-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{ height: 38, width: 'auto', minWidth: 120 }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </Group>

          {hasActiveFilters && (
            <Button
              variant="subtle"
              color="refinedBlue"
              size="xs"
              leftSection={<RotateCcw size={14} />}
              onClick={handleResetFilters}
            >
              Reset Filters
            </Button>
          )}
        </Group>
      </Paper>

      {/* Teachers Directory Table */}
      <Paper withBorder radius="md" bg="var(--bg-surface, #ffffff)" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th>Faculty Member</th>
                <th style={{ width: '130px' }}>Role</th>
                <th style={{ width: '110px' }}>Status</th>
                <th>Assigned Class(es)</th>
                <th>Subject Allocation</th>
                <th>Section Leadership</th>
                <th style={{ textAlign: 'right', width: '140px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeachers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2.5rem 1rem' }}>
                    <EmptyState
                      icon={<Users size={32} />}
                      title="No Faculty Members Found"
                      description={
                        hasActiveFilters
                          ? 'No teachers match the active search and filter criteria.'
                          : 'No faculty accounts have been registered.'
                      }
                      action={
                        hasActiveFilters ? (
                          <Button
                            variant="light"
                            color="refinedBlue"
                            size="xs"
                            onClick={handleResetFilters}
                          >
                            Clear Filters
                          </Button>
                        ) : undefined
                      }
                      withBorder={false}
                    />
                  </td>
                </tr>
              ) : (
                filteredTeachers.map((teacher) => (
                  <tr key={teacher.id}>
                    <td>
                      <Group gap="sm" wrap="nowrap">
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: teacher.role === 'admin' ? '#1e40af' : '#2563eb',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            flexShrink: 0
                          }}
                        >
                          {teacher.full_name?.charAt(0) || 'T'}
                        </div>
                        <Stack gap={1}>
                          <Text fw={650} size="sm" c="slate.9">
                            {teacher.full_name}
                          </Text>
                          <Group gap="xs">
                            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                              @{teacher.username}
                            </Text>
                            <Text size="xs" c="dimmed">•</Text>
                            <a
                              href={`mailto:${teacher.email}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: '0.75rem',
                                color: 'var(--primary, #2563eb)',
                                textDecoration: 'none'
                              }}
                            >
                              <Mail size={11} /> {teacher.email}
                            </a>
                          </Group>
                        </Stack>
                      </Group>
                    </td>

                    <td>{getRoleBadge(teacher.role)}</td>

                    <td>
                      <Badge
                        color={teacher.is_active ? 'statusGreen' : 'statusRed'}
                        variant="light"
                        size="sm"
                      >
                        {teacher.is_active ? 'Active' : 'Deactivated'}
                      </Badge>
                    </td>

                    <td>
                      {teacher.classTeacherClasses.length > 0 ? (
                        <Group gap={4} wrap="wrap">
                          {teacher.classTeacherClasses.map((clsName: string, i: number) => (
                            <Badge
                              key={i}
                              color="statusGreen"
                              variant="outline"
                              size="xs"
                              radius="sm"
                              leftSection={<School size={10} />}
                            >
                              {clsName}
                            </Badge>
                          ))}
                        </Group>
                      ) : (
                        <Text size="xs" c="dimmed" fs="italic">
                          None
                        </Text>
                      )}
                    </td>

                    <td>
                      {teacher.subjectAssignments.length > 0 ? (
                        <Group gap={4} wrap="wrap">
                          {teacher.subjectAssignments.map((sa: any, i: number) => (
                            <Badge
                              key={i}
                              color="refinedBlue"
                              variant="outline"
                              size="xs"
                              radius="sm"
                              leftSection={<BookOpen size={10} />}
                            >
                              {sa.subject_name} ({sa.class_name})
                            </Badge>
                          ))}
                        </Group>
                      ) : (
                        <Text size="xs" c="dimmed" fs="italic">
                          No subjects assigned
                        </Text>
                      )}
                    </td>

                    <td>
                      {teacher.sectionHeadSections.length > 0 ? (
                        <Group gap={4} wrap="wrap">
                          {teacher.sectionHeadSections.map((secName: string, i: number) => (
                            <Badge
                              key={i}
                              color="statusAmber"
                              variant="light"
                              size="xs"
                              radius="sm"
                              leftSection={<Layers size={10} />}
                            >
                              {secName}
                            </Badge>
                          ))}
                        </Group>
                      ) : (
                        <Text size="xs" c="dimmed" fs="italic">
                          —
                        </Text>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <Group gap="xs" justify="flex-end">
                        <Button
                          variant="light"
                          color="refinedBlue"
                          size="xs"
                          leftSection={<Eye size={13} />}
                          onClick={() => {
                            setSelectedTeacher(teacher);
                            setShowDetailModal(true);
                          }}
                        >
                          Dossier
                        </Button>
                        <Button
                          variant="subtle"
                          color={teacher.is_active ? 'red' : 'green'}
                          size="xs"
                          loading={togglingId === teacher.id}
                          onClick={() => handleToggleStatus(teacher)}
                        >
                          {teacher.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </Group>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollArea>
      </Paper>

      {/* Teacher Profile / Detail Modal */}
      <Modal
        opened={showDetailModal && !!selectedTeacher}
        onClose={() => setShowDetailModal(false)}
        title={
          selectedTeacher && (
            <Group gap="sm">
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: selectedTeacher.role === 'admin' ? '#1e40af' : '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.9rem'
                }}
              >
                {selectedTeacher.full_name?.charAt(0) || 'T'}
              </div>
              <Stack gap={0}>
                <Text fw={700} size="sm">{selectedTeacher.full_name}</Text>
                <Text size="xs" c="dimmed">
                  @{selectedTeacher.username} • Account ID: #{selectedTeacher.id}
                </Text>
              </Stack>
            </Group>
          )
        }
        size="lg"
        radius="md"
        centered
      >
        {selectedTeacher && (
          <Stack gap="md">
            {/* Account Status & Role */}
            <Paper withBorder p="sm" radius="md" bg="var(--bg-subtle, #f8fafc)">
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                <div>
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase">System Role</Text>
                  <Box mt={4}>{getRoleBadge(selectedTeacher.role)}</Box>
                </div>
                <div>
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase">Login Status</Text>
                  <Badge
                    mt={4}
                    color={selectedTeacher.is_active ? 'statusGreen' : 'statusRed'}
                    variant="light"
                  >
                    {selectedTeacher.is_active ? 'Active Account' : 'Deactivated'}
                  </Badge>
                </div>
                <div>
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase">Email Address</Text>
                  <Text size="sm" fw={600} mt={4}>{selectedTeacher.email}</Text>
                </div>
              </SimpleGrid>
            </Paper>

            {/* Class Teacher Assignments */}
            <Box>
              <Group gap="xs" mb="xs">
                <School size={16} color="var(--primary, #2563eb)" />
                <Text fw={650} size="sm">Class Teacher Appointments</Text>
              </Group>
              {selectedTeacher.classTeacherClasses.length > 0 ? (
                <Group gap="xs">
                  {selectedTeacher.classTeacherClasses.map((cls: string, i: number) => (
                    <Badge key={i} color="statusGreen" variant="light" size="md">
                      {cls} (Class Teacher)
                    </Badge>
                  ))}
                </Group>
              ) : (
                <Text size="sm" c="dimmed">
                  No active Class Teacher appointments assigned to this faculty member.
                </Text>
              )}
            </Box>

            <Divider />

            {/* Subject Allocations */}
            <Box>
              <Group gap="xs" mb="xs">
                <BookOpen size={16} color="var(--primary, #2563eb)" />
                <Text fw={650} size="sm">Subject Allocations & Classes</Text>
              </Group>
              {selectedTeacher.subjectAssignments.length > 0 ? (
                <ScrollArea mah={140}>
                  <table className="data-table" style={{ fontSize: '0.8rem', width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Subject Name</th>
                        <th>Subject Code</th>
                        <th>Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTeacher.subjectAssignments.map((sa: any, i: number) => (
                        <tr key={i}>
                          <td><strong>{sa.subject_name}</strong></td>
                          <td><code>{sa.subject_code || '—'}</code></td>
                          <td>{sa.class_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              ) : (
                <Text size="sm" c="dimmed">
                  No subject teaching allocations recorded for this faculty member.
                </Text>
              )}
            </Box>

            <Divider />

            {/* Section Head Responsibilities */}
            <Box>
              <Group gap="xs" mb="xs">
                <Layers size={16} color="var(--primary, #2563eb)" />
                <Text fw={650} size="sm">Sectional Leadership & Oversight</Text>
              </Group>
              {selectedTeacher.sectionHeadSections.length > 0 ? (
                <Group gap="xs">
                  {selectedTeacher.sectionHeadSections.map((sec: string, i: number) => (
                    <Badge key={i} color="statusAmber" variant="light" size="md">
                      {sec} (Section Head)
                    </Badge>
                  ))}
                </Group>
              ) : (
                <Text size="sm" c="dimmed">
                  This faculty member does not currently serve as a Section Head.
                </Text>
              )}
            </Box>

            <Divider />

            {/* Modal Actions */}
            <Group justify="space-between" align="center">
              <Button
                variant="light"
                color={selectedTeacher.is_active ? 'red' : 'green'}
                size="xs"
                onClick={() => handleToggleStatus(selectedTeacher)}
              >
                {selectedTeacher.is_active ? 'Deactivate Account' : 'Reactivate Account'}
              </Button>
              <Button variant="default" onClick={() => setShowDetailModal(false)}>
                Close
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Upload,
  Download,
  Eye,
  X,
  Phone,
  Calendar,
  FileSpreadsheet,
  Maximize2,
  CheckCircle2,
  UserCheck,
  Building,
  RotateCcw,
  Sparkles,
  School,
  AlertCircle
} from 'lucide-react';
import {
  Modal,
  Badge,
  Paper,
  Text,
  Title,
  Group,
  Stack,
  SimpleGrid,
  Box,
  Divider,
  Alert,
  Tooltip,
  ScrollArea,
  Button
} from '@mantine/core';
import { api } from '../api/client';
import { StudentFullView } from './StudentFullView';
import { EmptyState, LoadingState } from '../ui/mantine';
import './students.css';

interface StudentsProps {
  user: any;
}

export const Students: React.FC<StudentsProps> = ({ user }) => {
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [grades, setGrades] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Full View State
  const [fullViewStudentId, setFullViewStudentId] = useState<number | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [studentDetails, setStudentDetails] = useState<any | null>(null);

  // Add Student Form State
  const [formData, setFormData] = useState({
    admission_no: '',
    full_name: '',
    calling_name: '',
    dob: '2012-05-15',
    gender: 'Male',
    address: '',
    guardian_name: '',
    guardian_relation: 'Father',
    guardian_phone: '',
    guardian_email: '',
    class_id: '',
    roll_number: ''
  });
  const [formError, setFormError] = useState<string | null>(null);

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [searchQuery, selectedGrade, selectedClass, selectedStatus]);

  const loadInitialData = async () => {
    try {
      const [classRes, gradeRes] = await Promise.all([
        api.getClasses(),
        api.getGrades()
      ]);
      setClasses(classRes.classes || []);
      setGrades(gradeRes.grades || []);
    } catch (err) {
      console.error('Failed to load classes or grades:', err);
    }
  };

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const res = await api.getStudents({
        q: searchQuery,
        grade: selectedGrade ? Number(selectedGrade) : undefined,
        classId: selectedClass ? Number(selectedClass) : undefined,
        status: selectedStatus || undefined
      });
      setStudents(res.students || []);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProfile = async (st: any) => {
    setSelectedStudent(st);
    setShowProfileModal(true);
    try {
      const details = await api.getStudent(st.id);
      setStudentDetails(details);
    } catch (err) {
      console.error('Failed to fetch student details:', err);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setFormError(null);
      await api.createStudent(formData);
      setShowAddModal(false);
      setFormData({
        admission_no: '',
        full_name: '',
        calling_name: '',
        dob: '2012-05-15',
        gender: 'Male',
        address: '',
        guardian_name: '',
        guardian_relation: 'Father',
        guardian_phone: '',
        guardian_email: '',
        class_id: '',
        roll_number: ''
      });
      fetchStudents();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create student record.');
    }
  };

  const handleCsvPreview = async () => {
    if (!csvText.trim()) return;

    const lines = csvText.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      alert('CSV must contain a header line and at least one data row.');
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const obj: any = {};
      headers.forEach((h, i) => {
        obj[h] = vals[i] || '';
      });
      return obj;
    });

    try {
      setImporting(true);
      const preview = await api.importCsv(rows, false);
      setImportPreview(preview);
    } catch (err: any) {
      alert(`CSV validation failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleCsvCommit = async () => {
    if (!importPreview || !importPreview.preview) return;
    try {
      setImporting(true);
      const rows = importPreview.preview.map((p: any) => p.data);
      const res = await api.importCsv(rows, true);
      alert(`Success: Imported ${res.importedCount} student records!`);
      setShowImportModal(false);
      setCsvText('');
      setImportPreview(null);
      fetchStudents();
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleExportCsv = () => {
    if (students.length === 0) return;
    const headers = ['Admission No', 'Full Name', 'Calling Name', 'Class', 'Gender', 'Guardian Name', 'Guardian Phone', 'Status'];
    const rows = students.map((s) => [
      s.admission_no,
      `"${s.full_name}"`,
      s.calling_name,
      s.class_name || '',
      s.gender,
      `"${s.guardian_name}"`,
      s.guardian_phone,
      s.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `skoolsys-students-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedGrade('');
    setSelectedClass('');
    setSelectedStatus('');
  };

  const sampleCsvTemplate = `admission_no,full_name,calling_name,dob,gender,guardian_name,guardian_relation,guardian_phone,class_name
SCH-2026-101,Ravindu Nirmal Perera,Ravindu,2012-06-14,Male,Kamal Perera,Father,0771122334,Grade 8-A
SCH-2026-102,Hansani Malsha Jayakody,Hansani,2012-09-21,Female,Geetha Jayakody,Mother,0712233445,Grade 8-A`;

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = students.length;
    const active = students.filter((s) => s.status === 'Active').length;
    const male = students.filter((s) => s.gender === 'Male').length;
    const female = students.filter((s) => s.gender === 'Female').length;
    const uniqueClasses = new Set(students.map((s) => s.class_name).filter(Boolean)).size;
    return { total, active, male, female, uniqueClasses };
  }, [students]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || selectedGrade || selectedClass || selectedStatus
  );

  // Render Full View if a student is selected
  if (fullViewStudentId !== null) {
    return (
      <StudentFullView
        studentId={fullViewStudentId}
        onBack={() => setFullViewStudentId(null)}
        user={user}
        onStudentUpdated={fetchStudents}
      />
    );
  }

  return (
    <div className="students-page">
      {/* Header & Action Bar */}
      <div className="students-header">
        <div className="students-header-titles">
          <div className="students-title-row">
            <h2 className="students-title">Student Information Records</h2>
            <Badge variant="light" color="refinedBlue" size="md">
              {metrics.total} Registered Pupils
            </Badge>
          </div>
          <p className="students-subtitle">
            Permanent admission registry, class enrollment rosters, and verified guardian contact records.
          </p>
        </div>

        <div className="students-header-actions">
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn btn-secondary btn-sm"
            title="Export filtered student records as CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>

          {user?.role === 'admin' && (
            <>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="btn btn-secondary btn-sm"
                title="Bulk import students via CSV"
              >
                <Upload size={14} />
                <span>Bulk CSV Import</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="btn btn-primary btn-sm"
                title="Register a new student admission"
              >
                <Plus size={14} />
                <span>Add New Student</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary KPI Metric Cards */}
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="sm">
        <Paper withBorder radius="md" p="md" bg="var(--bg-surface, #ffffff)">
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.04em">
                Total Enrolled
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
                Active Pupils
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
              <UserCheck size={22} />
            </Box>
          </Group>
        </Paper>

        <Paper withBorder radius="md" p="md" bg="var(--bg-surface, #ffffff)">
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.04em">
                Gender Breakdown
              </Text>
              <Text size="xl" fw={800} c="slate.9" style={{ fontSize: '1.65rem', lineHeight: 1.1 }}>
                {metrics.male}M <Text component="span" size="sm" c="dimmed" fw={600}>/ {metrics.female}F</Text>
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
              <Calendar size={22} />
            </Box>
          </Group>
        </Paper>

        <Paper withBorder radius="md" p="md" bg="var(--bg-surface, #ffffff)">
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.04em">
                Classes Represented
              </Text>
              <Text size="xl" fw={800} c="refinedBlue.7" style={{ fontSize: '1.65rem', lineHeight: 1.1 }}>
                {metrics.uniqueClasses} <Text component="span" size="xs" c="dimmed" fw={600}>Active</Text>
              </Text>
            </Stack>
            <Box
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: 'var(--excused-bg, #f0fdf4)',
                color: 'var(--excused, #059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Building size={22} />
            </Box>
          </Group>
        </Paper>
      </SimpleGrid>

      {/* Filter & Search Toolbar */}
      <Paper withBorder radius="md" p="md" bg="var(--bg-surface, #ffffff)" className="students-filter-card">
        <div className="students-filter-row">
          <div className="students-search-wrapper">
            <Search size={16} className="students-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="students-search-input"
              placeholder="Search by Admission No, Name, or Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search students"
            />
            {searchQuery && (
              <button
                type="button"
                className="students-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear student search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="students-filter-select-group">
            <select
              className="form-select students-select"
              value={selectedGrade}
              onChange={(e) => {
                setSelectedGrade(e.target.value);
                setSelectedClass('');
              }}
              aria-label="Filter by Grade"
            >
              <option value="">All Grades</option>
              {grades.map((g) => (
                <option key={g} value={g}>Grade {g}</option>
              ))}
            </select>

            <select
              className="form-select students-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              aria-label="Filter by Class"
            >
              <option value="">All Classes</option>
              {classes
                .filter((c) => !selectedGrade || c.grade === Number(selectedGrade))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>

            <select
              className="form-select students-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              aria-label="Filter by Status"
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Transferred">Transferred</option>
              <option value="Graduated">Graduated</option>
            </select>
          </div>
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="students-active-filters-bar">
            <span className="students-active-filters-label">Active Filters:</span>
            {searchQuery && (
              <span className="students-filter-tag">
                Query: "{searchQuery}"
                <button
                  type="button"
                  className="students-filter-tag-close"
                  onClick={() => setSearchQuery('')}
                  aria-label="Remove search filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {selectedGrade && (
              <span className="students-filter-tag">
                Grade: {selectedGrade}
                <button
                  type="button"
                  className="students-filter-tag-close"
                  onClick={() => setSelectedGrade('')}
                  aria-label="Remove grade filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {selectedClass && (
              <span className="students-filter-tag">
                Class: {classes.find((c) => c.id === Number(selectedClass))?.name || selectedClass}
                <button
                  type="button"
                  className="students-filter-tag-close"
                  onClick={() => setSelectedClass('')}
                  aria-label="Remove class filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {selectedStatus && (
              <span className="students-filter-tag">
                Status: {selectedStatus}
                <button
                  type="button"
                  className="students-filter-tag-close"
                  onClick={() => setSelectedStatus('')}
                  aria-label="Remove status filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            <button
              type="button"
              className="students-reset-filters-btn"
              onClick={handleResetFilters}
            >
              Reset Filters
            </button>
          </div>
        )}
      </Paper>

      {/* Student Records Table Card */}
      <Paper withBorder radius="md" bg="var(--bg-surface, #ffffff)" className="students-table-card card" style={{ padding: 0 }}>
        <ScrollArea>
          <table className="students-table data-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Admission No</th>
                <th>Student Full Name</th>
                <th style={{ width: '120px' }}>Class</th>
                <th style={{ width: '90px' }}>Gender</th>
                <th>Guardian Contact</th>
                <th style={{ width: '110px' }}>Status</th>
                <th style={{ textAlign: 'right', width: '170px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3.5rem 1rem' }}>
                    <LoadingState message="Loading student records..." minHeight={120} />
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2.5rem 1rem' }}>
                    <EmptyState
                      icon={<Users size={36} />}
                      title="No Student Records Found"
                      description={
                        hasActiveFilters
                          ? 'No student admissions match the active search criteria and filters.'
                          : 'No students have been enrolled in the registry yet.'
                      }
                      action={
                        hasActiveFilters ? (
                          <Button
                            variant="light"
                            color="refinedBlue"
                            size="xs"
                            leftSection={<RotateCcw size={14} />}
                            onClick={handleResetFilters}
                          >
                            Clear Active Filters
                          </Button>
                        ) : undefined
                      }
                      withBorder={false}
                    />
                  </td>
                </tr>
              ) : (
                students.map((st) => (
                  <tr key={st.id}>
                    <td>
                      <span
                        className="students-adm-badge"
                        onClick={() => setFullViewStudentId(st.id)}
                        title="Click to view comprehensive student dossier"
                      >
                        {st.admission_no}
                      </span>
                    </td>

                    <td>
                      <div className="students-identity-cell">
                        <div
                          className="students-avatar"
                          onClick={() => setFullViewStudentId(st.id)}
                          style={{
                            backgroundColor: st.gender === 'Female' ? '#db2777' : '#2563eb'
                          }}
                          title="Click to view full record"
                          aria-hidden="true"
                        >
                          {st.calling_name?.charAt(0) || st.full_name?.charAt(0) || 'S'}
                        </div>
                        <div className="students-identity-info">
                          <div
                            className="students-name-link"
                            onClick={() => setFullViewStudentId(st.id)}
                            title="Click to view comprehensive full record"
                          >
                            {st.full_name}
                          </div>
                          <div className="students-sub-info">
                            Call Name: <strong>{st.calling_name}</strong> • DOB: {st.dob}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <Badge variant="light" color="slate" size="sm" radius="sm">
                        {st.class_name || 'Unassigned'}
                      </Badge>
                    </td>

                    <td>
                      <Text size="sm" c="slate.7">
                        {st.gender}
                      </Text>
                    </td>

                    <td>
                      <div className="students-guardian-cell">
                        <span className="students-guardian-name">{st.guardian_name}</span>
                        <a
                          href={`tel:${st.guardian_phone}`}
                          className="students-guardian-phone"
                          title="Tap to call guardian"
                        >
                          <Phone size={12} />
                          <span>{st.guardian_phone}</span>
                          <span style={{ color: 'var(--text-muted)' }}>({st.guardian_relation})</span>
                        </a>
                      </div>
                    </td>

                    <td>
                      <span className={`badge ${st.status === 'Active' ? 'badge-present' : 'badge-absent'}`}>
                        {st.status}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setFullViewStudentId(st.id)}
                          className="btn btn-primary btn-sm"
                          style={{ padding: '0.4rem 0.75rem', fontWeight: 600 }}
                          title="Open comprehensive student dossier"
                        >
                          <Maximize2 size={13} />
                          <span>Full View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenProfile(st)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.4rem 0.6rem' }}
                          title="Quick preview modal"
                          aria-label={`Quick preview for ${st.calling_name}`}
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollArea>
      </Paper>

      {/* Add Student Modal */}
      <Modal
        opened={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={
          <Group gap="xs">
            <School size={20} color="var(--primary, #2563eb)" />
            <Text fw={650} size="md">Add New Student Admission</Text>
          </Group>
        }
        size="lg"
        radius="md"
        centered
      >
        <form onSubmit={handleAddSubmit}>
          <Stack gap="md">
            {formError && (
              <Alert icon={<AlertCircle size={16} />} color="red" radius="md">
                {formError}
              </Alert>
            )}

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <div className="form-group">
                <label className="form-label">Admission Number *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.admission_no}
                  onChange={(e) => setFormData({ ...formData, admission_no: e.target.value })}
                  placeholder="e.g. SCH-2026-031"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Calling Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.calling_name}
                  onChange={(e) => setFormData({ ...formData, calling_name: e.target.value })}
                  placeholder="e.g. Kasun"
                  required
                />
              </div>
            </SimpleGrid>

            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                className="form-input"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="e.g. Kasun Malinda Ranasinghe"
                required
              />
            </div>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <div className="form-group">
                <label className="form-label">Date of Birth *</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Gender *</label>
                <select
                  className="form-select"
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <div className="form-group">
                <label className="form-label">Class Assignment</label>
                <select
                  className="form-select"
                  value={formData.class_id}
                  onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                >
                  <option value="">Select Class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Roll Number</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.roll_number}
                  onChange={(e) => setFormData({ ...formData, roll_number: e.target.value })}
                  placeholder="e.g. 21"
                />
              </div>
            </SimpleGrid>

            <div className="form-group">
              <label className="form-label">Residential Address</label>
              <input
                type="text"
                className="form-input"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Home address"
              />
            </div>

            <Divider my="xs" label="Guardian & Emergency Contact" labelPosition="left" />

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <div className="form-group">
                <label className="form-label">Guardian Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.guardian_name}
                  onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })}
                  placeholder="Parent / Guardian name"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Relation *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.guardian_relation}
                  onChange={(e) => setFormData({ ...formData, guardian_relation: e.target.value })}
                  placeholder="Father / Mother / Guardian"
                  required
                />
              </div>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <div className="form-group">
                <label className="form-label">Guardian Phone Number *</label>
                <input
                  type="tel"
                  className="form-input"
                  value={formData.guardian_phone}
                  onChange={(e) => setFormData({ ...formData, guardian_phone: e.target.value })}
                  placeholder="e.g. 0771234567"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Guardian Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={formData.guardian_email}
                  onChange={(e) => setFormData({ ...formData, guardian_email: e.target.value })}
                  placeholder="guardian@example.com"
                />
              </div>
            </SimpleGrid>

            <Group justify="flex-end" gap="sm" mt="md">
              <Button variant="default" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" color="refinedBlue">
                Save Admission Record
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Student Profile Quick Modal */}
      <Modal
        opened={showProfileModal && !!selectedStudent}
        onClose={() => setShowProfileModal(false)}
        title={
          selectedStudent && (
            <Group gap="sm">
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: selectedStudent.gender === 'Female' ? '#db2777' : '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.9rem'
                }}
              >
                {selectedStudent.calling_name?.charAt(0) || selectedStudent.full_name?.charAt(0)}
              </div>
              <Stack gap={0}>
                <Text fw={700} size="sm">{selectedStudent.full_name}</Text>
                <Text size="xs" c="dimmed">
                  Admission ID: <strong>{selectedStudent.admission_no}</strong> • Class: {selectedStudent.class_name || 'N/A'}
                </Text>
              </Stack>
            </Group>
          )
        }
        size="lg"
        radius="md"
        centered
      >
        {selectedStudent && (
          <Stack gap="md">
            {studentDetails ? (
              <>
                {/* Attendance & Key Stats */}
                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                  <Paper withBorder p="xs" radius="md" style={{ textAlign: 'center' }}>
                    <Text size="lg" fw={800} c="statusGreen.7">
                      {studentDetails.attendance?.attendanceRate ?? 100}%
                    </Text>
                    <Text size="xs" c="dimmed">Attendance Rate</Text>
                  </Paper>

                  <Paper withBorder p="xs" radius="md" style={{ textAlign: 'center' }}>
                    <Text size="lg" fw={800} c="slate.8">
                      {studentDetails.attendance?.present_days ?? 0}
                    </Text>
                    <Text size="xs" c="dimmed">Days Present</Text>
                  </Paper>

                  <Paper withBorder p="xs" radius="md" style={{ textAlign: 'center' }}>
                    <Text size="lg" fw={800} c="statusRed.7">
                      {studentDetails.attendance?.absent_days ?? 0}
                    </Text>
                    <Text size="xs" c="dimmed">Days Absent</Text>
                  </Paper>

                  <Paper withBorder p="xs" radius="md" style={{ textAlign: 'center' }}>
                    <Text size="lg" fw={800} c="statusAmber.7">
                      {studentDetails.attendance?.late_days ?? 0}
                    </Text>
                    <Text size="xs" c="dimmed">Days Late</Text>
                  </Paper>
                </SimpleGrid>

                {/* Details Card */}
                <Paper withBorder p="sm" radius="md" bg="var(--bg-subtle, #f8fafc)">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.04em" mb="xs">
                    Personal & Guardian Information
                  </Text>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                    <Text size="sm"><strong>Date of Birth:</strong> {selectedStudent.dob}</Text>
                    <Text size="sm"><strong>Gender:</strong> {selectedStudent.gender}</Text>
                    <Text size="sm"><strong>Guardian:</strong> {selectedStudent.guardian_name} ({selectedStudent.guardian_relation})</Text>
                    <Text size="sm"><strong>Phone:</strong> {selectedStudent.guardian_phone}</Text>
                    <Box style={{ gridColumn: '1 / -1' }}>
                      <Text size="sm"><strong>Address:</strong> {selectedStudent.address || 'Not provided'}</Text>
                    </Box>
                  </SimpleGrid>
                </Paper>

                {/* Academic Marks History */}
                <Box>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.04em" mb="xs">
                    Term Examination Marks
                  </Text>
                  {studentDetails.marks && studentDetails.marks.length > 0 ? (
                    <ScrollArea mah={160}>
                      <table className="data-table" style={{ fontSize: '0.825rem' }}>
                        <thead>
                          <tr>
                            <th>Exam</th>
                            <th>Subject</th>
                            <th>Score</th>
                            <th>Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentDetails.marks.map((m: any) => (
                            <tr key={m.id}>
                              <td>{m.examination_name}</td>
                              <td>{m.subject_name}</td>
                              <td><strong>{m.is_absent ? 'AB' : m.score}</strong></td>
                              <td>
                                <span className={`grade-badge grade-${m.grade_letter?.toLowerCase() || 's'}`}>
                                  {m.grade_letter}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  ) : (
                    <Text size="sm" c="dimmed">
                      No examination marks submitted for this student yet.
                    </Text>
                  )}
                </Box>
              </>
            ) : (
              <LoadingState message="Loading full profile details..." minHeight={120} />
            )}

            <Divider my="xs" />

            <Group justify="space-between" align="center">
              <Button variant="default" onClick={() => setShowProfileModal(false)}>
                Close
              </Button>
              <Button
                color="refinedBlue"
                leftSection={<Maximize2 size={15} />}
                onClick={() => {
                  setShowProfileModal(false);
                  setFullViewStudentId(selectedStudent.id);
                }}
              >
                Open Comprehensive Full View
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* CSV Bulk Import Modal */}
      <Modal
        opened={showImportModal}
        onClose={() => setShowImportModal(false)}
        title={
          <Group gap="xs">
            <FileSpreadsheet size={20} color="var(--primary, #2563eb)" />
            <Text fw={650} size="md">Bulk CSV Student Import & Validation</Text>
          </Group>
        }
        size="lg"
        radius="md"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Paste CSV data below. The system will validate required columns, detect duplicate admission numbers, and match classes before importing.
          </Text>

          <Group justify="space-between" align="center">
            <Button
              variant="light"
              color="slate"
              size="xs"
              onClick={() => setCsvText(sampleCsvTemplate)}
            >
              Load Sample Template
            </Button>
            <Button
              variant="light"
              color="refinedBlue"
              size="xs"
              onClick={handleCsvPreview}
              loading={importing}
              disabled={importing || !csvText.trim()}
            >
              Validate & Preview CSV
            </Button>
          </Group>

          <textarea
            className="form-textarea"
            rows={6}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Paste CSV rows here..."
            style={{ fontFamily: 'monospace', fontSize: '0.8rem', width: '100%', borderRadius: 8 }}
          />

          {/* Preview Results Table */}
          {importPreview && (
            <Paper withBorder p="sm" radius="md">
              <Group justify="space-between" align="center" mb="xs">
                <Text size="sm" fw={600}>CSV Validation Summary</Text>
                <Badge
                  color={importPreview.hasErrors ? 'red' : 'green'}
                  variant="light"
                  size="sm"
                >
                  {importPreview.preview?.length || 0} rows parsed • {importPreview.hasErrors ? 'Errors detected' : 'All rows valid'}
                </Badge>
              </Group>

              <ScrollArea mah={200}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Admission</th>
                      <th>Student Name</th>
                      <th>Class</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.preview?.map((p: any) => (
                      <tr key={p.rowNumber}>
                        <td>{p.rowNumber}</td>
                        <td>{p.data?.admission_no}</td>
                        <td>{p.data?.full_name}</td>
                        <td>{p.data?.class_name}</td>
                        <td>
                          {p.errors?.length > 0 ? (
                            <span style={{ color: 'var(--absent)' }}>{p.errors.join(', ')}</span>
                          ) : (
                            <span style={{ color: 'var(--present)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <CheckCircle2 size={12} /> Valid
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </Paper>
          )}

          <Group justify="flex-end" gap="sm" mt="sm">
            <Button variant="default" onClick={() => setShowImportModal(false)}>
              Cancel
            </Button>
            <Button
              color="refinedBlue"
              onClick={handleCsvCommit}
              loading={importing}
              disabled={importing || !importPreview || importPreview.hasErrors}
            >
              Commit & Import Valid Students
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
};

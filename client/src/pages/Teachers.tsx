import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Upload,
  Search,
  Edit2,
  Shield,
  Layers,
  BookOpen,
  School,
  RefreshCw,
  UserCheck
} from 'lucide-react';
import {
  Modal,
  TextInput,
  PasswordInput,
  Select,
  Checkbox,
  Button,
  Stack,
  Group,
  Text
} from '@mantine/core';
import { useForm, isNotEmpty, isEmail } from '@mantine/form';
import { api } from '../api/client';
import { useToast } from '../ui/useToast';
import './teachers.css';

interface StaffProps {
  user: any;
  onNavigate?: (tab: string) => void;
}

export const Teachers: React.FC<StaffProps> = ({ user }) => {
  const { showSuccess, showError } = useToast();
  const isAdmin = user?.role === 'admin';

  // Data states
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any | null>(null);

  // Form states powered by @mantine/form
  const addStaffForm = useForm({
    mode: 'uncontrolled',
    initialValues: {
      full_name: '',
      username: '',
      email: '',
      role: 'class_teacher',
      password: '',
      is_active: true,
    },
    validate: {
      full_name: isNotEmpty('Full name is required'),
      username: isNotEmpty('Staff ID / Username is required'),
      email: isEmail('Valid email address is required'),
    },
    transformValues: (values) => ({
      full_name: values.full_name.trim(),
      username: values.username.trim(),
      email: values.email.trim(),
      role: values.role,
      password: values.password || undefined,
      is_active: values.is_active ? 1 : 0,
    }),
  });

  const editStaffForm = useForm({
    mode: 'uncontrolled',
    initialValues: {
      full_name: '',
      email: '',
      role: 'class_teacher',
      is_active: true,
      newPassword: '',
    },
    validate: {
      full_name: isNotEmpty('Full name is required'),
      email: isEmail('Valid email address is required'),
    },
    transformValues: (values) => ({
      full_name: values.full_name.trim(),
      email: values.email.trim(),
      role: values.role,
      is_active: values.is_active ? 1 : 0,
      newPassword: values.newPassword || undefined,
    }),
  });

  // CSV Import State
  const [csvFileContent, setCsvFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);

  // Load Directory Data
  const loadStaffData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getTeachers();
      setStaffList(res.teachers || []);
    } catch (err: any) {
      console.error('Failed to load staff directory:', err);
      setError(err.message || 'Unable to load staff directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaffData();
  }, []);

  // Filtered List
  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      // Role / Category filter
      if (roleFilter === 'admin') {
        if (s.role !== 'admin') return false;
      } else if (roleFilter === 'section_head') {
        const isSH = s.assigned_sections && s.assigned_sections.length > 0;
        if (!isSH) return false;
      } else if (roleFilter === 'teachers') {
        const isSH = s.assigned_sections && s.assigned_sections.length > 0;
        if (s.role !== 'class_teacher' || isSH) return false;
      } else if (roleFilter === 'inactive') {
        if (s.is_active) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (s.full_name || '').toLowerCase().includes(q);
        const matchesUser = (s.username || '').toLowerCase().includes(q);
        const matchesEmail = (s.email || '').toLowerCase().includes(q);
        return matchesName || matchesUser || matchesEmail;
      }

      return true;
    });
  }, [staffList, roleFilter, searchQuery]);

  // KPI Metrics (Active Staff, Administration, Sectional Heads, Teachers)
  const metrics = useMemo(() => {
    const total = staffList.length;
    const active = staffList.filter((s) => s.is_active).length;
    const adminCount = staffList.filter((s) => s.role === 'admin').length;
    const sectionHeadCount = staffList.filter(
      (s) => s.assigned_sections && s.assigned_sections.length > 0
    ).length;
    const teachingCount = staffList.filter(
      (s) => s.role === 'class_teacher' && (!s.assigned_sections || s.assigned_sections.length === 0)
    ).length;
    const pending = staffList.filter((s) => !s.is_active).length;

    return { total, active, adminCount, sectionHeadCount, teachingCount, pending };
  }, [staffList]);

  // Handle Add Staff Member with @mantine/form
  const handleAddStaff = addStaffForm.onSubmit(async (transformedValues) => {
    try {
      await api.createTeacher(transformedValues);
      showSuccess(`Staff member "${transformedValues.full_name}" created successfully.`);
      setShowAddModal(false);
      addStaffForm.reset();
      loadStaffData();
    } catch (err: any) {
      showError(err.message || 'Failed to create staff record.');
    }
  });

  // Open Edit Modal
  const openEditModal = (staff: any) => {
    setSelectedStaff(staff);
    editStaffForm.setValues({
      full_name: staff.full_name || '',
      email: staff.email || '',
      role: staff.role || 'class_teacher',
      is_active: staff.is_active === 1 || staff.is_active === true,
      newPassword: '',
    });
    setShowEditModal(true);
  };

  // Handle Edit Staff Member with @mantine/form
  const handleEditStaff = editStaffForm.onSubmit(async (transformedValues) => {
    if (!selectedStaff) return;
    try {
      await api.updateTeacher(selectedStaff.id, transformedValues);
      showSuccess(`Staff metadata for "${transformedValues.full_name}" updated successfully.`);
      setShowEditModal(false);
      setSelectedStaff(null);
      loadStaffData();
    } catch (err: any) {
      showError(err.message || 'Failed to update staff record.');
    }
  });

  // Handle CSV File Selection
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      setCsvFileContent(text);
      try {
        const preview = await api.importTeachersCsv({ csvData: text, mode: 'preview' });
        setImportPreview(preview);
      } catch (err: any) {
        showError(err.message || 'Failed to parse CSV preview.');
      }
    };
    reader.readAsText(file);
  };

  // Commit CSV Import
  const handleCommitImport = async () => {
    if (!csvFileContent) return;
    setImporting(true);
    try {
      const res = await api.importTeachersCsv({ csvData: csvFileContent, mode: 'commit' });
      showSuccess(res.message || `Successfully imported ${res.importedCount} staff records.`);
      setShowImportModal(false);
      setCsvFileContent('');
      setImportPreview(null);
      setFileName('');
      loadStaffData();
    } catch (err: any) {
      showError(err.message || 'Failed to complete import.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="teachers-page">
      {/* Header */}
      <header className="teachers-header">
        <div className="teachers-header-titles">
          <div className="teachers-title-row">
            <h1 className="teachers-title">Staff Directory</h1>
            <span className="badge badge-primary">{metrics.total} Registered Staff</span>
          </div>
          <p className="teachers-subtitle">
            Maintain institutional staff metadata, accounts, and system access for principals, sectional heads, and teachers.
          </p>
        </div>

        {isAdmin && (
          <div className="teachers-header-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setCsvFileContent('');
                setImportPreview(null);
                setFileName('');
                setShowImportModal(true);
              }}
            >
              <Upload size={16} />
              Import Staff CSV
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowAddModal(true)}
            >
              <UserPlus size={16} />
              Add Staff Member
            </button>
          </div>
        )}
      </header>

      {/* KPI Cards Bar */}
      <div className="teachers-kpi-grid">
        <div className="teachers-kpi-card">
          <div className="teachers-kpi-icon blue">
            <UserCheck size={22} />
          </div>
          <div className="teachers-kpi-info">
            <span className="teachers-kpi-value">{metrics.active}</span>
            <span className="teachers-kpi-label">Active Staff</span>
          </div>
        </div>

        <div className="teachers-kpi-card">
          <div className="teachers-kpi-icon purple">
            <Shield size={22} />
          </div>
          <div className="teachers-kpi-info">
            <span className="teachers-kpi-value">{metrics.adminCount}</span>
            <span className="teachers-kpi-label">Administration</span>
          </div>
        </div>

        <div className="teachers-kpi-card">
          <div className="teachers-kpi-icon green">
            <Layers size={22} />
          </div>
          <div className="teachers-kpi-info">
            <span className="teachers-kpi-value">{metrics.sectionHeadCount}</span>
            <span className="teachers-kpi-label">Sectional Heads</span>
          </div>
        </div>

        <div className="teachers-kpi-card">
          <div className="teachers-kpi-icon amber">
            <School size={22} />
          </div>
          <div className="teachers-kpi-info">
            <span className="teachers-kpi-value">{metrics.teachingCount}</span>
            <span className="teachers-kpi-label">Teachers</span>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search & Filters */}
      <div className="teachers-controls">
        <div className="teachers-search-wrapper">
          <Search size={16} className="teachers-search-icon" />
          <input
            type="text"
            className="teachers-search-input"
            placeholder="Search by staff name, ID, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="teachers-filter-tabs">
          <button
            type="button"
            className={`teachers-filter-pill ${roleFilter === 'all' ? 'active' : ''}`}
            onClick={() => setRoleFilter('all')}
          >
            All Staff
          </button>
          <button
            type="button"
            className={`teachers-filter-pill ${roleFilter === 'admin' ? 'active' : ''}`}
            onClick={() => setRoleFilter('admin')}
          >
            Administration
          </button>
          <button
            type="button"
            className={`teachers-filter-pill ${roleFilter === 'section_head' ? 'active' : ''}`}
            onClick={() => setRoleFilter('section_head')}
          >
            Section Heads
          </button>
          <button
            type="button"
            className={`teachers-filter-pill ${roleFilter === 'teachers' ? 'active' : ''}`}
            onClick={() => setRoleFilter('teachers')}
          >
            Teaching Staff
          </button>
          <button
            type="button"
            className={`teachers-filter-pill ${roleFilter === 'inactive' ? 'active' : ''}`}
            onClick={() => setRoleFilter('inactive')}
          >
            Pending / Inactive
          </button>
        </div>
      </div>

      {/* Directory Table */}
      <div className="teachers-table-card">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
            <p>Loading staff personnel records...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={36} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
            <p style={{ fontWeight: 600 }}>No staff members found matching your search or filter.</p>
            <p style={{ fontSize: '0.8125rem' }}>Try clearing filters or add a new staff member above.</p>
          </div>
        ) : (
          <table className="teachers-table">
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Staff ID / Login</th>
                <th>System Role / Designation</th>
                <th>Status</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((staff) => {
                const isSecHead = staff.assigned_sections && staff.assigned_sections.length > 0;

                return (
                  <tr key={staff.id}>
                    <td>
                      <div className="teacher-profile-cell">
                        <div className="teacher-name-box">
                          <span className="teacher-full-name">{staff.full_name}</span>
                          <span className="teacher-username-tag">{staff.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code>{staff.username}</code>
                    </td>
                    <td>
                      {staff.role === 'admin' ? (
                        <span className="role-badge admin">
                          <Shield size={12} aria-hidden="true" />
                          Principal / Administrator
                        </span>
                      ) : isSecHead ? (
                        <span className="role-badge section_head">
                          <Layers size={12} aria-hidden="true" />
                          Section Head
                        </span>
                      ) : (
                        <span className="role-badge class_teacher">
                          <School size={12} aria-hidden="true" />
                          Teacher
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${staff.is_active ? 'active' : 'inactive'}`}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: staff.is_active ? '#10b981' : '#f59e0b'
                          }}
                        />
                        {staff.is_active ? 'Active' : 'Pending Activation'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: 'right' }}>
                        <div className="teacher-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditModal(staff)}
                            title="Edit Staff Metadata"
                          >
                            <Edit2 size={14} />
                            Edit
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL 1: ADD STAFF MEMBER powered by @mantine/form */}
      <Modal
        opened={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={
          <Group gap="xs">
            <UserPlus size={18} color="var(--primary, #2563eb)" />
            <Text fw={650} size="md">Add New Staff Member</Text>
          </Group>
        }
        size="md"
        radius="md"
        centered
      >
        <form onSubmit={handleAddStaff}>
          <Stack gap="sm">
            <TextInput
              label="Full Name"
              required
              placeholder="e.g. M. I. Mohamed Rifas"
              key={addStaffForm.key('full_name')}
              {...addStaffForm.getInputProps('full_name')}
            />

            <TextInput
              label="Staff ID / Username"
              required
              placeholder="e.g. T042 or rifas"
              key={addStaffForm.key('username')}
              {...addStaffForm.getInputProps('username')}
            />

            <TextInput
              label="Official Email Address"
              required
              type="email"
              placeholder="e.g. rifas@kcc.lk"
              key={addStaffForm.key('email')}
              {...addStaffForm.getInputProps('email')}
            />

            <Select
              label="Staff Role / Designation"
              required
              data={[
                { value: 'admin', label: 'Principal / School Administrator' },
                { value: 'class_teacher', label: 'Teacher' },
              ]}
              key={addStaffForm.key('role')}
              {...addStaffForm.getInputProps('role')}
            />

            <PasswordInput
              label="Initial Password (Optional)"
              placeholder="Leave blank to create as pending activation"
              description="If omitted, the account will be created as inactive pending activation."
              key={addStaffForm.key('password')}
              {...addStaffForm.getInputProps('password')}
            />

            <Checkbox
              label="Activate user account immediately"
              key={addStaffForm.key('is_active')}
              {...addStaffForm.getInputProps('is_active', { type: 'checkbox' })}
            />

            <Group justify="flex-end" gap="sm" mt="md">
              <Button variant="default" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" color="refinedBlue" loading={addStaffForm.submitting}>
                Save Staff Record
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* MODAL 2: EDIT STAFF RECORD powered by @mantine/form */}
      <Modal
        opened={showEditModal && !!selectedStaff}
        onClose={() => setShowEditModal(false)}
        title={
          <Group gap="xs">
            <Edit2 size={18} color="var(--primary, #2563eb)" />
            <Text fw={650} size="md">Edit Staff Record</Text>
          </Group>
        }
        size="md"
        radius="md"
        centered
      >
        <form onSubmit={handleEditStaff}>
          <Stack gap="sm">
            <TextInput
              label="Staff ID / Username"
              value={selectedStaff?.username || ''}
              disabled
              description="System identifier / login ID"
            />

            <TextInput
              label="Full Name"
              required
              key={editStaffForm.key('full_name')}
              {...editStaffForm.getInputProps('full_name')}
            />

            <TextInput
              label="Official Email Address"
              required
              type="email"
              key={editStaffForm.key('email')}
              {...editStaffForm.getInputProps('email')}
            />

            <Select
              label="Staff Role / Designation"
              required
              data={[
                { value: 'admin', label: 'Principal / Administrator' },
                { value: 'class_teacher', label: 'Teacher' },
              ]}
              key={editStaffForm.key('role')}
              {...editStaffForm.getInputProps('role')}
            />

            <PasswordInput
              label="Reset Password (Optional)"
              placeholder="Enter new password (min 8 chars, letters + numbers)"
              key={editStaffForm.key('newPassword')}
              {...editStaffForm.getInputProps('newPassword')}
            />

            <Checkbox
              label="Active login account"
              key={editStaffForm.key('is_active')}
              {...editStaffForm.getInputProps('is_active', { type: 'checkbox' })}
            />

            <Group justify="flex-end" gap="sm" mt="md">
              <Button variant="default" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button type="submit" color="refinedBlue" loading={editStaffForm.submitting}>
                Update Staff Record
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* MODAL 3: BULK CSV IMPORT */}
      {showImportModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Upload size={18} color="var(--primary)" />
                <h2 className="modal-title">Bulk Staff Import & Onboarding</h2>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={() => setShowImportModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Upload a CSV file containing staff metadata (Principals, Section Heads, Teachers).
                </p>
                <a
                  href="/api/admin/teachers/template"
                  download="kcc_staff_template.csv"
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  Download CSV Template
                </a>
              </div>

              <div
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: 8,
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  background: 'var(--bg-card)'
                }}
              >
                <input
                  type="file"
                  id="staffCsvUpload"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={handleCsvFile}
                />
                <label
                  htmlFor="staffCsvUpload"
                  style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                >
                  <Upload size={28} color="var(--primary)" />
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {fileName ? fileName : 'Choose CSV file to upload'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Columns: full_name, staff_id, email, role
                  </span>
                </label>
              </div>

              {/* Preview Table */}
              {importPreview && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Validation Preview</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Total: {importPreview.totalRows} &bull; Valid: {importPreview.validCount} &bull; Errors: {importPreview.errorCount}
                    </span>
                  </div>

                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                    <table className="teachers-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Full Name</th>
                          <th>Staff ID</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.preview?.map((row: any, idx: number) => (
                          <tr key={idx}>
                            <td>{row.rowNumber}</td>
                            <td>{row.full_name}</td>
                            <td><code>{row.staff_id}</code></td>
                            <td>{row.email}</td>
                            <td>{row.role}</td>
                            <td>
                              {row.status === 'valid' ? (
                                <span style={{ color: '#059669', fontWeight: 600 }}>Valid</span>
                              ) : (
                                <span style={{ color: '#dc2626', fontWeight: 600 }} title={row.errors?.join(', ')}>
                                  {row.errors?.[0] || 'Invalid'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowImportModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!importPreview || importPreview.validCount === 0 || importing}
                onClick={handleCommitImport}
              >
                {importing ? 'Importing...' : `Import ${importPreview?.validCount || 0} Staff`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const StaffDirectory = Teachers;

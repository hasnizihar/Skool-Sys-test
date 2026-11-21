import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Upload,
  Download,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  X,
  Edit2,
  Trash2,
  Shield,
  Layers,
  BookOpen,
  School,
  Key,
  RefreshCw,
  Plus,
  Eye,
  UserCheck
} from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../ui/useToast';
import './teachers.css';

interface TeachersProps {
  user: any;
  onNavigate?: (tab: string) => void;
}

export const Teachers: React.FC<TeachersProps> = ({ user, onNavigate }) => {
  const { showSuccess, showError } = useToast();
  const isAdmin = user?.role === 'admin';

  // Data states
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignmentsModal, setShowAssignmentsModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);

  // Form states
  const [addForm, setAddForm] = useState({
    full_name: '',
    username: '',
    email: '',
    role: 'class_teacher',
    password: '',
    is_active: 1
  });

  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    role: 'class_teacher',
    is_active: 1,
    newPassword: ''
  });

  // Assignment Modal selection states
  const [assignSectionId, setAssignSectionId] = useState<string>('');
  const [assignClassId, setAssignClassId] = useState<string>('');

  // CSV Import State
  const [csvFileContent, setCsvFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);

  // Load Directory Data
  const loadTeachersData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [teachersRes, classesRes, sectionsRes] = await Promise.all([
        api.getTeachers(),
        api.getClasses().catch(() => ({ classes: [] })),
        api.getSections().catch(() => ({ sections: [] }))
      ]);

      setTeachers(teachersRes.teachers || []);
      setClasses(classesRes.classes || []);
      setSections(sectionsRes.sections || []);
    } catch (err: any) {
      console.error('Failed to load teacher directory:', err);
      setError(err.message || 'Unable to load teacher directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachersData();
  }, []);

  // Filtered List
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      // Role / Category filter
      if (roleFilter === 'class_teacher') {
        const isCT = t.role === 'class_teacher' || (t.assigned_classes && t.assigned_classes.length > 0);
        if (!isCT) return false;
      } else if (roleFilter === 'subject_teacher') {
        if (t.role !== 'subject_teacher') return false;
      } else if (roleFilter === 'section_head') {
        const isSH = t.assigned_sections && t.assigned_sections.length > 0;
        if (!isSH) return false;
      } else if (roleFilter === 'inactive') {
        if (t.is_active) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (t.full_name || '').toLowerCase().includes(q);
        const matchesUser = (t.username || '').toLowerCase().includes(q);
        const matchesEmail = (t.email || '').toLowerCase().includes(q);
        return matchesName || matchesUser || matchesEmail;
      }

      return true;
    });
  }, [teachers, roleFilter, searchQuery]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = teachers.length;
    const active = teachers.filter((t) => t.is_active).length;
    const classTeachers = teachers.filter(
      (t) => t.role === 'class_teacher' || (t.assigned_classes && t.assigned_classes.length > 0)
    ).length;
    const sectionHeads = teachers.filter(
      (t) => t.assigned_sections && t.assigned_sections.length > 0
    ).length;
    const pending = teachers.filter((t) => !t.is_active).length;

    return { total, active, classTeachers, sectionHeads, pending };
  }, [teachers]);

  // Handle Add Teacher
  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.full_name.trim() || !addForm.username.trim() || !addForm.email.trim()) {
      showError('Please fill in all required fields.');
      return;
    }

    try {
      await api.createTeacher(addForm);
      showSuccess(`Teacher "${addForm.full_name}" created successfully.`);
      setShowAddModal(false);
      setAddForm({
        full_name: '',
        username: '',
        email: '',
        role: 'class_teacher',
        password: '',
        is_active: 1
      });
      loadTeachersData();
    } catch (err: any) {
      showError(err.message || 'Failed to create teacher record.');
    }
  };

  // Open Edit Modal
  const openEditModal = (teacher: any) => {
    setSelectedTeacher(teacher);
    setEditForm({
      full_name: teacher.full_name,
      email: teacher.email,
      role: teacher.role,
      is_active: teacher.is_active ? 1 : 0,
      newPassword: ''
    });
    setShowEditModal(true);
  };

  // Handle Edit Teacher
  const handleEditTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacher) return;

    try {
      await api.updateTeacher(selectedTeacher.id, editForm);
      showSuccess(`Teacher "${editForm.full_name}" updated successfully.`);
      setShowEditModal(false);
      setSelectedTeacher(null);
      loadTeachersData();
    } catch (err: any) {
      showError(err.message || 'Failed to update teacher.');
    }
  };

  // Open Assignments Modal
  const openAssignmentsModal = (teacher: any) => {
    setSelectedTeacher(teacher);
    setAssignSectionId('');
    setAssignClassId('');
    setShowAssignmentsModal(true);
  };

  // Assign Section Head
  const handleAssignSection = async () => {
    if (!selectedTeacher || !assignSectionId) return;
    try {
      await api.assignSectionHead(Number(assignSectionId), selectedTeacher.id);
      showSuccess(`Assigned as Section Head.`);
      setAssignSectionId('');
      // Reload current teacher info
      const updated = await api.getTeacher(selectedTeacher.id);
      setSelectedTeacher(updated.teacher);
      loadTeachersData();
    } catch (err: any) {
      showError(err.message || 'Failed to assign section head.');
    }
  };

  // Remove Section Head
  const handleRemoveSection = async (sectionId: number) => {
    if (!selectedTeacher) return;
    try {
      await api.removeSectionHead(sectionId, selectedTeacher.id);
      showSuccess(`Section Head assignment removed.`);
      const updated = await api.getTeacher(selectedTeacher.id);
      setSelectedTeacher(updated.teacher);
      loadTeachersData();
    } catch (err: any) {
      showError(err.message || 'Failed to remove section assignment.');
    }
  };

  // Assign Class Teacher
  const handleAssignClass = async () => {
    if (!selectedTeacher || !assignClassId) return;
    try {
      await api.assignClassTeacher(Number(assignClassId), selectedTeacher.id);
      showSuccess(`Assigned as Class Teacher.`);
      setAssignClassId('');
      const updated = await api.getTeacher(selectedTeacher.id);
      setSelectedTeacher(updated.teacher);
      loadTeachersData();
    } catch (err: any) {
      showError(err.message || 'Failed to assign class teacher.');
    }
  };

  // Remove Class Teacher
  const handleRemoveClass = async (classId: number) => {
    if (!selectedTeacher) return;
    try {
      await api.removeClassTeacher(classId, selectedTeacher.id);
      showSuccess(`Class Teacher assignment removed.`);
      const updated = await api.getTeacher(selectedTeacher.id);
      setSelectedTeacher(updated.teacher);
      loadTeachersData();
    } catch (err: any) {
      showError(err.message || 'Failed to remove class assignment.');
    }
  };

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
      showSuccess(res.message || `Successfully imported ${res.importedCount} teachers.`);
      setShowImportModal(false);
      setCsvFileContent('');
      setImportPreview(null);
      setFileName('');
      loadTeachersData();
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
            <h1 className="teachers-title">Teaching Staff Directory</h1>
            <span className="badge badge-primary">{metrics.total} Registered</span>
          </div>
          <p className="teachers-subtitle">
            Manage teaching faculty, section head appointments, and class teacher responsibilities.
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
              Import CSV
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowAddModal(true)}
            >
              <UserPlus size={16} />
              Add Teacher
            </button>
          </div>
        )}
      </header>

      {/* KPI Cards Bar */}
      <div className="teachers-kpi-grid">
        <div className="teachers-kpi-card">
          <div className="teachers-kpi-icon blue">
            <Users size={22} />
          </div>
          <div className="teachers-kpi-info">
            <span className="teachers-kpi-value">{metrics.total}</span>
            <span className="teachers-kpi-label">Total Faculty</span>
          </div>
        </div>

        <div className="teachers-kpi-card">
          <div className="teachers-kpi-icon green">
            <UserCheck size={22} />
          </div>
          <div className="teachers-kpi-info">
            <span className="teachers-kpi-value">{metrics.active}</span>
            <span className="teachers-kpi-label">Active Staff</span>
          </div>
        </div>

        <div className="teachers-kpi-card">
          <div className="teachers-kpi-icon purple">
            <School size={22} />
          </div>
          <div className="teachers-kpi-info">
            <span className="teachers-kpi-value">{metrics.classTeachers}</span>
            <span className="teachers-kpi-label">Class Teachers</span>
          </div>
        </div>

        <div className="teachers-kpi-card">
          <div className="teachers-kpi-icon amber">
            <Layers size={22} />
          </div>
          <div className="teachers-kpi-info">
            <span className="teachers-kpi-value">{metrics.sectionHeads}</span>
            <span className="teachers-kpi-label">Section Heads</span>
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
            placeholder="Search by teacher name, staff ID, or email..."
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
            className={`teachers-filter-pill ${roleFilter === 'class_teacher' ? 'active' : ''}`}
            onClick={() => setRoleFilter('class_teacher')}
          >
            Class Teachers
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
            className={`teachers-filter-pill ${roleFilter === 'subject_teacher' ? 'active' : ''}`}
            onClick={() => setRoleFilter('subject_teacher')}
          >
            Subject Teachers
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
            <p>Loading teacher personnel records...</p>
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={36} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
            <p style={{ fontWeight: 600 }}>No teachers found matching your search or filter.</p>
            <p style={{ fontSize: '0.8125rem' }}>Try clearing filters or add a new teacher above.</p>
          </div>
        ) : (
          <table className="teachers-table">
            <thead>
              <tr>
                <th>Teacher Profile</th>
                <th>Staff ID / Login</th>
                <th>System Role</th>
                <th>Assigned Responsibilities</th>
                <th>Status</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredTeachers.map((teacher) => {
                const isSecHead = teacher.assigned_sections && teacher.assigned_sections.length > 0;
                const isClassT = teacher.assigned_classes && teacher.assigned_classes.length > 0;

                return (
                  <tr key={teacher.id}>
                    <td>
                      <div className="teacher-profile-cell">
                        <div className="teacher-avatar">
                          {teacher.full_name ? teacher.full_name.charAt(0).toUpperCase() : 'T'}
                        </div>
                        <div className="teacher-name-box">
                          <span className="teacher-full-name">{teacher.full_name}</span>
                          <span className="teacher-username-tag">{teacher.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code>{teacher.username}</code>
                    </td>
                    <td>
                      <span className={`role-badge ${teacher.role}`}>
                        {teacher.role?.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="assignment-chips-list">
                        {isSecHead &&
                          teacher.assigned_sections.map((sec: any) => (
                            <span key={sec.id} className="assignment-chip section" title={`Section Head for ${sec.name}`}>
                              <Layers size={11} /> {sec.name}
                            </span>
                          ))}
                        {isClassT &&
                          teacher.assigned_classes.map((cls: any) => (
                            <span key={cls.id} className="assignment-chip class" title={`Class Teacher for ${cls.name}`}>
                              <School size={11} /> Class {cls.name}
                            </span>
                          ))}
                        {!isSecHead && !isClassT && (
                          <span className="assignment-chip-empty">No active assignments</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${teacher.is_active ? 'active' : 'inactive'}`}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: teacher.is_active ? '#10b981' : '#f59e0b'
                          }}
                        />
                        {teacher.is_active ? 'Active' : 'Pending Activation'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: 'right' }}>
                        <div className="teacher-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openAssignmentsModal(teacher)}
                            title="Manage Section & Class Assignments"
                          >
                            <Layers size={14} />
                            Roles
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditModal(teacher)}
                            title="Edit Teacher"
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

      {/* MODAL 1: ADD TEACHER */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 className="modal-title">Add New Teacher</h2>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={() => setShowAddModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddTeacher}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="e.g. M. I. Mohamed Rifas"
                    value={addForm.full_name}
                    onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Staff ID / Username *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="e.g. T042 or rifas"
                    value={addForm.username}
                    onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Official Email Address *</label>
                  <input
                    type="email"
                    className="form-input"
                    required
                    placeholder="e.g. rifas@kcc.lk"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Primary Role</label>
                  <select
                    className="form-input"
                    value={addForm.role}
                    onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                  >
                    <option value="class_teacher">Class Teacher</option>
                    <option value="subject_teacher">Subject Teacher</option>
                    <option value="admin">Principal / School Administrator</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Initial Password (Optional)</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Leave blank to create as pending activation"
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    If omitted, the account will be created as inactive pending activation.
                  </span>
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 4 }}>
                  <input
                    type="checkbox"
                    id="add-teacher-active"
                    checked={addForm.is_active === 1}
                    onChange={(e) => setAddForm({ ...addForm, is_active: e.target.checked ? 1 : 0 })}
                  />
                  <label htmlFor="add-teacher-active" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    Activate user account immediately
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Teacher Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT TEACHER */}
      {showEditModal && selectedTeacher && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Teacher Record</h2>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={() => setShowEditModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleEditTeacher}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    className="form-input"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Primary Role</label>
                  <select
                    className="form-input"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    <option value="class_teacher">Class Teacher</option>
                    <option value="subject_teacher">Subject Teacher</option>
                    <option value="admin">Principal / Administrator</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Reset Password (Optional)</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter new password (min 8 chars, letters + numbers)"
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 4 }}>
                  <input
                    type="checkbox"
                    id="edit-teacher-active"
                    checked={editForm.is_active === 1}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked ? 1 : 0 })}
                  />
                  <label htmlFor="edit-teacher-active" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    Active login account
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MANAGE ASSIGNMENTS (Multi-role, sections & classes) */}
      {showAssignmentsModal && selectedTeacher && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Manage Responsibilities</h2>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {selectedTeacher.full_name} ({selectedTeacher.username})
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={() => setShowAssignmentsModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* SECTION HEAD ASSIGNMENTS */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={16} color="#8b5cf6" />
                    Section Head Responsibilities
                  </h3>
                  <span className="badge badge-secondary">
                    {selectedTeacher.assigned_sections?.length || 0} Assigned
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {selectedTeacher.assigned_sections && selectedTeacher.assigned_sections.length > 0 ? (
                    selectedTeacher.assigned_sections.map((sec: any) => (
                      <div
                        key={sec.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '0.35rem 0.65rem',
                          background: 'rgba(139, 92, 246, 0.12)',
                          color: '#7c3aed',
                          borderRadius: 6,
                          fontSize: '0.8125rem',
                          fontWeight: 500
                        }}
                      >
                        <span>{sec.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSection(sec.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#7c3aed' }}
                          title="Remove section assignment"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Not currently assigned as Section Head for any section.
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    className="form-input"
                    style={{ flex: 1 }}
                    value={assignSectionId}
                    onChange={(e) => setAssignSectionId(e.target.value)}
                  >
                    <option value="">-- Select section to assign --</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!assignSectionId}
                    onClick={handleAssignSection}
                  >
                    <Plus size={14} /> Assign
                  </button>
                </div>
              </div>

              {/* CLASS TEACHER ASSIGNMENTS */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <School size={16} color="#0284c7" />
                    Class Teacher (Homeroom) Responsibilities
                  </h3>
                  <span className="badge badge-secondary">
                    {selectedTeacher.assigned_classes?.length || 0} Assigned
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {selectedTeacher.assigned_classes && selectedTeacher.assigned_classes.length > 0 ? (
                    selectedTeacher.assigned_classes.map((cls: any) => (
                      <div
                        key={cls.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '0.35rem 0.65rem',
                          background: 'rgba(14, 165, 233, 0.12)',
                          color: '#0284c7',
                          borderRadius: 6,
                          fontSize: '0.8125rem',
                          fontWeight: 500
                        }}
                      >
                        <span>Class {cls.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveClass(cls.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#0284c7' }}
                          title="Remove class assignment"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Not currently assigned as Class Teacher for any class.
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    className="form-input"
                    style={{ flex: 1 }}
                    value={assignClassId}
                    onChange={(e) => setAssignClassId(e.target.value)}
                  >
                    <option value="">-- Select class to assign --</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        Class {c.name} (Grade {c.grade})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!assignClassId}
                    onClick={handleAssignClass}
                  >
                    <Plus size={14} /> Assign
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowAssignmentsModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CSV BULK IMPORT */}
      {showImportModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Bulk Import Teaching Faculty (CSV)</h2>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Import teacher directory records safely. Imported records are created as inactive pending activation.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={() => setShowImportModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {/* Step 1: Download Template */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color)', borderRadius: 8, marginBottom: '1rem' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>1. Download CSV Template</span>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Formula-safe format: full_name, staff_id, email, role
                  </p>
                </div>
                <a
                  href={api.getTeacherTemplateUrl()}
                  download="kcc_teachers_template.csv"
                  className="btn btn-secondary btn-sm"
                >
                  <Download size={14} /> Download Template
                </a>
              </div>

              {/* Step 2: Upload File */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">2. Select CSV File to Import</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="form-input"
                  onChange={handleCsvFile}
                />
              </div>

              {/* Step 3: Live Preview Table */}
              {importPreview && (
                <div>
                  <div className="import-stat-banner">
                    <div className="import-stat-item" style={{ color: 'var(--text-main)' }}>
                      Total Rows: {importPreview.totalRows}
                    </div>
                    <div className="import-stat-item" style={{ color: '#059669' }}>
                      <CheckCircle size={14} /> Ready to Import: {importPreview.validCount}
                    </div>
                    {importPreview.duplicateCount > 0 && (
                      <div className="import-stat-item" style={{ color: '#d97706' }}>
                        <AlertTriangle size={14} /> Duplicates (Skipped): {importPreview.duplicateCount}
                      </div>
                    )}
                    {importPreview.invalidCount > 0 && (
                      <div className="import-stat-item" style={{ color: '#dc2626' }}>
                        <X size={14} /> Invalid: {importPreview.invalidCount}
                      </div>
                    )}
                  </div>

                  <div className="import-modal-preview">
                    <table className="import-preview-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Full Name</th>
                          <th>Staff ID</th>
                          <th>Email</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.preview.map((row: any) => (
                          <tr key={row.rowNumber}>
                            <td>{row.rowNumber}</td>
                            <td style={{ fontWeight: 500 }}>{row.full_name}</td>
                            <td><code>{row.username}</code></td>
                            <td>{row.email}</td>
                            <td>
                              {row.status === 'valid' && (
                                <span className="status-badge active" style={{ fontSize: '0.7rem' }}>
                                  Ready
                                </span>
                              )}
                              {row.status === 'duplicate' && (
                                <span className="status-badge inactive" style={{ fontSize: '0.7rem' }} title={row.error}>
                                  Duplicate
                                </span>
                              )}
                              {row.status === 'invalid' && (
                                <span className="role-badge admin" style={{ fontSize: '0.7rem' }} title={row.error}>
                                  {row.error}
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

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowImportModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!importPreview || importPreview.validCount === 0 || importing}
                onClick={handleCommitImport}
              >
                {importing ? (
                  <>
                    <RefreshCw size={14} className="spin" /> Importing...
                  </>
                ) : (
                  `Commit Import (${importPreview ? importPreview.validCount : 0} Teachers)`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Teachers;

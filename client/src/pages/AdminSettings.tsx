import React, { useState, useEffect } from 'react';
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
  Key,
  CheckCircle2,
  AlertTriangle,
  Plus,
  X,
  Layers,
  Edit3,
  UserCheck,
  School,
  ChevronRight
} from 'lucide-react';
import { api } from '../api/client';

export const AdminSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sections' | 'users' | 'assignments' | 'backup'>('sections');

  // Sections State (Phase 1)
  const [sections, setSections] = useState<any[]>([]);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingSection, setEditingSection] = useState<any | null>(null);
  const [sectionFormData, setSectionFormData] = useState({
    name: '',
    code: '',
    description: ''
  });

  // Assign Classes Modal State
  const [showAssignClassesModal, setShowAssignClassesModal] = useState(false);
  const [targetSectionForClasses, setTargetSectionForClasses] = useState<any | null>(null);
  const [selectedClassIdsForSection, setSelectedClassIdsForSection] = useState<number[]>([]);

  // Assign Section Head Modal State
  const [showAssignHeadModal, setShowAssignHeadModal] = useState(false);
  const [targetSectionForHead, setTargetSectionForHead] = useState<any | null>(null);
  const [selectedHeadUserId, setSelectedHeadUserId] = useState<string>('');

  // Class Teachers Management Modal State
  const [showClassTeachersModal, setShowClassTeachersModal] = useState(false);
  const [targetClassForTeachers, setTargetClassForTeachers] = useState<any | null>(null);
  const [selectedTeacherIdForClass, setSelectedTeacherIdForClass] = useState<string>('');
  const [currentClassTeachers, setCurrentClassTeachers] = useState<any[]>([]);

  // Users State
  const [users, setUsers] = useState<any[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [userFormData, setUserFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'class_teacher'
  });

  // Assignments State
  const [assignments, setAssignments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignFormData, setAssignFormData] = useState({
    teacher_id: '',
    class_id: '',
    subject_id: '',
    assignment_type: 'class_teacher'
  });

  // Backup State
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [restoreJson, setRestoreJson] = useState('');
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    loadAllAdminData();
  }, []);

  const loadAllAdminData = async () => {
    try {
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
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  };

  const reloadSections = async () => {
    try {
      const [secRes, cRes] = await Promise.all([
        api.getSections(),
        api.getClasses()
      ]);
      setSections(secRes.sections || []);
      setClasses(cRes.classes || []);
    } catch (err) {
      console.error('Failed to reload sections:', err);
    }
  };

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
    try {
      if (editingSection) {
        await api.updateSection(editingSection.id, sectionFormData);
      } else {
        await api.createSection(sectionFormData);
      }
      setShowSectionModal(false);
      await reloadSections();
    } catch (err: any) {
      alert(`Failed to save section: ${err.message}`);
    }
  };

  const handleDeleteSection = async (sec: any) => {
    if (!window.confirm(`Are you sure you want to delete section "${sec.name}"?\nClasses in this section will be unassigned, but will NOT be deleted.`)) {
      return;
    }
    try {
      await api.deleteSection(sec.id);
      await reloadSections();
    } catch (err: any) {
      alert(`Failed to delete section: ${err.message}`);
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
      await api.assignSectionClasses(targetSectionForClasses.id, selectedClassIdsForSection);
      setShowAssignClassesModal(false);
      await reloadSections();
    } catch (err: any) {
      alert(`Failed to assign classes: ${err.message}`);
    }
  };

  const handleUnassignClassFromSection = async (sectionId: number, classId: number) => {
    try {
      await api.unassignSectionClass(sectionId, classId);
      await reloadSections();
    } catch (err: any) {
      alert(`Failed to unassign class: ${err.message}`);
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
    if (!targetSectionForHead || !selectedHeadUserId) return;
    try {
      await api.assignSectionHead(targetSectionForHead.id, Number(selectedHeadUserId));
      setShowAssignHeadModal(false);
      await reloadSections();
    } catch (err: any) {
      alert(`Failed to assign section head: ${err.message}`);
    }
  };

  const handleRemoveSectionHead = async (sectionId: number, userId: number) => {
    if (!window.confirm('Remove this section head assignment?')) return;
    try {
      await api.removeSectionHead(sectionId, userId);
      await reloadSections();
    } catch (err: any) {
      alert(`Failed to remove section head: ${err.message}`);
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
      await api.assignClassTeacher(targetClassForTeachers.id, Number(selectedTeacherIdForClass));
      setSelectedTeacherIdForClass('');
      const res = await api.getClassTeachers(targetClassForTeachers.id);
      setCurrentClassTeachers(res.teachers || []);
      await reloadSections();
    } catch (err: any) {
      alert(`Failed to assign class teacher: ${err.message}`);
    }
  };

  const handleRemoveClassTeacher = async (teacherId: number) => {
    if (!targetClassForTeachers) return;
    try {
      await api.removeClassTeacher(targetClassForTeachers.id, teacherId);
      const res = await api.getClassTeachers(targetClassForTeachers.id);
      setCurrentClassTeachers(res.teachers || []);
      await reloadSections();
    } catch (err: any) {
      alert(`Failed to remove class teacher: ${err.message}`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
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
      alert('User account created successfully!');
    } catch (err: any) {
      alert(`Failed to create user: ${err.message}`);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
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
      alert('Teacher assignment saved successfully!');
    } catch (err: any) {
      alert(`Assignment failed: ${err.message}`);
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    if (!confirm('Are you sure you want to remove this teacher assignment?')) return;
    try {
      await api.deleteAssignment(id);
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      alert(`Failed to delete assignment: ${err.message}`);
    }
  };

  const handleDownloadBackup = async () => {
    try {
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
      setTimeout(() => setBackupStatus(null), 4000);
    } catch (err: any) {
      alert(`Backup failed: ${err.message}`);
      setBackupStatus(null);
    }
  };

  const handleToggleUserStatus = async (user: any) => {
    const nextStatus = !user.is_active;
    const actionLabel = nextStatus ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${actionLabel} user "${user.username}"? ${!nextStatus ? 'Their active sessions and tokens will be invalidated immediately.' : ''}`)) {
      return;
    }
    try {
      await api.updateUser(user.id, { is_active: nextStatus });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: nextStatus ? 1 : 0 } : u))
      );
    } catch (err: any) {
      alert(`Failed to update user status: ${err.message}`);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreJson.trim()) return;
    if (!confirm('WARNING: Restoring will overwrite existing data. Proceed?')) return;

    try {
      setRestoring(true);
      const parsed = JSON.parse(restoreJson);
      await api.restoreBackup(parsed);
      alert('Database restored successfully from backup!');
      setRestoreJson('');
      loadAllAdminData();
    } catch (err: any) {
      alert(`Restore failed: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  };

  const handleResetSeed = async () => {
    if (!confirm('Re-seed will reset the school database to default pilot demo data (Grade 6–13 classes, demo students, Term 1 marks). Proceed?')) return;
    try {
      await api.resetSeed();
      alert('Database re-seeded successfully to pilot state!');
      loadAllAdminData();
    } catch (err: any) {
      alert(`Reset failed: ${err.message}`);
    }
  };

  return (
    <div>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <h2>School Administration & Security</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            User credentials, role assignments, system backups, and database recovery.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('sections')}
            className={`btn btn-sm ${activeTab === 'sections' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Layers size={14} /> School Sections & Structure
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`btn btn-sm ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Users size={14} /> User Accounts
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`btn btn-sm ${activeTab === 'assignments' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <BookOpen size={14} /> Teacher Assignments
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`btn btn-sm ${activeTab === 'backup' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Database size={14} /> Backup & Restore
          </button>
        </div>
      </div>

      {/* Tab 0: School Sections & Structure (Phase 1) */}
      {activeTab === 'sections' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header Card */}
          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Layers size={18} style={{ color: 'var(--kcc-primary, #075E3B)' }} />
                  School Sections & Organizational Structure
                </h3>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Define school sections (e.g. Junior Secondary, Senior Secondary, G.C.E. A/L), assign sectional heads, and link classroom units with multiple class teachers.
                </p>
              </div>
              <button onClick={handleOpenAddSection} className="btn btn-primary btn-sm">
                <Plus size={14} /> Add New Section
              </button>
            </div>
          </div>

          {/* Unassigned Classes Notice */}
          {classes.filter((c) => !c.section_id).length > 0 && (
            <div
              style={{
                padding: '0.85rem 1.25rem',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--late-bg, #fef3c7)',
                border: '1px solid var(--late-border, #fde68a)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                fontSize: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={16} style={{ color: 'var(--late, #d97706)', flexShrink: 0 }} />
                <span>
                  <strong>{classes.filter((c) => !c.section_id).length} classes</strong> are currently unassigned to any section. Link them to a section below for classroom monitoring and reporting.
                </span>
              </div>
            </div>
          )}

          {/* Sections List */}
          {sections.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <School size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <h4>No School Sections Configured Yet</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0.5rem 0 1.25rem' }}>
                Get started by creating your first school section (e.g. "Junior Secondary (Grades 6–9)").
              </p>
              <button onClick={handleOpenAddSection} className="btn btn-primary btn-sm">
                <Plus size={14} /> Create First Section
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {sections.map((sec) => (
                <div key={sec.id} className="card" style={{ padding: '1.25rem 1.5rem' }}>
                  {/* Section Top Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{sec.name}</h4>
                        <span className="badge" style={{ background: 'var(--kcc-primary-soft, #e9f5ed)', color: 'var(--kcc-primary, #075E3B)', fontWeight: 600 }}>
                          {sec.code}
                        </span>
                        {sec.academic_year_name && (
                          <span className="badge" style={{ background: 'var(--bg-subtle, #f1f5f9)', color: 'var(--text-muted)' }}>
                            {sec.academic_year_name}
                          </span>
                        )}
                      </div>
                      {sec.description && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          {sec.description}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <button onClick={() => handleOpenAssignClasses(sec)} className="btn btn-secondary btn-sm" title="Link classes to this section">
                        <BookOpen size={13} /> Link Classes
                      </button>
                      <button onClick={() => handleOpenAssignHead(sec)} className="btn btn-secondary btn-sm" title="Assign Section Head">
                        <UserCheck size={13} /> Assign Head
                      </button>
                      <button onClick={() => handleOpenEditSection(sec)} className="btn btn-secondary btn-sm" title="Edit Section details">
                        <Edit3 size={13} /> Edit
                      </button>
                      <button onClick={() => handleDeleteSection(sec)} className="btn btn-secondary btn-sm" style={{ color: '#ef4444' }} title="Delete Section">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Sectional Heads Sub-Section */}
                  <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-subtle, #f8fafc)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                        Sectional Heads ({sec.section_heads?.length || 0})
                      </span>
                      <button onClick={() => handleOpenAssignHead(sec)} className="btn btn-link btn-sm" style={{ padding: 0, fontSize: '0.75rem', color: 'var(--kcc-primary, #075E3B)' }}>
                        + Add Head
                      </button>
                    </div>

                    {(!sec.section_heads || sec.section_heads.length === 0) ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No sectional heads assigned. Click "+ Add Head" to assign a supervisor.
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {sec.section_heads.map((head: any) => (
                          <span
                            key={head.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.25rem 0.6rem',
                              borderRadius: '20px',
                              background: '#ffffff',
                              border: '1px solid var(--border-color)',
                              fontSize: '0.8rem',
                              fontWeight: 500
                            }}
                          >
                            <UserCheck size={12} style={{ color: 'var(--kcc-primary, #075E3B)' }} />
                            <span>{head.full_name}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSectionHead(sec.id, head.id)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px' }}
                              title="Remove section head assignment"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Assigned Classes Table */}
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                        Linked Classes ({sec.classes?.length || 0})
                      </span>
                      <button onClick={() => handleOpenAssignClasses(sec)} className="btn btn-link btn-sm" style={{ padding: 0, fontSize: '0.75rem', color: 'var(--kcc-primary, #075E3B)' }}>
                        + Link More Classes
                      </button>
                    </div>

                    {(!sec.classes || sec.classes.length === 0) ? (
                      <div style={{ padding: '1rem', textAlign: 'center', background: 'var(--bg-subtle, #f8fafc)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        No classes linked to this section yet. Click "+ Link More Classes" to assign classes.
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="data-table" style={{ fontSize: '0.825rem' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '120px' }}>Class</th>
                              <th style={{ width: '80px' }}>Grade</th>
                              <th style={{ width: '90px' }}>Pupils</th>
                              <th>Assigned Class Teacher(s)</th>
                              <th style={{ textAlign: 'right', width: '190px' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sec.classes.map((cls: any) => (
                              <tr key={cls.id}>
                                <td>
                                  <strong>{cls.name}</strong>
                                </td>
                                <td>Grade {cls.grade}</td>
                                <td>{cls.student_count || 0}</td>
                                <td>
                                  {(!cls.class_teachers || cls.class_teachers.length === 0) ? (
                                    <span style={{ color: 'var(--late, #d97706)', fontStyle: 'italic', fontSize: '0.775rem' }}>
                                      No Class Teacher assigned
                                    </span>
                                  ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                      {cls.class_teachers.map((t: any) => (
                                        <span
                                          key={t.id}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                            padding: '0.15rem 0.5rem',
                                            borderRadius: '4px',
                                            background: 'var(--kcc-primary-soft, #e9f5ed)',
                                            color: 'var(--kcc-primary, #075E3B)',
                                            fontSize: '0.75rem',
                                            fontWeight: 600
                                          }}
                                        >
                                          {t.full_name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    onClick={() => handleOpenClassTeachers(cls)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', marginRight: '0.4rem' }}
                                    title="Manage teachers for this class"
                                  >
                                    Teachers ({cls.class_teachers?.length || 0})
                                  </button>
                                  <button
                                    onClick={() => handleUnassignClassFromSection(sec.id, cls.id)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: 'var(--text-muted)' }}
                                    title="Unassign class from this section"
                                  >
                                    Unlink
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 1: Users */}
      {activeTab === 'users' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>Faculty & Staff Accounts</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Role-based access control (Administrator, Class Teacher, Subject Teacher)
              </p>
            </div>
            <button onClick={() => setShowAddUserModal(true)} className="btn btn-primary btn-sm">
              <UserPlus size={14} /> Add User Account
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div className="user-avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>
                          {u.full_name?.charAt(0)}
                        </div>
                        <strong>{u.full_name}</strong>
                      </div>
                    </td>
                    <td><code>{u.username}</code></td>
                    <td style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                    <td>
                      <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? 'badge-present' : 'badge-absent'}`}>
                        {u.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.created_at?.slice(0, 10)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleToggleUserStatus(u)}
                        className={`btn btn-sm ${u.is_active ? 'btn-secondary' : 'btn-primary'}`}
                        style={{
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.75rem',
                          color: u.is_active ? 'var(--danger)' : undefined,
                          borderColor: u.is_active ? 'var(--danger-light, rgba(239,68,68,0.2))' : undefined
                        }}
                        title={u.is_active ? 'Deactivate account and revoke all active tokens immediately' : 'Reactivate account'}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Assignments */}
      {activeTab === 'assignments' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>Teacher Class & Subject Assignments</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Designate class teachers and subject instructors across Grades 6 to 13
              </p>
            </div>
            <button onClick={() => setShowAssignModal(true)} className="btn btn-primary btn-sm">
              <Plus size={14} /> New Assignment
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Teacher Name</th>
                  <th>Class</th>
                  <th>Role / Assignment Type</th>
                  <th>Assigned Subject</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.teacher_name}</strong></td>
                    <td><span className="badge" style={{ background: 'var(--bg-subtle)' }}>{a.class_name}</span></td>
                    <td>
                      <span className="badge" style={{ background: a.assignment_type === 'class_teacher' ? '#dcfce7' : '#e0f2fe', color: a.assignment_type === 'class_teacher' ? '#15803d' : '#0369a1' }}>
                        {a.assignment_type === 'class_teacher' ? 'Class Teacher' : 'Subject Teacher'}
                      </span>
                    </td>
                    <td>{a.subject_name ? `${a.subject_name} (${a.subject_code})` : 'Whole Class Register'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleDeleteAssignment(a.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#ef4444', padding: '0.3rem 0.5rem' }}
                        title="Remove Assignment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Backup & Recovery */}
      {activeTab === 'backup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Security & Data Safety Notice Banner */}
          <div
            style={{
              padding: '1rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--late-bg)',
              border: '1px solid var(--late-border)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem'
            }}
          >
            <AlertTriangle size={20} style={{ color: 'var(--late)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ fontSize: '0.875rem', color: 'var(--late)' }}>
                Emergency Data Protection Notice (PR-002 Safety Baseline)
              </strong>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '0.25rem' }}>
                Destructive Database Restore and Demo Re-seed endpoints are <strong>disabled</strong> to prevent data corruption and accidental table wiping. Read-only backup JSON export is fully operational. Transactional, atomic database restoration is scheduled for PR-004.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">System Database Backup</div>
                  <div className="card-subtitle">Download an immutable JSON snapshot of all tables</div>
                </div>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Includes all students, attendance histories, marks, users, academic years, and audit logs. This file can be stored on external media or used to migrate the system.
              </p>

              <button onClick={handleDownloadBackup} className="btn btn-primary">
                <Download size={16} /> Export & Download Backup
              </button>

              {backupStatus && (
                <p style={{ marginTop: '0.75rem', fontSize: '0.825rem', color: 'var(--present)' }}>
                  {backupStatus}
                </p>
              )}

              <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '2rem', paddingTop: '1.5rem' }}>
                <div className="card-title" style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                  Pilot Demonstration Reset (Disabled)
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.5rem 0 1rem' }}>
                  Reset endpoint is locked. Database reset operations must be run strictly via authenticated offline CLI scripts in staging environments.
                </p>
                <button disabled className="btn btn-secondary btn-sm" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  <RotateCcw size={14} /> Re-seed Demo Database (Disabled)
                </button>
              </div>
            </div>

            <div className="card" style={{ opacity: 0.85 }}>
              <div className="card-header">
                <div>
                  <div className="card-title">Restore Database Snapshot (Locked)</div>
                  <div className="card-subtitle">Disabled until transactional recovery (PR-004)</div>
                </div>
                <span className="badge badge-late">Safety Locked</span>
              </div>

              <div className="form-group">
                <label className="form-label">Paste Backup JSON Content</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  disabled
                  placeholder="Restore operations are locked to prevent unrecoverable data loss..."
                  style={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>

              <button
                disabled
                className="btn btn-secondary"
                style={{ opacity: 0.5, cursor: 'not-allowed' }}
              >
                <Upload size={16} />
                <span>Restore Endpoint Disabled (Safety Containment)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem' }}>Create User Account</h3>
              <button onClick={() => setShowAddUserModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={userFormData.full_name}
                    onChange={(e) => setUserFormData({ ...userFormData, full_name: e.target.value })}
                    placeholder="e.g. Mrs. Sunethra Jayasinghe"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                    placeholder="e.g. teacher_sunethra"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    className="form-input"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    placeholder="teacher@skoolsys.edu"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Temporary Password *</label>
                  <input
                    type="password"
                    className="form-input"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    placeholder="••••••••"
                    minLength={8}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Must be at least 8 characters long and contain both letters and numbers.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">System Role *</label>
                  <select
                    className="form-select"
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                  >
                    <option value="class_teacher">Class Teacher</option>
                    <option value="subject_teacher">Subject Teacher</option>
                    <option value="admin">Administrator / Principal</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowAddUserModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Assignment Modal */}
      {showAssignModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem' }}>Assign Teacher to Class / Subject</h3>
              <button onClick={() => setShowAssignModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAssignment}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Select Teacher *</label>
                  <select
                    className="form-select"
                    value={assignFormData.teacher_id}
                    onChange={(e) => setAssignFormData({ ...assignFormData, teacher_id: e.target.value })}
                    required
                  >
                    <option value="">Select Faculty Member</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.username})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Assignment Type *</label>
                  <select
                    className="form-select"
                    value={assignFormData.assignment_type}
                    onChange={(e) => setAssignFormData({ ...assignFormData, assignment_type: e.target.value })}
                  >
                    <option value="class_teacher">Class Teacher (Daily Attendance & Roster)</option>
                    <option value="subject_teacher">Subject Teacher (Marks Entry)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Class (Grade 6–13) *</label>
                  <select
                    className="form-select"
                    value={assignFormData.class_id}
                    onChange={(e) => setAssignFormData({ ...assignFormData, class_id: e.target.value })}
                    required
                  >
                    <option value="">Select Class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {assignFormData.assignment_type === 'subject_teacher' && (
                  <div className="form-group">
                    <label className="form-label">Subject *</label>
                    <select
                      className="form-select"
                      value={assignFormData.subject_id}
                      onChange={(e) => setAssignFormData({ ...assignFormData, subject_id: e.target.value })}
                      required
                    >
                      <option value="">Select Subject</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowAssignModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1. Add / Edit Section Modal */}
      {showSectionModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem' }}>
                {editingSection ? 'Edit Section' : 'Create New Section'}
              </h3>
              <button onClick={() => setShowSectionModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSection}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Section Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={sectionFormData.name}
                    onChange={(e) => setSectionFormData({ ...sectionFormData, name: e.target.value })}
                    placeholder="e.g. Junior Secondary (Grades 6–9)"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Section Code *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={sectionFormData.code}
                    onChange={(e) => setSectionFormData({ ...sectionFormData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. SEC-JUNIOR"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description (Optional)</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={sectionFormData.description}
                    onChange={(e) => setSectionFormData({ ...sectionFormData, description: e.target.value })}
                    placeholder="Optional description of grades, buildings, or administrative scope..."
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowSectionModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingSection ? 'Save Changes' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Assign Classes to Section Modal */}
      {showAssignClassesModal && targetSectionForClasses && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>Link Classes to Section</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Section: <strong>{targetSectionForClasses.name}</strong> ({targetSectionForClasses.code})
                </p>
              </div>
              <button onClick={() => setShowAssignClassesModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAssignedClasses}>
              <div className="modal-body">
                <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Select the classes belonging to this section. Any class selected will be linked to this section:
                </p>

                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.5rem' }}>
                  {classes.map((cls) => {
                    const isChecked = selectedClassIdsForSection.includes(cls.id);
                    const isOtherSection = cls.section_id && cls.section_id !== targetSectionForClasses.id;
                    return (
                      <label
                        key={cls.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.5rem 0.65rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          background: isChecked ? 'var(--kcc-primary-soft, #e9f5ed)' : 'transparent',
                          marginBottom: '2px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedClassIdsForSection([...selectedClassIdsForSection, cls.id]);
                              } else {
                                setSelectedClassIdsForSection(selectedClassIdsForSection.filter((id) => id !== cls.id));
                              }
                            }}
                          />
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{cls.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Grade {cls.grade}</span>
                        </div>
                        {isOtherSection && (
                          <span className="badge" style={{ fontSize: '0.7rem', background: '#fee2e2', color: '#991b1b' }}>
                            Currently in {cls.section_name || 'other section'}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowAssignClassesModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Linked Classes ({selectedClassIdsForSection.length})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Assign Section Head Modal */}
      {showAssignHeadModal && targetSectionForHead && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>Assign Sectional Head</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Section: <strong>{targetSectionForHead.name}</strong>
                </p>
              </div>
              <button onClick={() => setShowAssignHeadModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSectionHead}>
              <div className="modal-body">
                <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Select a faculty or staff member to assign as Sectional Head with supervisory monitoring access for this section:
                </p>

                <div className="form-group">
                  <label className="form-label">Faculty Member *</label>
                  <select
                    className="form-select"
                    value={selectedHeadUserId}
                    onChange={(e) => setSelectedHeadUserId(e.target.value)}
                    required
                  >
                    <option value="">Select Faculty Member</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.username} • {u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowAssignHeadModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Assign as Section Head
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Manage Class Teachers Modal */}
      {showClassTeachersModal && targetClassForTeachers && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>Manage Class Teachers</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Class: <strong>{targetClassForTeachers.name}</strong> (Grade {targetClassForTeachers.grade})
                </p>
              </div>
              <button onClick={() => setShowClassTeachersModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Current Teachers List */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ marginBottom: '0.5rem' }}>
                  Currently Assigned Class Teachers ({currentClassTeachers.length})
                </label>

                {currentClassTeachers.length === 0 ? (
                  <p style={{ fontSize: '0.825rem', color: 'var(--late, #d97706)', fontStyle: 'italic' }}>
                    No class teacher assigned yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {currentClassTeachers.map((t: any) => (
                      <div
                        key={t.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.5rem 0.75rem',
                          background: 'var(--bg-subtle, #f8fafc)',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '0.85rem' }}>{t.full_name}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                            {t.email || t.username}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveClassTeacher(t.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ color: '#ef4444', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                          title="Remove class teacher assignment"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Another Class Teacher Form */}
              <form onSubmit={handleAddClassTeacher} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <label className="form-label" style={{ marginBottom: '0.4rem' }}>
                  Assign Additional Class Teacher
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    className="form-select"
                    value={selectedTeacherIdForClass}
                    onChange={(e) => setSelectedTeacherIdForClass(e.target.value)}
                    required
                  >
                    <option value="">Select Teacher...</option>
                    {users
                      .filter((u) => !currentClassTeachers.some((ct: any) => ct.id === u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.username})
                        </option>
                      ))}
                  </select>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
                    <Plus size={14} /> Assign
                  </button>
                </div>
              </form>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowClassTeachersModal(false)} className="btn btn-secondary">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

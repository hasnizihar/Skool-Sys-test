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
  X
} from 'lucide-react';
import { api } from '../api/client';

export const AdminSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'assignments' | 'backup'>('users');

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
      const [uRes, aRes, cRes, sRes] = await Promise.all([
        api.getUsers(),
        api.getAssignments(),
        api.getClasses(),
        api.getSubjects()
      ]);
      setUsers(uRes.users || []);
      setAssignments(aRes.assignments || []);
      setClasses(cRes.classes || []);
      setSubjects(sRes.subjects || []);
    } catch (err) {
      console.error('Failed to load admin data:', err);
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

        <div style={{ display: 'flex', gap: '0.4rem' }}>
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
                      <span className="badge badge-present">Active</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.created_at?.slice(0, 10)}</td>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
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
              <div className="card-title" style={{ color: '#ef4444', fontSize: '1rem' }}>
                Pilot Demonstration Reset
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.5rem 0 1rem' }}>
                Reset the system to the initial clean seed state with Grades 6–13 classes, 20 Grade 8-A students, sample attendance, and Term 1 exam marks.
              </p>
              <button onClick={handleResetSeed} className="btn btn-secondary btn-sm" style={{ color: '#ef4444' }}>
                <RotateCcw size={14} /> Re-seed Demo Database
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Restore Database Snapshot</div>
                <div className="card-subtitle">Restore system data from a previous JSON backup</div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Paste Backup JSON Content</label>
              <textarea
                className="form-textarea"
                rows={8}
                value={restoreJson}
                onChange={(e) => setRestoreJson(e.target.value)}
                placeholder='Paste exported {"version": "1.0.0", "data": {...}} JSON here...'
                style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
              />
            </div>

            <button
              onClick={handleRestoreBackup}
              disabled={restoring || !restoreJson.trim()}
              className="btn btn-danger"
            >
              <Upload size={16} />
              <span>{restoring ? 'Restoring...' : 'Restore System Backup'}</span>
            </button>
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
                    required
                  />
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
    </div>
  );
};

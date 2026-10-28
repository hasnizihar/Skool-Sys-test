import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Printer,
  Award,
  Edit3,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Shield,
  CheckCircle2,
  School,
  X,
  AlertCircle
} from 'lucide-react';
import { api } from '../api/client';
import { StudentReportCard } from './StudentReportCard';
import './studentFullView.css';

interface StudentFullViewProps {
  studentId: number;
  onBack: () => void;
  user: any;
  onStudentUpdated?: () => void;
}

export const StudentFullView: React.FC<StudentFullViewProps> = ({
  studentId,
  onBack,
  user,
  onStudentUpdated
}) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [editFormData, setEditFormData] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Report Card Modal State
  const [showReportCard, setShowReportCard] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);

  useEffect(() => {
    loadStudent();
    loadClasses();
  }, [studentId]);

  const loadStudent = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getStudent(studentId);
      setData(res);
      setEditFormData({
        full_name: res.student.full_name,
        calling_name: res.student.calling_name,
        dob: res.student.dob,
        gender: res.student.gender,
        address: res.student.address || '',
        guardian_name: res.student.guardian_name,
        guardian_relation: res.student.guardian_relation,
        guardian_phone: res.student.guardian_phone,
        guardian_email: res.student.guardian_email || '',
        guardian_nic: res.student.guardian_nic || '',
        emergency_contact: res.student.emergency_contact || '',
        status: res.student.status,
        class_id: res.student.class_id ? String(res.student.class_id) : '',
        roll_number: res.student.roll_number ? String(res.student.roll_number) : ''
      });
      // Set default exam for report card if marks exist
      if (res.marks && res.marks.length > 0) {
        setSelectedExamId(res.marks[0].examination_id);
      } else {
        try {
          const exRes = await api.getExaminations();
          const pubExam = (exRes.examinations || []).find((e: any) => e.is_published === 1) || exRes.examinations?.[0];
          setSelectedExamId(pubExam?.id || null);
        } catch {
          setSelectedExamId(null);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load student record details.');
    } finally {
      setLoading(false);
    }
  };

  const loadClasses = async () => {
    try {
      const res = await api.getClasses();
      setClasses(res.classes || []);
    } catch (err) {
      console.error('Failed to load classes for edit:', err);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingEdit(true);
      setEditError(null);
      await api.updateStudent(studentId, editFormData);
      setShowEditModal(false);
      await loadStudent();
      if (onStudentUpdated) onStudentUpdated();
    } catch (err: any) {
      setEditError(err.message || 'Failed to save student record updates.');
    } finally {
      setSavingEdit(false);
    }
  };

  const calculateAge = (dobString: string) => {
    if (!dobString) return '';
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age > 0 ? `${age} Years` : '';
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4.5rem 1rem' }}>
        <div className="animate-spin" style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
        <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.85rem' }}>Loading comprehensive student record...</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
          Retrieving academic enrollment, guardian contacts, and attendance history.
        </p>
      </div>
    );
  }

  if (error || !data?.student) {
    return (
      <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
        <AlertCircle size={36} style={{ color: 'var(--absent)', margin: '0 auto 1rem' }} />
        <h3>Failed to Load Student Record</h3>
        <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem' }}>{error || 'Student not found.'}</p>
        <button type="button" onClick={onBack} className="btn btn-primary">
          <ArrowLeft size={16} /> Back to Student Directory
        </button>
      </div>
    );
  }

  const { student, attendance, marks } = data;
  const attRate = attendance?.attendanceRate !== undefined ? attendance.attendanceRate : 100;
  const isFemale = student.gender === 'Female';

  return (
    <div className="dossier-page">
      {/* Top Breadcrumb & Navigation */}
      <div className="dossier-nav-bar btn-no-print">
        <button
          type="button"
          onClick={onBack}
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
        >
          <ArrowLeft size={16} />
          <span>Back to Student Directory</span>
        </button>

        <div className="dossier-action-group">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-secondary btn-sm"
          >
            <Printer size={15} />
            <span>Print Student Dossier</span>
          </button>

          <button
            type="button"
            onClick={() => setShowReportCard(true)}
            className="btn btn-secondary btn-sm"
            style={{ color: 'var(--primary)', borderColor: 'var(--primary-light)' }}
          >
            <Award size={15} />
            <span>Terminal Report Card</span>
          </button>

          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="btn btn-primary btn-sm"
            >
              <Edit3 size={15} />
              <span>Edit Student Record</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Student Hero Card */}
      <div className="dossier-hero-card">
        <div className="dossier-hero-left">
          <div
            className="dossier-avatar"
            style={{
              background: isFemale
                ? 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)'
                : 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)'
            }}
            aria-hidden="true"
          >
            {student.calling_name?.charAt(0) || student.full_name?.charAt(0) || 'S'}
          </div>

          <div className="dossier-hero-identity">
            <div className="dossier-name-row">
              <h2 className="dossier-full-name">{student.full_name}</h2>
              <span
                className={`badge ${
                  student.status === 'Active'
                    ? 'badge-present'
                    : student.status === 'Transferred'
                    ? 'badge-late'
                    : 'badge-absent'
                }`}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem', fontWeight: 700 }}
              >
                {student.status}
              </span>
            </div>

            <p className="dossier-sub-id">
              Calling Name: <strong style={{ color: 'var(--text-main)' }}>{student.calling_name}</strong> • Permanent Admission ID:{' '}
              <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>
                {student.admission_no}
              </strong>
            </p>

            <div className="dossier-badges-row">
              <span className="dossier-pill">
                <School size={13} style={{ color: 'var(--primary)' }} />
                <span>{student.class_name || 'Class Unassigned'}</span>
              </span>

              {student.roll_number && (
                <span className="dossier-pill">
                  Roll #{student.roll_number}
                </span>
              )}

              <span className="dossier-pill">
                {student.gender}
              </span>

              <span className="dossier-pill">
                <Calendar size={13} />
                <span>DOB: {student.dob} {calculateAge(student.dob) ? `(${calculateAge(student.dob)})` : ''}</span>
              </span>

              <span className="dossier-pill">
                Year: {student.academic_year || '2026'}
              </span>
            </div>
          </div>
        </div>

        {/* Key Attendance Metric Box */}
        <div className="dossier-kpi-box">
          <div
            className="dossier-kpi-value"
            style={{
              color: attRate >= 80 ? 'var(--present)' : attRate >= 60 ? 'var(--late)' : 'var(--absent)'
            }}
          >
            {attRate}%
          </div>
          <div className="dossier-kpi-labels">
            <span className="dossier-kpi-title">Attendance Rate</span>
            <span className="dossier-kpi-subtitle">
              {attendance?.present_days || 0} / {attendance?.total_days || 0} days recorded
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Information Sections */}
      <div className="dossier-grid">
        {/* Card 1: Personal & Demographic Information */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <User size={18} style={{ color: 'var(--primary)' }} />
              <span>Personal & Demographic Information</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Official Registry</span>
          </div>

          <div className="dossier-data-list">
            <div className="dossier-data-row">
              <span className="dossier-data-label">Full Name:</span>
              <span className="dossier-data-value">{student.full_name}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Calling Name:</span>
              <span className="dossier-data-value">{student.calling_name}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Permanent Admission No:</span>
              <span className="dossier-data-value" style={{ color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>
                {student.admission_no}
              </span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Date of Birth:</span>
              <span className="dossier-data-value">{student.dob} ({calculateAge(student.dob)})</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Gender:</span>
              <span className="dossier-data-value">{student.gender}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Enrollment Status:</span>
              <span className={`badge ${student.status === 'Active' ? 'badge-present' : 'badge-absent'}`}>
                {student.status}
              </span>
            </div>

            <div className="dossier-data-row" style={{ alignItems: 'flex-start' }}>
              <span className="dossier-data-label">Residential Address:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                <MapPin size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span>{student.address || 'No residential address on file'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Guardian & Emergency Contacts */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <Shield size={18} style={{ color: 'var(--present)' }} />
              <span>Guardian & Emergency Contacts</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Verified Contact</span>
          </div>

          <div className="dossier-data-list">
            <div className="dossier-data-row">
              <span className="dossier-data-label">Primary Guardian:</span>
              <span className="dossier-data-value">{student.guardian_name}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Relationship:</span>
              <span className="dossier-data-value">{student.guardian_relation}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Guardian Telephone:</span>
              <a
                href={`tel:${student.guardian_phone}`}
                className="btn btn-secondary btn-sm"
                style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Phone size={13} />
                <strong>{student.guardian_phone}</strong>
              </a>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Guardian Email:</span>
              <span className="dossier-data-value">
                {student.guardian_email ? (
                  <a href={`mailto:${student.guardian_email}`} style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Mail size={12} /> {student.guardian_email}
                  </a>
                ) : (
                  'Not provided'
                )}
              </span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">National Identity Card (NIC):</span>
              <span className="dossier-data-value">{student.guardian_nic || 'Not registered'}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Emergency Contact:</span>
              <span className="dossier-data-value">{student.emergency_contact || student.guardian_phone}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Classroom & Academic Placement */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <School size={18} style={{ color: 'var(--excused)' }} />
              <span>Classroom & Academic Placement</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Curriculum Assignment</span>
          </div>

          <div className="dossier-data-list">
            <div className="dossier-data-row">
              <span className="dossier-data-label">Assigned Class:</span>
              <strong className="dossier-data-value">{student.class_name || 'Grade 8-A'}</strong>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Grade Level:</span>
              <span className="dossier-data-value">Grade {student.grade || 8}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Classroom Location:</span>
              <span className="dossier-data-value">{student.room_number || 'Main School Block'}</span>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Class Teacher:</span>
              <strong className="dossier-data-value">{student.class_teacher_name || 'Mrs. Nimali Jayasinghe'}</strong>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Roll Number:</span>
              <strong className="dossier-data-value">#{student.roll_number || '1'}</strong>
            </div>

            <div className="dossier-data-row">
              <span className="dossier-data-label">Current Academic Year:</span>
              <span className="dossier-data-value">{student.academic_year || '2026'}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Attendance Summary Statistics */}
        <div className="dossier-card">
          <div className="dossier-card-header">
            <h3 className="dossier-card-title">
              <CheckCircle2 size={18} style={{ color: 'var(--present)' }} />
              <span>Attendance Statistics</span>
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Term Attendance Metrics</span>
          </div>

          <div className="dossier-att-grid">
            <div className="dossier-att-stat">
              <div className="dossier-att-count" style={{ color: 'var(--present)' }}>
                {attendance?.present_days || 0}
              </div>
              <div className="dossier-att-label">Days Present</div>
            </div>

            <div className="dossier-att-stat">
              <div className="dossier-att-count" style={{ color: 'var(--absent)' }}>
                {attendance?.absent_days || 0}
              </div>
              <div className="dossier-att-label">Days Absent</div>
            </div>

            <div className="dossier-att-stat">
              <div className="dossier-att-count" style={{ color: 'var(--late)' }}>
                {attendance?.late_days || 0}
              </div>
              <div className="dossier-att-label">Days Late</div>
            </div>

            <div className="dossier-att-stat">
              <div className="dossier-att-count" style={{ color: 'var(--excused)' }}>
                {attendance?.excused_days || 0}
              </div>
              <div className="dossier-att-label">Days Excused</div>
            </div>
          </div>

          <div
            style={{
              padding: '0.65rem 0.9rem',
              borderRadius: 'var(--radius-md)',
              background: attRate >= 80 ? 'var(--present-bg)' : 'var(--absent-bg)',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              border: `1px solid ${attRate >= 80 ? 'var(--present-border)' : 'var(--absent-border)'}`
            }}
          >
            <CheckCircle2 size={16} color="var(--primary)" />
            <span>Cumulative Term Attendance Rate: {attRate}%</span>
          </div>
        </div>
      </div>

      {/* Recent Attendance Register History */}
      {attendance?.history && attendance.history.length > 0 && (
        <div className="dossier-table-card card" style={{ padding: 0 }}>
          <div className="dossier-table-header">
            <div>
              <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700 }}>Daily Attendance History Log</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                Recent roll-call entries recorded for this student
              </p>
            </div>
          </div>

          <div className="table-responsive" style={{ maxHeight: '240px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Attendance Status</th>
                  <th>Reason / Remarks</th>
                </tr>
              </thead>
              <tbody>
                {attendance.history.map((h: any, idx: number) => {
                  let badge = 'badge-present';
                  if (h.status === 'absent') badge = 'badge-absent';
                  if (h.status === 'late') badge = 'badge-late';
                  if (h.status === 'excused') badge = 'badge-excused';

                  return (
                    <tr key={idx}>
                      <td><strong>{h.date}</strong></td>
                      <td>{h.class_name}</td>
                      <td>
                        <span className={`badge ${badge}`} style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                          {h.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                        {h.remarks || 'Normal attendance'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Examination Performance & Marks Table */}
      <div className="dossier-table-card card" style={{ padding: 0 }}>
        <div className="dossier-table-header">
          <div>
            <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700 }}>Examination Marks & Academic Performance</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Official examination marks, subject assignments (Mathematics, Science), and grade allocations
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowReportCard(true)}
            className="btn btn-primary btn-sm btn-no-print"
          >
            <Award size={15} />
            <span>View Full Report Card</span>
          </button>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Examination</th>
                <th>Subject Code</th>
                <th>Subject Name</th>
                <th style={{ textAlign: 'center' }}>Term</th>
                <th style={{ textAlign: 'center' }}>Score / Result</th>
                <th style={{ textAlign: 'center' }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {marks && marks.length > 0 ? (
                marks.map((m: any) => (
                  <tr key={m.id}>
                    <td><strong>{m.examination_name}</strong></td>
                    <td><code>{m.subject_code}</code></td>
                    <td>{m.subject_name}</td>
                    <td style={{ textAlign: 'center' }}>Term {m.term}</td>
                    <td style={{ textAlign: 'center' }}>
                      <strong>{m.is_absent ? 'ABSENT' : m.score}</strong>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`grade-badge grade-${m.grade_letter?.toLowerCase() || 's'}`}>
                        {m.grade_letter}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No examination records submitted for this student yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Student Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem', margin: 0 }}>Edit Student Record</h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="btn btn-secondary btn-icon btn-sm"
                aria-label="Close edit modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                {editError && (
                  <div
                    style={{
                      background: 'var(--absent-bg)',
                      color: 'var(--absent)',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '1rem',
                      fontSize: '0.85rem'
                    }}
                  >
                    {editError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Calling Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editFormData.calling_name || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, calling_name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editFormData.full_name || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Date of Birth *</label>
                    <input
                      type="date"
                      className="form-input"
                      value={editFormData.dob || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, dob: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Gender *</label>
                    <select
                      className="form-select"
                      value={editFormData.gender || 'Male'}
                      onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Class Assignment</label>
                    <select
                      className="form-select"
                      value={editFormData.class_id || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, class_id: e.target.value })}
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
                      value={editFormData.roll_number || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, roll_number: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Residential Address</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editFormData.address || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  />
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', margin: '1rem 0', paddingTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Guardian Contacts</h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Guardian Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.guardian_name || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, guardian_name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Relation *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.guardian_relation || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, guardian_relation: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Guardian Phone *</label>
                      <input
                        type="tel"
                        className="form-input"
                        value={editFormData.guardian_phone || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, guardian_phone: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Guardian Email</label>
                      <input
                        type="email"
                        className="form-input"
                        value={editFormData.guardian_email || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, guardian_email: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={savingEdit} className="btn btn-primary">
                  {savingEdit ? 'Saving...' : 'Save Updates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminal Report Card Modal */}
      {showReportCard && (
        <StudentReportCard
          studentId={studentId}
          examId={selectedExamId || 1}
          onClose={() => setShowReportCard(false)}
        />
      )}
    </div>
  );
};

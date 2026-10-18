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
  XCircle,
  Clock,
  HelpCircle,
  FileText,
  School,
  X,
  Save,
  AlertCircle
} from 'lucide-react';
import { api } from '../api/client';
import { StudentReportCard } from './StudentReportCard';

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
        setSelectedExamId(1);
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
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>Loading comprehensive student record...</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
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
        <button onClick={onBack} className="btn btn-primary">
          <ArrowLeft size={16} /> Back to Student Directory
        </button>
      </div>
    );
  }

  const { student, attendance, marks } = data;
  const attRate = attendance?.attendanceRate !== undefined ? attendance.attendanceRate : 100;
  const isFemale = student.gender === 'Female';

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* Top Breadcrumb & Navigation */}
      <div
        className="btn-no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <button
          onClick={onBack}
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ArrowLeft size={16} />
          <span>Back to Student Directory</span>
        </button>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button onClick={() => window.print()} className="btn btn-secondary btn-sm">
            <Printer size={15} />
            <span>Print Student Dossier</span>
          </button>

          <button
            onClick={() => setShowReportCard(true)}
            className="btn btn-secondary btn-sm"
            style={{ color: 'var(--primary)', borderColor: 'var(--border-focus)' }}
          >
            <Award size={15} />
            <span>Terminal Report Card</span>
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={() => setShowEditModal(true)}
              className="btn btn-primary btn-sm"
            >
              <Edit3 size={15} />
              <span>Edit Student Record</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Student Header Hero Card */}
      <div
        className="card"
        style={{
          padding: '1.75rem',
          marginBottom: '1.5rem',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-md)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1.5rem',
            flexWrap: 'wrap'
          }}
        >
          {/* Avatar */}
          <div
            className="user-avatar"
            style={{
              width: 80,
              height: 80,
              fontSize: '2rem',
              fontWeight: 800,
              background: isFemale
                ? 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)'
                : 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              boxShadow: 'var(--shadow-glow)'
            }}
          >
            {student.calling_name?.charAt(0) || student.full_name?.charAt(0)}
          </div>

          {/* Student Info */}
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
              <h2 style={{ fontSize: '1.75rem', lineHeight: 1.2 }}>{student.full_name}</h2>
              <span
                className={`badge ${
                  student.status === 'Active'
                    ? 'badge-present'
                    : student.status === 'Transferred'
                    ? 'badge-late'
                    : 'badge-absent'
                }`}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
              >
                {student.status}
              </span>
            </div>

            <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Calling Name: <strong style={{ color: 'var(--text-main)' }}>{student.calling_name}</strong> • Permanent Admission ID:{' '}
              <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>
                {student.admission_no}
              </strong>
            </p>

            {/* Quick Badges */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'var(--bg-subtle)', color: 'var(--text-main)' }}>
                <School size={13} style={{ marginRight: 3, color: 'var(--primary)' }} />
                {student.class_name || 'Class Unassigned'}
              </span>

              {student.roll_number && (
                <span className="badge" style={{ background: 'var(--bg-subtle)' }}>
                  Roll #{student.roll_number}
                </span>
              )}

              <span className="badge" style={{ background: 'var(--bg-subtle)' }}>
                {student.gender}
              </span>

              <span className="badge" style={{ background: 'var(--bg-subtle)' }}>
                <Calendar size={13} style={{ marginRight: 3 }} />
                DOB: {student.dob} {calculateAge(student.dob) ? `(${calculateAge(student.dob)})` : ''}
              </span>

              <span className="badge" style={{ background: 'var(--bg-subtle)' }}>
                Year: {student.academic_year || '2026'}
              </span>
            </div>
          </div>

          {/* Key Stat Rings */}
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              borderLeft: '1px solid var(--border-color)',
              paddingLeft: '1.5rem',
              minWidth: '200px'
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2.25rem',
                  fontWeight: 800,
                  lineHeight: 1,
                  color: attRate >= 80 ? 'var(--present)' : attRate >= 60 ? 'var(--late)' : 'var(--absent)'
                }}
              >
                {attRate}%
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontWeight: 600 }}>
                Attendance Rate
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {attendance?.present_days || 0} / {attendance?.total_days || 0} days recorded
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Detailed Sections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Card 1: Personal & Demographics */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={18} style={{ color: 'var(--primary)' }} />
                <span>Personal & Demographic Information</span>
              </div>
              <div className="card-subtitle">Official Ministry enrollment registry data</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Full Name:</span>
              <strong>{student.full_name}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Calling Name:</span>
              <strong>{student.calling_name}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Permanent Admission No:</span>
              <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>{student.admission_no}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Date of Birth:</span>
              <span>{student.dob} ({calculateAge(student.dob)})</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Gender:</span>
              <span>{student.gender}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Enrollment Status:</span>
              <span className={`badge ${student.status === 'Active' ? 'badge-present' : 'badge-absent'}`}>
                {student.status}
              </span>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Residential Address:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500 }}>
                <MapPin size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span>{student.address || 'No residential address on file'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Guardian & Emergency Contact Details */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={18} style={{ color: 'var(--present)' }} />
                <span>Guardian & Emergency Contacts</span>
              </div>
              <div className="card-subtitle">Primary parental and emergency contact details</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Primary Guardian:</span>
              <strong>{student.guardian_name}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Relationship:</span>
              <span>{student.guardian_relation}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Guardian Telephone:</span>
              <a
                href={`tel:${student.guardian_phone}`}
                className="btn btn-secondary btn-sm"
                style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Phone size={13} />
                <strong>{student.guardian_phone}</strong>
              </a>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Guardian Email:</span>
              <span>
                {student.guardian_email ? (
                  <a href={`mailto:${student.guardian_email}`} style={{ color: 'var(--primary)' }}>
                    {student.guardian_email}
                  </a>
                ) : (
                  'Not provided'
                )}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>National Identity Card (NIC):</span>
              <span>{student.guardian_nic || 'Not registered'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Emergency Contact:</span>
              <span>{student.emergency_contact || student.guardian_phone}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Academic Placement */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <School size={18} style={{ color: 'var(--excused)' }} />
                <span>Classroom & Academic Placement</span>
              </div>
              <div className="card-subtitle">Class division and assigned educator</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Assigned Class:</span>
              <strong>{student.class_name || 'Unassigned'}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Grade Level:</span>
              <span>Grade {student.grade}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Classroom Location:</span>
              <span>{student.room_number || 'Main School Block'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Class Teacher:</span>
              <strong>{student.class_teacher_name || 'Mrs. Nimali Perera'}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Roll Number:</span>
              <strong>#{student.roll_number || 'Unassigned'}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Current Academic Year:</span>
              <span>{student.academic_year || '2026'}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Attendance Summary Stats */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={18} style={{ color: 'var(--present)' }} />
                <span>Attendance Statistics</span>
              </div>
              <div className="card-subtitle">Daily register attendance metrics</div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.75rem',
              marginBottom: '1rem'
            }}
          >
            <div style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--present)' }}>
                {attendance?.present_days || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Days Present</div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--absent)' }}>
                {attendance?.absent_days || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Days Absent</div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--late)' }}>
                {attendance?.late_days || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Days Late</div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--excused)' }}>
                {attendance?.excused_days || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Days Excused</div>
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
              gap: '0.4rem'
            }}
          >
            <CheckCircle2 size={16} color="var(--primary)" />
            <span>Cumulative Term Attendance Rate: {attRate}%</span>
          </div>
        </div>
      </div>

      {/* Recent Attendance Register History */}
      {attendance?.history && attendance.history.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '1.1rem' }}>Daily Attendance History Log</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Individual attendance session logs recorded by the class teacher
            </p>
          </div>

          <div className="table-responsive" style={{ maxHeight: '220px' }}>
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
                        <span className={`badge ${badge}`} style={{ textTransform: 'capitalize' }}>
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
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.1rem' }}>Examination Marks & Academic Performance</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Official examination marks entries, distinction grades, and terminal summaries
            </p>
          </div>

          <button
            onClick={() => setShowReportCard(true)}
            className="btn btn-primary btn-sm btn-no-print"
          >
            <Award size={15} /> View Full Report Card
          </button>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Examination</th>
                <th>Subject Code</th>
                <th>Subject Name</th>
                <th style={{ textAlign: 'center', width: 120 }}>Score (100)</th>
                <th style={{ textAlign: 'center', width: 90 }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {!marks || marks.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No examination marks entered for this student yet.
                  </td>
                </tr>
              ) : (
                marks.map((m: any) => (
                  <tr key={m.id}>
                    <td><strong>{m.examination_name}</strong> (Term {m.term})</td>
                    <td><code>{m.subject_code}</code></td>
                    <td>{m.subject_name}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.95rem' }}>
                      {m.is_absent ? (
                        <span style={{ color: 'var(--absent)' }}>AB (Absent)</span>
                      ) : m.score !== null ? (
                        m.score
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`grade-badge grade-${m.grade_letter?.toLowerCase() || 's'}`}>
                        {m.grade_letter}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Student Record Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem' }}>Edit Student Record</h3>
              <button onClick={() => setShowEditModal(false)} className="btn btn-secondary btn-icon btn-sm">
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
                    <label className="form-label">Full Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editFormData.full_name || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                      required
                    />
                  </div>

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
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Date of Birth</label>
                    <input
                      type="date"
                      className="form-input"
                      value={editFormData.dob || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, dob: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Gender</label>
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
                  <label className="form-label">Enrollment Status</label>
                  <select
                    className="form-select"
                    value={editFormData.status || 'Active'}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                  >
                    <option value="Active">Active</option>
                    <option value="Transferred">Transferred</option>
                    <option value="Graduated">Graduated</option>
                    <option value="Suspended">Suspended</option>
                  </select>
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
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Guardian & Contact Info</h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Guardian Name</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.guardian_name || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, guardian_name: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Relation</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.guardian_relation || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, guardian_relation: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Guardian Phone</label>
                      <input
                        type="tel"
                        className="form-input"
                        value={editFormData.guardian_phone || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, guardian_phone: e.target.value })}
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
                  <Save size={15} />
                  <span>{savingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminal Report Card Modal */}
      {showReportCard && selectedExamId && (
        <StudentReportCard
          studentId={studentId}
          examId={selectedExamId}
          onClose={() => setShowReportCard(false)}
        />
      )}
    </div>
  );
};

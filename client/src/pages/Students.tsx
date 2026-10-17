import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  Upload,
  Download,
  Eye,
  Edit,
  X,
  AlertCircle,
  CheckCircle2,
  Phone,
  Calendar,
  FileSpreadsheet,
  Maximize2
} from 'lucide-react';
import { api } from '../api/client';
import { StudentFullView } from './StudentFullView';

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

    // Parse CSV lines into objects
    const lines = csvText.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      alert('CSV must contain a header line and at least one data row.');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
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
    const rows = students.map(s => [
      s.admission_no,
      `"${s.full_name}"`,
      s.calling_name,
      s.class_name || '',
      s.gender,
      `"${s.guardian_name}"`,
      s.guardian_phone,
      s.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `skoolsys-students-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sampleCsvTemplate = `admission_no,full_name,calling_name,dob,gender,guardian_name,guardian_relation,guardian_phone,class_name
SCH-2026-101,Ravindu Nirmal Perera,Ravindu,2012-06-14,Male,Kamal Perera,Father,0771122334,Grade 8-A
SCH-2026-102,Hansani Malsha Jayakody,Hansani,2012-09-21,Female,Geetha Jayakody,Mother,0712233445,Grade 8-A`;

  // Render Full View if a student is selected for full view
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
    <div>
      {/* Header & Action Bar */}

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
          <h2>Student Management (Grades 6–13)</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Manage permanent admission records, enrollment classes, and emergency guardian contacts.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button onClick={handleExportCsv} className="btn btn-secondary btn-sm">
            <Download size={15} /> Export CSV
          </button>

          {user.role === 'admin' && (
            <>
              <button onClick={() => setShowImportModal(true)} className="btn btn-secondary btn-sm">
                <Upload size={15} /> Bulk CSV Import
              </button>

              <button onClick={() => setShowAddModal(true)} className="btn btn-primary btn-sm">
                <Plus size={15} /> Add New Student
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.2rem', paddingRight: '0.5rem' }}
              placeholder="Search by Admission No, Name, or Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ width: '130px' }}>
            <select
              className="form-select"
              value={selectedGrade}
              onChange={(e) => {
                setSelectedGrade(e.target.value);
                setSelectedClass('');
              }}
            >
              <option value="">All Grades</option>
              {grades.map((g) => (
                <option key={g} value={g}>Grade {g}</option>
              ))}
            </select>
          </div>

          <div style={{ width: '160px' }}>
            <select
              className="form-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              <option value="">All Classes</option>
              {classes
                .filter((c) => !selectedGrade || c.grade === Number(selectedGrade))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
          </div>

          <div style={{ width: '130px' }}>
            <select
              className="form-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Transferred">Transferred</option>
              <option value="Graduated">Graduated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Student Records Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Admission No</th>
                <th>Student Full Name</th>
                <th>Class</th>
                <th>Gender</th>
                <th>Guardian Contact</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                    Loading student records...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>No student records matching criteria found.</div>
                  </td>
                </tr>
              ) : (
                students.map((st) => (
                  <tr key={st.id}>
                    <td>
                      <strong
                        onClick={() => setFullViewStudentId(st.id)}
                        style={{ fontFamily: 'var(--font-display)', color: 'var(--primary)', cursor: 'pointer' }}
                        title="Click to view comprehensive full record"
                      >
                        {st.admission_no}
                      </strong>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div
                          className="user-avatar"
                          onClick={() => setFullViewStudentId(st.id)}
                          style={{
                            width: 32,
                            height: 32,
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            background: st.gender === 'Female' ? '#db2777' : '#4f46e5'
                          }}
                          title="Click to view full record"
                        >
                          {st.calling_name?.charAt(0) || 'S'}
                        </div>
                        <div>
                          <div
                            onClick={() => setFullViewStudentId(st.id)}
                            style={{ fontWeight: 600, cursor: 'pointer' }}
                            title="Click to view comprehensive full record"
                          >
                            {st.full_name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Call Name: {st.calling_name} • DOB: {st.dob}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--bg-subtle)' }}>
                        {st.class_name || 'Unassigned'}
                      </span>
                    </td>
                    <td>{st.gender}</td>
                    <td>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{st.guardian_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={11} /> {st.guardian_phone} ({st.guardian_relation})
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
                          onClick={() => setFullViewStudentId(st.id)}
                          className="btn btn-primary btn-sm"
                          style={{ padding: '0.35rem 0.65rem' }}
                          title="Open full view dossier"
                        >
                          <Maximize2 size={13} /> Full View
                        </button>
                        <button
                          onClick={() => handleOpenProfile(st)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.35rem 0.55rem' }}
                          title="Quick preview modal"
                        >
                          <Eye size={13} />
                        </button>
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem' }}>Add New Student Admission</h3>
              <button onClick={() => setShowAddModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div className="modal-body">
                {formError && (
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
                    {formError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                </div>

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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                </div>

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

                <div style={{ borderTop: '1px solid var(--border-color)', margin: '1rem 0', paddingTop: '1rem' }}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Guardian & Emergency Contact</h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Admission Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Profile Modal */}
      {showProfileModal && selectedStudent && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="brand-badge" style={{ width: 44, height: 44 }}>
                  {selectedStudent.calling_name?.charAt(0)}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem' }}>{selectedStudent.full_name}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Admission ID: <strong>{selectedStudent.admission_no}</strong> • Class: {selectedStudent.class_name || 'N/A'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileModal(false);
                    setFullViewStudentId(selectedStudent.id);
                  }}
                  className="btn btn-primary btn-sm"
                  title="Expand to Full View Dossier"
                >
                  <Maximize2 size={13} /> Full View
                </button>
                <button onClick={() => setShowProfileModal(false)} className="btn btn-secondary btn-icon btn-sm">
                  <X size={18} />
                </button>
              </div>
            </div>


            <div className="modal-body">
              {studentDetails ? (
                <>
                  {/* Attendance & Key Stats */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '0.75rem',
                      marginBottom: '1.5rem'
                    }}
                  >
                    <div style={{ padding: '0.85rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--present)' }}>
                        {studentDetails.attendance?.attendanceRate || 100}%
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Attendance Rate</div>
                    </div>

                    <div style={{ padding: '0.85rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                        {studentDetails.attendance?.present_days || 0}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Days Present</div>
                    </div>

                    <div style={{ padding: '0.85rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--absent)' }}>
                        {studentDetails.attendance?.absent_days || 0}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Days Absent</div>
                    </div>

                    <div style={{ padding: '0.85rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--late)' }}>
                        {studentDetails.attendance?.late_days || 0}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Days Late</div>
                    </div>
                  </div>

                  {/* Details Card */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                      Personal & Guardian Information
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
                      <div><strong>Date of Birth:</strong> {selectedStudent.dob}</div>
                      <div><strong>Gender:</strong> {selectedStudent.gender}</div>
                      <div><strong>Guardian:</strong> {selectedStudent.guardian_name} ({selectedStudent.guardian_relation})</div>
                      <div><strong>Phone:</strong> {selectedStudent.guardian_phone}</div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <strong>Address:</strong> {selectedStudent.address || 'Not provided'}
                      </div>
                    </div>
                  </div>

                  {/* Academic Marks History */}
                  <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                      Term Examination Marks
                    </h4>
                    {studentDetails.marks && studentDetails.marks.length > 0 ? (
                      <table className="data-table">
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
                    ) : (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        No examination marks submitted for this student yet.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p>Loading full profile details...</p>
              )}
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowProfileModal(false)} className="btn btn-secondary">
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  setFullViewStudentId(selectedStudent.id);
                }}
                className="btn btn-primary"
              >
                <Maximize2 size={15} /> Open Comprehensive Full View
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CSV Bulk Import Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <FileSpreadsheet size={22} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '1.15rem' }}>Bulk CSV Student Import & Validation</h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Paste CSV data below. The system will validate required columns, detect duplicate admission numbers, and match classes before importing.
              </p>

              <div style={{ marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setCsvText(sampleCsvTemplate)}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem' }}
                >
                  Load Sample Template
                </button>
              </div>

              <textarea
                className="form-textarea"
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Paste CSV rows here..."
                style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
              />

              <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleCsvPreview}
                  disabled={importing || !csvText.trim()}
                  className="btn btn-secondary btn-sm"
                >
                  {importing ? 'Validating...' : 'Validate & Preview CSV'}
                </button>
              </div>

              {/* Validation Results Preview */}
              {importPreview && (
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                    <span className="badge badge-present">Valid: {importPreview.validCount}</span>
                    <span className="badge badge-absent">Duplicates/Errors: {importPreview.errorCount}</span>
                    <span>Total Rows: {importPreview.totalRows}</span>
                  </div>

                  <div className="table-responsive" style={{ maxHeight: '200px' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Admission</th>
                          <th>Name</th>
                          <th>Class</th>
                          <th>Validation Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.preview.map((p: any) => (
                          <tr key={p.index}>
                            <td>{p.index}</td>
                            <td>{p.data.admission_no}</td>
                            <td>{p.data.full_name}</td>
                            <td>{p.data.class_name}</td>
                            <td>
                              {p.isValid ? (
                                <span className="badge badge-present">
                                  <CheckCircle2 size={12} /> Ready
                                </span>
                              ) : (
                                <span className="badge badge-absent" title={p.errors.join(', ')}>
                                  <AlertCircle size={12} /> {p.errors[0]}
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
              <button onClick={() => setShowImportModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              {importPreview && importPreview.validCount > 0 && (
                <button
                  onClick={handleCsvCommit}
                  disabled={importing}
                  className="btn btn-primary"
                >
                  {importing ? 'Importing...' : `Confirm Import (${importPreview.validCount} Students)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

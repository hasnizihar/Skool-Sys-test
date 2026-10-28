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
  RotateCcw
} from 'lucide-react';
import { api } from '../api/client';
import { StudentFullView } from './StudentFullView';
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

          {user.role === 'admin' && (
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
      <div className="students-kpi-grid">
        <div className="students-kpi-card">
          <div className="students-kpi-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            <Users size={22} />
          </div>
          <div className="students-kpi-info">
            <span className="students-kpi-value">{metrics.total}</span>
            <span className="students-kpi-label">Total Enrolled</span>
          </div>
        </div>

        <div className="students-kpi-card">
          <div className="students-kpi-icon" style={{ background: 'var(--present-bg)', color: 'var(--present)' }}>
            <UserCheck size={22} />
          </div>
          <div className="students-kpi-info">
            <span className="students-kpi-value">{metrics.active}</span>
            <span className="students-kpi-label">Active Pupils</span>
          </div>
        </div>

        <div className="students-kpi-card">
          <div className="students-kpi-icon" style={{ background: 'var(--late-bg)', color: 'var(--late)' }}>
            <Calendar size={22} />
          </div>
          <div className="students-kpi-info">
            <span className="students-kpi-value">{metrics.male}M / {metrics.female}F</span>
            <span className="students-kpi-label">Gender Breakdown</span>
          </div>
        </div>

        <div className="students-kpi-card">
          <div className="students-kpi-icon" style={{ background: 'var(--excused-bg)', color: 'var(--excused)' }}>
            <Building size={22} />
          </div>
          <div className="students-kpi-info">
            <span className="students-kpi-value">{metrics.uniqueClasses}</span>
            <span className="students-kpi-label">Classes Represented</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="students-filter-card">
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
      </div>

      {/* Student Records Table Card */}
      <div className="students-table-card card" style={{ padding: 0 }}>
        <div className="table-responsive">
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
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem' }}>
                    <div className="animate-spin" style={{ display: 'inline-block', width: 26, height: 26, border: '3px solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
                    <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      Loading student records...
                    </p>
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      No student records matching criteria found.
                    </div>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: '0.75rem' }}
                      >
                        <RotateCcw size={14} /> Clear Active Filters
                      </button>
                    )}
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
                            backgroundColor: st.gender === 'Female' ? '#db2777' : '#4f46e5'
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
                      <span className="badge" style={{ background: 'var(--bg-subtle)', fontWeight: 600 }}>
                        {st.class_name || 'Unassigned'}
                      </span>
                    </td>

                    <td>{st.gender}</td>

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
        </div>
      </div>

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem' }}>Add New Student Admission</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="btn btn-secondary btn-icon btn-sm"
                aria-label="Close add student modal"
              >
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

      {/* Student Profile Quick Modal */}
      {showProfileModal && selectedStudent && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="brand-badge" style={{ width: 44, height: 44, borderRadius: '50%' }}>
                  {selectedStudent.calling_name?.charAt(0)}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{selectedStudent.full_name}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.15rem 0 0' }}>
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
                  <Maximize2 size={13} />
                  <span>Full View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="btn btn-secondary btn-icon btn-sm"
                  aria-label="Close quick preview modal"
                >
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
              <button type="button" onClick={() => setShowProfileModal(false)} className="btn btn-secondary">
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
                <Maximize2 size={15} />
                <span>Open Comprehensive Full View</span>
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
                <h3 style={{ fontSize: '1.15rem', margin: 0 }}>Bulk CSV Student Import & Validation</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="btn btn-secondary btn-icon btn-sm"
                aria-label="Close import modal"
              >
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
                style={{ fontFamily: 'monospace', fontSize: '0.8rem', width: '100%' }}
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

              {/* Preview Results Table */}
              {importPreview && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h4 style={{ fontSize: '0.9rem' }}>CSV Validation Summary</h4>
                    <span className="badge" style={{ background: importPreview.hasErrors ? 'var(--absent-bg)' : 'var(--present-bg)', color: importPreview.hasErrors ? 'var(--absent)' : 'var(--present)' }}>
                      {importPreview.preview?.length || 0} rows parsed • {importPreview.hasErrors ? 'Errors detected' : 'All rows valid'}
                    </span>
                  </div>

                  <div className="table-responsive" style={{ maxHeight: '200px' }}>
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
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowImportModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCsvCommit}
                disabled={importing || !importPreview || importPreview.hasErrors}
                className="btn btn-primary"
              >
                {importing ? 'Importing...' : 'Commit & Import Valid Students'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

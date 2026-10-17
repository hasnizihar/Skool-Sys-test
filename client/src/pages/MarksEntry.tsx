import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Save,
  Award,
  TrendingUp,
  Users,
  CheckCircle2,
  FileText,
  AlertCircle
} from 'lucide-react';
import { api } from '../api/client';
import { StudentReportCard } from './StudentReportCard';

interface MarksEntryProps {
  user: any;
}

export const MarksEntry: React.FC<MarksEntryProps> = ({ user }) => {
  const [exams, setExams] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);

  const [roster, setRoster] = useState<any[]>([]);
  const [marksMap, setMarksMap] = useState<Record<number, { score: string; is_absent: boolean }>>({});
  const [stats, setStats] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Selected student for report card modal
  const [reportStudentId, setReportStudentId] = useState<number | null>(null);

  useEffect(() => {
    loadSelectors();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      loadClassSubjects(selectedClassId);
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedExamId && selectedClassId && selectedSubjectId) {
      loadMarksSheet(selectedExamId, selectedClassId, selectedSubjectId);
    }
  }, [selectedExamId, selectedClassId, selectedSubjectId]);

  const loadSelectors = async () => {
    try {
      const [examRes, classRes] = await Promise.all([
        api.getExaminations(),
        api.getClasses()
      ]);

      const ex = examRes.examinations || [];
      const cls = classRes.classes || [];

      setExams(ex);
      setClasses(cls);

      if (ex.length > 0) setSelectedExamId(ex[0].id);
      if (cls.length > 0) setSelectedClassId(cls[0].id);
    } catch (err) {
      console.error('Failed to load marks selectors:', err);
    }
  };

  const loadClassSubjects = async (classId: number) => {
    try {
      const res = await api.getClassSubjects(classId);
      let subs = res.subjects || [];

      // If user is subject teacher, filter to their assigned subjects for this class
      if (user.role === 'subject_teacher' && user.assignments) {
        const assignedSubIds = user.assignments
          .filter((a: any) => a.class_id === classId)
          .map((a: any) => a.subject_id);

        if (assignedSubIds.length > 0) {
          subs = subs.filter((s: any) => assignedSubIds.includes(s.id));
        }
      }

      setSubjects(subs);
      if (subs.length > 0) {
        setSelectedSubjectId(subs[0].id);
      } else {
        setSelectedSubjectId(null);
      }
    } catch (err) {
      console.error('Failed to load class subjects:', err);
    }
  };

  const loadMarksSheet = async (examId: number, classId: number, subjectId: number) => {
    try {
      setLoading(true);
      setSaveSuccessMsg(null);
      const res = await api.getMarksSheet(examId, classId, subjectId);
      setRoster(res.roster || []);
      setStats(res.stats || null);

      const map: Record<number, { score: string; is_absent: boolean }> = {};
      (res.roster || []).forEach((r: any) => {
        map[r.student_id] = {
          score: r.score !== null && r.score !== undefined ? String(r.score) : '',
          is_absent: Boolean(r.is_absent)
        };
      });
      setMarksMap(map);
    } catch (err) {
      console.error('Failed to load marks sheet:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScoreChange = (studentId: number, val: string) => {
    let sanitized = val.replace(/[^0-9]/g, '');
    if (Number(sanitized) > 100) sanitized = '100';

    setMarksMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        score: sanitized,
        is_absent: sanitized ? false : prev[studentId]?.is_absent || false
      }
    }));
  };

  const handleAbsentToggle = (studentId: number, checked: boolean) => {
    setMarksMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        is_absent: checked,
        score: checked ? '' : prev[studentId]?.score || ''
      }
    }));
  };

  const calcGrade = (scoreStr: string, isAbsent: boolean): { letter: string; cls: string } => {
    if (isAbsent) return { letter: 'AB', cls: 'grade-f' };
    if (!scoreStr) return { letter: '-', cls: '' };
    const num = Number(scoreStr);
    if (num >= 75) return { letter: 'A', cls: 'grade-a' };
    if (num >= 65) return { letter: 'B', cls: 'grade-b' };
    if (num >= 50) return { letter: 'C', cls: 'grade-c' };
    if (num >= 35) return { letter: 'S', cls: 'grade-s' };
    return { letter: 'F', cls: 'grade-f' };
  };

  const handleSaveMarks = async () => {
    if (!selectedExamId || !selectedClassId || !selectedSubjectId || roster.length === 0) return;

    const payloadMarks = roster.map((r) => {
      const entry = marksMap[r.student_id] || { score: '', is_absent: false };
      return {
        student_id: r.student_id,
        score: entry.is_absent ? null : entry.score ? Number(entry.score) : null,
        is_absent: entry.is_absent ? 1 : 0
      };
    });

    try {
      setSaving(true);
      await api.saveMarksSheet({
        examId: selectedExamId,
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        marks: payloadMarks,
        status: 'submitted'
      });
      setSaveSuccessMsg('Marks sheet saved successfully and class stats updated!');
      loadMarksSheet(selectedExamId, selectedClassId, selectedSubjectId);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(`Failed to save marks: ${err.message}`);
    } finally {
      setSaving(false);
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
          <h2>Examination Marks Management</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Enter and validate examination marks, auto-compute distinction grades, and view terminal reports.
          </p>
        </div>

        <button
          onClick={handleSaveMarks}
          disabled={saving || roster.length === 0}
          className="btn btn-primary"
          style={{ minWidth: 150 }}
        >
          <Save size={16} />
          <span>{saving ? 'Saving...' : 'Save Marks Sheet'}</span>
        </button>
      </div>

      {/* Selectors Bar */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label className="form-label">Examination Definition</label>
            <select
              className="form-select"
              value={selectedExamId || ''}
              onChange={(e) => setSelectedExamId(Number(e.target.value))}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} (Term {ex.term})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Class (Grade 6–13)</label>
            <select
              className="form-select"
              value={selectedClassId || ''}
              onChange={(e) => setSelectedClassId(Number(e.target.value))}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Subject</label>
            <select
              className="form-select"
              value={selectedSubjectId || ''}
              onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}) • {s.category}
                </option>
              ))}
            </select>
          </div>
        </div>

        {saveSuccessMsg && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: 'var(--present-bg)',
              color: 'var(--present)',
              border: '1px solid var(--present-border)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem'
            }}
          >
            <CheckCircle2 size={18} />
            <strong>{saveSuccessMsg}</strong>
          </div>
        )}
      </div>

      {/* Class Statistics Widget */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#e0e7ff', color: '#4338ca' }}>
              <TrendingUp size={24} />
            </div>
            <div>
              <div className="stat-val">{stats.average}%</div>
              <div className="stat-label">Subject Class Average</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#dcfce7', color: '#15803d' }}>
              <Award size={24} />
            </div>
            <div>
              <div className="stat-val">{stats.passRate}%</div>
              <div className="stat-label">Pass Rate (Score &ge; 35)</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
              <GraduationCap size={24} />
            </div>
            <div>
              <div className="stat-val">{stats.maxScore} / 100</div>
              <div className="stat-label">Highest Score</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#eff6ff', color: '#0284c7' }}>
              <Users size={24} />
            </div>
            <div>
              <div className="stat-val">{stats.totalGraded} / {stats.totalStudents}</div>
              <div className="stat-label">Graded Students</div>
            </div>
          </div>
        </div>
      )}

      {/* Grade Distribution Bar */}
      {stats?.gradeCounts && (
        <div
          className="card"
          style={{
            padding: '0.75rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            background: 'var(--bg-subtle)'
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Grade Distribution:</span>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge" style={{ background: '#dcfce7', color: '#15803d' }}>
              A (75+): {stats.gradeCounts.A || 0}
            </span>
            <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>
              B (65-74): {stats.gradeCounts.B || 0}
            </span>
            <span className="badge" style={{ background: '#fef9c3', color: '#a16207' }}>
              C (50-64): {stats.gradeCounts.C || 0}
            </span>
            <span className="badge" style={{ background: '#ffedd5', color: '#c2410c' }}>
              S (35-49): {stats.gradeCounts.S || 0}
            </span>
            <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>
              F (&lt;35): {stats.gradeCounts.F || 0}
            </span>
            <span className="badge" style={{ background: 'var(--border-color)', color: 'var(--text-muted)' }}>
              AB (Absent): {stats.gradeCounts.AB || 0}
            </span>
          </div>
        </div>
      )}

      {/* Marks Spreadsheet Grid */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Roll</th>
                <th>Admission No</th>
                <th>Student Full Name</th>
                <th style={{ width: 140 }}>Marks (0–100)</th>
                <th style={{ width: 90, textAlign: 'center' }}>Absent</th>
                <th style={{ width: 80, textAlign: 'center' }}>Grade</th>
                <th style={{ textAlign: 'right', width: 160 }}>Report Card</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    Loading marks sheet...
                  </td>
                </tr>
              ) : roster.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>
                      No students enrolled in this class.
                    </div>
                  </td>
                </tr>
              ) : (
                roster.map((r, idx) => {
                  const entry = marksMap[r.student_id] || { score: '', is_absent: false };
                  const grade = calcGrade(entry.score, entry.is_absent);

                  return (
                    <tr key={r.student_id}>
                      <td><strong>#{r.roll_number || idx + 1}</strong></td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-display)', color: 'var(--primary)', fontWeight: 600 }}>
                          {r.admission_no}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.calling_name}</div>
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="form-input"
                          style={{
                            width: '90px',
                            fontWeight: 700,
                            textAlign: 'center',
                            fontSize: '0.95rem',
                            padding: '0.45rem 0.6rem'
                          }}
                          placeholder="0–100"
                          value={entry.score}
                          disabled={entry.is_absent}
                          onChange={(e) => handleScoreChange(r.student_id, e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--absent)' }}
                          checked={entry.is_absent}
                          onChange={(e) => handleAbsentToggle(r.student_id, e.target.checked)}
                          title="Mark as Absent (AB)"
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`grade-badge ${grade.cls}`}>
                          {grade.letter}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => setReportStudentId(r.student_id)}
                          className="btn btn-secondary btn-sm"
                          title="Generate printable report card"
                        >
                          <FileText size={13} />
                          <span>Report Card</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Report Card Modal */}
      {reportStudentId && selectedExamId && (
        <StudentReportCard
          studentId={reportStudentId}
          examId={selectedExamId}
          onClose={() => setReportStudentId(null)}
        />
      )}
    </div>
  );
};

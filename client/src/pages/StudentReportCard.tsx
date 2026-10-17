import React, { useState, useEffect } from 'react';
import { School, Printer, X, Award, CheckCircle, TrendingUp } from 'lucide-react';
import { api } from '../api/client';

interface StudentReportCardProps {
  studentId: number;
  examId: number;
  onClose: () => void;
}

export const StudentReportCard: React.FC<StudentReportCardProps> = ({
  studentId,
  examId,
  onClose
}) => {
  const [reportData, setReportData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [studentId, examId]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const res = await api.getStudentReportCard(studentId, examId);
      setReportData(res);
    } catch (err) {
      console.error('Failed to load student report card:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="side-panel-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="side-panel-right">
        <div className="modal-header btn-no-print" style={{ padding: '1.25rem 1.5rem', background: 'var(--bg-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Award size={22} style={{ color: 'var(--primary)' }} />
            <div>
              <h3 style={{ fontSize: '1.15rem' }}>Student Terminal Report Card</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Official Examination Results Sheet</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              <Printer size={15} /> Print Card
            </button>
            <button onClick={onClose} className="btn btn-secondary btn-icon btn-sm" title="Close Panel">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ padding: '1.75rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>

              Generating terminal report card...
            </div>
          ) : reportData ? (
            <div className="print-report-card">
              {/* Official School Header */}
              <div
                style={{
                  textAlign: 'center',
                  borderBottom: '2px solid var(--text-main)',
                  paddingBottom: '1rem',
                  marginBottom: '1.5rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                  <School size={28} />
                  <h2 style={{ fontSize: '1.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Central Model College — Colombo
                  </h2>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Ministry of Education Approved • Grades 6 to 13
                </p>
                <div
                  style={{
                    display: 'inline-block',
                    background: 'var(--bg-subtle)',
                    padding: '0.3rem 1rem',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    marginTop: '0.5rem'
                  }}
                >
                  {reportData.exam?.name} • Academic Year {reportData.student?.academic_year || '2026'}
                </div>
              </div>

              {/* Student Bio Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                  padding: '1rem',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1.5rem',
                  fontSize: '0.875rem'
                }}
              >
                <div><strong>Admission Number:</strong> {reportData.student?.admission_no}</div>
                <div><strong>Class:</strong> {reportData.student?.class_name}</div>
                <div><strong>Student Full Name:</strong> {reportData.student?.full_name}</div>
                <div><strong>Calling Name:</strong> {reportData.student?.calling_name}</div>
                <div><strong>Class Teacher:</strong> {reportData.student?.class_teacher_name || 'Mrs. Nimali Perera'}</div>
                <div><strong>Attendance Record:</strong> {reportData.attendance?.attendancePercentage}% ({reportData.attendance?.presentDays}/{reportData.attendance?.totalSchoolDays} Days)</div>
              </div>

              {/* Subject Results Table */}
              <div style={{ marginBottom: '1.5rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Code</th>
                      <th>Subject Name</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'center', width: 90 }}>Marks (100)</th>
                      <th style={{ textAlign: 'center', width: 80 }}>Grade</th>
                      <th>Instructor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.subjects?.map((sub: any) => (
                      <tr key={sub.subject_id}>
                        <td><strong>{sub.subject_code}</strong></td>
                        <td>{sub.subject_name}</td>
                        <td><span className="badge" style={{ background: 'var(--bg-subtle)' }}>{sub.category}</span></td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>
                          {sub.is_absent ? 'AB' : sub.score !== null ? sub.score : '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`grade-badge grade-${sub.grade_letter?.toLowerCase() || 's'}`}>
                            {sub.grade_letter}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {sub.teacher_name || 'Staff'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Term Summary Statistics */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '1rem',
                  padding: '1rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1.5rem',
                  textAlign: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Score</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{reportData.performance?.totalScore}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Term Average</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
                    {reportData.performance?.average}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Class Rank</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--present)' }}>
                    {reportData.performance?.rank}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Attendance</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                    {reportData.attendance?.attendancePercentage}%
                  </div>
                </div>
              </div>

              {/* Grading Legend & Signatures */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '0.75rem',
                  marginBottom: '2rem'
                }}
              >
                <div>
                  <strong>Grading System:</strong> A: 75–100 (Distinction) • B: 65–74 (Very Good) • C: 50–64 (Credit) • S: 35–49 (Pass) • F: 0–34 (Fail)
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '3rem',
                  paddingTop: '1rem'
                }}
              >
                <div style={{ textAlign: 'center', width: '200px', borderTop: '1px dashed var(--text-muted)', paddingTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Class Teacher's Signature</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{reportData.student?.class_teacher_name || 'Mrs. Nimali Perera'}</div>
                </div>

                <div style={{ textAlign: 'center', width: '200px', borderTop: '1px dashed var(--text-muted)', paddingTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Principal's Signature</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Dr. Anura Bandara</div>
                </div>
              </div>
            </div>
          ) : (
            <p>Report data unavailable.</p>
          )}
        </div>

        <div className="modal-footer btn-no-print">
          <button onClick={onClose} className="btn btn-secondary">
            Close Panel
          </button>
          <button onClick={handlePrint} className="btn btn-primary">
            <Printer size={15} /> Print Report Card
          </button>
        </div>

      </div>
    </div>
  );
};

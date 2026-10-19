import React, { useState, useEffect } from 'react';
import { Printer, X, Award, CheckCircle, TrendingUp } from 'lucide-react';
import { api } from '../api/client';
import { CollegeLogo } from '../components/CollegeLogo';

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
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Official Examination Results & Progress Sheet</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={handlePrint} className="btn btn-primary btn-sm">
              <Printer size={15} /> Print Report Card
            </button>
            <button onClick={onClose} className="btn btn-secondary btn-icon btn-sm" title="Close Panel">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ padding: '1.75rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3.5rem' }}>
              <div className="animate-spin" style={{ display: 'inline-block', width: 26, height: 26, border: '3px solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
              <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>Generating terminal report card...</p>
            </div>
          ) : reportData ? (
            <div className="print-report-card">
              {/* Official Kattankudy Central College Header */}
              <div
                style={{
                  textAlign: 'center',
                  borderBottom: '2px solid var(--primary)',
                  paddingBottom: '1.25rem',
                  marginBottom: '1.5rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                  <CollegeLogo size={60} inContainer={true} />
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      Kattankudy Central College
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      National School • Batticaloa • Ministry of Education Sri Lanka
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: 'inline-block',
                    background: 'var(--primary-light)',
                    color: 'var(--primary)',
                    padding: '0.35rem 1.25rem',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    marginTop: '0.5rem',
                    border: '1px solid rgba(2, 101, 54, 0.2)'
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
                  gap: '0.85rem',
                  padding: '1.15rem',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-card)',
                  marginBottom: '1.5rem',
                  fontSize: '0.875rem'
                }}
              >
                <div><strong>Admission Number:</strong> {reportData.student?.admission_no}</div>
                <div><strong>Class:</strong> {reportData.student?.class_name}</div>
                <div><strong>Full Name:</strong> {reportData.student?.full_name}</div>
                <div><strong>Calling Name:</strong> {reportData.student?.calling_name}</div>
                <div><strong>Class Teacher:</strong> {reportData.student?.class_teacher_name || 'Assigned Faculty'}</div>
                <div>
                  <strong>Term Attendance:</strong> {reportData.attendance?.attendancePercentage}%
                  ({reportData.attendance?.presentDays}/{reportData.attendance?.totalSchoolDays} School Days)
                </div>
              </div>

              {/* Subject Results Table */}
              <div style={{ marginBottom: '1.5rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Code</th>
                      <th>Subject Name</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'center', width: 95 }}>Marks (100)</th>
                      <th style={{ textAlign: 'center', width: 80 }}>Grade</th>
                      <th>Instructor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.subjects?.map((sub: any) => (
                      <tr key={sub.subject_code}>
                        <td><code>{sub.subject_code}</code></td>
                        <td><strong>{sub.subject_name}</strong></td>
                        <td>{sub.category}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>
                          {sub.is_absent ? (
                            <span style={{ color: 'var(--absent)' }}>Absent</span>
                          ) : (
                            sub.score ?? '-'
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {sub.is_absent ? (
                            <span className="badge badge-absent">ABS</span>
                          ) : (
                            <span className={`grade-badge grade-${(sub.grade || 'f').toLowerCase()}`}>
                              {sub.grade || '-'}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                          {sub.teacher_name || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Overall Terminal Summary Box */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '1rem',
                  padding: '1.25rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-card)',
                  marginBottom: '2rem',
                  textAlign: 'center',
                  background: 'var(--bg-surface)'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Aggregate</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)' }}>
                    {reportData.summary?.totalMarks}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Average Score</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)' }}>
                    {reportData.summary?.averageScore}%
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Class Rank</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-dark)' }}>
                    #{reportData.summary?.rank || 1}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Overall Result</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--present)' }}>
                    {reportData.summary?.averageScore >= 50 ? 'Promoted' : 'Pass'}
                  </div>
                </div>
              </div>

              {/* Remarks and Official College Signatures */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2.5rem' }}>
                <div style={{ borderTop: '1px dashed var(--text-muted)', paddingTop: '0.75rem' }}>
                  <p style={{ fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>Class Teacher's Assessment:</p>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontStyle: 'italic', minHeight: 40 }}>
                    "{reportData.summary?.averageScore >= 75 ? 'Outstanding academic dedication and leadership in class activities.' : 'Good progress shown. Focus on continuous mathematics revisions.'}"
                  </p>
                  <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Signature: _______________________
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed var(--text-muted)', paddingTop: '0.75rem' }}>
                  <p style={{ fontSize: '0.825rem', fontWeight: 700, marginBottom: '0.35rem' }}>Principal's Endorsement:</p>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontStyle: 'italic', minHeight: 40 }}>
                    Certified official term record under Kattankudy Central College regulations.
                  </p>
                  <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Signature & Seal: _______________________
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Report card data could not be retrieved.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

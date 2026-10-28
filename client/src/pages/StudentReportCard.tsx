import React, { useState, useEffect } from 'react';
import {
  School,
  Printer,
  X,
  Award,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldAlert,
  FileCheck,
  TrendingUp,
  UserCheck
} from 'lucide-react';
import { api } from '../api/client';
import { SCHOOL_PROFILE } from '../config/schoolConfig';
import { SchoolCrest } from '../components/common/SchoolCrest';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (studentId && examId) {
      loadReport();
    } else {
      setLoading(false);
      setError('No examination selected or available.');
    }
  }, [studentId, examId]);

  const loadReport = async () => {
    if (!studentId || !examId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.getStudentReportCard(studentId, examId);
      setReportData(res);
    } catch (err: any) {
      console.error('Failed to load student report card:', err);
      setError(err.message || 'Failed to generate terminal report card.');
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
        {/* Modal Top Bar */}
        <div
          className="modal-header btn-no-print"
          style={{ padding: '1.25rem 1.5rem', background: 'var(--bg-subtle)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Award size={22} style={{ color: 'var(--primary)' }} />
            <div>
              <h3 style={{ fontSize: '1.15rem' }}>
                {reportData?.is_published
                  ? 'Official Student Terminal Report Card'
                  : 'Provisional Leadership Preview — Report Card'}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Kattankudy Central College • Academic Examination Records
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {reportData && !error && (
              <button onClick={handlePrint} className="btn btn-primary btn-sm">
                <Printer size={15} /> Print (A4)
              </button>
            )}
            <button
              onClick={onClose}
              className="btn btn-secondary btn-icon btn-sm"
              title="Close Panel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '1.75rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3.5rem' }}>
              <div
                className="animate-spin"
                style={{
                  width: 32,
                  height: 32,
                  border: '3px solid var(--border-color)',
                  borderTopColor: 'var(--primary)',
                  borderRadius: '50%',
                  margin: '0 auto 1rem'
                }}
              />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Generating authenticated student terminal report card...
              </p>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '1.5rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--absent-bg)',
                border: '1px solid var(--absent-border)',
                color: 'var(--absent)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                <ShieldAlert size={20} />
                <strong style={{ fontSize: '1rem' }}>Confidentiality or Access Restriction</strong>
              </div>
              <p style={{ fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>{error}</p>
              <div style={{ marginTop: '1rem' }}>
                <button onClick={onClose} className="btn btn-secondary btn-sm">
                  Close Window
                </button>
              </div>
            </div>
          ) : reportData ? (
            <div className={`print-report-card watermark-container ${!reportData.is_published ? 'has-watermark' : ''}`}>
              {/* Watermark overlay for unpublished preview */}
              {!reportData.is_published && (
                <div className="watermark-overlay" aria-hidden="true">
                  UNPUBLISHED — CONFIDENTIAL LEADERSHIP PREVIEW
                </div>
              )}

              {/* Provisional Notice Banner (screen view) */}
              {!reportData.is_published && (
                <div
                  className="btn-no-print"
                  style={{
                    background: 'var(--late-bg)',
                    border: '1px solid var(--late-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.85rem 1rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    fontSize: '0.825rem',
                    color: 'var(--late)'
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>Provisional Leadership Preview (Unpublished)</strong>
                    <div style={{ marginTop: '0.2rem', color: 'var(--text-main)' }}>
                      {reportData.provisional_notice ||
                        'This report card contains unverified/unpublished examination results intended solely for internal academic leadership review.'}
                    </div>
                    {reportData.confidentiality_watermark && (
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                        Previewed by {reportData.confidentiality_watermark.previewed_by_name} on{' '}
                        {new Date(reportData.confidentiality_watermark.previewed_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reissued Notice Banner */}
              {reportData.is_reissued && (
                <div
                  style={{
                    background: 'var(--accent-light)',
                    border: '1px solid var(--accent)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <FileCheck size={18} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--accent-hover)' }}>
                      Official Reissued Examination Report Card
                    </span>
                  </div>
                  <span
                    className="badge"
                    style={{ background: 'var(--accent)', color: 'white', fontSize: '0.7rem' }}
                  >
                    Post-Publication Corrections Applied
                  </span>
                </div>
              )}

              {/* Demonstration Result Notice Banner */}
              <div
                style={{
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.45rem 0.85rem',
                  marginBottom: '1rem',
                  textAlign: 'center',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#92400e',
                  letterSpacing: '0.04em'
                }}
              >
                ⚠️ {SCHOOL_PROFILE.demoResultNotice}
              </div>

              {/* School Formal Header */}
              <div
                style={{
                  textAlign: 'center',
                  borderBottom: '2px solid var(--text-main)',
                  paddingBottom: '1rem',
                  marginBottom: '1.25rem'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    marginBottom: '0.35rem'
                  }}
                >
                  <SchoolCrest size={48} showBorder={true} alt={SCHOOL_PROFILE.name} />
                  <div>
                    <h2
                      style={{
                        fontSize: '1.35rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        margin: 0
                      }}
                    >
                      {SCHOOL_PROFILE.name}
                    </h2>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary)', margin: '0.15rem 0' }}>
                      {SCHOOL_PROFILE.nameTamil}
                    </div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      {SCHOOL_PROFILE.secondaryTitle} • {SCHOOL_PROFILE.zone} Educational Zone • Census No. {SCHOOL_PROFILE.censusNo}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginTop: '0.5rem',
                    padding: '0.3rem 0.85rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.825rem',
                    fontWeight: 700
                  }}
                >
                  <span>{reportData.exam?.name}</span>
                  <span>•</span>
                  <span>Term {reportData.exam?.term}</span>
                  <span>•</span>
                  <span>Academic Year {reportData.student?.academic_year || '2026'}</span>
                </div>
              </div>

              {/* Student Bio Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.65rem 1.25rem',
                  padding: '1rem 1.25rem',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Admission Number:</span>{' '}
                  <strong style={{ fontFamily: 'var(--font-display)', color: 'var(--primary)' }}>
                    {reportData.student?.admission_no}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Class & Roll:</span>{' '}
                  <strong>
                    {reportData.student?.class_name} (Roll #{reportData.student?.roll_number || '—'})
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Student Name:</span>{' '}
                  <strong>{reportData.student?.full_name}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Calling Name:</span>{' '}
                  <strong>{reportData.student?.calling_name || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Class Teacher:</span>{' '}
                  <strong>{reportData.student?.class_teacher_name || 'Assigned Staff'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Attendance:</span>{' '}
                  <strong>
                    {reportData.attendance?.status === 'Recorded'
                      ? `${reportData.attendance?.attendancePercentage}% (${reportData.attendance?.presentDays}/${reportData.attendance?.totalSchoolDays} Days)`
                      : 'Attendance Not Recorded'}
                  </strong>
                </div>
              </div>

              {/* Results Table (Participating Subjects Only) */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.5rem'
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Academic Performance by Subject</h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Participating subjects: {reportData.subjects?.length || 0}
                  </span>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 80 }}>Code</th>
                        <th>Subject Name</th>
                        <th style={{ width: 100 }}>Category</th>
                        <th style={{ textAlign: 'center', width: 90 }}>Raw Score</th>
                        <th style={{ textAlign: 'center', width: 80 }}>Norm %</th>
                        <th style={{ textAlign: 'center', width: 70 }}>Grade</th>
                        <th style={{ width: 120 }}>Instructor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.subjects?.map((sub: any) => {
                        const isAbsent = Boolean(sub.is_absent);
                        const isExempt = Boolean(sub.is_exempt);
                        const displayScore = isAbsent
                          ? 'AB'
                          : isExempt
                          ? 'EX'
                          : sub.score !== null && sub.score !== undefined
                          ? `${sub.score}/${sub.max_score || 100}`
                          : '—';

                        const gradeLetter = sub.grade_letter || '—';
                        const gradeClass = gradeLetter ? `grade-${gradeLetter.toLowerCase()}` : '';

                        return (
                          <tr key={sub.subject_id}>
                            <td>
                              <strong>{sub.subject_code}</strong>
                            </td>
                            <td>{sub.subject_name}</td>
                            <td>
                              <span
                                className="badge"
                                style={{
                                  background: 'var(--bg-subtle)',
                                  fontSize: '0.7rem',
                                  textTransform: 'capitalize'
                                }}
                              >
                                {sub.category?.replace(/_/g, ' ') || 'General'}
                              </span>
                            </td>
                            <td
                              style={{
                                textAlign: 'center',
                                fontWeight: 700,
                                color: isAbsent ? 'var(--absent)' : 'inherit'
                              }}
                            >
                              {displayScore}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>
                              {sub.normalized_percentage !== undefined && sub.normalized_percentage !== null
                                ? `${sub.normalized_percentage}%`
                                : isAbsent
                                ? '0%'
                                : sub.score !== null
                                ? `${sub.score}%`
                                : '—'}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`grade-badge ${gradeClass}`}>
                                {isAbsent ? 'AB' : gradeLetter}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                              {sub.teacher_name || 'Faculty Staff'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Term Summary Statistics */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.75rem',
                  padding: '1rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1.25rem',
                  textAlign: 'center',
                  background: 'var(--bg-surface)'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Score</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>
                    {reportData.performance?.totalScore !== null
                      ? reportData.performance?.totalScore
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Policy Weighted Avg</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)' }}>
                    {reportData.performance?.average !== null
                      ? `${reportData.performance?.average}%`
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Official Class Rank</div>
                  <div
                    style={{
                      fontSize: '1.35rem',
                      fontWeight: 800,
                      color: reportData.performance?.rank ? 'var(--present)' : 'var(--text-muted)'
                    }}
                  >
                    {reportData.performance?.rank !== null && reportData.performance?.rank !== undefined
                      ? `#${reportData.performance?.rank}`
                      : '—'}
                  </div>
                  {!reportData.is_published && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--late)' }}>
                      Rank deferred to publication
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Attendance Rate</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>
                    {reportData.attendance?.attendancePercentage !== null
                      ? `${reportData.attendance?.attendancePercentage}%`
                      : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Policy Provenance & Grading Legend */}
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-color)',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}
              >
                <div>
                  <strong>Grading Scale:</strong> A (75–100 Distinction) • B (65–74 Very Good) • C (50–64 Credit) • S (35–49 Pass) • F (0–34 Fail)
                </div>
                {reportData.policy && (
                  <div>
                    <strong>Governing Policy:</strong> {reportData.policy.title || reportData.policy.policy_code} (v{reportData.policy.version})
                  </div>
                )}
              </div>

              {/* Approved Corrections Audit Trail (if reissued) */}
              {reportData.is_reissued && reportData.corrections_history?.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h5 style={{ fontSize: '0.825rem', marginBottom: '0.4rem', color: 'var(--accent-hover)' }}>
                    Approved Corrections History (Post-Publication Reissue)
                  </h5>
                  <div className="table-responsive">
                    <table className="data-table" style={{ fontSize: '0.775rem' }}>
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Previous Mark</th>
                          <th>Corrected Mark</th>
                          <th>Category</th>
                          <th>Justification</th>
                          <th>Approved By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.corrections_history.map((c: any) => (
                          <tr key={c.id}>
                            <td><strong>{c.subject_name}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>
                              {c.expected_previous_score !== null ? c.expected_previous_score : c.expected_previous_status}
                            </td>
                            <td style={{ color: 'var(--present)', fontWeight: 700 }}>
                              {c.corrected_score !== null ? c.corrected_score : c.corrected_status}
                            </td>
                            <td>{c.correction_category}</td>
                            <td>{c.detailed_justification}</td>
                            <td>{c.approved_by_name || 'Principal'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Official Signatures */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '2.5rem',
                  paddingTop: '1rem'
                }}
              >
                <div
                  style={{
                    textAlign: 'center',
                    width: '210px',
                    borderTop: '1px dashed var(--text-muted)',
                    paddingTop: '0.5rem'
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Class Teacher's Signature</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {reportData.student?.class_teacher_name || 'Class Teacher'}
                  </div>
                </div>

                <div
                  style={{
                    textAlign: 'center',
                    width: '210px',
                    borderTop: '1px dashed var(--text-muted)',
                    paddingTop: '0.5rem'
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Principal's Signature</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {SCHOOL_PROFILE.principalName} / Principal
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Modal Footer (Screen View) */}
        <div className="modal-footer btn-no-print">
          <button onClick={onClose} className="btn btn-secondary">
            Close Panel
          </button>
          {reportData && !error && (
            <button onClick={handlePrint} className="btn btn-primary">
              <Printer size={15} /> Print Official A4 Card
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

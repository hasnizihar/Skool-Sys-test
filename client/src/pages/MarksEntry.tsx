import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Save,
  Award,
  TrendingUp,
  Users,
  CheckCircle2,
  FileText,
  AlertCircle,
  Calendar,
  CalendarCheck,
  AlertTriangle,
  FileSpreadsheet,
  Edit3,
  Clock,
  ShieldCheck,
  Scale,
  Send,
  History,
  Plus,
  Search,
  Filter,
  Lock,
  RefreshCw,
  FileCheck,
  Eye,
  Info,
  BookOpen,
  X,
  XCircle,
  CheckSquare
} from 'lucide-react';
import { api } from '../api/client';
import { StudentReportCard } from './StudentReportCard';

interface MarksEntryProps {
  user: any;
}

type WorkspaceTab =
  | 'overview'
  | 'schedules'
  | 'entry'
  | 'review'
  | 'policies'
  | 'publication'
  | 'corrections';

export const MarksEntry: React.FC<MarksEntryProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');

  // Shared Core Selectors
  const [exams, setExams] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);

  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);

  // Filters for Overview
  const [yearFilter, setYearFilter] = useState<string>('');
  const [termFilter, setTermFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Tab: Marks Entry state
  const [roster, setRoster] = useState<any[]>([]);
  const [activeSheet, setActiveSheet] = useState<any | null>(null);
  const [marksMap, setMarksMap] = useState<Record<number, { score: string; status: string; remarks?: string }>>({});
  const [stats, setStats] = useState<any | null>(null);
  const [sheetMaxScore, setSheetMaxScore] = useState<number>(100);
  const [sheetPolicy, setSheetPolicy] = useState<{
    id?: number;
    policy_code?: string;
    title?: string;
    is_approved_by_school?: boolean;
    grading_scale_json?: string;
  } | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingSheet, setSubmittingSheet] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tab: Schedules state
  const [schedulesData, setSchedulesData] = useState<any | null>(null);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [newScheduleClassId, setNewScheduleClassId] = useState<number | ''>('');
  const [newScheduleSubjectId, setNewScheduleSubjectId] = useState<number | ''>('');
  const [newScheduleIsRequired, setNewScheduleIsRequired] = useState(true);
  const [newScheduleMaxScore, setNewScheduleMaxScore] = useState<number | ''>(100);
  const [scheduleActionError, setScheduleActionError] = useState<string | null>(null);

  // Tab: Review & Approvals state
  const [reviewSheets, setReviewSheets] = useState<any[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewModalSheet, setReviewModalSheet] = useState<any | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'endorse' | 'return'>('endorse');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [approvingSheetId, setApprovingSheetId] = useState<number | null>(null);
  const [sheetHistory, setSheetHistory] = useState<any[] | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Tab: Policies state
  const [policies, setPolicies] = useState<any[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<any | null>(null);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [policyMessage, setPolicyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tab: Publication state
  const [readinessData, setReadinessData] = useState<any | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishConfirmationChecked, setPublishConfirmationChecked] = useState(false);
  const [selectedPublishPolicyId, setSelectedPublishPolicyId] = useState<number | ''>('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  // Tab: Corrections state
  const [correctionsList, setCorrectionsList] = useState<any[]>([]);
  const [loadingCorrections, setLoadingCorrections] = useState(false);
  const [showRequestCorrectionModal, setShowRequestCorrectionModal] = useState(false);
  const [correctionStudentId, setCorrectionStudentId] = useState<number | ''>('');
  const [correctionSubjectId, setCorrectionSubjectId] = useState<number | ''>('');
  const [correctionRequestedScore, setCorrectionRequestedScore] = useState<string>('');
  const [correctionRequestedStatus, setCorrectionRequestedStatus] = useState<string>('PRESENT');
  const [correctionCategory, setCorrectionCategory] = useState<string>('clerical_addition');
  const [correctionJustification, setCorrectionJustification] = useState<string>('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [authoritativeMark, setAuthoritativeMark] = useState<any | null>(null);
  const [loadingAuthoritativeMark, setLoadingAuthoritativeMark] = useState(false);
  const [authoritativeMarkError, setAuthoritativeMarkError] = useState<string | null>(null);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);

  useEffect(() => {
    if (showRequestCorrectionModal) {
      if (allStudents.length === 0) {
        api.getStudents().then((res: any) => {
          setAllStudents(res.students || []);
        }).catch(() => {});
      }
      if (allSubjects.length === 0) {
        api.getSubjects().then((res: any) => {
          setAllSubjects(res.subjects || []);
        }).catch(() => {});
      }
    }
  }, [showRequestCorrectionModal, allStudents.length, allSubjects.length]);

  // Examination Creation / Edit Modal
  const [showExamModal, setShowExamModal] = useState(false);
  const [examModalName, setExamModalName] = useState('');
  const [examModalYearId, setExamModalYearId] = useState<number | ''>('');
  const [examModalTerm, setExamModalTerm] = useState<number>(1);
  const [examModalGradeBand, setExamModalGradeBand] = useState<string>('all');
  const [examModalStartDate, setExamModalStartDate] = useState('');
  const [examModalEndDate, setExamModalEndDate] = useState('');
  const [examModalMaxScore, setExamModalMaxScore] = useState<number>(100);
  const [savingExam, setSavingExam] = useState(false);

  // Selected student for report card modal
  const [reportStudentId, setReportStudentId] = useState<number | null>(null);

  // Derive Leadership Appointments
  const userAuthorizations: any[] = user?.authorizations || [];
  const isPrincipal = userAuthorizations.some((a) => a.auth_role === 'principal');
  const isVP = userAuthorizations.some((a) => a.auth_role === 'vice_principal_academic');
  const isSectionHead = userAuthorizations.some((a) => a.auth_role === 'section_head');
  const hasAcademicLeadership = isPrincipal || isVP || isSectionHead;
  const isAdmin = user?.role === 'admin';

  // Load initial global lookups
  useEffect(() => {
    loadLookups();
  }, []);

  // When class changes, reload its subjects
  useEffect(() => {
    if (selectedClassId) {
      loadClassSubjects(selectedClassId);
    }
  }, [selectedClassId]);

  // When exam or tab changes, load appropriate tab data
  useEffect(() => {
    if (selectedExamId) {
      if (activeTab === 'schedules') loadSchedules(selectedExamId);
      if (activeTab === 'publication') loadReadiness(selectedExamId);
      if (activeTab === 'corrections') loadCorrections(selectedExamId);
    }
  }, [selectedExamId, activeTab]);

  // When marks entry selectors change, load sheet
  useEffect(() => {
    if (activeTab === 'entry' && selectedExamId && selectedClassId && selectedSubjectId) {
      loadMarksSheet(selectedExamId, selectedClassId, selectedSubjectId);
    }
  }, [activeTab, selectedExamId, selectedClassId, selectedSubjectId]);

  // When review tab opens, load pending review sheets
  useEffect(() => {
    if (activeTab === 'review') {
      loadReviewSheets();
    }
    if (activeTab === 'policies') {
      loadPolicies();
    }
  }, [activeTab]);

  // PR-005 G5F-03: Fetch authoritative published mark when correction targets change
  useEffect(() => {
    if (showRequestCorrectionModal && selectedExamId && correctionStudentId && correctionSubjectId) {
      let isMounted = true;
      const fetchAuthMark = async () => {
        try {
          setLoadingAuthoritativeMark(true);
          setAuthoritativeMarkError(null);
          const data = await api.getPublishedMark(
            Number(selectedExamId),
            Number(correctionStudentId),
            Number(correctionSubjectId)
          );
          if (isMounted) {
            setAuthoritativeMark(data);
            if (data.score !== null && data.score !== undefined) {
              setCorrectionRequestedScore(String(data.score));
            } else {
              setCorrectionRequestedScore('');
            }
            setCorrectionRequestedStatus(data.assessmentStatus || 'PRESENT');
          }
        } catch (err: any) {
          if (isMounted) {
            setAuthoritativeMark(null);
            setAuthoritativeMarkError(err.message || 'Unable to fetch authoritative published mark record for this student and subject.');
          }
        } finally {
          if (isMounted) setLoadingAuthoritativeMark(false);
        }
      };
      fetchAuthMark();
      return () => { isMounted = false; };
    } else {
      setAuthoritativeMark(null);
      setAuthoritativeMarkError(null);
    }
  }, [showRequestCorrectionModal, selectedExamId, correctionStudentId, correctionSubjectId]);

  const loadLookups = async () => {
    try {
      const [examRes, classRes, yearsRes] = await Promise.all([
        api.getExaminations(),
        api.getClasses(),
        api.getAcademicYears().catch(() => ({ academicYears: [] }))
      ]);

      const ex = examRes.examinations || [];
      const cls = classRes.classes || [];
      const yrs = yearsRes.academicYears || [];

      setExams(ex);
      setClasses(cls);
      setAcademicYears(yrs);

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
      setLoadingSheet(true);
      setSheetMessage(null);
      const res = await api.getMarksSheet(examId, classId, subjectId);
      setRoster(res.roster || []);
      setStats(res.stats || null);
      setActiveSheet(res.sheet || null);
      const authoritativeMax = res.maxScore
        ? Number(res.maxScore)
        : (res.sheet?.max_score
            ? Number(res.sheet.max_score)
            : (res.roster?.[0]?.max_score ? Number(res.roster[0].max_score) : 100));
      setSheetMaxScore(authoritativeMax);
      setSheetPolicy(res.policy || null);

      const map: Record<number, { score: string; status: string; remarks?: string }> = {};
      (res.roster || []).forEach((r: any) => {
        let status = r.assessment_status || r.mark_status || 'PRESENT';
        if (r.is_absent && status !== 'ABSENT') status = 'ABSENT';
        else if (r.is_exempt && status !== 'EXEMPT') status = 'EXEMPT';
        else if (r.status === 'MEDICAL' || status === 'MEDICAL') status = 'MEDICAL';
        else if (status === 'NOT_ASSESSED') status = 'NOT_ASSESSED';

        map[r.student_id] = {
          score: (status === 'PRESENT' && r.score !== null && r.score !== undefined) ? String(r.score) : '',
          status,
          remarks: r.remarks || ''
        };
      });
      setMarksMap(map);
    } catch (err: any) {
      console.error('Failed to load marks sheet:', err);
      setSheetMessage({ type: 'error', text: err.message || 'Failed to load marks sheet.' });
    } finally {
      setLoadingSheet(false);
    }
  };

  const loadSchedules = async (examId: number) => {
    try {
      setLoadingSchedules(true);
      setScheduleActionError(null);
      const res = await api.getExaminationSchedules(examId);
      setSchedulesData(res);
    } catch (err: any) {
      console.error('Failed to load schedules:', err);
      setScheduleActionError(err.message || 'Failed to load schedules.');
    } finally {
      setLoadingSchedules(false);
    }
  };

  const loadReviewSheets = async () => {
    try {
      setLoadingReview(true);
      const res = await api.getMarksSheets({
        examinationId: selectedExamId || undefined
      });
      setReviewSheets(res.sheets || []);
    } catch (err) {
      console.error('Failed to load review sheets:', err);
    } finally {
      setLoadingReview(false);
    }
  };

  const loadPolicies = async () => {
    try {
      setLoadingPolicies(true);
      const res = await api.getPolicies();
      setPolicies(res.policies || []);
      if (res.policies?.length > 0) setSelectedPolicy(res.policies[0]);
    } catch (err) {
      console.error('Failed to load policies:', err);
    } finally {
      setLoadingPolicies(false);
    }
  };

  const loadReadiness = async (examId: number) => {
    try {
      setLoadingReadiness(true);
      setPublishError(null);
      const res = await api.getPublicationReadiness(examId);
      setReadinessData(res);
    } catch (err: any) {
      console.error('Failed to load publication readiness:', err);
      setPublishError(err.message);
    } finally {
      setLoadingReadiness(false);
    }
  };

  const loadCorrections = async (examId: number) => {
    try {
      setLoadingCorrections(true);
      const res = await api.getCorrections({ examinationId: examId });
      setCorrectionsList(res.corrections || []);
    } catch (err) {
      console.error('Failed to load corrections:', err);
    } finally {
      setLoadingCorrections(false);
    }
  };

  // Score & Status Handlers
  const handleScoreChange = (studentId: number, val: string) => {
    // Preserve fractional scores with up to 1 decimal place without stripping decimal points
    let sanitized = val.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) {
      sanitized = parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts.length === 2 && parts[1].length > 1) {
      sanitized = parts[0] + '.' + parts[1].slice(0, 1);
    }
    const num = parseFloat(sanitized);
    if (!isNaN(num) && num > sheetMaxScore) {
      sanitized = String(sheetMaxScore);
    }

    setMarksMap((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        score: sanitized,
        status: sanitized ? 'PRESENT' : prev[studentId]?.status || 'PRESENT'
      }
    }));
  };

  const handleStatusChange = (studentId: number, newStatus: string) => {
    setMarksMap((prev) => ({
      ...prev,
      [studentId]: {
        score: newStatus === 'PRESENT' ? prev[studentId]?.score || '' : '',
        status: newStatus
      }
    }));
  };

  const calcGrade = (scoreStr: string, status: string): { letter: string; cls: string; isProvisional: boolean; percentage: number | null } => {
    if (status === 'ABSENT') return { letter: 'AB', cls: 'grade-f', isProvisional: false, percentage: 0 };
    if (status === 'MEDICAL') return { letter: 'MED', cls: 'grade-s', isProvisional: false, percentage: null };
    if (status === 'EXEMPT') return { letter: 'EX', cls: 'grade-s', isProvisional: false, percentage: null };
    if (!scoreStr || isNaN(Number(scoreStr))) return { letter: '—', cls: '', isProvisional: false, percentage: null };

    const score = Number(scoreStr);
    const max = sheetMaxScore > 0 ? sheetMaxScore : 100.0;
    const pct = Math.round(((score / max) * 100.0) * 10) / 10;

    const isPolicyApproved = Boolean(sheetPolicy?.is_approved_by_school);
    const isProvisional = !isPolicyApproved;

    let grade = 'F';
    let cls = 'grade-f';

    if (sheetPolicy?.grading_scale_json) {
      try {
        const scale = typeof sheetPolicy.grading_scale_json === 'string'
          ? JSON.parse(sheetPolicy.grading_scale_json)
          : sheetPolicy.grading_scale_json;
        if (Array.isArray(scale)) {
          const sorted = [...scale].sort((a: any, b: any) => (b.minScore ?? b.minPercentage ?? 0) - (a.minScore ?? a.minPercentage ?? 0));
          for (const item of sorted) {
            const threshold = item.minPercentage !== undefined ? item.minPercentage : item.minScore;
            if (pct >= threshold) {
              grade = item.gradeLetter || item.grade;
              break;
            }
          }
        }
      } catch {}
    } else {
      if (pct >= 75.0) grade = 'A';
      else if (pct >= 65.0) grade = 'B';
      else if (pct >= 50.0) grade = 'C';
      else if (pct >= 35.0) grade = 'S';
      else grade = 'F';
    }

    if (grade === 'A') cls = 'grade-a';
    else if (grade === 'B') cls = 'grade-b';
    else if (grade === 'C') cls = 'grade-c';
    else if (grade === 'S') cls = 'grade-s';
    else cls = 'grade-f';

    const displayLetter = isProvisional ? `${grade} (Prov.)` : grade;

    return { letter: displayLetter, cls, isProvisional, percentage: pct };
  };

  // Save Draft Marks (CAS Base Revision - G5F-02)
  const handleSaveDraft = async () => {
    if (!activeSheet?.id) {
      // If sheet does not exist yet, save via primary saveMarksSheet
      await handleLegacySave('draft');
      return;
    }

    const eligibleRoster = roster.filter((r) => r.is_eligible_for_draft !== false);
    const payloadMarks = eligibleRoster.map((r) => {
      const entry = marksMap[r.student_id] || { score: '', status: 'PRESENT' };
      const assessmentStatus = entry.status || 'PRESENT';
      const isPresent = assessmentStatus === 'PRESENT';
      const hasNumericScore = isPresent && entry.score !== '' && entry.score !== null && entry.score !== undefined;

      return {
        studentId: r.student_id,
        score: hasNumericScore ? Number(entry.score) : null,
        maxScore: sheetMaxScore,
        assessmentStatus: assessmentStatus as 'PRESENT' | 'ABSENT' | 'MEDICAL' | 'EXEMPT' | 'NOT_ASSESSED',
        remarks: entry.remarks || undefined
      };
    });

    try {
      setSavingDraft(true);
      setSheetMessage(null);
      await api.saveDraftMarks(activeSheet.id, {
        baseRevision: activeSheet.revision || 1,
        marks: payloadMarks
      });
      if (selectedExamId && selectedClassId && selectedSubjectId) {
        await loadMarksSheet(selectedExamId, selectedClassId, selectedSubjectId);
      }
      setSheetMessage({ type: 'success', text: 'Draft marks saved successfully!' });
    } catch (err: any) {
      let errText = `Failed to save draft: ${err.message}`;
      if (err.code === 'STALE_REVISION' || err.status === 409) {
        errText = `Stale Revision Conflict: The sheet was modified by another user (server revision: ${err.currentRevision || 'newer'}). Please reload the latest sheet before saving.`;
      } else if (err.code === 'UNASSIGNED_TEACHER' || err.status === 403) {
        errText = 'Access Denied: Only the verified assigned subject teacher for this academic year is authorized to save draft marks for this sheet.';
      }
      setSheetMessage({ type: 'error', text: errText });
    } finally {
      setSavingDraft(false);
    }
  };

  // Submit Marks Sheet for Review
  const handleSubmitSheet = async () => {
    if (!activeSheet?.id) {
      alert('Please save a draft of the sheet first before submitting.');
      return;
    }

    const confirmSubmit = window.confirm(
      'Submit Marks Sheet for Review?\n\n' +
      'Once submitted, the sheet is locked from teacher editing and forwarded to the Section Head for endorsement.\n' +
      'Are you ready to submit?'
    );
    if (!confirmSubmit) return;

    try {
      setSubmittingSheet(true);
      setSheetMessage(null);
      await api.submitMarksSheet(activeSheet.id, {
        baseRevision: activeSheet.revision || 1,
        notes: 'Submitted for formal academic review'
      });
      if (selectedExamId && selectedClassId && selectedSubjectId) {
        await loadMarksSheet(selectedExamId, selectedClassId, selectedSubjectId);
      }
      setSheetMessage({ type: 'success', text: 'Marks sheet submitted for review successfully!' });
    } catch (err: any) {
      setSheetMessage({ type: 'error', text: `Failed to submit marks sheet: ${err.message}` });
    } finally {
      setSubmittingSheet(false);
    }
  };

  // Fallback initial sheet creator
  const handleLegacySave = async (status: string = 'draft') => {
    if (!selectedExamId || !selectedClassId || !selectedSubjectId || roster.length === 0) return;

    const eligibleRoster = roster.filter((r) => r.is_eligible_for_draft !== false);
    const payloadMarks = eligibleRoster.map((r) => {
      const entry = marksMap[r.student_id] || { score: '', status: 'PRESENT' };
      const assessmentStatus = entry.status || 'PRESENT';
      const isPresent = assessmentStatus === 'PRESENT';
      const hasNumericScore = isPresent && entry.score !== '' && entry.score !== null && entry.score !== undefined;

      return {
        student_id: r.student_id,
        studentId: r.student_id,
        score: hasNumericScore ? Number(entry.score) : null,
        maxScore: sheetMaxScore,
        max_score: sheetMaxScore,
        assessmentStatus,
        is_absent: assessmentStatus === 'ABSENT' ? 1 : 0,
        is_exempt: assessmentStatus === 'EXEMPT' ? 1 : 0,
        remarks: entry.remarks || undefined
      };
    });

    try {
      setSavingDraft(true);
      setSheetMessage(null);
      await api.saveMarksSheet({
        examId: selectedExamId,
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        marks: payloadMarks,
        status,
        baseRevision: activeSheet?.revision
      });
      if (selectedExamId && selectedClassId && selectedSubjectId) {
        await loadMarksSheet(selectedExamId, selectedClassId, selectedSubjectId);
      }
      setSheetMessage({ type: 'success', text: 'Marks sheet initialized and saved!' });
    } catch (err: any) {
      let errText = `Save failed: ${err.message}`;
      if (err.code === 'STALE_REVISION' || err.status === 409) {
        errText = `Stale Revision Conflict: The sheet has been modified. Please reload before saving.`;
      } else if (err.code === 'UNASSIGNED_TEACHER' || err.status === 403) {
        errText = 'Access Denied: Only the verified assigned subject teacher is authorized to create or edit marks for this sheet.';
      }
      setSheetMessage({ type: 'error', text: errText });
    } finally {
      setSavingDraft(false);
    }
  };

  // Review & Approval Actions
  const handlePerformReview = async () => {
    if (!reviewModalSheet) return;
    if (reviewDecision === 'return' && !reviewRemarks.trim()) {
      alert('Mandatory Remarks: Please provide specific reasons when returning a sheet for revisions.');
      return;
    }

    try {
      await api.reviewMarksSheet(reviewModalSheet.id, {
        baseRevision: reviewModalSheet.revision,
        decision: reviewDecision,
        remarks: reviewRemarks || 'Endorsed for final leadership approval'
      });
      setReviewModalSheet(null);
      setReviewRemarks('');
      loadReviewSheets();
      alert(`Marks sheet ${reviewDecision === 'endorse' ? 'endorsed' : 'returned'} successfully!`);
    } catch (err: any) {
      alert(`Review failed: ${err.message}`);
    }
  };

  const handleApproveSheet = async (sheet: any) => {
    const confirmApprove = window.confirm(
      `Approve Marks Sheet for ${sheet.class_name} • ${sheet.subject_name}?\n\n` +
      `This confirms final academic leadership approval and marks this subject examination complete.`
    );
    if (!confirmApprove) return;

    try {
      setApprovingSheetId(sheet.id);
      await api.approveMarksSheet(sheet.id, {
        baseRevision: sheet.revision,
        remarks: 'Approved by authorized academic leadership'
      });
      loadReviewSheets();
      alert('Marks sheet approved successfully!');
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setApprovingSheetId(null);
    }
  };

  const handleViewHistory = async (sheetId: number) => {
    try {
      const res = await api.getMarksSheetHistory(sheetId);
      setSheetHistory(res.history || []);
      setShowHistoryModal(true);
    } catch (err: any) {
      alert(`Failed to load history: ${err.message}`);
    }
  };

  // Schedule Actions
  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId || !newScheduleClassId || !newScheduleSubjectId) return;

    try {
      setScheduleActionError(null);
      await api.addExaminationSchedule(selectedExamId, {
        classId: Number(newScheduleClassId),
        subjectId: Number(newScheduleSubjectId),
        isRequired: newScheduleIsRequired,
        maxScore: Number(newScheduleMaxScore) || 100
      });
      setShowAddScheduleModal(false);
      setNewScheduleClassId('');
      setNewScheduleSubjectId('');
      setNewScheduleMaxScore(100);
      loadSchedules(selectedExamId);
    } catch (err: any) {
      setScheduleActionError(err.message || 'Failed to add subject schedule.');
    }
  };

  const handleApproveSchedules = async () => {
    if (!selectedExamId) return;
    const confirmApprove = window.confirm(
      'Approve Examination Schedule?\n\n' +
      'This records your leadership authorization and timestamp provenance, establishing the authoritative examination offering scope.'
    );
    if (!confirmApprove) return;

    try {
      setScheduleActionError(null);
      await api.approveExaminationSchedules(selectedExamId);
      loadSchedules(selectedExamId);
      alert('Examination schedule approved successfully!');
    } catch (err: any) {
      setScheduleActionError(err.message || 'Failed to approve schedules.');
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    if (!selectedExamId) return;
    if (!window.confirm('Delete this schedule entry?')) return;

    try {
      setScheduleActionError(null);
      await api.deleteExaminationSchedule(selectedExamId, scheduleId);
      loadSchedules(selectedExamId);
    } catch (err: any) {
      setScheduleActionError(err.message || 'Failed to delete schedule entry.');
    }
  };

  // Policy Approval Action
  const handleApprovePolicy = async (policyId: number) => {
    const confirmApprove = window.confirm(
      'Approve Assessment Policy as Official School Regulation?\n\n' +
      'This activates this grading policy for official terminal examinations. Only approved policies can be used for controlled results publication.'
    );
    if (!confirmApprove) return;

    try {
      setPolicyMessage(null);
      await api.approvePolicy(policyId);
      setPolicyMessage({ type: 'success', text: 'Assessment policy approved as official school regulation!' });
      loadPolicies();
    } catch (err: any) {
      setPolicyMessage({ type: 'error', text: err.message || 'Failed to approve policy.' });
    }
  };

  // Controlled Publication Action
  const handlePublishResults = async () => {
    if (!selectedExamId) return;
    if (!publishConfirmationChecked) {
      alert('Confirmation Required: Please tick the academic integrity confirmation checkbox before publishing.');
      return;
    }

    try {
      setPublishing(true);
      setPublishError(null);
      setPublishSuccess(null);
      await api.publishExamination(selectedExamId, {
        policyProfileId: selectedPublishPolicyId ? Number(selectedPublishPolicyId) : undefined
      });
      setShowPublishModal(false);
      setPublishSuccess('Examination results successfully published! Official report cards are now accessible.');
      loadLookups();
      loadReadiness(selectedExamId);
    } catch (err: any) {
      setPublishError(err.message || 'Publication failed.');
    } finally {
      setPublishing(false);
    }
  };

  // Correction Request Action (G5F-03)
  const handleRequestCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId || !correctionStudentId || !correctionSubjectId) {
      alert('Examination, Student, and Subject are all required.');
      return;
    }
    if (!authoritativeMark) {
      alert('Authoritative published mark record could not be verified. Correction requests cannot be submitted without an existing published mark.');
      return;
    }
    if (!correctionJustification.trim() || correctionJustification.trim().length < 10) {
      alert('Justification Required: Please provide a detailed justification (minimum 10 characters).');
      return;
    }

    try {
      setSubmittingCorrection(true);
      setCorrectionError(null);

      const expectedPrevScore = authoritativeMark.score !== null && authoritativeMark.score !== undefined ? Number(authoritativeMark.score) : null;
      const expectedPrevStatus = authoritativeMark.assessmentStatus;

      await api.requestCorrection({
        markId: authoritativeMark.markId,
        sheetId: authoritativeMark.sheetId,
        examinationId: selectedExamId,
        studentId: Number(correctionStudentId),
        subjectId: Number(correctionSubjectId),
        expectedPreviousScore: expectedPrevScore,
        expectedPreviousStatus: expectedPrevStatus,
        requestedScore: correctionRequestedStatus === 'PRESENT' ? Number(correctionRequestedScore) : null,
        requestedStatus: correctionRequestedStatus,
        correctionCategory,
        detailedJustification: correctionJustification
      });

      setShowRequestCorrectionModal(false);
      setCorrectionJustification('');
      setCorrectionRequestedScore('');
      setAuthoritativeMark(null);
      loadCorrections(selectedExamId);
      alert('Post-publication correction request submitted for leadership review!');
    } catch (err: any) {
      if (err.code === 'STALE_MARK_STATE' || err.status === 409) {
        setCorrectionError(`Stale Mark Conflict: ${err.message}. The database record was updated since it was loaded. Please reload the authoritative mark.`);
      } else {
        setCorrectionError(err.message || 'Failed to submit correction request.');
      }
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const handleReviewCorrection = async (id: number, decision: 'approve' | 'reject') => {
    const comments = window.prompt(`Enter review comments for this ${decision}:`, decision === 'approve' ? 'Approved by leadership' : 'Rejected');
    if (comments === null) return;

    try {
      await api.reviewCorrection(id, { decision, reviewComments: comments });
      if (selectedExamId) loadCorrections(selectedExamId);
      alert(`Correction ${decision}d successfully!`);
    } catch (err: any) {
      alert(`Correction review failed: ${err.message}`);
    }
  };

  // Save new examination
  const handleSaveExamModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examModalName || !examModalYearId) return;

    try {
      setSavingExam(true);
      await api.createExamination({
        name: examModalName,
        academic_year_id: Number(examModalYearId),
        term: Number(examModalTerm),
        grade_band: examModalGradeBand,
        start_date: examModalStartDate || undefined,
        end_date: examModalEndDate || undefined,
        maxScore: Number(examModalMaxScore) || 100
      });
      setShowExamModal(false);
      setExamModalName('');
      setExamModalMaxScore(100);
      loadLookups();
      alert('Examination created successfully!');
    } catch (err: any) {
      alert(`Failed to create examination: ${err.message}`);
    } finally {
      setSavingExam(false);
    }
  };

  // Selected Exam Object
  const currentExam = exams.find((e) => e.id === selectedExamId);
  const isSheetLocked =
    activeSheet?.status === 'submitted' ||
    activeSheet?.status === 'reviewed' ||
    activeSheet?.status === 'approved' ||
    currentExam?.is_published === 1;

  // Filtered examinations list for Overview tab
  const filteredExams = exams.filter((ex) => {
    if (yearFilter && String(ex.academic_year_id) !== yearFilter) return false;
    if (termFilter && String(ex.term) !== termFilter) return false;
    if (statusFilter && ex.status !== statusFilter) return false;
    if (searchQuery && !ex.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      {/* Workspace Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h2>Examination Management Workspace</h2>
            <span
              className="badge"
              style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700 }}
            >
              PR-005 Integrity
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 2 }}>
            Kattankudy Central College • Authoritative examination scheduling, marks entry, independent review, assessment policy, and results publication.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* User Appointments Badges */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {isAdmin && (
              <span className="badge" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                <ShieldCheck size={12} /> Administrator
              </span>
            )}
            {isPrincipal && (
              <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>
                <Award size={12} /> Principal
              </span>
            )}
            {isVP && (
              <span className="badge" style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4' }}>
                <Award size={12} /> VP Academic
              </span>
            )}
            {isSectionHead && (
              <span className="badge" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                <Award size={12} /> Section Head
              </span>
            )}
          </div>

          {(isAdmin || hasAcademicLeadership) && (
            <button
              onClick={() => {
                if (academicYears.length > 0) setExamModalYearId(academicYears[0].id);
                setShowExamModal(true);
              }}
              className="btn btn-primary btn-sm"
            >
              <Plus size={15} /> New Examination
            </button>
          )}

          <button
            onClick={() => {
              loadLookups();
              if (selectedExamId) {
                if (activeTab === 'schedules') loadSchedules(selectedExamId);
                if (activeTab === 'publication') loadReadiness(selectedExamId);
                if (activeTab === 'corrections') loadCorrections(selectedExamId);
                if (activeTab === 'review') loadReviewSheets();
              }
            }}
            className="btn btn-secondary btn-icon btn-sm"
            title="Refresh Examination Workspace Data"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Workspace Navigation Tabs */}
      <div className="workspace-tabs">
        <button
          className={`workspace-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <GraduationCap size={16} />
          <span>Overview & Exams</span>
          <span className="workspace-tab-badge">{exams.length}</span>
        </button>

        <button
          className={`workspace-tab-btn ${activeTab === 'schedules' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedules')}
        >
          <Calendar size={16} />
          <span>Schedules</span>
          {schedulesData?.summary && (
            <span className="workspace-tab-badge">{schedulesData.summary.total}</span>
          )}
        </button>

        <button
          className={`workspace-tab-btn ${activeTab === 'entry' ? 'active' : ''}`}
          onClick={() => setActiveTab('entry')}
        >
          <Edit3 size={16} />
          <span>Marks Entry</span>
          {activeSheet && (
            <span
              className="workspace-tab-badge"
              style={{
                background:
                  activeSheet.status === 'approved'
                    ? 'var(--present-bg)'
                    : activeSheet.status === 'submitted'
                    ? '#eff6ff'
                    : 'var(--bg-subtle)',
                color:
                  activeSheet.status === 'approved'
                    ? 'var(--present)'
                    : activeSheet.status === 'submitted'
                    ? 'var(--primary)'
                    : 'var(--text-muted)'
              }}
            >
              {activeSheet.status}
            </span>
          )}
        </button>

        <button
          className={`workspace-tab-btn ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => setActiveTab('review')}
        >
          <CheckCircle2 size={16} />
          <span>Review & Approvals</span>
          {reviewSheets.length > 0 && (
            <span className="workspace-tab-badge">{reviewSheets.length}</span>
          )}
        </button>

        <button
          className={`workspace-tab-btn ${activeTab === 'policies' ? 'active' : ''}`}
          onClick={() => setActiveTab('policies')}
        >
          <Scale size={16} />
          <span>Assessment Policies</span>
          <span className="workspace-tab-badge">{policies.length}</span>
        </button>

        <button
          className={`workspace-tab-btn ${activeTab === 'publication' ? 'active' : ''}`}
          onClick={() => setActiveTab('publication')}
        >
          <Send size={16} />
          <span>Publication & Release</span>
          {readinessData?.status && (
            <span
              className="workspace-tab-badge"
              style={{
                background: readinessData.status === 'ready' ? 'var(--present-bg)' : 'var(--absent-bg)',
                color: readinessData.status === 'ready' ? 'var(--present)' : 'var(--absent)'
              }}
            >
              {readinessData.status}
            </span>
          )}
        </button>

        <button
          className={`workspace-tab-btn ${activeTab === 'corrections' ? 'active' : ''}`}
          onClick={() => setActiveTab('corrections')}
        >
          <History size={16} />
          <span>Post-Publication Corrections</span>
          {correctionsList.length > 0 && (
            <span className="workspace-tab-badge">{correctionsList.length}</span>
          )}
        </button>
      </div>

      {/* =========================================================================
          TAB 1: OVERVIEW & EXAMINATIONS
          ========================================================================= */}
      {activeTab === 'overview' && (
        <div>
          {/* Filters Bar */}
          <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
              <div>
                <label className="form-label">Search Examination</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: '2.2rem' }}
                  />
                  <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
                </div>
              </div>

              <div>
                <label className="form-label">Academic Year</label>
                <select
                  className="form-select"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                >
                  <option value="">All Academic Years</option>
                  {academicYears.map((ay) => (
                    <option key={ay.id} value={ay.id}>{ay.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Academic Term</label>
                <select
                  className="form-select"
                  value={termFilter}
                  onChange={(e) => setTermFilter(e.target.value)}
                >
                  <option value="">All Terms</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>

              <div>
                <label className="form-label">Lifecycle Status</label>
                <select
                  className="form-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="marking_open">Marking Open</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>
          </div>

          {/* Examinations List Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Examination Definition</th>
                    <th>Term & Year</th>
                    <th>Grade Band</th>
                    <th style={{ textAlign: 'center' }}>Schedules</th>
                    <th style={{ textAlign: 'center' }}>Sheets Approved</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExams.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        No examinations match the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredExams.map((ex) => {
                      const isPub = ex.is_published === 1 || ex.status === 'published';
                      const isSel = ex.id === selectedExamId;

                      return (
                        <tr
                          key={ex.id}
                          style={{ background: isSel ? 'var(--bg-subtle)' : undefined }}
                        >
                          <td>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{ex.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              ID #{ex.id} • {ex.start_date || 'TBD'} to {ex.end_date || 'TBD'}
                            </div>
                          </td>
                          <td>
                            <strong>Term {ex.term}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Year {ex.academic_year_name || ex.academic_year_id}
                            </div>
                          </td>
                          <td>
                            <span className="badge" style={{ background: 'var(--bg-subtle)', textTransform: 'uppercase' }}>
                              {ex.grade_band || 'all'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <strong>{ex.total_schedules || 0}</strong>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {ex.approved_schedules || 0} approved
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <strong>{ex.approved_sheets || 0} / {ex.total_sheets || 0}</strong>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {ex.total_sheets > 0 ? `${Math.round(((ex.approved_sheets || 0) / ex.total_sheets) * 100)}%` : '—'}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className="badge"
                              style={{
                                background: isPub
                                  ? 'var(--present-bg)'
                                  : ex.status === 'approved'
                                  ? '#eff6ff'
                                  : ex.status === 'under_review'
                                  ? 'var(--late-bg)'
                                  : 'var(--bg-subtle)',
                                color: isPub
                                  ? 'var(--present)'
                                  : ex.status === 'approved'
                                  ? 'var(--primary)'
                                  : ex.status === 'under_review'
                                  ? 'var(--late)'
                                  : 'var(--text-muted)',
                                border: '1px solid currentColor',
                                textTransform: 'capitalize'
                              }}
                            >
                              {isPub ? 'Published' : ex.status || 'Draft'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setSelectedExamId(ex.id);
                                  setActiveTab('schedules');
                                }}
                                title="Manage Schedules"
                              >
                                <Calendar size={13} /> Schedules
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setSelectedExamId(ex.id);
                                  setActiveTab('entry');
                                }}
                                title="Enter Marks"
                              >
                                <Edit3 size={13} /> Marks
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setSelectedExamId(ex.id);
                                  setActiveTab('publication');
                                }}
                                title="Check Publication Readiness"
                              >
                                <Send size={13} /> Readiness
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: EXAMINATION SCHEDULE MANAGEMENT
          ========================================================================= */}
      {activeTab === 'schedules' && (
        <div>
          {/* Header Bar */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ minWidth: 260 }}>
                <label className="form-label">Active Examination</label>
                <select
                  className="form-select"
                  value={selectedExamId || ''}
                  onChange={(e) => setSelectedExamId(Number(e.target.value))}
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} (Term {ex.term}) • {ex.is_published ? 'Published' : ex.status || 'Draft'}
                    </option>
                  ))}
                </select>
              </div>

              {schedulesData?.summary && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Completeness</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                      {schedulesData.summary.completenessPercentage}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Approved Schedules</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                      {schedulesData.summary.approved} / {schedulesData.summary.total}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</div>
                    <span
                      className="badge"
                      style={{
                        background: schedulesData.summary.isFullyApproved ? 'var(--present-bg)' : 'var(--late-bg)',
                        color: schedulesData.summary.isFullyApproved ? 'var(--present)' : 'var(--late)'
                      }}
                    >
                      {schedulesData.summary.isFullyApproved ? 'Fully Approved' : 'Draft Pending Approval'}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {/* Add schedule subject button */}
                <button
                  disabled={currentExam?.is_published === 1}
                  onClick={() => setShowAddScheduleModal(true)}
                  className="btn btn-secondary btn-sm"
                  title={currentExam?.is_published === 1 ? 'Schedule locked after publication' : 'Add class subject to examination schedule'}
                >
                  <Plus size={14} /> Add Subject Offering
                </button>

                {/* Approve schedules button (Principal or Section Head) */}
                {(isPrincipal || isVP || isSectionHead || isAdmin) && (
                  <button
                    disabled={currentExam?.is_published === 1 || schedulesData?.summary?.isFullyApproved}
                    onClick={handleApproveSchedules}
                    className="btn btn-primary btn-sm"
                  >
                    <CheckCircle2 size={14} /> Approve Examination Schedule
                  </button>
                )}
              </div>
            </div>

            {currentExam?.is_published === 1 && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.65rem 0.9rem',
                  background: 'var(--late-bg)',
                  border: '1px solid var(--late-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  color: 'var(--late)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Lock size={15} />
                <span>
                  <strong>Schedule Permanently Locked:</strong> This examination has been officially published. No schedule entries can be added, modified, or removed.
                </span>
              </div>
            )}

            {scheduleActionError && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.65rem 0.9rem',
                  background: 'var(--absent-bg)',
                  border: '1px solid var(--absent-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  color: 'var(--absent)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <AlertCircle size={15} />
                <span>{scheduleActionError}</span>
              </div>
            )}
          </div>

          {/* Schedules Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class (Grade)</th>
                    <th>Subject Code & Name</th>
                    <th>Assessment Type</th>
                    <th style={{ textAlign: 'center' }}>Schedule Status</th>
                    <th>Approval Provenance</th>
                    <th style={{ textAlign: 'center' }}>Marks Sheet Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingSchedules ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}>
                        Loading examination schedules...
                      </td>
                    </tr>
                  ) : !schedulesData?.schedules || schedulesData.schedules.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        No subject schedules defined for this examination. Click "+ Add Subject Offering" to build the schedule.
                      </td>
                    </tr>
                  ) : (
                    schedulesData.schedules.map((s: any) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.class_name}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Grade {s.grade}</div>
                        </td>
                        <td>
                          <strong>{s.subject_code}</strong> — {s.subject_name}
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.category}</div>
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: s.is_required ? 'var(--primary-light)' : 'var(--bg-subtle)',
                              color: s.is_required ? 'var(--primary)' : 'var(--text-muted)'
                            }}
                          >
                            {s.is_required ? 'Required (Core)' : 'Optional (Elective)'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              background: s.status === 'approved' ? 'var(--present-bg)' : 'var(--late-bg)',
                              color: s.status === 'approved' ? 'var(--present)' : 'var(--late)'
                            }}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.775rem' }}>
                          {s.approved_by_user_id ? (
                            <div>
                              <div style={{ fontWeight: 600 }}>{s.approved_by_name || `User #${s.approved_by_user_id}`}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                {s.approved_at ? new Date(s.approved_at).toLocaleString() : 'Approved'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Pending leadership sign-off</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              background:
                                s.sheet_status === 'approved'
                                  ? 'var(--present-bg)'
                                  : s.sheet_status === 'submitted'
                                  ? '#eff6ff'
                                  : 'var(--bg-subtle)',
                              color:
                                s.sheet_status === 'approved'
                                  ? 'var(--present)'
                                  : s.sheet_status === 'submitted'
                                  ? 'var(--primary)'
                                  : 'var(--text-muted)'
                            }}
                          >
                            {s.sheet_status || 'Not Created'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            disabled={currentExam?.is_published === 1}
                            onClick={() => handleDeleteSchedule(s.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--absent)' }}
                            title="Remove schedule entry"
                          >
                            <X size={14} /> Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: MARKS ENTRY
          ========================================================================= */}
      {activeTab === 'entry' && (
        <div>
          {/* Selectors Bar */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="form-label" htmlFor="marks-exam-select">Examination Definition</label>
                <select
                  id="marks-exam-select"
                  className="form-select"
                  value={selectedExamId || ''}
                  onChange={(e) => setSelectedExamId(Number(e.target.value))}
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} (Term {ex.term}) • {ex.is_published ? 'Published' : ex.status || 'Draft'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="marks-class-select">Class (Grade 6–13)</label>
                <select
                  id="marks-class-select"
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
                <label className="form-label" htmlFor="marks-subject-select">Subject</label>
                <select
                  id="marks-subject-select"
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

            {/* Sheet Status and Action Bar */}
            <div
              style={{
                marginTop: '1.25rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Sheet Lifecycle:</span>
                <span
                  className="badge"
                  style={{
                    background:
                      activeSheet?.status === 'approved'
                        ? 'var(--present-bg)'
                        : activeSheet?.status === 'submitted'
                        ? '#eff6ff'
                        : 'var(--bg-subtle)',
                    color:
                      activeSheet?.status === 'approved'
                        ? 'var(--present)'
                        : activeSheet?.status === 'submitted'
                        ? 'var(--primary)'
                        : 'var(--text-muted)',
                    textTransform: 'uppercase',
                    fontWeight: 700
                  }}
                >
                  {activeSheet?.status || 'draft'}
                </span>
                {activeSheet?.revision && (
                  <span className="badge" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                    Revision #{activeSheet.revision}
                  </span>
                )}
                {isSheetLocked && (
                  <span
                    className="badge"
                    style={{ background: 'var(--late-bg)', color: 'var(--late)', border: '1px solid var(--late-border)' }}
                  >
                    <Lock size={12} /> Read-Only Locked
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {activeSheet?.id && (
                  <button
                    type="button"
                    onClick={() => handleViewHistory(activeSheet.id)}
                    className="btn btn-secondary btn-sm"
                  >
                    <History size={14} /> Revisions
                  </button>
                )}

                {!isSheetLocked && (
                  <>
                    <button
                      type="button"
                      disabled={savingDraft || roster.length === 0}
                      onClick={handleSaveDraft}
                      className="btn btn-secondary btn-sm"
                    >
                      <Save size={14} />
                      <span>{savingDraft ? 'Saving Draft...' : 'Save Draft'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={submittingSheet || roster.length === 0}
                      onClick={handleSubmitSheet}
                      className="btn btn-primary btn-sm"
                    >
                      <Send size={14} />
                      <span>{submittingSheet ? 'Submitting...' : 'Submit for Review'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {sheetMessage && (
              <div
                className={`alert ${sheetMessage.type === 'success' ? 'alert-success' : 'alert-danger'}`}
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  background: sheetMessage.type === 'success' ? 'var(--present-bg)' : 'var(--absent-bg)',
                  color: sheetMessage.type === 'success' ? 'var(--present)' : 'var(--absent)',
                  border: `1px solid ${sheetMessage.type === 'success' ? 'var(--present-border)' : 'var(--absent-border)'}`,
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem'
                }}
              >
                {sheetMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <strong>{sheetMessage.text}</strong>
              </div>
            )}
          </div>

          {/* Class Statistics Widget */}
          {stats && (
            <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
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
                  <div className="stat-label">Pass Rate (&ge; 35)</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                  <GraduationCap size={24} />
                </div>
                <div>
                  <div className="stat-val">{stats.maxScore} / {sheetMaxScore}</div>
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

          {/* Marks Spreadsheet Grid */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Roll</th>
                    <th>Admission No</th>
                    <th>Student Full Name</th>
                    <th>Subject Category</th>
                    <th style={{ width: 140 }}>Raw Mark (0–{sheetMaxScore})</th>
                    <th style={{ width: 200, textAlign: 'center' }}>Assessment Status</th>
                    <th style={{ width: 85, textAlign: 'center' }}>Grade</th>
                    <th style={{ textAlign: 'right', width: 140 }}>Report Card</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingSheet ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem' }}>
                        Loading marks roster...
                      </td>
                    </tr>
                  ) : roster.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        No students enrolled in this class or subject offering.
                      </td>
                    </tr>
                  ) : (
                    roster.map((r, idx) => {
                      const entry = marksMap[r.student_id] || { score: '', status: 'PRESENT' };
                      const grade = calcGrade(entry.score, entry.status);

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
                            <span
                              className="badge"
                              style={{ background: 'var(--bg-subtle)', fontSize: '0.7rem' }}
                            >
                              {r.enrollment_category || 'Core'}
                            </span>
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
                              placeholder={`0–${sheetMaxScore}`}
                              value={entry.score}
                              disabled={isSheetLocked || entry.status !== 'PRESENT'}
                              onChange={(e) => handleScoreChange(r.student_id, e.target.value)}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                              <button
                                type="button"
                                disabled={isSheetLocked}
                                onClick={() => handleStatusChange(r.student_id, 'PRESENT')}
                                className={`btn btn-sm ${entry.status === 'PRESENT' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                              >
                                Present
                              </button>
                              <button
                                type="button"
                                disabled={isSheetLocked}
                                onClick={() => handleStatusChange(r.student_id, 'ABSENT')}
                                className={`btn btn-sm ${entry.status === 'ABSENT' ? 'btn-danger' : 'btn-secondary'}`}
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                              >
                                Absent
                              </button>
                              <button
                                type="button"
                                disabled={isSheetLocked}
                                onClick={() => handleStatusChange(r.student_id, 'MEDICAL')}
                                className={`btn btn-sm ${entry.status === 'MEDICAL' ? 'btn-secondary active' : 'btn-secondary'}`}
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                              >
                                Med
                              </button>
                              <button
                                type="button"
                                disabled={isSheetLocked}
                                onClick={() => handleStatusChange(r.student_id, 'EXEMPT')}
                                className={`btn btn-sm ${entry.status === 'EXEMPT' ? 'btn-secondary active' : 'btn-secondary'}`}
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                              >
                                Exempt
                              </button>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className={`grade-badge ${grade.cls}`}
                              title={grade.percentage !== null ? `${grade.percentage}% normalized (${grade.isProvisional ? 'Provisional - Policy unapproved' : 'Official Policy'})` : undefined}
                            >
                              {grade.letter}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => setReportStudentId(r.student_id)}
                              className="btn btn-secondary btn-sm"
                              title="Generate printable terminal report card"
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
        </div>
      )}

      {/* =========================================================================
          TAB 4: MARKS REVIEW & APPROVAL
          ========================================================================= */}
      {activeTab === 'review' && (
        <div>
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>Independent Marks Review & Approval Queue</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Enforcing Sri Lankan Ministry of Education separation-of-duties: Subject Teachers submit, Section Heads endorse, and Principal provides final sign-off.
                </p>
              </div>

              <button onClick={loadReviewSheets} className="btn btn-secondary btn-sm">
                <RefreshCw size={14} /> Refresh Queue
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Examination & Class</th>
                    <th>Subject</th>
                    <th>Teacher / Submitter</th>
                    <th>Revision & Status</th>
                    <th style={{ textAlign: 'center' }}>Roster Progress</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingReview ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                        Loading review queue...
                      </td>
                    </tr>
                  ) : reviewSheets.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        No marks sheets currently awaiting review or approval.
                      </td>
                    </tr>
                  ) : (
                    reviewSheets.map((sh: any) => {
                      const isSubmitter = sh.submitted_by_user_id === user.id;

                      return (
                        <tr key={sh.id}>
                          <td>
                            <strong>{sh.class_name}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sh.examination_name}</div>
                          </td>
                          <td>
                            <strong>{sh.subject_code}</strong> — {sh.subject_name}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{sh.submitted_by_name || 'Staff'}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {sh.submitted_at ? new Date(sh.submitted_at).toLocaleString() : '—'}
                            </div>
                          </td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                background:
                                  sh.status === 'approved'
                                    ? 'var(--present-bg)'
                                    : sh.status === 'reviewed'
                                    ? '#eff6ff'
                                    : sh.status === 'submitted'
                                    ? 'var(--late-bg)'
                                    : 'var(--bg-subtle)',
                                color:
                                  sh.status === 'approved'
                                    ? 'var(--present)'
                                    : sh.status === 'reviewed'
                                    ? 'var(--primary)'
                                    : sh.status === 'submitted'
                                    ? 'var(--late)'
                                    : 'var(--text-muted)'
                              }}
                            >
                              {sh.status} (Rev {sh.revision})
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <strong>{sh.graded_count || 0} / {sh.total_marks_count || 0}</strong>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                              <button
                                onClick={() => handleViewHistory(sh.id)}
                                className="btn btn-secondary btn-sm"
                                title="View Revision Audit Trail"
                              >
                                <History size={13} />
                              </button>

                              {/* Section Head Endorse / Return */}
                              {(isSectionHead || isAdmin) && sh.status === 'submitted' && (
                                <button
                                  disabled={isSubmitter}
                                  onClick={() => {
                                    setReviewModalSheet(sh);
                                    setReviewDecision('endorse');
                                  }}
                                  className="btn btn-secondary btn-sm"
                                  title={isSubmitter ? 'Separation of Duties: Submitter cannot review own sheet' : 'Endorse or return marks sheet'}
                                >
                                  <ShieldCheck size={13} /> Review / Return
                                </button>
                              )}

                              {/* Principal Final Approval */}
                              {(isPrincipal || isAdmin) && (sh.status === 'reviewed' || sh.status === 'submitted') && (
                                <button
                                  disabled={isSubmitter || approvingSheetId === sh.id}
                                  onClick={() => handleApproveSheet(sh)}
                                  className="btn btn-primary btn-sm"
                                  title={isSubmitter ? 'Separation of Duties: Submitter cannot approve own sheet' : 'Approve marks sheet'}
                                >
                                  <CheckCircle2 size={13} /> {approvingSheetId === sh.id ? 'Approving...' : 'Final Approval'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: ASSESSMENT POLICIES
          ========================================================================= */}
      {activeTab === 'policies' && (
        <div>
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem' }}>Kattankudy Central College Assessment Policies</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Official grading scales, weighted averages, and ranking governance profiles approved by school leadership.
                </p>
              </div>

              <button onClick={loadPolicies} className="btn btn-secondary btn-sm">
                <RefreshCw size={14} /> Refresh Policies
              </button>
            </div>

            {policyMessage && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  background: policyMessage.type === 'success' ? 'var(--present-bg)' : 'var(--absent-bg)',
                  color: policyMessage.type === 'success' ? 'var(--present)' : 'var(--absent)',
                  border: `1px solid ${policyMessage.type === 'success' ? 'var(--present-border)' : 'var(--absent-border)'}`,
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem'
                }}
              >
                {policyMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <strong>{policyMessage.text}</strong>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.25rem' }}>
            {/* Policy List */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>
                Policy Profiles
              </div>
              <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                {loadingPolicies ? (
                  <div style={{ padding: '2rem', textAlign: 'center' }}>Loading policies...</div>
                ) : policies.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No policy profiles configured.
                  </div>
                ) : (
                  policies.map((pol) => {
                    const isApproved = pol.is_approved_by_school === 1;
                    const isSelected = selectedPolicy?.id === pol.id;

                    return (
                      <div
                        key={pol.id}
                        onClick={() => setSelectedPolicy(pol)}
                        style={{
                          padding: '1rem',
                          borderBottom: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--bg-subtle)' : undefined,
                          transition: 'background var(--transition-fast)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <strong style={{ fontSize: '0.9rem' }}>{pol.policy_code}</strong>
                          <span
                            className="badge"
                            style={{
                              background: isApproved ? 'var(--present-bg)' : 'var(--late-bg)',
                              color: isApproved ? 'var(--present)' : 'var(--late)',
                              fontSize: '0.7rem'
                            }}
                          >
                            {isApproved ? 'Approved Official' : 'Provisional'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                          {pol.title}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          v{pol.version} • Grade Band: {pol.grade_band || 'all'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Selected Policy Details */}
            {selectedPolicy ? (
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.15rem' }}>{selectedPolicy.title}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Code: {selectedPolicy.policy_code} • Version {selectedPolicy.version}
                    </span>
                  </div>

                  {selectedPolicy.is_approved_by_school !== 1 && (isPrincipal || isAdmin) && (
                    <button
                      onClick={() => handleApprovePolicy(selectedPolicy.id)}
                      className="btn btn-primary btn-sm"
                    >
                      <CheckCircle2 size={14} /> Approve as Official School Policy
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '1rem',
                    padding: '1rem',
                    background: 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '1.5rem',
                    fontSize: '0.825rem'
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Approval Status:</span>
                    <div style={{ fontWeight: 700, color: selectedPolicy.is_approved_by_school ? 'var(--present)' : 'var(--late)' }}>
                      {selectedPolicy.is_approved_by_school ? 'Approved by School' : 'Provisional (Unapproved)'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Effective Period:</span>
                    <div style={{ fontWeight: 600 }}>
                      {selectedPolicy.valid_from || 'Always'} to {selectedPolicy.valid_to || 'Indefinite'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Applicable Grade Band:</span>
                    <div style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      {selectedPolicy.grade_band || 'all'}
                    </div>
                  </div>
                </div>

                {/* Grading Scales */}
                <h5 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Grading Scales & Distinction Tiers</h5>
                <div className="table-responsive" style={{ marginBottom: '1.5rem' }}>
                  <table className="data-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Minimum Score</th>
                        <th>Maximum Score</th>
                        <th>Distinction Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPolicy.grading_scales?.map((g: any, i: number) => (
                        <tr key={i}>
                          <td><strong>{g.gradeLetter || g.grade_letter}</strong></td>
                          <td>{g.minScore || g.min_score}%</td>
                          <td>{g.maxScore || g.max_score}%</td>
                          <td>{g.description || 'Standard'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Ranking & Absence Rules */}
                <h5 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Ranking & Weighting Rules</h5>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <div>• <strong>Subject Weights:</strong> Core subjects carry 100% normalized weight. Optional basket subjects are weighted per curriculum category.</div>
                  <div>• <strong>Absence Rule:</strong> Absent or Medical exemptions are excluded from distinction rank calculations.</div>
                  <div>• <strong>Official Rank Tie-Breaking:</strong> Highest aggregate core marks break ties in official class terminal ranking.</div>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Select an assessment policy to view detailed rules.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: CONTROLLED RESULTS PUBLICATION
          ========================================================================= */}
      {activeTab === 'publication' && (
        <div>
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ minWidth: 260 }}>
                <label className="form-label">Active Examination</label>
                <select
                  className="form-select"
                  value={selectedExamId || ''}
                  onChange={(e) => setSelectedExamId(Number(e.target.value))}
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} (Term {ex.term}) • {ex.is_published ? 'Published' : ex.status || 'Draft'}
                    </option>
                  ))}
                </select>
              </div>

              {readinessData && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span
                    className="badge"
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.85rem',
                      background: (readinessData.isReady || readinessData.status === 'ready') ? 'var(--present-bg)' : 'var(--absent-bg)',
                      color: (readinessData.isReady || readinessData.status === 'ready') ? 'var(--present)' : 'var(--absent)',
                      border: '1px solid currentColor'
                    }}
                  >
                    {(readinessData.isReady || readinessData.status === 'ready') ? 'Publication Ready' : 'Publication Blocked'}
                  </span>
                </div>
              )}

              {/* Guarded Publish Action (Principal or VP Academic only) */}
              {(isPrincipal || isVP || isAdmin) && (
                <button
                  disabled={currentExam?.is_published === 1 || !(readinessData?.isReady || readinessData?.status === 'ready')}
                  onClick={() => {
                    setPublishConfirmationChecked(false);
                    setShowPublishModal(true);
                  }}
                  className="btn btn-primary"
                >
                  <Send size={15} /> Publish Results Officially
                </button>
              )}
            </div>

            {publishSuccess && (
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
                <strong>{publishSuccess}</strong>
              </div>
            )}

            {publishError && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  background: 'var(--absent-bg)',
                  color: 'var(--absent)',
                  border: '1px solid var(--absent-border)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem'
                }}
              >
                <AlertCircle size={18} />
                <strong>{publishError}</strong>
              </div>
            )}
          </div>

          {/* 7-Point Publication Readiness Checklist */}
          {loadingReadiness ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              Validating publication prerequisites...
            </div>
          ) : readinessData ? (
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                Pre-Publication Integrity Verification Checklist
              </h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                All 7 verification checkpoints must pass without exceptions. Results publication is permanently recorded in the immutable audit log.
              </p>

              {(() => {
                const checks = readinessData?.checks || readinessData?.readiness || {};
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.75rem' }}>
                    {/* 1. Approved Examination Schedule */}
                    <div className={`readiness-item ${checks.scheduleApproved ? 'ready' : 'blocked'}`}>
                      {checks.scheduleApproved ? (
                        <CheckCircle2 size={20} style={{ color: 'var(--present)', flexShrink: 0 }} />
                      ) : (
                        <XCircle size={20} style={{ color: 'var(--absent)', flexShrink: 0 }} />
                      )}
                      <div>
                        <strong>1. Approved Examination Schedule</strong>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                          Authoritative schedule approved by academic leadership with provenance timestamp.
                        </div>
                      </div>
                    </div>

                    {/* 2. Required Marks Sheet Coverage */}
                    <div className={`readiness-item ${checks.allSheetsApproved ? 'ready' : 'blocked'}`}>
                      {checks.allSheetsApproved ? (
                        <CheckCircle2 size={20} style={{ color: 'var(--present)', flexShrink: 0 }} />
                      ) : (
                        <XCircle size={20} style={{ color: 'var(--absent)', flexShrink: 0 }} />
                      )}
                      <div>
                        <strong>2. Marks Sheet Coverage & Approval</strong>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                          100% of required scheduled class-subject marks sheets fully approved.
                        </div>
                      </div>
                    </div>

                    {/* 3. Confirmed Student-Subject Enrolments */}
                    <div className={`readiness-item ${checks.enrolmentsConfirmed ? 'ready' : 'blocked'}`}>
                      {checks.enrolmentsConfirmed ? (
                        <CheckCircle2 size={20} style={{ color: 'var(--present)', flexShrink: 0 }} />
                      ) : (
                        <XCircle size={20} style={{ color: 'var(--absent)', flexShrink: 0 }} />
                      )}
                      <div>
                        <strong>3. Confirmed Subject Enrolments</strong>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                          No students with unconfirmed, pending, or draft subject enrolments.
                        </div>
                      </div>
                    </div>

                    {/* 4. Complete Marks Data */}
                    <div className={`readiness-item ${checks.allSheetsApproved ? 'ready' : 'blocked'}`}>
                      {checks.allSheetsApproved ? (
                        <CheckCircle2 size={20} style={{ color: 'var(--present)', flexShrink: 0 }} />
                      ) : (
                        <XCircle size={20} style={{ color: 'var(--absent)', flexShrink: 0 }} />
                      )}
                      <div>
                        <strong>4. Complete Student Marks Roster</strong>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                          Every enrolled student has an assessed score, absence, or approved exemption.
                        </div>
                      </div>
                    </div>

                    {/* 5. Independent Approval Provenance */}
                    <div className={`readiness-item ${checks.allSheetsApproved ? 'ready' : 'blocked'}`}>
                      {checks.allSheetsApproved ? (
                        <CheckCircle2 size={20} style={{ color: 'var(--present)', flexShrink: 0 }} />
                      ) : (
                        <XCircle size={20} style={{ color: 'var(--absent)', flexShrink: 0 }} />
                      )}
                      <div>
                        <strong>5. Independent Approval Provenance</strong>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                          No sheets approved by their own submitter. Multi-tier separation enforced.
                        </div>
                      </div>
                    </div>

                    {/* 6. Approved Assessment Policy */}
                    <div className={`readiness-item ${checks.policyApproved ? 'ready' : 'blocked'}`}>
                      {checks.policyApproved ? (
                        <CheckCircle2 size={20} style={{ color: 'var(--present)', flexShrink: 0 }} />
                      ) : (
                        <XCircle size={20} style={{ color: 'var(--absent)', flexShrink: 0 }} />
                      )}
                      <div>
                        <strong>6. Approved Assessment Policy Profile</strong>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                          Official governing policy approved by school leadership and active for exam dates.
                        </div>
                      </div>
                    </div>

                    {/* 7. Clean Legacy Quarantine */}
                    <div className={`readiness-item ${checks.legacyQuarantineClean ? 'ready' : 'blocked'}`}>
                      {checks.legacyQuarantineClean ? (
                        <CheckCircle2 size={20} style={{ color: 'var(--present)', flexShrink: 0 }} />
                      ) : (
                        <XCircle size={20} style={{ color: 'var(--absent)', flexShrink: 0 }} />
                      )}
                      <div>
                        <strong>7. Legacy Data Quarantine Containment</strong>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                          Zero unmigrated or quarantined legacy data contaminating calculations.
                        </div>
                      </div>
                    </div>

                    {/* 8. Authorized Publisher Authority */}
                    <div className={`readiness-item ${checks.publisherAuthorized ? 'ready' : 'blocked'}`}>
                      {checks.publisherAuthorized ? (
                        <CheckCircle2 size={20} style={{ color: 'var(--present)', flexShrink: 0 }} />
                      ) : (
                        <XCircle size={20} style={{ color: 'var(--absent)', flexShrink: 0 }} />
                      )}
                      <div>
                        <strong>8. Authorized Publisher Authority</strong>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                          User holds active Principal or VP Academic appointment for this academic year.
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Blockers Display */}
              {readinessData.blockers?.length > 0 && (
                <div
                  style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    background: 'var(--absent-bg)',
                    border: '1px solid var(--absent-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--absent)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <AlertTriangle size={18} />
                    <strong>Unresolved Publication Blockers ({readinessData.blockers.length}):</strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
                    {readinessData.blockers.map((b: string, i: number) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* =========================================================================
          TAB 7: POST-PUBLICATION CORRECTIONS
          ========================================================================= */}
      {activeTab === 'corrections' && (
        <div>
          <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ minWidth: 260 }}>
                <label className="form-label">Active Published Examination</label>
                <select
                  className="form-select"
                  value={selectedExamId || ''}
                  onChange={(e) => setSelectedExamId(Number(e.target.value))}
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} (Term {ex.term}) • {ex.is_published ? 'Published' : ex.status || 'Draft'}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  disabled={currentExam?.is_published !== 1}
                  onClick={() => setShowRequestCorrectionModal(true)}
                  className="btn btn-primary btn-sm"
                  title={currentExam?.is_published !== 1 ? 'Corrections are only available on published exams' : 'Request a formal mark correction'}
                >
                  <Plus size={14} /> Request Mark Correction
                </button>

                <button
                  onClick={() => selectedExamId && loadCorrections(selectedExamId)}
                  className="btn btn-secondary btn-sm"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            </div>

            {currentExam?.is_published !== 1 && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.65rem 0.9rem',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Info size={15} />
                <span>
                  Post-publication corrections are only applicable after an examination has been officially published. Use standard draft revision before publication.
                </span>
              </div>
            )}
          </div>

          {/* Corrections Audit Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student Details</th>
                    <th>Subject</th>
                    <th>Previous vs Requested Mark</th>
                    <th>Category & Justification</th>
                    <th>Requested By</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'right' }}>Leadership Review</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingCorrections ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem' }}>
                        Loading corrections history...
                      </td>
                    </tr>
                  ) : correctionsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        No post-publication mark corrections registered for this examination.
                      </td>
                    </tr>
                  ) : (
                    correctionsList.map((c: any) => {
                      const isPending = c.status === 'pending';
                      const isSubmitter = c.requested_by_user_id === user.id;

                      return (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.student_name}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Admission #{c.admission_no} • {c.class_name}
                            </div>
                          </td>
                          <td>
                            <strong>{c.subject_code}</strong> — {c.subject_name}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>
                                {c.expected_previous_score !== null ? c.expected_previous_score : c.expected_previous_status}
                              </span>
                              <span>&rarr;</span>
                              <strong style={{ color: 'var(--present)' }}>
                                {c.requested_score !== null ? c.requested_score : c.requested_status}
                              </strong>
                            </div>
                          </td>
                          <td>
                            <span
                              className="badge"
                              style={{ background: 'var(--bg-subtle)', textTransform: 'capitalize', fontSize: '0.7rem' }}
                            >
                              {c.correction_category?.replace(/_/g, ' ')}
                            </span>
                            <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', color: 'var(--text-main)' }}>
                              {c.detailed_justification}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{c.requested_by_name || 'Staff'}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {c.requested_at ? new Date(c.requested_at).toLocaleString() : '—'}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className="badge"
                              style={{
                                background:
                                  c.status === 'approved'
                                    ? 'var(--present-bg)'
                                    : c.status === 'rejected'
                                    ? 'var(--absent-bg)'
                                    : 'var(--late-bg)',
                                color:
                                  c.status === 'approved'
                                    ? 'var(--present)'
                                    : c.status === 'rejected'
                                    ? 'var(--absent)'
                                    : 'var(--late)'
                              }}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {isPending && (isPrincipal || isVP || isSectionHead || isAdmin) ? (
                              <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                <button
                                  disabled={isSubmitter}
                                  onClick={() => handleReviewCorrection(c.id, 'approve')}
                                  className="btn btn-primary btn-sm"
                                  title={isSubmitter ? 'Separation of Duties: Submitter cannot approve own request' : 'Approve correction'}
                                >
                                  Approve
                                </button>
                                <button
                                  disabled={isSubmitter}
                                  onClick={() => handleReviewCorrection(c.id, 'reject')}
                                  className="btn btn-secondary btn-sm"
                                  title="Reject correction"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : c.reviewed_by_name ? (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                By {c.reviewed_by_name}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODALS & DRAWERS
          ========================================================================= */}

      {/* Modal: Add Schedule Offering */}
      {showAddScheduleModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h4>Add Subject Offering to Examination Schedule</h4>
              <button onClick={() => setShowAddScheduleModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddSchedule}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Class</label>
                  <select
                    className="form-select"
                    required
                    value={newScheduleClassId}
                    onChange={(e) => {
                      const cId = Number(e.target.value);
                      setNewScheduleClassId(cId);
                      loadClassSubjects(cId);
                    }}
                  >
                    <option value="">Select Class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <select
                    className="form-select"
                    required
                    value={newScheduleSubjectId}
                    onChange={(e) => setNewScheduleSubjectId(Number(e.target.value))}
                  >
                    <option value="">Select Subject</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code}) • {s.category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Authoritative Maximum Marks (e.g. 50, 100, 200)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="1000"
                    className="form-input"
                    value={newScheduleMaxScore}
                    onChange={(e) => setNewScheduleMaxScore(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="100"
                    required
                  />
                  <small style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.75rem' }}>
                    Authoritative assessment maximum score. Pre-configures the marks sheet before teachers enter scores.
                  </small>
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="isRequiredSchedule"
                    checked={newScheduleIsRequired}
                    onChange={(e) => setNewScheduleIsRequired(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  <label htmlFor="isRequiredSchedule" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    Required assessment entry (Core / Compulsory)
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAddScheduleModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Schedule Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Review Marks Sheet (Endorse / Return) */}
      {reviewModalSheet && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h4>Review Marks Sheet: {reviewModalSheet.class_name} • {reviewModalSheet.subject_name}</h4>
              <button onClick={() => setReviewModalSheet(null)} className="btn btn-secondary btn-icon btn-sm">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Review Decision</label>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="decision"
                      checked={reviewDecision === 'endorse'}
                      onChange={() => setReviewDecision('endorse')}
                    />
                    <strong>Endorse Sheet (Forward to Principal)</strong>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="decision"
                      checked={reviewDecision === 'return'}
                      onChange={() => setReviewDecision('return')}
                    />
                    <strong style={{ color: 'var(--absent)' }}>Return with Remarks</strong>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Reviewer Remarks {reviewDecision === 'return' ? '(Mandatory)' : '(Optional)'}
                </label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder={reviewDecision === 'return' ? 'Specify required corrections...' : 'Add endorsement remarks...'}
                  value={reviewRemarks}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setReviewModalSheet(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handlePerformReview} className="btn btn-primary">
                Confirm Review Decision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Marks Sheet Revision Audit Trail */}
      {showHistoryModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h4>Marks Sheet Revision History & Provenance</h4>
              <button onClick={() => setShowHistoryModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {!sheetHistory || sheetHistory.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No revision history available.</p>
              ) : (
                sheetHistory.map((h: any, i: number) => (
                  <div
                    key={h.id || i}
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-subtle)',
                      marginBottom: '0.65rem',
                      fontSize: '0.85rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <strong>Revision #{h.revision_number || h.revision} • {h.action_type || h.action}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {h.created_at ? new Date(h.created_at).toLocaleString() : '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                      By: {h.created_by_name || `User #${h.created_by_user_id}`}
                    </div>
                    {h.remarks && (
                      <div style={{ marginTop: '0.35rem', fontStyle: 'italic', color: 'var(--text-main)' }}>
                        "{h.remarks}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowHistoryModal(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Publish Examination Guarded Confirmation */}
      {showPublishModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} style={{ color: 'var(--primary)' }} />
                <h4>Controlled Results Publication</h4>
              </div>
              <button onClick={() => setShowPublishModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div
                style={{
                  background: 'var(--late-bg)',
                  border: '1px solid var(--late-border)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                  color: 'var(--late)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem'
                }}
              >
                <AlertTriangle size={22} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>Permanent Publication Commitment:</strong>
                  <div style={{ marginTop: '0.25rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                    Publishing examination results will permanently lock all associated schedules and marks sheets, compute official student rankings, and release student report cards.
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Governing Assessment Policy Profile</label>
                <select
                  className="form-select"
                  value={selectedPublishPolicyId}
                  onChange={(e) => setSelectedPublishPolicyId(Number(e.target.value))}
                >
                  <option value="">Default (Approved School Policy)</option>
                  {policies
                    .filter((p) => p.is_approved_by_school === 1)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.policy_code} • {p.title} (v{p.version})
                      </option>
                    ))}
                </select>
              </div>

              <div
                style={{
                  padding: '0.85rem',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1rem'
                }}
              >
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={publishConfirmationChecked}
                    onChange={(e) => setPublishConfirmationChecked(e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 2 }}
                  />
                  <span>
                    I confirm as authorized Academic Leadership that all marks sheets, schedules, and policies have been independently verified in compliance with Kattankudy Central College examination integrity regulations.
                  </span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowPublishModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                disabled={publishing || !publishConfirmationChecked}
                onClick={handlePublishResults}
                className="btn btn-primary"
              >
                {publishing ? 'Publishing...' : 'Confirm & Publish Results'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Request Post-Publication Mark Correction */}
      {showRequestCorrectionModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h4>Request Post-Publication Mark Correction</h4>
              <button onClick={() => setShowRequestCorrectionModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleRequestCorrection}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Select Student</label>
                  <select
                    className="form-select"
                    required
                    value={correctionStudentId}
                    onChange={(e) => setCorrectionStudentId(Number(e.target.value))}
                  >
                    <option value="">Select Student</option>
                    {(roster.length > 0 ? roster : allStudents).map((r) => (
                      <option key={r.student_id || r.id} value={r.student_id || r.id}>
                        {r.full_name} ({r.admission_no})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Select Subject</label>
                  <select
                    className="form-select"
                    required
                    value={correctionSubjectId}
                    onChange={(e) => setCorrectionSubjectId(Number(e.target.value))}
                  >
                    <option value="">Select Subject</option>
                    {(subjects.length > 0 ? subjects : allSubjects).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Authoritative Mark Preview / Verification (G5F-03) */}
                {loadingAuthoritativeMark && (
                  <div style={{ padding: '0.6rem', fontSize: '0.825rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <RefreshCw size={14} className="spin" /> Fetching authoritative published mark record...
                  </div>
                )}
                {authoritativeMark && (
                  <div style={{ padding: '0.75rem', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Authoritative Published Mark (Verified)
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', fontSize: '0.85rem' }}>
                      <div>
                        <strong>Mark ID:</strong> #{authoritativeMark.markId} | <strong>Status:</strong> <span className="badge" style={{ fontSize: '0.7rem' }}>{authoritativeMark.assessmentStatus}</span>
                      </div>
                      <div>
                        <strong>Current Score:</strong> {authoritativeMark.score !== null ? <strong>{authoritativeMark.score} / {authoritativeMark.maxScore}</strong> : <em>N/A ({authoritativeMark.assessmentStatus})</em>}
                      </div>
                    </div>
                  </div>
                )}
                {authoritativeMarkError && (
                  <div style={{ color: 'var(--absent)', fontSize: '0.825rem', marginBottom: '0.75rem', padding: '0.5rem', background: '#ffebee', borderRadius: '4px', border: '1px solid #ffcdd2' }}>
                    ⚠️ {authoritativeMarkError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Requested Score (0–{authoritativeMark?.maxScore || sheetMaxScore || 100})</label>
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      max={authoritativeMark?.maxScore || sheetMaxScore || 100}
                      className="form-input"
                      placeholder="e.g. 78"
                      value={correctionRequestedScore}
                      onChange={(e) => setCorrectionRequestedScore(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Requested Status</label>
                    <select
                      className="form-select"
                      value={correctionRequestedStatus}
                      onChange={(e) => setCorrectionRequestedStatus(e.target.value)}
                    >
                      <option value="PRESENT">Present</option>
                      <option value="ABSENT">Absent</option>
                      <option value="MEDICAL">Medical Exemption</option>
                      <option value="EXEMPT">Exempt</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Correction Category</label>
                  <select
                    className="form-select"
                    value={correctionCategory}
                    onChange={(e) => setCorrectionCategory(e.target.value)}
                  >
                    <option value="clerical_addition">Clerical Addition / Arithmetic Error</option>
                    <option value="missed_question">Missed Question / Omission</option>
                    <option value="incorrect_index">Incorrect Student Index / Admission Error</option>
                    <option value="re_scrutiny">Formal Re-Scrutiny Appeal</option>
                    <option value="other">Other Documented Justification</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Detailed Justification (Minimum 10 characters)</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    required
                    placeholder="Provide specific documentation reference, re-scrutiny finding, or justification..."
                    value={correctionJustification}
                    onChange={(e) => setCorrectionJustification(e.target.value)}
                  />
                </div>

                {correctionError && (
                  <div style={{ color: 'var(--absent)', fontSize: '0.825rem', marginTop: '0.5rem' }}>
                    {correctionError}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowRequestCorrectionModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submittingCorrection || loadingAuthoritativeMark || !authoritativeMark} className="btn btn-primary">
                  {submittingCorrection ? 'Submitting...' : 'Submit Correction Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Examination */}
      {showExamModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h4>Create Examination Definition</h4>
              <button onClick={() => setShowExamModal(false)} className="btn btn-secondary btn-icon btn-sm">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveExamModal}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Examination Name</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. 2026 Term 1 Terminal Evaluation"
                    value={examModalName}
                    onChange={(e) => setExamModalName(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Academic Year</label>
                    <select
                      className="form-select"
                      required
                      value={examModalYearId}
                      onChange={(e) => setExamModalYearId(Number(e.target.value))}
                    >
                      {academicYears.map((ay) => (
                        <option key={ay.id} value={ay.id}>{ay.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Term</label>
                    <select
                      className="form-select"
                      value={examModalTerm}
                      onChange={(e) => setExamModalTerm(Number(e.target.value))}
                    >
                      <option value={1}>Term 1</option>
                      <option value={2}>Term 2</option>
                      <option value={3}>Term 3</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Grade Band Scope</label>
                  <select
                    className="form-select"
                    value={examModalGradeBand}
                    onChange={(e) => setExamModalGradeBand(e.target.value)}
                  >
                    <option value="all">Whole School (All Grades 6–13)</option>
                    <option value="grade_6_9">Junior Secondary (Grades 6–9)</option>
                    <option value="grade_10_11">Senior Secondary / O-Level (Grades 10–11)</option>
                    <option value="grade_12_13">Collegiate / A-Level (Grades 12–13)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Examination Default Maximum Marks</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="1000"
                    className="form-input"
                    value={examModalMaxScore}
                    onChange={(e) => setExamModalMaxScore(Number(e.target.value))}
                    placeholder="100"
                    required
                  />
                  <small style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.75rem' }}>
                    Default authoritative maximum score for all assessment schedules in this examination (e.g. 50, 100, 200).
                  </small>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={examModalStartDate}
                      onChange={(e) => setExamModalStartDate(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">End Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={examModalEndDate}
                      onChange={(e) => setExamModalEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowExamModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={savingExam} className="btn btn-primary">
                  {savingExam ? 'Creating...' : 'Create Examination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

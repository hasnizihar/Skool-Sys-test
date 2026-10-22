// Centralized API client with auth token management

const TOKEN_KEY = 'skoolsys_token';
const USER_KEY = 'skoolsys_user';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthSession(token: string, user: any) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getCurrentUser(): any | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export class HttpError extends Error {
  status: number;
  code: string;
  problemDetails?: any;

  constructor(status: number, message: string, code: string = 'UNKNOWN_ERROR', problemDetails?: any) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.problemDetails = problemDetails;
  }
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  if (response.status === 401) {
    clearAuthSession();
    window.dispatchEvent(new CustomEvent('auth-invalid'));
    throw new HttpError(401, 'Session expired or unauthorized. Please log in again.', 'UNAUTHENTICATED_SESSION');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.detail || data.error || `Request failed with status ${response.status}`;
    const errorCode = data.code || `HTTP_${response.status}`;
    throw new HttpError(response.status, errorMsg, errorCode, data);
  }

  return data as T;
}

// API methods
export const api = {
  // Auth
  login: (username: string, password: string) =>
    apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),
  getMe: () => apiFetch('/api/auth/me'),

  // Academic
  getYears: () => apiFetch('/api/academic/years'),
  getAcademicYears: () => apiFetch('/api/academic/years'),
  getGrades: () => apiFetch('/api/academic/grades'),
  getClasses: (grade?: number) =>
    apiFetch(`/api/academic/classes${grade ? `?grade=${grade}` : ''}`),
  getClassRoster: (classId: number) =>
    apiFetch(`/api/academic/classes/${classId}/roster`),
  getSubjects: (gradeLevel?: string) =>
    apiFetch(`/api/academic/subjects${gradeLevel ? `?gradeLevel=${gradeLevel}` : ''}`),
  getClassSubjects: (classId: number) =>
    apiFetch(`/api/academic/classes/${classId}/subjects`),
  getExaminations: (params: { academic_year_id?: number; term?: number; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.academic_year_id) query.set('academic_year_id', String(params.academic_year_id));
    if (params.term) query.set('term', String(params.term));
    if (params.status) query.set('status', params.status);
    const qStr = query.toString();
    return apiFetch(`/api/academic/examinations${qStr ? `?${qStr}` : ''}`);
  },
  createExamination: (payload: any) =>
    apiFetch('/api/academic/examinations', { method: 'POST', body: JSON.stringify(payload) }),
  updateExamination: (id: number, payload: any) =>
    apiFetch(`/api/academic/examinations/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  createClass: (payload: any) =>
    apiFetch('/api/academic/classes', { method: 'POST', body: JSON.stringify(payload) }),
  createSubject: (payload: any) =>
    apiFetch('/api/academic/subjects', { method: 'POST', body: JSON.stringify(payload) }),

  // Examination Schedules
  getExaminationSchedules: (examId: number) =>
    apiFetch(`/api/marks/examinations/${examId}/schedules`),
  addExaminationSchedule: (examId: number, payload: { classId: number; subjectId: number; isRequired?: boolean }) =>
    apiFetch(`/api/marks/examinations/${examId}/schedules`, { method: 'POST', body: JSON.stringify(payload) }),
  approveExaminationSchedules: (examId: number, payload: { scheduleIds?: number[] } = {}) =>
    apiFetch(`/api/marks/examinations/${examId}/schedules/approve`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteExaminationSchedule: (examId: number, scheduleId: number) =>
    apiFetch(`/api/marks/examinations/${examId}/schedules/${scheduleId}`, { method: 'DELETE' }),

  // Marks Sheets & Workflow
  getMarksSheets: (params: { examinationId?: number; classId?: number; subjectId?: number; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.examinationId) query.set('examinationId', String(params.examinationId));
    if (params.classId) query.set('classId', String(params.classId));
    if (params.subjectId) query.set('subjectId', String(params.subjectId));
    if (params.status) query.set('status', params.status);
    const qStr = query.toString();
    return apiFetch(`/api/marks/sheets${qStr ? `?${qStr}` : ''}`);
  },
  getMarksSheetDetails: (sheetId: number) =>
    apiFetch(`/api/marks/sheets/${sheetId}`),
  getMarksSheet: (examId: number, classId: number, subjectId: number) =>
    apiFetch(`/api/marks/sheet?examId=${examId}&classId=${classId}&subjectId=${subjectId}`),
  saveMarksSheet: (payload: any) =>
    apiFetch('/api/marks/sheet', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  saveDraftMarks: (
    arg1: number | { sheetId: number; baseRevision: number; marks: any[] },
    arg2?: { baseRevision: number; marks: any[] }
  ) => {
    let sheetId: number;
    let payload: { baseRevision: number; marks: any[] };
    if (typeof arg1 === 'number') {
      sheetId = arg1;
      payload = arg2!;
    } else {
      sheetId = arg1.sheetId;
      payload = { baseRevision: arg1.baseRevision, marks: arg1.marks };
    }
    return apiFetch(`/api/marks/sheets/${sheetId}/save-draft`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  getPublishedMark: (examinationId: number, studentId: number, subjectId: number) =>
    apiFetch(`/api/marks/published-mark?examinationId=${examinationId}&studentId=${studentId}&subjectId=${subjectId}`),
  submitMarksSheet: (sheetId: number, payload: { baseRevision: number; notes?: string }) =>
    apiFetch(`/api/marks/sheets/${sheetId}/submit`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  reviewMarksSheet: (sheetId: number, payload: { baseRevision: number; decision: 'endorse' | 'return'; remarks: string }) =>
    apiFetch(`/api/marks/sheets/${sheetId}/review`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  approveMarksSheet: (sheetId: number, payload: { baseRevision: number; remarks?: string }) =>
    apiFetch(`/api/marks/sheets/${sheetId}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getMarksSheetHistory: (sheetId: number) =>
    apiFetch(`/api/marks/sheets/${sheetId}/history`),
  getMarksSheetRevisionSnapshot: (sheetId: number, revision: number) =>
    apiFetch(`/api/marks/sheets/${sheetId}/revisions/${revision}`),

  // Assessment Policies
  getPolicies: (params: { academic_year_id?: number; grade_band?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.academic_year_id) query.set('academic_year_id', String(params.academic_year_id));
    if (params.grade_band) query.set('grade_band', params.grade_band);
    const qStr = query.toString();
    return apiFetch(`/api/marks/policies${qStr ? `?${qStr}` : ''}`);
  },
  getPolicy: (id: number) =>
    apiFetch(`/api/marks/policies/${id}`),
  createPolicy: (payload: any) =>
    apiFetch('/api/marks/policies', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  approvePolicy: (id: number) =>
    apiFetch(`/api/marks/policies/${id}/approve`, {
      method: 'POST'
    }),

  // Publication & Publication Readiness
  getPublicationReadiness: (examId: number) =>
    apiFetch(`/api/marks/examinations/${examId}/publication-readiness`),
  publishExamination: (examId: number, payload: { policyProfileId?: number; expectedStatus?: string } = {}) =>
    apiFetch(`/api/marks/examinations/${examId}/publish`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getPublicationSummary: (examId: number) =>
    apiFetch(`/api/marks/examinations/${examId}/publication-summary`),

  // Post-Publication Mark Corrections
  getCorrections: (params: { examinationId?: number; sheetId?: number; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.examinationId) query.set('examinationId', String(params.examinationId));
    if (params.sheetId) query.set('sheetId', String(params.sheetId));
    if (params.status) query.set('status', params.status);
    const qStr = query.toString();
    return apiFetch(`/api/marks/corrections${qStr ? `?${qStr}` : ''}`);
  },
  getCorrection: (id: number) =>
    apiFetch(`/api/marks/corrections/${id}`),
  requestCorrection: (payload: any) =>
    apiFetch('/api/marks/corrections', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  reviewCorrection: (id: number, payload: { decision: 'approve' | 'reject'; reviewComments?: string }) =>
    apiFetch(`/api/marks/corrections/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Report Card
  getStudentReportCard: (studentId: number, examId: number) =>
    apiFetch(`/api/marks/student-report/${studentId}/${examId}`),
  getStudents: (params: { q?: string; grade?: number; classId?: number; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.grade) query.set('grade', String(params.grade));
    if (params.classId) query.set('classId', String(params.classId));
    if (params.status) query.set('status', params.status);
    return apiFetch(`/api/students?${query.toString()}`);
  },
  getStudent: (id: number) => apiFetch(`/api/students/${id}`),
  createStudent: (payload: any) =>
    apiFetch('/api/students', { method: 'POST', body: JSON.stringify(payload) }),
  updateStudent: (id: number, payload: any) =>
    apiFetch(`/api/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  importCsv: (rows: any[], execute: boolean = false) =>
    apiFetch('/api/students/import-csv', {
      method: 'POST',
      body: JSON.stringify({ rows, execute })
    }),

  // Attendance
  getAttendanceSession: (classId: number, date: string) =>
    apiFetch(`/api/attendance/session?classId=${classId}&date=${date}`),
  saveAttendanceSession: (payload: any) =>
    apiFetch('/api/attendance/session', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getDailyAttendanceReport: (date?: string) =>
    apiFetch(`/api/attendance/reports/daily${date ? `?date=${date}` : ''}`),
  getMonthlyAttendanceReport: (classId: number, year: number, month: number) =>
    apiFetch(`/api/attendance/reports/monthly?classId=${classId}&year=${year}&month=${month}`),

  // Admin
  getUsers: () => apiFetch('/api/admin/users'),
  createUser: (payload: any) =>
    apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id: number, payload: any) =>
    apiFetch(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  getAssignments: () => apiFetch('/api/admin/assignments'),
  createAssignment: (payload: any) =>
    apiFetch('/api/admin/assignments', { method: 'POST', body: JSON.stringify(payload) }),
  deleteAssignment: (id: number) =>
    apiFetch(`/api/admin/assignments/${id}`, { method: 'DELETE' }),
  getAuditLogs: (action?: string) =>
    apiFetch(`/api/admin/audit-logs${action ? `?action=${action}` : ''}`),
  getBackup: () => apiFetch('/api/admin/backup'),
  restoreBackup: (backupData: any) =>
    apiFetch('/api/admin/restore', { method: 'POST', body: JSON.stringify({ backupData }) }),
  resetSeed: () =>
    apiFetch('/api/admin/reset-seed', { method: 'POST' })
};

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
  updateMyProfile: (payload: { full_name: string; email: string }) =>
    apiFetch('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiFetch('/api/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  getHealth: () => apiFetch('/api/health'),

  // Academic
  getYears: () => apiFetch('/api/academic/years'),
  getAcademicYears: () => apiFetch('/api/academic/years'),
  getAcademicTerms: (academicYearId?: number) =>
    apiFetch(`/api/academic/terms${academicYearId ? `?academic_year_id=${academicYearId}` : ''}`),
  getGrades: () => apiFetch('/api/academic/grades'),
  getClasses: (grade?: number) =>
    apiFetch(`/api/academic/classes${grade ? `?grade=${grade}` : ''}`),
  getClassRoster: (classId: number) =>
    apiFetch(`/api/academic/classes/${classId}/roster`),
  getSubjects: (gradeLevel?: string) =>
    apiFetch(`/api/academic/subjects${gradeLevel ? `?gradeLevel=${gradeLevel}` : ''}`),
  getClassSubjects: (classId: number) =>
    apiFetch(`/api/academic/classes/${classId}/subjects`),
  createClass: (payload: any) =>
    apiFetch('/api/academic/classes', { method: 'POST', body: JSON.stringify(payload) }),
  updateClass: (id: number, payload: any) =>
    apiFetch(`/api/academic/classes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteClass: (id: number) =>
    apiFetch(`/api/academic/classes/${id}`, { method: 'DELETE' }),
  createSubject: (payload: any) =>
    apiFetch('/api/academic/subjects', { method: 'POST', body: JSON.stringify(payload) }),
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

  // Sections & School Structure (Phase 1)
  getSections: () => apiFetch('/api/academic/sections'),
  getSection: (id: number) => apiFetch(`/api/academic/sections/${id}`),
  createSection: (payload: any) =>
    apiFetch('/api/academic/sections', { method: 'POST', body: JSON.stringify(payload) }),
  updateSection: (id: number, payload: any) =>
    apiFetch(`/api/academic/sections/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteSection: (id: number) =>
    apiFetch(`/api/academic/sections/${id}`, { method: 'DELETE' }),
  assignSectionClasses: (id: number, classIds: number[]) =>
    apiFetch(`/api/academic/sections/${id}/classes`, { method: 'POST', body: JSON.stringify({ classIds }) }),
  unassignSectionClass: (id: number, classId: number) =>
    apiFetch(`/api/academic/sections/${id}/classes/${classId}`, { method: 'DELETE' }),
  assignSectionHead: (id: number, userId: number, academicYearId?: number) =>
    apiFetch(`/api/academic/sections/${id}/heads`, { method: 'POST', body: JSON.stringify({ userId, academicYearId }) }),
  removeSectionHead: (id: number, userId: number) =>
    apiFetch(`/api/academic/sections/${id}/heads/${userId}`, { method: 'DELETE' }),
  getClassTeachers: (classId: number) =>
    apiFetch(`/api/academic/classes/${classId}/teachers`),
  assignClassTeacher: (classId: number, teacherId: number) =>
    apiFetch(`/api/academic/classes/${classId}/teachers`, { method: 'POST', body: JSON.stringify({ teacherId }) }),
  removeClassTeacher: (classId: number, teacherId: number) =>
    apiFetch(`/api/academic/classes/${classId}/teachers/${teacherId}`, { method: 'DELETE' }),

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
    apiFetch('/api/admin/reset-seed', { method: 'POST' }),

  // Classroom Status Tracking (Phase 2)
  getClassroomStatusContext: (date?: string, period?: number) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (period) params.set('period', String(period));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/classroom-status/context${qs}`);
  },
  getClassroomStatusOverview: (date?: string, period?: number) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (period) params.set('period', String(period));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/classroom-status/overview${qs}`);
  },
  recordClassroomStatus: (payload: {
    classId: number;
    status: 'teaching' | 'not_teaching' | 'other_activity';
    periodNumber?: number;
    schoolDate?: string;
    activityNote?: string;
    expectedRevision?: number;
  }) => apiFetch('/api/classroom-status/record', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getTimetableConfig: () => apiFetch('/api/classroom-status/timetable'),
  updateTimetableConfig: (payload: {
    periods: Array<{ periodNumber: number; name?: string; startTime: string; endTime: string }>;
    breakAfterPeriod?: number;
    breakStartTime?: string;
    breakEndTime?: string;
    breakName?: string;
    schoolDays?: number[];
  }) => apiFetch('/api/classroom-status/timetable', {
    method: 'PUT',
    body: JSON.stringify(payload)
  }),
  getClassroomStatusHistory: (classId: number, date?: string, period?: number) => {
    const params = new URLSearchParams({ classId: String(classId) });
    if (date) params.set('date', date);
    if (period) params.set('period', String(period));
    return apiFetch(`/api/classroom-status/history?${params.toString()}`);
  },

  // Staff & Faculty Directory (Metadata Management)
  getTeachers: (params: { search?: string; role?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.role) query.set('role', params.role);
    if (params.status) query.set('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiFetch(`/api/admin/staff${qs}`);
  },
  getStaff: (params: { search?: string; role?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.role) query.set('role', params.role);
    if (params.status) query.set('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiFetch(`/api/admin/staff${qs}`);
  },
  getTeacher: (id: number) => apiFetch(`/api/admin/staff/${id}`),
  getStaffMember: (id: number) => apiFetch(`/api/admin/staff/${id}`),
  createTeacher: (payload: any) =>
    apiFetch('/api/admin/staff', { method: 'POST', body: JSON.stringify(payload) }),
  createStaff: (payload: any) =>
    apiFetch('/api/admin/staff', { method: 'POST', body: JSON.stringify(payload) }),
  updateTeacher: (id: number, payload: any) =>
    apiFetch(`/api/admin/staff/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateStaff: (id: number, payload: any) =>
    apiFetch(`/api/admin/staff/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTeacher: (id: number) =>
    apiFetch(`/api/admin/staff/${id}`, { method: 'DELETE' }),
  deleteStaff: (id: number) =>
    apiFetch(`/api/admin/staff/${id}`, { method: 'DELETE' }),
  getTeacherTemplateUrl: () => '/api/admin/staff/template',
  getStaffTemplateUrl: () => '/api/admin/staff/template',
  importTeachersCsv: (payload: { csvData: string; mode?: 'preview' | 'commit' }) =>
    apiFetch('/api/admin/staff/import', { method: 'POST', body: JSON.stringify(payload) }),
  importStaffCsv: (payload: { csvData: string; mode?: 'preview' | 'commit' }) =>
    apiFetch('/api/admin/staff/import', { method: 'POST', body: JSON.stringify(payload) }),

  // Dashboard Scoped Summary (Phase 4)
  getDashboardSummary: (date?: string) =>
    apiFetch(`/api/academic/dashboard-summary${date ? `?date=${date}` : ''}`),

  // Institutional Settings & Daily Timetables
  getSchoolProfile: () => apiFetch('/api/admin/settings/school-profile'),
  updateSchoolProfile: (payload: any) =>
    apiFetch('/api/admin/settings/school-profile', { method: 'PUT', body: JSON.stringify(payload) }),
  getTimetableSchedules: (day?: string) =>
    apiFetch(`/api/admin/settings/timetable-schedules${day ? `?day=${day}` : ''}`),
  updateTimetableSchedule: (day: string, payload: { periods: any[] }) =>
    apiFetch(`/api/admin/settings/timetable-schedules/${day}`, { method: 'PUT', body: JSON.stringify(payload) }),
  copyTimetableSchedule: (payload: { sourceDay: string; targetDays: string[] }) =>
    apiFetch('/api/admin/settings/timetable-schedules/copy', { method: 'POST', body: JSON.stringify(payload) }),
  resetTimetableSchedule: (payload?: { day?: string }) =>
    apiFetch('/api/admin/settings/timetable-schedules/reset-default', { method: 'POST', body: JSON.stringify(payload || {}) })
};

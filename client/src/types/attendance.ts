/**
 * SkoolSys 2.0 — PR-004 Attendance Types & API Contracts (V2)
 */

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecordDTO {
  student_id: number;
  status: AttendanceStatus;
  remarks?: string | null;
}

export interface AttendanceSessionV2Request {
  classId: number;
  date: string; // YYYY-MM-DD (Asia/Colombo civil calendar)
  mode: 'draft' | 'submitted';
  baseRevision: number;
  clientMutationId: string; // RFC 4122 UUID v4
  rosterFingerprint: string;
  notes?: string | null;
  records: AttendanceRecordDTO[];
}

export interface AttendanceSessionV2SuccessResponse {
  success: true;
  status: 'applied' | 'replayed';
  sessionId: number;
  revision: number;
  classId: number;
  date: string;
  mode: 'draft' | 'submitted';
  recordsCount: number;
  clientMutationId: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance: string;
  invalidParams?: Array<{ name: string; reason: string }>;
  serverRevision?: number;
  baseRevision?: number;
  conflictingSession?: any;
}

export interface AttendanceSyncItemV2 {
  clientMutationId: string;
  classId: number;
  className?: string;
  date: string;
  mode: 'draft' | 'submitted';
  baseRevision: number;
  rosterFingerprint: string;
  notes?: string | null;
  records: AttendanceRecordDTO[];
  timestamp: string;
}

export interface AttendanceSyncBatchResponse {
  batchId: string;
  processedCount: number;
  results: Array<{
    clientMutationId: string;
    classId: number;
    date: string;
    status: 'applied' | 'replayed' | 'conflicted' | 'rejected';
    revision?: number;
    code?: string;
    error?: string;
    serverRevision?: number;
    syncedAt?: string;
  }>;
}

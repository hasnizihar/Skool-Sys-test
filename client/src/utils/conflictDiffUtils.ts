import type { OfflineAttendanceMutation } from '../api/offlineQueue';

export interface ConflictStudentDiff {
  student_id: number;
  admission_no: string;
  calling_name: string;
  localStatus: string;
  localRemarks: string;
  serverStatus: string;
  serverRemarks: string;
  isDiff: boolean;
  chosen: 'local' | 'server';
}

/**
 * Pure calculation helper for student-by-student attendance conflict reconciliation.
 * Accurately compares each enrolled student's local draft state against fresh server records.
 * Supports preserving prior user selections during repeated collision refreshes.
 */
export function buildStudentDiffList(
  students: any[],
  pendingMutation: OfflineAttendanceMutation,
  serverRecords: any[],
  attendanceMap: Record<number, { status: string; remarks: string }>,
  priorChoices?: Map<number, 'local' | 'server'>
): ConflictStudentDiff[] {
  const serverMap = new Map<number, any>();
  serverRecords.forEach((r: any) => serverMap.set(r.student_id, r));

  return students.map((st) => {
    const localRec = pendingMutation.records.find((r) => r.student_id === st.student_id);
    const serverRec = serverMap.get(st.student_id);

    const localStatus = localRec?.status || attendanceMap[st.student_id]?.status || 'unmarked';
    const localRemarks = localRec?.remarks || attendanceMap[st.student_id]?.remarks || '';
    const serverStatus = serverRec?.status || 'unmarked';
    const serverRemarks = serverRec?.remarks || '';

    const isDiff = localStatus !== serverStatus || localRemarks !== serverRemarks;
    const priorChoice = priorChoices?.get(st.student_id);
    const chosen = isDiff ? (priorChoice || 'server') : 'local';

    return {
      student_id: st.student_id,
      admission_no: st.admission_no,
      calling_name: st.calling_name || st.full_name,
      localStatus,
      localRemarks,
      serverStatus,
      serverRemarks,
      isDiff,
      chosen
    };
  });
}

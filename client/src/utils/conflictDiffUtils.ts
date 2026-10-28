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
  serverChangedAgain?: boolean;
}

/**
 * Pure calculation helper for student-by-student attendance conflict reconciliation.
 * Accurately compares each enrolled student's local draft state against fresh server records.
 * 
 * Repeated 409 Safety Rules:
 * - If priorServerRecords is supplied (e.g. on second consecutive collision), detects whether
 *   the server record for each student changed between collision 1 and collision 2.
 * - When a student's server record has mutated again, any prior choice (e.g. 'local') is
 *   strictly INVALIDATED, resetting chosen = 'server' and flagging serverChangedAgain = true.
 * - Deliberate teacher choices are preserved only for students whose server records remained unchanged.
 */
export function buildStudentDiffList(
  students: any[],
  pendingMutation: OfflineAttendanceMutation,
  serverRecords: any[],
  attendanceMap: Record<number, { status: string; remarks: string }>,
  priorChoices?: Map<number, 'local' | 'server'>,
  priorServerRecords?: any[]
): ConflictStudentDiff[] {
  const serverMap = new Map<number, any>();
  serverRecords.forEach((r: any) => serverMap.set(r.student_id, r));

  const prevServerMap = new Map<number, any>();
  if (priorServerRecords && priorServerRecords.length > 0) {
    priorServerRecords.forEach((r: any) => prevServerMap.set(r.student_id, r));
  }

  return students.map((st) => {
    const localRec = pendingMutation.records.find((r) => r.student_id === st.student_id);
    const serverRec = serverMap.get(st.student_id);

    const localStatus = localRec?.status || attendanceMap[st.student_id]?.status || 'unmarked';
    const localRemarks = localRec?.remarks || attendanceMap[st.student_id]?.remarks || '';
    const serverStatus = serverRec?.status || 'unmarked';
    const serverRemarks = serverRec?.remarks || '';

    const isDiff = localStatus !== serverStatus || localRemarks !== serverRemarks;

    // Detect if server record changed again between collision 1 and collision 2
    let serverChangedAgain = false;
    if (prevServerMap.size > 0 && prevServerMap.has(st.student_id)) {
      const prevRec = prevServerMap.get(st.student_id);
      const prevStatus = prevRec?.status || 'unmarked';
      const prevRemarks = prevRec?.remarks || '';
      if (prevStatus !== serverStatus || prevRemarks !== serverRemarks) {
        serverChangedAgain = true;
      }
    }

    const priorChoice = priorChoices?.get(st.student_id);

    // If server mutated again, invalidate prior choice and reset to 'server'
    // Otherwise preserve deliberate priorChoice if discrepancy exists
    let chosen: 'local' | 'server';
    if (!isDiff) {
      chosen = 'local';
    } else if (serverChangedAgain) {
      chosen = 'server'; // Stale choice invalidated
    } else if (priorChoice) {
      chosen = priorChoice;
    } else {
      chosen = 'server';
    }

    return {
      student_id: st.student_id,
      admission_no: st.admission_no,
      calling_name: st.calling_name || st.full_name,
      localStatus,
      localRemarks,
      serverStatus,
      serverRemarks,
      isDiff,
      chosen,
      serverChangedAgain
    };
  });
}

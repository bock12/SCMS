import { supabase } from './supabaseClient';

export interface AttendanceSession {
  id: string;
  branch_id: string;
  event_id?: string | null;
  title: string;
  session_date: string;
  session_type: string;
  created_by_profile_id?: string | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  member_id: string;
  attendance_status: 'present' | 'absent' | 'late' | 'excused';
  check_in_time?: string | null;
  recorded_by_profile_id?: string | null;
  notes?: string | null;
}

export async function getAttendanceSessions(branchId?: string): Promise<AttendanceSession[]> {
  let query = supabase.from('attendance_sessions').select('*').order('session_date', { ascending: false });
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data as AttendanceSession[] : [];
}

export async function getAttendanceRecords(sessionId: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase.from('attendance_records').select('*').eq('session_id', sessionId);
  if (error) throw error;
  return Array.isArray(data) ? data as AttendanceRecord[] : [];
}

export async function createAttendanceSession(input: {
  branchId: string;
  title: string;
  sessionDate?: string;
  sessionType?: string;
}): Promise<AttendanceSession> {
  const { data, error } = await supabase.rpc('manage_attendance', {
    p_action: 'create_session',
    p_branch_id: input.branchId,
    p_title: input.title,
    p_session_date: input.sessionDate || null,
    p_session_type: input.sessionType || 'service'
  });
  if (error) throw error;
  if (!data) throw new Error('The attendance session was not created.');
  return data as AttendanceSession;
}

export async function recordMemberAttendance(input: {
  sessionId: string;
  memberId: string;
  status: AttendanceRecord['attendance_status'];
  notes?: string;
}): Promise<AttendanceRecord> {
  const { data, error } = await supabase.rpc('manage_attendance', {
    p_action: 'record',
    p_session_id: input.sessionId,
    p_member_id: input.memberId,
    p_attendance_status: input.status,
    p_notes: input.notes || null
  });
  if (error) throw error;
  if (!data) throw new Error('The attendance record was not saved.');
  return data as AttendanceRecord;
}

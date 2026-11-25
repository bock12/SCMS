import { supabase } from './supabaseClient';
import { resolveMemberDataClient } from './supabaseIntegration';

export interface LeadershipAppointment {
  id: string;
  profile_id: string;
  scope_type: 'branch' | 'district';
  branch_id: string | null;
  district_id: string | null;
  title: string;
  responsibilities: string | null;
  status: 'active' | 'ended';
  appointed_by_profile_id: string | null;
  appointed_at: string;
  effective_from: string;
  effective_to: string | null;
  ended_by_profile_id: string | null;
  ended_at: string | null;
  end_reason: string | null;
}

export async function getLeadershipAppointments(): Promise<LeadershipAppointment[]> {
  const client = resolveMemberDataClient(supabase);
  const result = await client
    .from('leadership_appointments')
    .select('*')
    .order('appointed_at', { ascending: false });

  if (result.error) throw new Error(result.error.message || 'Unable to load leadership appointments.');
  return (result.data || []) as LeadershipAppointment[];
}

export async function createLeadershipAppointment(input: {
  profile_id: string;
  scope_type: 'branch' | 'district';
  branch_id?: string | null;
  district_id?: string | null;
  title: string;
  responsibilities?: string | null;
  effective_from?: string;
}): Promise<LeadershipAppointment> {
  const client = resolveMemberDataClient(supabase);
  const result = await client.rpc('create_leadership_appointment', {
    p_profile_id: input.profile_id,
    p_scope_type: input.scope_type,
    p_branch_id: input.scope_type === 'branch' ? input.branch_id ?? null : null,
    p_district_id: input.scope_type === 'district' ? input.district_id ?? null : null,
    p_title: input.title,
    p_responsibilities: input.responsibilities ?? null,
    p_effective_from: input.effective_from ?? new Date().toISOString().slice(0, 10)
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to create leadership appointment.');
  }
  return result.data as LeadershipAppointment;
}

export async function endLeadershipAppointment(
  appointmentId: string,
  reason?: string | null
): Promise<LeadershipAppointment> {
  const client = resolveMemberDataClient(supabase);
  const result = await client.rpc('end_leadership_appointment', {
    p_appointment_id: appointmentId,
    p_end_reason: reason ?? null
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to end leadership appointment.');
  }
  return result.data as LeadershipAppointment;
}

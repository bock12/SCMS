import { supabase } from './supabaseClient';

export interface SystemRole {
  id: string;
  name: string;
  description?: string | null;
  is_system: boolean;
  is_active: boolean;
}

export interface ProfileRoleAssignment {
  id: string;
  profile_id: string;
  role_id: string;
  scope_type: 'church' | 'district' | 'branch';
  branch_id: string | null;
  district_id: string | null;
  assigned_by_profile_id: string | null;
  assigned_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export async function getProfileRoleData(): Promise<{
  roles: SystemRole[];
  assignments: ProfileRoleAssignment[];
}> {
  const [rolesResult, assignmentsResult] = await Promise.all([
    supabase.from('roles').select('*').eq('is_active', true).order('name', { ascending: true }),
    supabase.from('profile_role_assignments').select('*').order('assigned_at', { ascending: false })
  ]);

  if (rolesResult.error) throw new Error(rolesResult.error.message || 'Unable to load system roles.');
  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message || 'Unable to load member role assignments.');

  return {
    roles: (rolesResult.data || []) as SystemRole[],
    assignments: (assignmentsResult.data || []) as ProfileRoleAssignment[]
  };
}

export async function assignProfileRole(input: {
  profile_id: string;
  role_id: string;
  scope_type?: 'church' | 'district' | 'branch';
  branch_id?: string | null;
  district_id?: string | null;
}): Promise<ProfileRoleAssignment> {
  const result = await supabase.rpc('assign_profile_role', {
    p_profile_id: input.profile_id,
    p_role_id: input.role_id,
    p_scope_type: input.scope_type || 'church',
    p_branch_id: input.branch_id ?? null,
    p_district_id: input.district_id ?? null
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to save member role assignment.');
  }

  return result.data as ProfileRoleAssignment;
}

export async function deactivateProfileRoleAssignment(assignmentId: string): Promise<void> {
  const result = await supabase.rpc('deactivate_profile_role_assignment', {
    p_assignment_id: assignmentId
  });

  if (result.error) throw new Error(result.error.message || 'Unable to remove member role assignment.');
}

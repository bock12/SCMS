import { supabase } from './supabaseClient';
import { resolveDataClient } from './supabaseIntegration';

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
  const client = resolveDataClient(supabase);
  const [rolesResult, assignmentsResult] = await Promise.all([
    client.from('roles').select('*').eq('is_active', true).order('name', { ascending: true }),
    client.from('profile_role_assignments').select('*').order('assigned_at', { ascending: false })
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
  const client = resolveDataClient(supabase);
  const result = await client.rpc('assign_profile_role', {
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
  const client = resolveDataClient(supabase);
  const result = await client.rpc('deactivate_profile_role_assignment', {
    p_assignment_id: assignmentId
  });

  if (result.error) throw new Error(result.error.message || 'Unable to remove member role assignment.');
}

export async function reactivateProfileRoleAssignment(assignmentId: string): Promise<ProfileRoleAssignment> {
  const client = resolveDataClient(supabase);
  const result = await client.rpc('reactivate_profile_role_assignment', {
    p_assignment_id: assignmentId
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to reactivate member role assignment.');
  }

  return result.data as ProfileRoleAssignment;
}

export async function updateProfileRoleAssignment(input: {
  id: string;
  role_id: string;
  scope_type: 'church' | 'district' | 'branch';
  branch_id?: string | null;
  district_id?: string | null;
}): Promise<ProfileRoleAssignment> {
  const client = resolveDataClient(supabase);
  const result = await client.rpc('update_profile_role_assignment', {
    p_assignment_id: input.id,
    p_role_id: input.role_id,
    p_scope_type: input.scope_type,
    p_branch_id: input.scope_type === 'branch' ? (input.branch_id ?? null) : null,
    p_district_id: input.scope_type === 'district' ? (input.district_id ?? null) : null
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to update member role assignment.');
  }

  return result.data as ProfileRoleAssignment;
}

export async function deleteProfileRoleAssignment(assignmentId: string): Promise<void> {
  const client = resolveDataClient(supabase);
  const result = await client.rpc('delete_profile_role_assignment', {
    p_assignment_id: assignmentId
  });

  if (result.error) {
    throw new Error(result.error.message || 'Unable to remove member role assignment.');
  }
}

export interface RolePermissionLink {
  role_id: string;
  permission_id: string;
}

export async function updateRolePermissions(
  roleId: string,
  permissionIds: string[]
): Promise<RolePermissionLink[]> {
  const client = resolveDataClient(supabase);
  const result = await client.rpc('update_role_permissions', {
    p_role_id: roleId,
    p_permission_ids: permissionIds
  });

  if (result.error) {
    throw new Error(result.error.message || 'Unable to update role permissions.');
  }

  return (result.data || []) as RolePermissionLink[];
}

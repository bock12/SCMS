import { supabase } from './supabaseClient';
import { resolveDataClient } from './supabaseIntegration';

export const PERMISSION_LABELS: Record<string, string> = {
  view_members: 'View members',
  manage_members: 'Manage members',
  manage_member_transfers: 'Manage member transfers',
  manage_roles: 'Manage roles',
  manage_branches: 'Manage branches',
  manage_ministries: 'Manage ministries',
  view_leader_console: 'Access ministry leader workspace',
  view_finances: 'View finances',
  manage_finances: 'Manage finances',
  approve_finances: 'Approve finances',
  submit_requisitions: 'Submit funding requisitions',
  approve_requisitions: 'Approve funding requisitions',
  post_journals: 'Post journals',
  manage_events: 'Manage events',
  submit_event_budgets: 'Submit event budgets and view own submissions',
  manage_attendance: 'Manage attendance',
  manage_welfare: 'Manage welfare',
  view_audit_logs: 'View audit logs',
  manage_resources: 'Manage resources',
  manage_surveys: 'Manage surveys',
  manage_streams: 'Manage live streams',
  view_events: 'View events',
  view_attendance: 'View attendance',
  view_resources: 'View resources',
  view_streams: 'View live streams',
  register_for_events: 'Register for events',
  send_stream_chat: 'Send stream chat messages'
};

export const ADMIN_CONSOLE_PERMISSION_KEYS = [
  'manage_roles',
  'manage_members',
  'manage_events',
  'manage_ministries',
  'manage_resources',
  'manage_surveys',
  'manage_streams',
  'manage_branches',
  'view_audit_logs'
] as const;

export const ADMIN_DASHBOARD_PERMISSION_KEYS = [
  ...ADMIN_CONSOLE_PERMISSION_KEYS,
  'manage_finances',
  'manage_member_transfers'
] as const;

export const HIGH_PRIVILEGE_GOVERNANCE_ROLES = [
  'super_admin',
  'admin',
  'district_admin'
] as const;

export const BRANCH_LEADERSHIP_ROLE_NAMES = [
  'pastor',
  'finance_officer',
  'leader',
  'worker'
] as const;

export function canManageTargetRoleByScope(
  actorHasChurchManageRoles: boolean,
  targetRoleName: string
): boolean {
  if ((HIGH_PRIVILEGE_GOVERNANCE_ROLES as readonly string[]).includes(targetRoleName)) {
    return actorHasChurchManageRoles;
  }
  return true;
}

export const LEADER_CONSOLE_PERMISSION_KEYS = [
  'view_leader_console',
  'manage_ministries',
  'manage_events'
] as const;

export const FINANCE_CONSOLE_PERMISSION_KEYS = [
  'view_finances',
  'manage_finances'
] as const;

export const MEMBER_ADMIN_PERMISSION_KEYS = [
  'manage_members',
  'manage_roles'
] as const;

export const DEPARTMENT_OVERSIGHT_PERMISSION_KEYS = [
  'manage_roles',
  'manage_members',
  'manage_ministries'
] as const;

export const FINANCE_APPROVAL_PERMISSION_KEYS = [
  'manage_finances',
  'approve_finances'
] as const;

export const FINANCE_ACTION_PERMISSION_KEYS = [
  'manage_finances',
  'approve_finances',
  'post_journals'
] as const;

export type AuthorizationScopeType = 'church' | 'district' | 'branch';

export interface AuthorizationRole {
  id: string;
  is_active: boolean;
}

export interface AuthorizationPermission {
  id: string;
  key: string;
}

export interface AuthorizationRolePermission {
  role_id: string;
  permission_id: string;
}

export interface AuthorizationRoleAssignment {
  id: string;
  profile_id: string;
  role_id: string;
  scope_type: AuthorizationScopeType;
  branch_id: string | null;
  district_id: string | null;
  assigned_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface AuthorizationBranch {
  id: string;
  district_id: string | null;
}

export interface PermissionResolutionInput {
  profileId: string;
  branchId?: string | null;
  now?: Date;
  assignments: AuthorizationRoleAssignment[];
  roles: AuthorizationRole[];
  permissions: AuthorizationPermission[];
  rolePermissions: AuthorizationRolePermission[];
  branches: AuthorizationBranch[];
}

export interface PermissionResolution {
  permissions: string[];
  assignmentIds: string[];
}

/**
 * Resolve permissions only from active database role assignments.
 * Legacy profiles.primary_role and browser-stored role definitions are deliberately
 * not consulted. A branch context is required for branch/district scoped grants.
 */
export function resolveEffectivePermissions(input: PermissionResolutionInput): PermissionResolution {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const activeRoleIds = new Set(
    input.roles.filter(role => role.is_active).map(role => role.id)
  );
  const activeAssignments = input.assignments.filter(assignment => {
    if (!assignment.is_active || assignment.profile_id !== input.profileId) return false;
    if (!activeRoleIds.has(assignment.role_id)) return false;

    const assignedAt = Date.parse(assignment.assigned_at);
    if (!Number.isFinite(assignedAt) || assignedAt > nowMs) return false;

    if (assignment.expires_at) {
      const expiresAt = Date.parse(assignment.expires_at);
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return false;
    }

    if (assignment.scope_type === 'church') {
      return assignment.branch_id === null && assignment.district_id === null;
    }

    if (!input.branchId) return false;
    const branch = input.branches.find(item => item.id === input.branchId);
    if (!branch) return false;

    if (assignment.scope_type === 'branch') {
      return assignment.branch_id === input.branchId && assignment.district_id === null;
    }

    return assignment.scope_type === 'district'
      && assignment.district_id !== null
      && assignment.district_id === branch.district_id
      && assignment.branch_id === null;
  });

  const permittedRoleIds = new Set(activeAssignments.map(item => item.role_id));
  const permittedPermissionIds = new Set(
    input.rolePermissions
      .filter(link => permittedRoleIds.has(link.role_id))
      .map(link => link.permission_id)
  );
  const permissionKeys = [...new Set(
    input.permissions
      .filter(permission => permittedPermissionIds.has(permission.id))
      .map(permission => permission.key)
  )].sort();

  return {
    permissions: permissionKeys,
    assignmentIds: activeAssignments.map(item => item.id)
  };
}

/**
 * Load the authoritative authorization rows for one signed-in church profile.
 * This is a UI convenience only: PostgreSQL RLS and permission-checked functions
 * remain the security boundary for all protected reads and mutations.
 */
export async function loadPermissionResolution(
  profileId: string,
  branchId?: string | null,
  now: Date = new Date()
): Promise<PermissionResolution> {
  if (!profileId) return { permissions: [], assignmentIds: [] };

  const client = resolveDataClient(supabase);
  const [assignmentsResult, rolesResult, permissionsResult, linksResult, branchesResult] = await Promise.all([
    client.from('profile_role_assignments').select('*').eq('profile_id', profileId).eq('is_active', true),
    client.from('roles').select('id,is_active').eq('is_active', true),
    client.from('permissions').select('id,key'),
    client.from('role_permissions').select('role_id,permission_id'),
    branchId
      ? client.from('church_branches').select('id,district_id').eq('id', branchId)
      : Promise.resolve({ data: [], error: null })
  ]);

  const errors = [
    assignmentsResult.error,
    rolesResult.error,
    permissionsResult.error,
    linksResult.error,
    branchesResult.error
  ].filter(Boolean);
  if (errors.length) {
    throw new Error(errors.map(error => error?.message || 'Authorization data could not be loaded.').join('; '));
  }

  return resolveEffectivePermissions({
    profileId,
    branchId,
    now,
    assignments: (assignmentsResult.data || []) as AuthorizationRoleAssignment[],
    roles: (rolesResult.data || []) as AuthorizationRole[],
    permissions: (permissionsResult.data || []) as AuthorizationPermission[],
    rolePermissions: (linksResult.data || []) as AuthorizationRolePermission[],
    branches: (branchesResult.data || []) as AuthorizationBranch[]
  });
}

export function hasEffectivePermission(
  resolution: PermissionResolution | null | undefined,
  permissionKey: string
): boolean {
  return Boolean(resolution?.permissions.includes(permissionKey));
}

export function hasAnyEffectivePermission(
  resolution: PermissionResolution | null | undefined,
  permissionKeys: readonly string[]
): boolean {
  return permissionKeys.some(permissionKey => hasEffectivePermission(resolution, permissionKey));
}

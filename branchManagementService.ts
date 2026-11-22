import { supabase } from './supabaseClient';
import type { ChurchBranch, District, Profile } from './types';
import {
  getProfileRoleData,
  type ProfileRoleAssignment,
  type SystemRole
} from './profileRoleAssignmentService';

export interface BranchGovernanceScope {
  canCreateDistrict: boolean;
  hasChurchBranchAccess: boolean;
  hasChurchRoleAccess: boolean;
  manageableDistrictIds: string[];
  manageableBranchIds: string[];
  assignableBranchIds: string[];
}

export interface DistrictBranchMemberSummary {
  branch: ChurchBranch;
  memberCount: number;
  activeMemberCount: number;
  leaderCount: number;
  hasPastor: boolean;
}

export interface DistrictPortalSummary {
  district: District;
  totalBranches: number;
  hqBranch: ChurchBranch | null;
  totalMembers: number;
  activeMembers: number;
  totalBranchLeaders: number;
  branchesWithPastor: number;
  overseerNames: string[];
  branchSummaries: DistrictBranchMemberSummary[];
}

export async function getBranchGovernanceData(): Promise<{
  districts: District[];
  branches: ChurchBranch[];
  roles: SystemRole[];
  assignments: ProfileRoleAssignment[];
  profiles: Profile[];
}> {
  const [districtsResult, branchesResult, roleData, profilesResult] = await Promise.all([
    supabase.from('districts').select('*').order('name', { ascending: true }),
    supabase.from('church_branches').select('*').order('name', { ascending: true }),
    getProfileRoleData(),
    supabase.from('profiles').select('*').order('first_name', { ascending: true })
  ]);

  if (districtsResult.error) throw new Error(districtsResult.error.message || 'Unable to load districts.');
  if (branchesResult.error) throw new Error(branchesResult.error.message || 'Unable to load church branches.');
  if (profilesResult.error) throw new Error(profilesResult.error.message || 'Unable to load member directory.');

  return {
    districts: (districtsResult.data || []) as District[],
    branches: (branchesResult.data || []) as ChurchBranch[],
    roles: roleData.roles,
    assignments: roleData.assignments,
    profiles: (profilesResult.data || []) as Profile[]
  };
}

export async function createDistrict(input: {
  name: string;
  region: string;
  country: string;
  description?: string;
}): Promise<District> {
  const result = await supabase.rpc('create_district', {
    p_name: input.name,
    p_region: input.region,
    p_country: input.country,
    p_description: input.description ?? null
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to create district.');
  }

  return result.data as District;
}

export async function updateDistrict(input: {
  id: string;
  name: string;
  region: string;
  country: string;
  description?: string;
  hq_branch_id?: string | null;
  update_hq?: boolean;
}): Promise<District> {
  const result = await supabase.rpc('update_district', {
    p_district_id: input.id,
    p_name: input.name,
    p_region: input.region,
    p_country: input.country,
    p_description: input.description ?? null,
    p_hq_branch_id: input.hq_branch_id ?? null,
    p_update_hq: Boolean(input.update_hq)
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to customize district.');
  }

  return result.data as District;
}

export async function deleteDistrict(districtId: string): Promise<boolean> {
  const result = await supabase.rpc('delete_district', {
    p_district_id: districtId
  });

  if (result.error) {
    throw new Error(result.error.message || 'Unable to delete district.');
  }

  return Boolean(result.data);
}

export async function createChurchBranch(input: {
  district_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  is_main_branch?: boolean;
}): Promise<ChurchBranch> {
  const result = await supabase.rpc('create_church_branch', {
    p_district_id: input.district_id,
    p_name: input.name,
    p_address: input.address,
    p_city: input.city,
    p_state: input.state,
    p_is_main_branch: Boolean(input.is_main_branch)
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to create church branch.');
  }

  return result.data as ChurchBranch;
}

export async function updateChurchBranch(input: {
  id: string;
  district_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  is_main_branch?: boolean;
}): Promise<ChurchBranch> {
  const result = await supabase.rpc('update_church_branch', {
    p_branch_id: input.id,
    p_district_id: input.district_id,
    p_name: input.name,
    p_address: input.address,
    p_city: input.city,
    p_state: input.state,
    p_is_main_branch: Boolean(input.is_main_branch)
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to update church branch.');
  }

  return result.data as ChurchBranch;
}

export async function resolveActorBranchGovernanceScope(
  actorProfileId: string | undefined,
  districts: District[],
  branches: ChurchBranch[]
): Promise<BranchGovernanceScope> {
  if (!actorProfileId) {
    return {
      canCreateDistrict: false,
      hasChurchBranchAccess: false,
      hasChurchRoleAccess: false,
      manageableDistrictIds: [],
      manageableBranchIds: [],
      assignableBranchIds: []
    };
  }

  const [assignmentsRes, rolesRes, permissionsRes, rolePermRes] = await Promise.all([
    supabase.from('profile_role_assignments').select('*').eq('profile_id', actorProfileId).eq('is_active', true),
    supabase.from('roles').select('id,is_active').eq('is_active', true),
    supabase.from('permissions').select('id,key'),
    supabase.from('role_permissions').select('role_id,permission_id')
  ]);

  const nowMs = Date.now();
  const activeRoleIds = new Set(
    ((rolesRes.data || []) as Array<{ id: string; is_active: boolean }>)
      .filter(r => r.is_active)
      .map(r => r.id)
  );
  const permIdByKey = new Map(
    ((permissionsRes.data || []) as Array<{ id: string; key: string }>).map(p => [p.key, p.id])
  );
  const manageBranchesPermId = permIdByKey.get('manage_branches');
  const manageRolesPermId = permIdByKey.get('manage_roles');
  const rolePermLinks = (rolePermRes.data || []) as Array<{ role_id: string; permission_id: string }>;

  const roleHasPerm = (roleId: string, permId: string | undefined) =>
    Boolean(permId && rolePermLinks.some(link => link.role_id === roleId && link.permission_id === permId));

  const activeAssignments = ((assignmentsRes.data || []) as ProfileRoleAssignment[]).filter(a => {
    if (!a.is_active || !activeRoleIds.has(a.role_id)) return false;
    const assignedAt = Date.parse(a.assigned_at);
    if (!Number.isFinite(assignedAt) || assignedAt > nowMs) return false;
    if (a.expires_at) {
      const expiresAt = Date.parse(a.expires_at);
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return false;
    }
    return true;
  });

  const branchAssignments = activeAssignments.filter(a => roleHasPerm(a.role_id, manageBranchesPermId));
  const roleAssignments = activeAssignments.filter(a => roleHasPerm(a.role_id, manageRolesPermId));

  const hasChurchBranchAccess = branchAssignments.some(a => a.scope_type === 'church');
  const hasChurchRoleAccess = roleAssignments.some(a => a.scope_type === 'church');

  const manageableDistrictIds = hasChurchBranchAccess
    ? districts.map(d => d.id)
    : Array.from(
        new Set(
          branchAssignments
            .filter(a => a.scope_type === 'district' && a.district_id)
            .map(a => a.district_id as string)
        )
      );

  const manageableBranchIds = hasChurchBranchAccess
    ? branches.map(b => b.id)
    : Array.from(
        new Set(
          branches
            .filter(b =>
              branchAssignments.some(
                a =>
                  (a.scope_type === 'district' && a.district_id === b.district_id) ||
                  (a.scope_type === 'branch' && a.branch_id === b.id)
              )
            )
            .map(b => b.id)
        )
      );

  const assignableBranchIds = hasChurchRoleAccess
    ? branches.map(b => b.id)
    : Array.from(
        new Set(
          branches
            .filter(b =>
              roleAssignments.some(
                a =>
                  (a.scope_type === 'district' && a.district_id === b.district_id) ||
                  (a.scope_type === 'branch' && a.branch_id === b.id)
              )
            )
            .map(b => b.id)
        )
      );

  return {
    canCreateDistrict: hasChurchBranchAccess,
    hasChurchBranchAccess,
    hasChurchRoleAccess,
    manageableDistrictIds,
    manageableBranchIds,
    assignableBranchIds
  };
}

export function buildDistrictPortalSummaries(params: {
  districts: District[];
  branches: ChurchBranch[];
  profiles: Profile[];
  assignments: ProfileRoleAssignment[];
  roles: SystemRole[];
  nowMs?: number;
}): DistrictPortalSummary[] {
  const { districts, branches, profiles, assignments, roles, nowMs = Date.now() } = params;

  const roleById = new Map<string, SystemRole>();
  roles.forEach(role => roleById.set(role.id, role));

  const profileById = new Map<string, Profile>();
  profiles.forEach(p => profileById.set(p.id, p));

  const activeAssignments = assignments.filter(a => {
    if (!a.is_active) return false;
    const role = roleById.get(a.role_id);
    if (role && !role.is_active) return false;
    const assignedAt = Date.parse(a.assigned_at);
    if (!Number.isFinite(assignedAt) || assignedAt > nowMs) return false;
    if (a.expires_at) {
      const expiresAt = Date.parse(a.expires_at);
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return false;
    }
    return true;
  });

  const memberCountByBranch = new Map<string, { total: number; active: number }>();
  profiles.forEach(member => {
    if (!member.branch_id) return;
    if (member.membership_status === 'archived') return;
    const current = memberCountByBranch.get(member.branch_id) || { total: 0, active: 0 };
    current.total += 1;
    if (!member.membership_status || member.membership_status === 'active') {
      current.active += 1;
    }
    memberCountByBranch.set(member.branch_id, current);
  });

  const branchAssignmentsMap = new Map<string, ProfileRoleAssignment[]>();
  const districtOverseersMap = new Map<string, ProfileRoleAssignment[]>();

  activeAssignments.forEach(a => {
    if (a.scope_type === 'branch' && a.branch_id) {
      const list = branchAssignmentsMap.get(a.branch_id) || [];
      list.push(a);
      branchAssignmentsMap.set(a.branch_id, list);
    } else if (a.scope_type === 'district' && a.district_id) {
      const list = districtOverseersMap.get(a.district_id) || [];
      list.push(a);
      districtOverseersMap.set(a.district_id, list);
    }
  });

  return districts.map(district => {
    const districtBranches = branches
      .filter(b => b.district_id === district.id)
      .sort((a, b) => {
        const hqDiff = Number(Boolean(b.is_main_branch)) - Number(Boolean(a.is_main_branch));
        if (hqDiff !== 0) return hqDiff;
        return a.name.localeCompare(b.name);
      });

    const hqBranch = districtBranches.find(b => b.is_main_branch) || null;
    let totalMembers = 0;
    let activeMembers = 0;
    let totalBranchLeaders = 0;
    let branchesWithPastor = 0;

    const branchSummaries: DistrictBranchMemberSummary[] = districtBranches.map(branch => {
      const counts = memberCountByBranch.get(branch.id) || { total: 0, active: 0 };
      const branchLeaders = branchAssignmentsMap.get(branch.id) || [];
      const hasPastor = branchLeaders.some(l => roleById.get(l.role_id)?.name === 'pastor');

      totalMembers += counts.total;
      activeMembers += counts.active;
      totalBranchLeaders += branchLeaders.length;
      if (hasPastor) branchesWithPastor += 1;

      return {
        branch,
        memberCount: counts.total,
        activeMemberCount: counts.active,
        leaderCount: branchLeaders.length,
        hasPastor
      };
    });

    const overseers = districtOverseersMap.get(district.id) || [];
    const overseerNames = overseers.map(o => {
      const person = profileById.get(o.profile_id);
      return person ? `${person.first_name} ${person.last_name}` : o.profile_id;
    });

    return {
      district,
      totalBranches: districtBranches.length,
      hqBranch,
      totalMembers,
      activeMembers,
      totalBranchLeaders,
      branchesWithPastor,
      overseerNames,
      branchSummaries
    };
  });
}

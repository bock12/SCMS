import { supabase } from './supabaseClient';
import { resolveDataClient } from './supabaseIntegration';
import type { ChurchBranch, District, Profile } from './types';
import {
  getLeadershipAppointments,
  type LeadershipAppointment
} from './leadershipAppointmentService';
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

export interface BranchMemberCountSnapshot {
  total: number;
  active: number;
}

export function normalizeChurchBranch(row: any): ChurchBranch {
  const resolvedState = row.state ?? row.state_or_region ?? '';
  return {
    ...row,
    district_id: row.district_id ?? null,
    state: resolvedState,
    state_or_region: row.state_or_region ?? resolvedState,
    is_main_branch: Boolean(row.is_main_branch)
  } as ChurchBranch;
}

export async function getBranchGovernanceData(): Promise<{
  districts: District[];
  branches: ChurchBranch[];
  roles: SystemRole[];
  assignments: ProfileRoleAssignment[];
  profiles: Profile[];
  branchMemberCounts: Record<string, BranchMemberCountSnapshot>;
  leadershipAppointments: LeadershipAppointment[];
}> {
  const client = resolveDataClient(supabase);
  const [districtsResult, branchesResult, roleData, profilesResult, summaryResult, leadershipAppointments] = await Promise.all([
    client.from('districts').select('*').order('name', { ascending: true }),
    client.from('church_branches').select('*').order('name', { ascending: true }),
    getProfileRoleData(),
    client.from('profiles').select('*').order('first_name', { ascending: true }),
    client.rpc('get_branch_governance_summaries'),
    getLeadershipAppointments()
  ]);

  if (districtsResult.error) throw new Error(districtsResult.error.message || 'Unable to load districts.');
  if (branchesResult.error) throw new Error(branchesResult.error.message || 'Unable to load church branches.');
  if (profilesResult.error) throw new Error(profilesResult.error.message || 'Unable to load member directory.');

  const branchMemberCounts: Record<string, BranchMemberCountSnapshot> = {};
  if (!summaryResult.error && Array.isArray(summaryResult.data)) {
    for (const row of summaryResult.data as any[]) {
      if (row?.branch_id) {
        branchMemberCounts[row.branch_id] = {
          total: Number(row.total_members ?? 0),
          active: Number(row.active_members ?? 0)
        };
      }
    }
  }

  return {
    districts: (districtsResult.data || []) as District[],
    branches: ((branchesResult.data || []) as any[]).map(normalizeChurchBranch),
    roles: roleData.roles,
    assignments: roleData.assignments,
    profiles: (profilesResult.data || []) as Profile[],
    branchMemberCounts,
    leadershipAppointments
  };
}

export async function createDistrict(input: {
  name: string;
  region: string;
  country: string;
  description?: string;
}): Promise<District> {
  const client = resolveDataClient(supabase);
  const result = await client.rpc('create_district', {
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
  const client = resolveDataClient(supabase);
  const result = await client.rpc('update_district', {
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
  const client = resolveDataClient(supabase);
  const result = await client.rpc('delete_district', {
    p_district_id: districtId
  });

  if (result.error) {
    throw new Error(result.error.message || 'Unable to delete district.');
  }

  return Boolean(result.data);
}

export async function createChurchBranch(input: {
  district_id: string | null;
  name: string;
  address: string;
  city: string;
  state: string;
  is_main_branch?: boolean;
}): Promise<ChurchBranch> {
  const client = resolveDataClient(supabase);
  const result = await client.rpc('create_church_branch', {
    p_district_id: input.district_id || null,
    p_name: input.name,
    p_address: input.address,
    p_city: input.city,
    p_state: input.state,
    p_is_main_branch: Boolean(input.is_main_branch)
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to create church branch.');
  }

  return normalizeChurchBranch(result.data);
}

export async function updateChurchBranch(input: {
  id: string;
  district_id: string | null;
  name: string;
  address: string;
  city: string;
  state: string;
  is_main_branch?: boolean;
}): Promise<ChurchBranch> {
  const client = resolveDataClient(supabase);
  const result = await client.rpc('update_church_branch', {
    p_branch_id: input.id,
    p_district_id: input.district_id || null,
    p_name: input.name,
    p_address: input.address,
    p_city: input.city,
    p_state: input.state,
    p_is_main_branch: Boolean(input.is_main_branch)
  });

  if (result.error || !result.data) {
    throw new Error(result.error?.message || 'Unable to update church branch.');
  }

  return normalizeChurchBranch(result.data);
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

  const client = resolveDataClient(supabase);
  const [assignmentsRes, rolesRes, permissionsRes, rolePermRes] = await Promise.all([
    client.from('profile_role_assignments').select('*').eq('profile_id', actorProfileId).eq('is_active', true),
    client.from('roles').select('id,is_active').eq('is_active', true),
    client.from('permissions').select('id,key'),
    client.from('role_permissions').select('role_id,permission_id')
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
                  (a.scope_type === 'district' && Boolean(b.district_id) && a.district_id === b.district_id) ||
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
                  (a.scope_type === 'district' && Boolean(b.district_id) && a.district_id === b.district_id) ||
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

const isCurrentLeadershipAppointment = (appointment: LeadershipAppointment, today: string) =>
  appointment.status === 'active' &&
  appointment.effective_from <= today &&
  (!appointment.effective_to || appointment.effective_to >= today);

export function buildDistrictPortalSummaries(params: {
  districts: District[];
  branches: ChurchBranch[];
  profiles: Profile[];
  leadershipAppointments: LeadershipAppointment[];
  branchMemberCounts?: Record<string, BranchMemberCountSnapshot>;
  today?: string;
}): DistrictPortalSummary[] {
  const {
    districts,
    branches,
    profiles,
    leadershipAppointments,
    branchMemberCounts,
    today = new Date().toISOString().slice(0, 10)
  } = params;

  const profileById = new Map<string, Profile>(profiles.map(profile => [profile.id, profile]));
  const activeAppointments = leadershipAppointments.filter(appointment =>
    isCurrentLeadershipAppointment(appointment, today)
  );

  const memberCountByBranch = new Map<string, { total: number; active: number }>();
  if (branchMemberCounts && Object.keys(branchMemberCounts).length > 0) {
    Object.entries(branchMemberCounts).forEach(([branchId, counts]) => {
      memberCountByBranch.set(branchId, { total: counts.total, active: counts.active });
    });
  } else {
    profiles.forEach(member => {
      if (!member.branch_id || member.membership_status === 'archived') return;
      const current = memberCountByBranch.get(member.branch_id) || { total: 0, active: 0 };
      current.total += 1;
      if (!member.membership_status || member.membership_status === 'active') current.active += 1;
      memberCountByBranch.set(member.branch_id, current);
    });
  }

  const branchAppointments = new Map<string, LeadershipAppointment[]>();
  const districtAppointments = new Map<string, LeadershipAppointment[]>();
  activeAppointments.forEach(appointment => {
    if (appointment.scope_type === 'branch' && appointment.branch_id) {
      const list = branchAppointments.get(appointment.branch_id) || [];
      list.push(appointment);
      branchAppointments.set(appointment.branch_id, list);
    } else if (appointment.scope_type === 'district' && appointment.district_id) {
      const list = districtAppointments.get(appointment.district_id) || [];
      list.push(appointment);
      districtAppointments.set(appointment.district_id, list);
    }
  });

  return districts.map(district => {
    const districtBranches = branches
      .filter(branch => branch.district_id === district.id)
      .sort((a, b) => {
        const hqDiff = Number(Boolean(b.is_main_branch)) - Number(Boolean(a.is_main_branch));
        return hqDiff || a.name.localeCompare(b.name);
      });
    const hqBranch = districtBranches.find(branch => branch.is_main_branch) || null;
    let totalMembers = 0;
    let activeMembers = 0;
    let totalBranchLeaders = 0;
    let branchesWithPastor = 0;

    const branchSummaries: DistrictBranchMemberSummary[] = districtBranches.map(branch => {
      const counts = memberCountByBranch.get(branch.id) || { total: 0, active: 0 };
      const leaders = branchAppointments.get(branch.id) || [];
      const hasPastor = leaders.some(leader => leader.title.toLowerCase().includes('pastor'));
      totalMembers += counts.total;
      activeMembers += counts.active;
      totalBranchLeaders += leaders.length;
      if (hasPastor) branchesWithPastor += 1;
      return {
        branch,
        memberCount: counts.total,
        activeMemberCount: counts.active,
        leaderCount: leaders.length,
        hasPastor
      };
    });

    const overseerNames = (districtAppointments.get(district.id) || []).map(appointment => {
      const member = profileById.get(appointment.profile_id);
      return member ? `${member.first_name} ${member.last_name} (${appointment.title})` : appointment.title;
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

export function buildStandaloneBranchSummaries(params: {
  branches: ChurchBranch[];
  profiles: Profile[];
  leadershipAppointments: LeadershipAppointment[];
  branchMemberCounts?: Record<string, BranchMemberCountSnapshot>;
  today?: string;
}): DistrictBranchMemberSummary[] {
  const {
    branches,
    profiles,
    leadershipAppointments,
    branchMemberCounts,
    today = new Date().toISOString().slice(0, 10)
  } = params;

  const activeAppointments = leadershipAppointments.filter(appointment =>
    appointment.scope_type === 'branch' &&
    appointment.branch_id &&
    isCurrentLeadershipAppointment(appointment, today)
  );

  const countByBranch = new Map<string, { total: number; active: number }>();
  if (branchMemberCounts && Object.keys(branchMemberCounts).length > 0) {
    Object.entries(branchMemberCounts).forEach(([branchId, counts]) => {
      countByBranch.set(branchId, { total: counts.total, active: counts.active });
    });
  } else {
    profiles.forEach(member => {
      if (!member.branch_id || member.membership_status === 'archived') return;
      const current = countByBranch.get(member.branch_id) || { total: 0, active: 0 };
      current.total += 1;
      if (!member.membership_status || member.membership_status === 'active') current.active += 1;
      countByBranch.set(member.branch_id, current);
    });
  }

  return branches
    .filter(branch => !branch.district_id)
    .sort((a, b) => {
      const mainDiff = Number(Boolean(b.is_main_branch)) - Number(Boolean(a.is_main_branch));
      return mainDiff || a.name.localeCompare(b.name);
    })
    .map(branch => {
      const counts = countByBranch.get(branch.id) || { total: 0, active: 0 };
      const leaders = activeAppointments.filter(appointment => appointment.branch_id === branch.id);
      return {
        branch,
        memberCount: counts.total,
        activeMemberCount: counts.active,
        leaderCount: leaders.length,
        hasPastor: leaders.some(leader => leader.title.toLowerCase().includes('pastor'))
      };
    });
}

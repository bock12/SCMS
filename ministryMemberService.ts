import type { Ministry, MinistryMember, Profile } from './types';
import { supabase } from './supabaseClient';
import { supabaseDataClient, supabaseIntegrationEnabled, supabaseAuthEnabled } from './supabaseIntegration';
import { mapCanonicalProfileToProfile } from './memberProfileMapper';

export interface MinistryRosterEntry extends MinistryMember {
  member: Profile;
}

export interface MemberMinistryAffiliation {
  assignment_id: string;
  ministry_id: string;
  ministry_name: string;
  ministry_type?: 'social_fellowship' | 'service_department';
  role_title: string;
  duty: string;
  status: MinistryMember['status'];
  joined_at: string;
  is_leader: boolean;
}

export interface ResolvedMinistryMembership {
  membership: MinistryMember;
  isLeader: boolean;
  source: 'roster' | 'leader' | 'department_assignment' | 'local_roster';
}

function getMinistryReadClient(): any {
  return supabaseIntegrationEnabled && supabaseAuthEnabled && supabaseDataClient
    ? supabaseDataClient
    : supabase;
}

function requireMinistryWriteClient(): any {
  if (!supabaseIntegrationEnabled) {
    return supabase;
  }
  if (!supabaseAuthEnabled) {
    throw new Error('Ministry roster changes require a real Supabase Auth session.');
  }
  if (!supabaseDataClient) {
    throw new Error('Supabase is enabled but its URL or publishable key is missing.');
  }
  return supabaseDataClient;
}

function normalizeMinistryRow(row: any): Ministry {
  const entityType = row.entity_type as Ministry['entity_type'];
  const derivedType: Ministry['type'] =
    row.type || (entityType === 'fellowship' ? 'social_fellowship' : 'service_department');
  return {
    ...row,
    leader_name: row.leader_name || 'Ministry Leadership',
    meeting_time: row.meeting_time || 'Scheduled Gathering',
    member_count: typeof row.member_count === 'number' ? row.member_count : 0,
    category: row.category || 'Ministry',
    type: derivedType,
    roles_and_responsibilities: Array.isArray(row.roles_and_responsibilities)
      ? row.roles_and_responsibilities
      : []
  };
}

export function isMemberEligibleForRoster(member: Profile | null | undefined): boolean {
  if (!member) return false;
  return (member.membership_status || 'active') === 'active' && (member as any).record_status !== 'archived';
}

export function isMemberCompatibleWithMinistryBranch(
  member: Pick<Profile, 'branch_id'> | null | undefined,
  ministry: Pick<Ministry, 'branch_id'> | null | undefined
): boolean {
  if (!member) return false;
  if (!ministry?.branch_id) return true;
  return member.branch_id === ministry.branch_id;
}

export async function getMinistriesList(): Promise<Ministry[]> {
  const client = getMinistryReadClient();
  const { data, error } = await client.from('ministries').select('*');
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .filter((m: any) => !m.status || m.status === 'active')
    .map(normalizeMinistryRow);
}

const LEADERSHIP_TITLES =
  /^(pastor|pst\.?|rev\.?|reverend|minister|min\.?|bishop|elder|deacon|deaconess|dcns\.?|apostle|evangelist|prophet|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i;

export function normalizePersonName(name?: string | null): string {
  let clean = (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  while (LEADERSHIP_TITLES.test(clean)) {
    clean = clean.replace(LEADERSHIP_TITLES, '').trim();
  }
  return clean;
}

export function doesDepartmentMatchMinistry(
  deptName: string | undefined | null,
  ministry: Pick<Ministry, 'name' | 'category'>
): boolean {
  const clean = (deptName || '').trim().toLowerCase();
  const minName = (ministry.name || '').trim().toLowerCase();
  const minCat = (ministry.category || '').trim().toLowerCase();
  if (!clean || !minName) return false;
  if (clean === minName) return true;

  const rules: { deptPattern: RegExp; minPattern: RegExp }[] = [
    { deptPattern: /\b(media|livestream|production|it ministry)\b/i, minPattern: /\b(media|livestream|production)\b/i },
    { deptPattern: /\b(choir|voices|worship)\b/i, minPattern: /\b(choir|voices|worship)\b/i },
    { deptPattern: /\b(youth|teen)\b/i, minPattern: /\b(youth|teen)\b/i },
    { deptPattern: /\b(children|faithkids|kids)\b/i, minPattern: /\b(children|faithkids|kids)\b/i },
    { deptPattern: /\b(usher|hospitality|protocol)\b/i, minPattern: /\b(usher|hospitality)\b/i },
    { deptPattern: /\b(prayer|intercessory)\b/i, minPattern: /\b(prayer|intercessory)\b/i },
    { deptPattern: /\bwomen('?s)?\b/i, minPattern: /\bwomen('?s)?\b/i },
    { deptPattern: /\bmen('?s|hood)?\b|\bbrotherhood\b/i, minPattern: /\bmen('?s)?\b|\bhonor\b/i },
    { deptPattern: /\b(outreach|evangelism|missions)\b/i, minPattern: /\b(outreach|evangelism|missions)\b/i }
  ];

  return rules.some(
    rule => rule.deptPattern.test(clean) && (rule.minPattern.test(minName) || rule.minPattern.test(minCat))
  );
}

export function isMinistryLeaderForProfile(
  ministry: Pick<Ministry, 'leader_id' | 'leader_name'>,
  profile: Pick<Profile, 'id' | 'auth_user_id' | 'first_name' | 'last_name'> | null | undefined
): boolean {
  if (!profile) return false;
  if (ministry.leader_id) {
    if (ministry.leader_id === profile.id) return true;
    if (profile.auth_user_id && ministry.leader_id === profile.auth_user_id) return true;
  }

  const profileName = normalizePersonName(`${profile.first_name || ''} ${profile.last_name || ''}`);
  const leaderName = normalizePersonName(ministry.leader_name);
  return Boolean(profileName && leaderName && profileName === leaderName);
}

function findProfileInSavedRosters(
  ministry: Pick<Ministry, 'id' | 'name' | 'category'>,
  profile: Profile
): { role?: string; duty?: string; joined_at?: string } | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;

  const fullName = normalizePersonName(`${profile.first_name || ''} ${profile.last_name || ''}`);
  const emailLower = (profile.email || '').trim().toLowerCase();

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith('fc_roster_') && !key.startsWith('fc_dept_roster_')) continue;

      const deptLabel = key.replace(/^fc_dept_roster_/, '').replace(/^fc_roster_/, '');
      if (!doesDepartmentMatchMinistry(deptLabel, ministry)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) continue;

      const matched = list.find((entry: any) => {
        if (!entry) return false;
        if (entry.member_id && (entry.member_id === profile.id || entry.member_id === profile.auth_user_id)) {
          return true;
        }
        if (entry.id && (entry.id === profile.id || entry.id === profile.auth_user_id)) {
          return true;
        }
        if (emailLower && entry.email && String(entry.email).trim().toLowerCase() === emailLower) {
          return true;
        }
        if (fullName && entry.name && normalizePersonName(String(entry.name)) === fullName) {
          return true;
        }
        return false;
      });

      if (matched) {
        return {
          role: matched.role || matched.role_title,
          duty: matched.duty,
          joined_at: matched.joined_date || matched.joined_at
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveMemberMinistryStatus(params: {
  ministry: Ministry;
  profile: Profile | null | undefined;
  activeMemberships: MinistryMember[];
}): ResolvedMinistryMembership | null {
  const { ministry, profile, activeMemberships } = params;
  if (!profile) return null;

  const isLeader = isMinistryLeaderForProfile(ministry, profile);

  // 1. Canonical persisted `ministry_members` record
  const persisted = activeMemberships.find(
    m =>
      m.status !== 'inactive' &&
      m.ministry_id === ministry.id &&
      (m.member_id === profile.id || (Boolean(profile.auth_user_id) && m.member_id === profile.auth_user_id))
  );
  if (persisted) {
    return {
      membership: persisted,
      isLeader: isLeader || /leader|director|head/i.test(persisted.role_title || ''),
      source: 'roster'
    };
  }

  // 2. Appointed department / ministry leader (leader_id or leader_name)
  if (isLeader) {
    return {
      membership: {
        id: `leader-${ministry.id}-${profile.id}`,
        ministry_id: ministry.id,
        member_id: profile.id,
        role_title: 'Department Leader',
        duty: 'Department Leadership & Team Oversight',
        status: 'active',
        joined_at: profile.membership_date || profile.created_at || new Date().toISOString()
      },
      isLeader: true,
      source: 'leader'
    };
  }

  // 3. Profile department assignment (assigned_department / department_name)
  const assignedDept = profile.assigned_department || profile.department_name;
  if (assignedDept && doesDepartmentMatchMinistry(assignedDept, ministry)) {
    const roleIsLeader = ['leader', 'worker', 'pastor', 'super_admin', 'admin', 'district_admin'].includes(
      profile.primary_role
    );
    return {
      membership: {
        id: `dept-${ministry.id}-${profile.id}`,
        ministry_id: ministry.id,
        member_id: profile.id,
        role_title: roleIsLeader ? 'Department Worker / Leader' : 'Assigned Team Member',
        duty: `Serving in ${ministry.name}`,
        status: 'active',
        joined_at: profile.membership_date || profile.created_at || new Date().toISOString()
      },
      isLeader: false,
      source: 'department_assignment'
    };
  }

  // 4. Local leader/admin saved roster cache (`fc_roster_*` / `fc_dept_roster_*`)
  const localEntry = findProfileInSavedRosters(ministry, profile);
  if (localEntry) {
    return {
      membership: {
        id: `local-${ministry.id}-${profile.id}`,
        ministry_id: ministry.id,
        member_id: profile.id,
        role_title: localEntry.role || 'Team Member',
        duty: localEntry.duty || `${ministry.name} Service Duty`,
        status: 'active',
        joined_at: localEntry.joined_at || profile.created_at || new Date().toISOString()
      },
      isLeader: /leader|director|head/i.test(localEntry.role || ''),
      source: 'local_roster'
    };
  }

  return null;
}

/**
 * Ministry participation references canonical `profiles` (`member_id` -> `profiles.id`),
 * supporting all church members whether or not they have portal login access.
 */
export async function getMinistryRoster(ministryId: string): Promise<MinistryRosterEntry[]> {
  const client = getMinistryReadClient();
  const [{ data: assignments, error: assignmentError }, { data: profiles, error: profileError }] = await Promise.all([
    client.from('ministry_members').select('*').eq('ministry_id', ministryId).order('joined_at', { ascending: true }),
    client
      .from('profiles')
      .select('id,auth_user_id,branch_id,first_name,last_name,email,phone,gender,avatar_url,portal_access_status,membership_status,membership_date,created_at,is_baptized,baptism_date,baptized_by_profile_id,baptized_by_name_snapshot,date_of_birth,marital_status,marriage_date')
  ]);

  if (assignmentError) throw assignmentError;
  if (profileError) throw profileError;

  const memberById = new Map<string, Profile>(
    (profiles || []).map((person: any) => {
      const normalized = 'portal_access_status' in person
        ? mapCanonicalProfileToProfile(person)
        : (person as Profile);
      return [normalized.id, normalized];
    })
  );

  return (assignments || [])
    .map((assignment: MinistryMember) => {
      const member = memberById.get(assignment.member_id);
      return member ? { ...assignment, member } : null;
    })
    .filter((entry): entry is MinistryRosterEntry => entry !== null);
}

/**
 * Resolves all active ministry & department affiliations (including leadership roles)
 * keyed by canonical `profiles.id` for display in the Member Directory.
 */
export async function getMemberMinistryAffiliations(): Promise<Record<string, MemberMinistryAffiliation[]>> {
  const client = getMinistryReadClient();
  const [{ data: minRows, error: minErr }, { data: membershipRows, error: memErr }] = await Promise.all([
    client.from('ministries').select('*'),
    client.from('ministry_members').select('*').order('joined_at', { ascending: true })
  ]);

  if (minErr) throw minErr;
  if (memErr) throw memErr;

  const ministries = (Array.isArray(minRows) ? minRows : [])
    .filter((m: any) => !m.status || m.status === 'active')
    .map(normalizeMinistryRow);
  const ministryById = new Map<string, Ministry>(ministries.map(m => [m.id, m]));
  const result: Record<string, MemberMinistryAffiliation[]> = {};

  for (const row of (Array.isArray(membershipRows) ? membershipRows : []) as MinistryMember[]) {
    if (row.status === 'inactive') continue;
    const ministry = ministryById.get(row.ministry_id);
    if (!ministry) continue;
    const isLeader =
      ministry.leader_id === row.member_id ||
      /\b(leader|director|head)\b/i.test(row.role_title || '');
    const entry: MemberMinistryAffiliation = {
      assignment_id: row.id,
      ministry_id: ministry.id,
      ministry_name: ministry.name,
      ministry_type: ministry.type,
      role_title: row.role_title || 'Team Member',
      duty: row.duty || '',
      status: row.status,
      joined_at: row.joined_at,
      is_leader: isLeader
    };
    result[row.member_id] = [...(result[row.member_id] || []), entry];
  }

  for (const ministry of ministries) {
    if (!ministry.leader_id) continue;
    const existingList = result[ministry.leader_id] || [];
    if (!existingList.some(a => a.ministry_id === ministry.id)) {
      result[ministry.leader_id] = [
        ...existingList,
        {
          assignment_id: `leader-${ministry.id}-${ministry.leader_id}`,
          ministry_id: ministry.id,
          ministry_name: ministry.name,
          ministry_type: ministry.type,
          role_title: 'Department Leader',
          duty: `${ministry.name} Leadership & Oversight`,
          status: 'active',
          joined_at: new Date().toISOString().slice(0, 10),
          is_leader: true
        }
      ];
    }
  }

  return result;
}

export async function addMinistryMember(
  assignment: Omit<MinistryMember, 'id' | 'joined_at'> & { joined_at?: string }
): Promise<MinistryMember> {
  const client = requireMinistryWriteClient();
  const { data, error } = await client.rpc('manage_ministry_member', {
    p_action: 'add',
    p_ministry_id: assignment.ministry_id,
    p_member_id: assignment.member_id,
    p_role_title: assignment.role_title,
    p_duty: assignment.duty,
    p_status: assignment.status,
    p_joined_at: (assignment.joined_at || new Date().toISOString()).slice(0, 10)
  });

  if (error) throw error;
  if (!data) throw new Error('The ministry appointment was not saved.');
  return data as MinistryMember;
}

export async function updateMinistryMember(
  assignmentId: string,
  changes: Partial<Pick<MinistryMember, 'role_title' | 'duty' | 'status'>>
): Promise<void> {
  const client = requireMinistryWriteClient();
  const { error } = await client.rpc('manage_ministry_member', {
    p_action: 'update',
    p_assignment_id: assignmentId,
    p_role_title: changes.role_title ?? null,
    p_duty: changes.duty ?? null,
    p_status: changes.status ?? null
  });

  if (error) throw error;
}

export async function removeMinistryMember(assignmentId: string): Promise<void> {
  const client = requireMinistryWriteClient();
  const { error } = await client.rpc('manage_ministry_member', {
    p_action: 'remove',
    p_assignment_id: assignmentId
  });

  if (error) throw error;
}

/**
 * Ensures an appointed ministry/department leader is persisted in `ministry_members`
 * without altering or granting any system portal permissions (`profile_role_assignments`).
 */
export async function ensureMinistryLeaderInRoster(
  ministry: Pick<Ministry, 'id' | 'name' | 'leader_id'>,
  createdById?: string
): Promise<void> {
  if (!ministry.id || !ministry.leader_id) return;
  const existing = await getMinistryRoster(ministry.id);
  const currentEntry = existing.find(entry => entry.member_id === ministry.leader_id);
  if (currentEntry) {
    if (currentEntry.status === 'inactive' || !/\b(leader|director|head)\b/i.test(currentEntry.role_title || '')) {
      await updateMinistryMember(currentEntry.id, {
        role_title: 'Department Leader',
        duty: currentEntry.duty || `${ministry.name} Leadership & Oversight`,
        status: 'active'
      });
    }
    return;
  }

  await addMinistryMember({
    ministry_id: ministry.id,
    member_id: ministry.leader_id,
    role_title: 'Department Leader',
    duty: `${ministry.name} Leadership & Oversight`,
    status: 'active',
    created_by: createdById
  });
}

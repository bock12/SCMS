import { beforeEach, describe, expect, test } from 'bun:test';

const values = new Map<string, string>();
const memoryStorage = {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, String(value)); },
  removeItem(key: string) { values.delete(key); },
  clear() { values.clear(); },
  key(index: number) { return [...values.keys()][index] ?? null; },
  get length() { return values.size; }
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: memoryStorage
});

if (typeof (globalThis as any).window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {}
    }
  });
}

const { supabase } = await import('./supabaseClient');
const {
  getMembers,
  hasPortalAccess,
  registerUnifiedMember,
  updateUnifiedMember,
  updateMembershipStatus,
  updatePortalAccountStatus,
  enablePortalAccess
} = await import('./memberService');
const {
  getMinistriesList,
  getMinistryRoster,
  getMemberMinistryAffiliations,
  addMinistryMember,
  updateMinistryMember,
  removeMinistryMember,
  ensureMinistryLeaderInRoster,
  isMemberEligibleForRoster,
  isMemberCompatibleWithMinistryBranch,
  resolveMemberMinistryStatus
} = await import('./ministryMemberService');
const {
  submitMinistryJoinRequest,
  withdrawMinistryJoinRequest,
  approveMinistryJoinRequest,
  declineMinistryJoinRequest,
  reopenMinistryJoinRequest,
  getJoinRequestsForMember
} = await import('./ministryJoinRequestService');
const {
  createMinistryDefinition,
  updateMinistryDefinition,
  archiveMinistryDefinition
} = await import('./ministryDefinitionService');
const {
  getProfileRoleData,
  assignProfileRole
} = await import('./profileRoleAssignmentService');

async function signInAsChurchSuperAdmin() {
  const res = await supabase.auth.signInWithPassword({
    email: 'admin@faithconnect.church',
    password: 'password123'
  });
  expect(res.error).toBeNull();
  return res.data.user!;
}

async function signInAsPlainMember() {
  const res = await supabase.auth.signInWithPassword({
    email: 'member@faithconnect.church',
    password: 'password123'
  });
  expect(res.error).toBeNull();
  return res.data.user!;
}

async function setAdminScope(scopeType: 'church' | 'district' | 'branch', branchId: string | null = null, districtId: string | null = null) {
  await supabase.from('profile_role_assignments').delete().eq('profile_id', 'usr-admin-1');
  await supabase.from('profile_role_assignments').insert({
    id: `admin-scope-${scopeType}`,
    profile_id: 'usr-admin-1',
    role_id: 'mock-role-super-admin',
    scope_type: scopeType,
    branch_id: branchId,
    district_id: districtId,
    assigned_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    is_active: true
  });
}

beforeEach(async () => {
  memoryStorage.clear();
  await supabase.auth.signOut();
});

describe('Congregation Roster Integration & Security (MEM-INT-004B)', () => {
  test('Scenario 1: portal-less member participates in multiple ministries and retains affiliations after directory edits', async () => {
    await signInAsChurchSuperAdmin();

    const { profile: member, portalInvite } = await registerUnifiedMember({
      first_name: 'Fatu',
      last_name: 'Koroma',
      branch_id: 'branch-1',
      membership_date: '2026-10-01',
      gender: 'female',
      phone: '+23276111222',
      is_baptized: true,
      baptism_date: '2024-05-12',
      enable_portal_access: false
    });

    expect(portalInvite).toBeUndefined();
    expect(member.auth_user_id ?? null).toBeNull();
    expect(hasPortalAccess(member)).toBe(false);
    expect(isMemberEligibleForRoster(member)).toBe(true);

    const rawUsers = JSON.parse(memoryStorage.getItem('faithconnect_auth_users_v2') || '{}');
    expect(Object.values(rawUsers).some((u: any) => u.id === member.id)).toBe(false);

    const ministries = await getMinistriesList();
    expect(ministries.length).toBeGreaterThanOrEqual(2);
    const serviceDept = ministries.find(m => m.type === 'service_department') || ministries[0];
    const fellowshipDept = ministries.find(m => m.id !== serviceDept.id) || ministries[1];

    const firstAssignment = await addMinistryMember({
      ministry_id: serviceDept.id,
      member_id: member.id,
      role_title: 'Choir Soprano',
      duty: 'Sunday Worship Service',
      status: 'active'
    });
    const secondAssignment = await addMinistryMember({
      ministry_id: fellowshipDept.id,
      member_id: member.id,
      role_title: 'Fellowship Member',
      duty: 'Monthly Outreach',
      status: 'in_training'
    });

    expect(firstAssignment.member_id).toBe(member.id);
    expect(secondAssignment.member_id).toBe(member.id);

    const deptRoster = await getMinistryRoster(serviceDept.id);
    const foundInRoster = deptRoster.find(entry => entry.member_id === member.id);
    expect(foundInRoster).toBeDefined();
    expect(foundInRoster?.member.first_name).toBe('Fatu');
    expect(hasPortalAccess(foundInRoster!.member)).toBe(false);

    const updatedMember = await updateUnifiedMember(member.id, {
      first_name: 'Fatu Mariama',
      last_name: 'Koroma',
      phone: '+23276999888',
      is_baptized: true,
      baptism_date: '2024-05-12'
    });
    expect(updatedMember.profile.id).toBe(member.id);
    expect(updatedMember.profile.auth_user_id ?? null).toBeNull();

    // Fresh reload queries show persisted canonical name & ministry affiliations intact
    const affiliations = await getMemberMinistryAffiliations();
    const fatuTeams = affiliations[member.id] || [];
    expect(fatuTeams.map(a => a.ministry_id).sort()).toEqual([serviceDept.id, fellowshipDept.id].sort());

    const reloadedRoster = await getMinistryRoster(serviceDept.id);
    expect(reloadedRoster.find(r => r.member_id === member.id)?.member.first_name).toBe('Fatu Mariama');
  });

  test('Scenario 2: portal suspension leaves membership and ministry roster intact, while membership suspension restricts updates', async () => {
    await signInAsChurchSuperAdmin();

    const created = await registerUnifiedMember({
      first_name: 'Mohamed',
      last_name: 'Sesay',
      branch_id: 'branch-1',
      membership_date: '2026-09-10',
      email: 'mohamed.sesay@example.org',
      enable_portal_access: true
    });
    await supabase.auth.completePasswordSetup({
      email: created.portalInvite!.email,
      setupToken: created.portalInvite!.setupToken,
      newPassword: 'SecurePassword123!'
    });

    // Re-sign-in as super admin to manage roster
    await signInAsChurchSuperAdmin();
    const [ministry] = await getMinistriesList();
    const assignment = await addMinistryMember({
      ministry_id: ministry.id,
      member_id: created.profile.id,
      role_title: 'Sound Technician',
      duty: 'Console Mixing',
      status: 'active'
    });

    // Suspend portal access only -> member still active in church & ministry roster
    const portalSuspended = await updatePortalAccountStatus(created.profile.id, 'suspended');
    expect(portalSuspended.status).toBe('suspended');
    expect(portalSuspended.membership_status).toBe('active');
    expect(isMemberEligibleForRoster(portalSuspended)).toBe(true);

    const rosterAfterPortalSuspend = await getMinistryRoster(ministry.id);
    expect(rosterAfterPortalSuspend.some(r => r.member_id === created.profile.id && r.status === 'active')).toBe(true);

    // Updating roster duty while portal is suspended still works because church membership is active
    await updateMinistryMember(assignment.id, { duty: 'Livestream Audio Backup' });
    const rosterAfterUpdate = await getMinistryRoster(ministry.id);
    expect(rosterAfterUpdate.find(r => r.id === assignment.id)?.duty).toBe('Livestream Audio Backup');

    // Reactivate portal, then suspend church membership -> roster updates blocked, removal still allowed
    await updatePortalAccountStatus(created.profile.id, 'active');
    await updateMembershipStatus(created.profile.id, 'suspended');

    await expect(
      updateMinistryMember(assignment.id, { role_title: 'Audio Lead' })
    ).rejects.toMatchObject({ code: '23503' });

    await removeMinistryMember(assignment.id);
    const rosterAfterCleanup = await getMinistryRoster(ministry.id);
    expect(rosterAfterCleanup.some(r => r.id === assignment.id)).toBe(false);
  });

  test('Scenario 3: ministry leadership appointment persists on roster without granting system portal permissions', async () => {
    await signInAsChurchSuperAdmin();

    const { profile: appointee } = await registerUnifiedMember({
      first_name: 'Isatu',
      last_name: 'Mansaray',
      branch_id: 'branch-1',
      membership_date: '2026-08-15',
      email: 'isatu.mansaray@example.org',
      enable_portal_access: false
    });

    const [ministry] = await getMinistriesList();
    await ensureMinistryLeaderInRoster(
      { id: ministry.id, name: ministry.name, leader_id: appointee.id },
      'usr-admin-1'
    );

    const roster = await getMinistryRoster(ministry.id);
    const leaderRow = roster.find(r => r.member_id === appointee.id);
    expect(leaderRow).toBeDefined();
    expect(leaderRow?.role_title).toBe('Department Leader');
    expect(leaderRow?.status).toBe('active');

    const affiliations = await getMemberMinistryAffiliations();
    expect(affiliations[appointee.id]?.some(a => a.ministry_id === ministry.id && a.is_leader)).toBe(true);

    // Crucial: appointing a ministry leader must NOT create any system RBAC assignment
    const roleDataBefore = await getProfileRoleData();
    const appointeeSystemRolesBefore = roleDataBefore.assignments.filter(
      a => a.profile_id === appointee.id && a.is_active
    );
    expect(appointeeSystemRolesBefore).toHaveLength(0);

    // Portal permissions remain governed strictly by explicit portal activation + profile_role_assignments
    const portalEnabled = await enablePortalAccess(appointee.id);
    expect(hasPortalAccess(portalEnabled.profile)).toBe(true);
    await assignProfileRole({
      profile_id: appointee.id,
      role_id: 'mock-role-leader',
      scope_type: 'branch',
      branch_id: 'branch-1'
    });
    const roleDataAfter = await getProfileRoleData();
    const appointeeSystemRolesAfter = roleDataAfter.assignments.filter(
      a => a.profile_id === appointee.id && a.is_active
    );
    expect(appointeeSystemRolesAfter).toHaveLength(1);
    expect(appointeeSystemRolesAfter[0].role_id).toBe('mock-role-leader');
    expect(appointeeSystemRolesAfter[0].scope_type).toBe('branch');
  });

  test('Scenario 4: enforces auth, manage_ministries permission, branch scope, duplicates, and status checks', async () => {
    // Create branch-1, branch-2, and inactive test ministries + members as church super admin
    await signInAsChurchSuperAdmin();
    const { profile: branch1Member } = await registerUnifiedMember({
      first_name: 'Sahr',
      last_name: 'Kargbo',
      branch_id: 'branch-1',
      membership_date: '2026-07-01',
      enable_portal_access: false
    });
    const { profile: branch2Member } = await registerUnifiedMember({
      first_name: 'Mariatu',
      last_name: 'Conteh',
      branch_id: 'branch-2',
      membership_date: '2026-07-01',
      enable_portal_access: false
    });

    await supabase.from('ministries').insert({
      id: 'min-branch-1-ushers',
      branch_id: 'branch-1',
      name: 'Grace Cathedral Ushers',
      description: 'Branch 1 ushers team',
      leader_name: 'TBD',
      meeting_time: 'Sundays 7:30 AM',
      member_count: 0,
      category: 'Hospitality',
      type: 'service_department',
      status: 'active',
      roles_and_responsibilities: ['Usher']
    });
    await supabase.from('ministries').insert({
      id: 'min-branch-2-choir',
      branch_id: 'branch-2',
      name: 'Bo Campus Choir',
      description: 'Branch 2 choir team',
      leader_name: 'TBD',
      meeting_time: 'Fridays 5 PM',
      member_count: 0,
      category: 'Worship',
      type: 'service_department',
      status: 'active',
      roles_and_responsibilities: ['Vocalist']
    });
    await supabase.from('ministries').insert({
      id: 'min-church-wide-missions',
      branch_id: null,
      name: 'Global Missions Network',
      description: 'Church-wide missions ministry',
      leader_name: 'TBD',
      meeting_time: 'Monthly',
      member_count: 0,
      category: 'Outreach',
      type: 'service_department',
      status: 'active',
      roles_and_responsibilities: ['Coordinator']
    });
    await supabase.from('ministries').insert({
      id: 'min-archived-team',
      branch_id: 'branch-1',
      name: 'Archived Ministry Team',
      description: 'Inactive team',
      leader_name: 'TBD',
      meeting_time: 'N/A',
      member_count: 0,
      category: 'Outreach',
      type: 'service_department',
      status: 'inactive',
      roles_and_responsibilities: []
    });

    // Branch compatibility helpers match backend rules
    expect(isMemberCompatibleWithMinistryBranch(branch1Member, { branch_id: 'branch-2' })).toBe(false);
    expect(isMemberCompatibleWithMinistryBranch(branch2Member, { branch_id: 'branch-2' })).toBe(true);

    // 4a. Unauthenticated user rejected
    await supabase.auth.signOut();
    await expect(
      addMinistryMember({
        ministry_id: 'min-branch-1-ushers',
        member_id: branch1Member.id,
        role_title: 'Member',
        duty: 'Service',
        status: 'active'
      })
    ).rejects.toBeTruthy();

    // 4b. Authenticated plain member without manage_ministries rejected (42501)
    await signInAsPlainMember();
    await expect(
      addMinistryMember({
        ministry_id: 'min-branch-1-ushers',
        member_id: branch1Member.id,
        role_title: 'Member',
        duty: 'Service',
        status: 'active'
      })
    ).rejects.toMatchObject({ code: '42501' });

    // 4c. Branch-1 scoped admin can manage branch-1 ministry, blocked from branch-2 & church-wide ministries
    await setAdminScope('branch', 'branch-1', null);
    await signInAsChurchSuperAdmin();

    const added = await addMinistryMember({
      ministry_id: 'min-branch-1-ushers',
      member_id: branch1Member.id,
      role_title: 'Usher',
      duty: 'Sanctuary Door',
      status: 'active'
    });
    expect(added.member_id).toBe(branch1Member.id);

    // Duplicate assignment rejected (23505)
    await expect(
      addMinistryMember({
        ministry_id: 'min-branch-1-ushers',
        member_id: branch1Member.id,
        role_title: 'Usher',
        duty: 'Duplicate Check',
        status: 'active'
      })
    ).rejects.toMatchObject({ code: '23505' });

    // Branch-1 admin blocked from branch-2 ministry (42501)
    await expect(
      addMinistryMember({
        ministry_id: 'min-branch-2-choir',
        member_id: branch2Member.id,
        role_title: 'Vocalist',
        duty: 'Choir',
        status: 'active'
      })
    ).rejects.toMatchObject({ code: '42501' });

    // Branch-1 admin blocked from church-wide (branch_id = null) ministry (42501)
    await expect(
      addMinistryMember({
        ministry_id: 'min-church-wide-missions',
        member_id: branch1Member.id,
        role_title: 'Coordinator',
        duty: 'Global Missions',
        status: 'active'
      })
    ).rejects.toMatchObject({ code: '42501' });

    // Restore church-wide admin: cross-branch member assignment still rejected (42501)
    await setAdminScope('church', null, null);
    await expect(
      addMinistryMember({
        ministry_id: 'min-branch-2-choir',
        member_id: branch1Member.id,
        role_title: 'Vocalist',
        duty: 'Cross-Branch Attempt',
        status: 'active'
      })
    ).rejects.toMatchObject({ code: '42501' });

    // Nonexistent / synthetic member ID rejected (23503)
    await expect(
      addMinistryMember({
        ministry_id: 'min-branch-1-ushers',
        member_id: 'synthetic-nonexistent-member',
        role_title: 'Member',
        duty: 'Fake Member Attempt',
        status: 'active'
      })
    ).rejects.toMatchObject({ code: '23503' });

    // Inactive/archived ministry rejected (23503)
    await expect(
      addMinistryMember({
        ministry_id: 'min-archived-team',
        member_id: branch1Member.id,
        role_title: 'Member',
        duty: 'Inactive Ministry Attempt',
        status: 'active'
      })
    ).rejects.toMatchObject({ code: '23503' });

    // Suspended church member rejected on add (23503)
    const { profile: suspendedMember } = await registerUnifiedMember({
      first_name: 'Kelfa',
      last_name: 'Bangura',
      branch_id: 'branch-1',
      membership_date: '2026-07-01',
      membership_status: 'suspended',
      enable_portal_access: false
    });
    expect(isMemberEligibleForRoster(suspendedMember)).toBe(false);
    await expect(
      addMinistryMember({
        ministry_id: 'min-branch-1-ushers',
        member_id: suspendedMember.id,
        role_title: 'Member',
        duty: 'Suspended Member Attempt',
        status: 'active'
      })
    ).rejects.toMatchObject({ code: '23503' });
  });

  test('Scenario 5: ministry definitions use scoped RPCs, canonical leaders, and retained roster history', async () => {
    await signInAsChurchSuperAdmin();

    const { profile: firstLeader } = await registerUnifiedMember({
      first_name: 'Hawa',
      last_name: 'Bangura',
      branch_id: 'branch-1',
      membership_date: '2026-06-01',
      enable_portal_access: false
    });
    const { profile: secondLeader } = await registerUnifiedMember({
      first_name: 'Abdul',
      last_name: 'Kamara',
      branch_id: 'branch-1',
      membership_date: '2026-06-02',
      enable_portal_access: false
    });
    const { profile: crossBranchMember } = await registerUnifiedMember({
      first_name: 'Mabinty',
      last_name: 'Jalloh',
      branch_id: 'branch-2',
      membership_date: '2026-06-03',
      enable_portal_access: false
    });

    const created = await createMinistryDefinition({
      branch_id: 'branch-1',
      name: 'MEM-INT-004B Definition Lifecycle',
      description: 'Secure definition management test.',
      category: 'Worship',
      meeting_time: 'Sunday 9 AM',
      type: 'social_fellowship',
      roles_and_responsibilities: ['Coordinator', 'Volunteer'],
      leader_id: firstLeader.id
    });
    expect(created.entity_type).toBe('fellowship');
    expect(created.type).toBe('social_fellowship');
    expect(created.member_count).toBe(1);

    const firstRoster = await getMinistryRoster(created.id);
    expect(firstRoster.find(row => row.member_id === firstLeader.id)?.role_title).toBe('Department Leader');

    const updated = await updateMinistryDefinition(created.id, {
      name: created.name,
      description: created.description,
      category: created.category,
      meeting_time: created.meeting_time,
      type: 'service_department',
      roles_and_responsibilities: ['Sound', 'Media'],
      leader_id: secondLeader.id
    });
    expect(updated.entity_type).toBe('department');
    expect(updated.type).toBe('service_department');
    expect(updated.leader_id).toBe(secondLeader.id);
    expect(updated.member_count).toBe(2);

    const updatedRoster = await getMinistryRoster(created.id);
    expect(updatedRoster.find(row => row.member_id === firstLeader.id)?.role_title).toBe('Team Member');
    expect(updatedRoster.find(row => row.member_id === secondLeader.id)?.role_title).toBe('Department Leader');

    await expect(
      updateMinistryDefinition(created.id, {
        name: updated.name,
        description: updated.description,
        category: updated.category,
        meeting_time: updated.meeting_time,
        type: updated.type!,
        roles_and_responsibilities: updated.roles_and_responsibilities || [],
        leader_id: crossBranchMember.id
      })
    ).rejects.toMatchObject({ code: '23514' });

    const archived = await archiveMinistryDefinition(created.id);
    expect(archived.status).toBe('archived');
    expect((await getMinistryRoster(created.id))).toHaveLength(2);
    expect((await getMinistriesList()).some(item => item.id === created.id)).toBe(false);

    // A branch-scoped ministry manager cannot create in another branch or church-wide.
    await setAdminScope('branch', 'branch-1', null);
    await signInAsChurchSuperAdmin();
    await expect(createMinistryDefinition({
      branch_id: 'branch-2',
      name: 'Out of Scope Branch Ministry',
      description: '',
      category: 'General',
      meeting_time: 'Weekly',
      type: 'service_department',
      roles_and_responsibilities: [],
      leader_id: null
    })).rejects.toMatchObject({ code: '42501' });

    await expect(createMinistryDefinition({
      branch_id: null,
      name: 'Out of Scope Churchwide Ministry',
      description: '',
      category: 'General',
      meeting_time: 'Weekly',
      type: 'service_department',
      roles_and_responsibilities: [],
      leader_id: null
    })).rejects.toMatchObject({ code: '42501' });
    await setAdminScope('church', null, null);
  });

  test('legacy profile department labels and browser roster caches do not create ministry membership', async () => {
    await signInAsChurchSuperAdmin();
    const { profile: member } = await registerUnifiedMember({
      first_name: 'Legacy',
      last_name: 'Fallback',
      branch_id: 'branch-1',
      membership_date: '2026-05-01',
      enable_portal_access: false
    });
    const ministry = (await getMinistriesList())[0];
    await supabase.from('profiles').update({
      assigned_department: ministry.name,
      department_name: ministry.name
    }).eq('id', member.id);
    memoryStorage.setItem(`fc_roster_${ministry.name}`, JSON.stringify([{
      id: member.id,
      member_id: member.id,
      name: `${member.first_name} ${member.last_name}`,
      role: 'Team Member'
    }]));

    const resolved = resolveMemberMinistryStatus({
      ministry,
      profile: { ...member, assigned_department: ministry.name, department_name: ministry.name },
      activeMemberships: []
    });
    expect(resolved).toBeNull();

    const affiliations = await getMemberMinistryAffiliations();
    expect(affiliations[member.id] || []).toHaveLength(0);
  });

  test('Scenario 5: ministry join request approval persists member to canonical roster and removal cleans up cleanly', async () => {
    const memberUser = await signInAsPlainMember();
    const members = await getMembers();
    const applicant = members.find(m => m.auth_user_id === memberUser.id || m.id === 'usr-member-1')!;
    expect(applicant).toBeDefined();

    const ministries = await getMinistriesList();
    const targetMinistry = ministries.find(m => !m.branch_id || m.branch_id === applicant.branch_id) || ministries[0];

    const firstRequest = await submitMinistryJoinRequest({
      ministry: targetMinistry,
      profile: applicant,
      preferredRoles: ['Hospitality'],
      availability: 'Sundays 8:00 AM',
      note: 'Happy to serve the congregation.'
    });
    const memberRequests = await getJoinRequestsForMember(applicant.id);
    expect(memberRequests.some(request => request.id === firstRequest.id && request.status === 'pending')).toBe(true);

    const withdrawn = await withdrawMinistryJoinRequest(firstRequest.id, applicant.id);
    expect(withdrawn.status).toBe('withdrawn');

    const joinReq = await submitMinistryJoinRequest({
      ministry: targetMinistry,
      profile: applicant,
      preferredRoles: ['Hospitality'],
      availability: 'Sundays 8:00 AM',
      note: 'Resubmitting after withdrawing the earlier request.'
    });

    await signInAsChurchSuperAdmin();
    const adminProfile = (await getMembers()).find(m => m.id === 'usr-admin-1')!;
    const declined = await declineMinistryJoinRequest({
      requestId: joinReq.id,
      reviewerProfile: adminProfile,
      reviewNote: 'Please attend the next ministry orientation.'
    });
    expect(declined.status).toBe('declined');

    const reopened = await reopenMinistryJoinRequest(joinReq.id, adminProfile);
    expect(reopened.status).toBe('pending');

    const approved = await approveMinistryJoinRequest({
      requestId: joinReq.id,
      reviewerProfile: adminProfile,
      roleTitle: 'Welcome Greeter',
      duty: 'Main Entrance Hospitality',
      memberStatus: 'active'
    });

    expect(approved.request.status).toBe('approved');
    const roster = await getMinistryRoster(targetMinistry.id);
    const createdEntry = roster.find(r => r.member_id === applicant.id);
    expect(createdEntry).toBeDefined();
    expect(createdEntry?.role_title).toBe('Welcome Greeter');

    await removeMinistryMember(createdEntry!.id);
    const afterRemove = await getMinistryRoster(targetMinistry.id);
    expect(afterRemove.some(r => r.member_id === applicant.id)).toBe(false);
  });
});

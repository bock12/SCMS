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

const { supabase } = await import('./supabaseClient');
const {
  createChurchBranch,
  updateChurchBranch,
  getBranchGovernanceData,
  resolveActorBranchGovernanceScope
} = await import('./branchManagementService');
const { registerUnifiedMember, updateUnifiedMember, hasPortalAccess } = await import('./memberService');
const {
  getMemberTransferDirectory,
  requestMemberTransfer,
  reviewMemberTransfer
} = await import('./memberTransferService');
const {
  addMinistryMember,
  getMinistryRoster
} = await import('./ministryMemberService');
const { getProfileRoleData, reactivateProfileRoleAssignment } = await import('./profileRoleAssignmentService');

beforeEach(() => {
  memoryStorage.clear();
});

async function signInAsChurchAdmin() {
  await supabase.from('profile_role_assignments').delete().eq('profile_id', 'usr-admin-1');
  await supabase.from('profile_role_assignments').insert({
    id: 'mem4a-church-admin',
    profile_id: 'usr-admin-1',
    role_id: 'mock-role-admin',
    scope_type: 'church',
    branch_id: null,
    district_id: null,
    assigned_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    is_active: true
  });
  const signIn = await supabase.auth.signInWithPassword({
    email: 'admin@faithconnect.church',
    password: 'password123'
  });
  expect(signIn.error).toBeNull();
}

async function signInAsDistrictAdmin(districtId: string) {
  await supabase.from('profile_role_assignments').delete().eq('profile_id', 'usr-bishop-1');
  await supabase.from('profile_role_assignments').insert({
    id: 'mem4a-dist-admin',
    profile_id: 'usr-bishop-1',
    role_id: 'mock-role-district-admin',
    scope_type: 'district',
    branch_id: null,
    district_id: districtId,
    assigned_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    is_active: true
  });
  const signIn = await supabase.auth.signInWithPassword({
    email: 'bishop@faithconnect.church',
    password: 'password123'
  });
  expect(signIn.error).toBeNull();
}

describe('MEM-INT-004A branch, district & congregation membership alignment', () => {
  test('role assignment reactivation rejects inactive branches and preserves expired assignments', async () => {
    await signInAsChurchAdmin();

    const inactiveBranchId = 'mem4a-reactivation-inactive-branch';
    await supabase.from('church_branches').insert({
      id: inactiveBranchId,
      district_id: 'dist-1',
      name: 'Inactive Reactivation Test Branch',
      address: '1 Test Road',
      city: 'Test City',
      state: 'Test State',
      state_or_region: 'Test State',
      code: 'M4R-INACTIVE',
      country: 'Sierra Leone',
      status: 'inactive',
      is_main_branch: false
    });

    await supabase.from('profile_role_assignments').insert([
      {
        id: 'mem4a-reactivation-inactive-scope',
        profile_id: 'usr-admin-1',
        role_id: 'mock-role-member',
        scope_type: 'branch',
        branch_id: inactiveBranchId,
        district_id: null,
        assigned_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
        is_active: false
      },
      {
        id: 'mem4a-reactivation-expired',
        profile_id: 'usr-admin-1',
        role_id: 'mock-role-member',
        scope_type: 'branch',
        branch_id: 'branch-1',
        district_id: null,
        assigned_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-01-02T00:00:00.000Z',
        is_active: false
      }
    ]);

    await expect(
      reactivateProfileRoleAssignment('mem4a-reactivation-inactive-scope')
    ).rejects.toThrow(/branch is no longer active/i);

    await expect(
      reactivateProfileRoleAssignment('mem4a-reactivation-expired')
    ).rejects.toThrow(/assignment has expired/i);

    const expiredRow = await supabase.from('profile_role_assignments')
      .select('expires_at,is_active')
      .eq('id', 'mem4a-reactivation-expired')
      .single();
    expect(expiredRow.data?.expires_at).toBe('2026-01-02T00:00:00.000Z');
    expect(expiredRow.data?.is_active).toBe(false);
  });

  test('Scenario A: church-wide admin creates standalone branches without a district, attaches/detaches districts, and preserves member branch_id', async () => {
    await signInAsChurchAdmin();

    const standalone = await createChurchBranch({
      district_id: null,
      name: 'Grace Standalone Mission',
      address: '55 Liberty St',
      city: 'Dover',
      state: 'DE',
      is_main_branch: false
    });
    expect(standalone.district_id).toBeNull();

    const { profile: member } = await registerUnifiedMember({
      first_name: 'Standalone',
      last_name: 'Congregant',
      branch_id: standalone.id,
      membership_date: '2026-03-01',
      membership_status: 'active',
      enable_portal_access: false
    });
    expect(member.branch_id).toBe(standalone.id);
    expect(hasPortalAccess(member)).toBe(false);

    // Attach branch to dist-1 -> member stays in standalone.id, derived district updates dynamically
    const attached = await updateChurchBranch({
      id: standalone.id,
      district_id: 'dist-1',
      name: standalone.name,
      address: standalone.address,
      city: standalone.city,
      state: standalone.state,
      is_main_branch: false
    });
    expect(attached.district_id).toBe('dist-1');

    // Detach back to standalone -> allowed for church-wide admin; member branch_id preserved
    const detached = await updateChurchBranch({
      id: standalone.id,
      district_id: null,
      name: standalone.name,
      address: standalone.address,
      city: standalone.city,
      state: standalone.state,
      is_main_branch: false
    });
    expect(detached.district_id).toBeNull();

    const dir = await getMemberTransferDirectory();
    const dirMember = dir.members.find(m => m.id === member.id);
    const dirBranch = dir.branches.find(b => b.id === standalone.id);
    expect(dirMember?.branch_id).toBe(standalone.id);
    expect(dirBranch?.district_id).toBeNull();
    expect(dirBranch?.district_name).toBeNull();
  });

  test('Scenario C: district_admin cannot manage standalone branches, cannot detach to standalone, and governance summaries stay accurate', async () => {
    await signInAsChurchAdmin();
    const standalone = await createChurchBranch({
      district_id: null,
      name: 'Independent Cathedral',
      address: '10 Liberty Plaza',
      city: 'Trenton',
      state: 'NJ',
      is_main_branch: true
    });

    await signInAsDistrictAdmin('dist-1');

    // District admin cannot create a standalone branch
    await expect(
      createChurchBranch({
        district_id: null,
        name: 'Rogue Standalone',
        address: '1 Main Rd',
        city: 'Newark',
        state: 'NJ',
        is_main_branch: false
      })
    ).rejects.toThrow();

    // District admin cannot detach an in-district branch into standalone
    await expect(
      updateChurchBranch({
        id: 'branch-2',
        district_id: null,
        name: 'Brooklyn Heights Sanctuary',
        address: '420 Atlantic Avenue',
        city: 'Brooklyn',
        state: 'NY',
        is_main_branch: false
      })
    ).rejects.toThrow();

    const data = await getBranchGovernanceData();
    const scope = await resolveActorBranchGovernanceScope('usr-bishop-1', data.districts, data.branches);
    expect(scope.hasChurchBranchAccess).toBe(false);
    expect(scope.manageableBranchIds).toContain('branch-1');
    expect(scope.manageableBranchIds).toContain('branch-2');
    expect(scope.manageableBranchIds).not.toContain(standalone.id);
    expect(scope.manageableBranchIds).not.toContain('branch-3');

    expect(data.branchMemberCounts['branch-1']?.total).toBeGreaterThan(0);
    expect(data.branchMemberCounts['branch-3']).toBeUndefined();
  });

  test('Scenario D: member registration rejects inactive branches and separates portal-less ministry leadership from RBAC roles', async () => {
    await signInAsChurchAdmin();

    // Insert an inactive branch cleanly to verify inactive-branch registration rejection
    await supabase.from('church_branches').insert({
      id: 'branch-inactive-test',
      district_id: 'dist-1',
      name: 'Inactive Satellite',
      address: '99 Closed Way',
      city: 'Camden',
      state: 'NJ',
      state_or_region: 'NJ',
      code: 'INACT-1',
      country: 'United States',
      status: 'inactive',
      is_main_branch: false
    });

    await expect(
      registerUnifiedMember({
        first_name: 'Rejected',
        last_name: 'Member',
        branch_id: 'branch-inactive-test',
        membership_date: '2026-03-01'
      })
    ).rejects.toThrow(/inactive/i);

    const { profile: nonPortalLeader } = await registerUnifiedMember({
      first_name: 'Hannah',
      last_name: 'NonPortal',
      branch_id: 'branch-1',
      membership_date: '2026-03-01',
      membership_status: 'active',
      enable_portal_access: false
    });
    expect(hasPortalAccess(nonPortalLeader)).toBe(false);

    // Direct branch reassignment via profile edit is rejected; metadata updates keep branch_id intact
    await expect(
      updateUnifiedMember(nonPortalLeader.id, {
        first_name: 'Hannah-Updated',
        last_name: 'NonPortal',
        branch_id: 'branch-2'
      })
    ).rejects.toThrow('approved member transfer workflow');

    const edited = await updateUnifiedMember(nonPortalLeader.id, {
      first_name: 'Hannah-Updated',
      last_name: 'NonPortal'
    });
    expect(edited.profile.first_name).toBe('Hannah-Updated');
    expect(edited.profile.branch_id).toBe('branch-1');

    // Appoint as Ministry Leader without portal access -> succeeds without creating RBAC roles
    await supabase.from('ministries').insert({
      id: 'min-scen-d-branch1',
      name: 'Branch 1 Choir',
      description: 'Branch 1 worship choir',
      entity_type: 'department',
      type: 'service_department',
      category: 'Worship',
      branch_id: 'branch-1',
      status: 'active'
    });

    const rosterEntry = await addMinistryMember({
      ministry_id: 'min-scen-d-branch1',
      member_id: nonPortalLeader.id,
      role_title: 'Department Leader',
      duty: 'Choir and service oversight',
      status: 'active'
    });
    expect(rosterEntry.status).toBe('active');

    const roleData = await getProfileRoleData();
    const rbacForLeader = roleData.assignments.filter(a => a.profile_id === nonPortalLeader.id && a.is_active);
    expect(rbacForLeader).toHaveLength(0);
  });

  test('Scenario E & F: approved transfer atomically moves branch, deactivates source-branch ministry rosters while preserving history and church-wide teams', async () => {
    await signInAsChurchAdmin();

    // Seed branch-scoped and church-wide ministry participation plus a branch-1 cell assignment.
    const { profile: mover } = await registerUnifiedMember({
      first_name: 'Daniel',
      last_name: 'Relocating',
      branch_id: 'branch-1',
      membership_date: '2026-03-01',
      membership_status: 'active',
      enable_portal_access: false
    });

    await supabase.from('ministries').insert([
      {
        id: 'min-branch1-scoped',
        name: 'Branch 1 Ushers',
        description: 'Branch 1 ushering',
        entity_type: 'department',
        type: 'service_department',
        category: 'Service',
        branch_id: 'branch-1',
        status: 'active'
      },
      {
        id: 'min-church-wide',
        name: 'National Missions Network',
        description: 'Church-wide missions',
        entity_type: 'ministry',
        type: 'service_department',
        category: 'Missions',
        branch_id: null,
        status: 'active'
      }
    ]);

    await addMinistryMember({
      ministry_id: 'min-branch1-scoped',
      member_id: mover.id,
      role_title: 'Head Usher',
      duty: 'Branch 1 door stewardship',
      status: 'active'
    });
    await addMinistryMember({
      ministry_id: 'min-church-wide',
      member_id: mover.id,
      role_title: 'Mission Coordinator',
      duty: 'Cross-church outreach',
      status: 'active'
    });

    await supabase.from('cells').insert({
      id: 'cell-branch1-transfer-history',
      branch_id: 'branch-1',
      name: 'Branch 1 Transfer History Cell',
      leader_id: mover.id,
      status: 'active'
    });
    await supabase.from('cell_members').insert({
      id: 'cell-member-branch1-transfer-history',
      cell_id: 'cell-branch1-transfer-history',
      member_id: mover.id,
      branch_id: 'branch-1',
      role: 'leader',
      status: 'active'
    });

    const transfer = await requestMemberTransfer({
      memberId: mover.id,
      toBranchId: 'branch-2',
      notes: 'Relocating to Brooklyn campus'
    });
    expect(transfer.status).toBe('pending');
    expect(transfer.from_branch_id).toBe('branch-1');
    expect(transfer.to_branch_id).toBe('branch-2');

    const approved = await reviewMemberTransfer(transfer.id, 'approve');
    expect(approved.status).toBe('approved');

    // Member directory shows new branch_id and derived district_name in transfer directory
    const directory = await getMemberTransferDirectory();
    const movedMember = directory.members.find(m => m.id === mover.id);
    expect(movedMember?.branch_id).toBe('branch-2');
    const destBranch = directory.branches.find(b => b.id === 'branch-2');
    expect(destBranch?.district_name).toBe('Metropolitan Central District');

    // Source-branch ministry roster row preserved as 'inactive'; church-wide team remains 'active'
    const branch1Roster = await getMinistryRoster('min-branch1-scoped');
    const oldAssignment = branch1Roster.find(r => r.member_id === mover.id);
    expect(oldAssignment).toBeDefined();
    expect(oldAssignment?.status).toBe('inactive');

    const churchRoster = await getMinistryRoster('min-church-wide');
    const churchAssignment = churchRoster.find(r => r.member_id === mover.id);
    expect(churchAssignment).toBeDefined();
    expect(churchAssignment?.status).toBe('active');

    const historicalCellMembership = await supabase.from('cell_members')
      .select('*')
      .eq('id', 'cell-member-branch1-transfer-history')
      .single();
    expect(historicalCellMembership.data?.status).toBe('transferred');

    const sourceCell = await supabase.from('cells')
      .select('leader_id')
      .eq('id', 'cell-branch1-transfer-history')
      .single();
    expect(sourceCell.data?.leader_id).toBeNull();
  });
});

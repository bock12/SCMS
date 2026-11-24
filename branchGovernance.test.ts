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
  ADMIN_CONSOLE_PERMISSION_KEYS,
  canManageTargetRoleByScope,
  hasAnyEffectivePermission,
  loadPermissionResolution
} = await import('./permissionResolutionService');
const {
  createDistrict,
  updateDistrict,
  deleteDistrict,
  createChurchBranch,
  updateChurchBranch,
  resolveActorBranchGovernanceScope,
  buildDistrictPortalSummaries,
  buildStandaloneBranchSummaries,
  getBranchGovernanceData
} = await import('./branchManagementService');

beforeEach(() => {
  memoryStorage.clear();
});

async function signInAsChurchAdmin() {
  await supabase.from('profile_role_assignments').delete().eq('profile_id', 'usr-admin-1');
  await supabase.from('profile_role_assignments').insert({
    id: 'actor-church-admin',
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
    id: 'actor-district-admin',
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

describe('two-tier branch and leadership governance', () => {
  test('district_admin resolves manage_branches and manage_roles only within assigned district and enters admin console', async () => {
    await signInAsDistrictAdmin('dist-1');

    const dist1BranchResolution = await loadPermissionResolution('usr-bishop-1', 'branch-1');
    expect(dist1BranchResolution.permissions).toContain('manage_branches');
    expect(dist1BranchResolution.permissions).toContain('manage_roles');
    expect(hasAnyEffectivePermission(dist1BranchResolution, ADMIN_CONSOLE_PERMISSION_KEYS)).toBe(true);

    const outsideDistrictResolution = await loadPermissionResolution('usr-bishop-1', 'branch-3');
    expect(outsideDistrictResolution.permissions).not.toContain('manage_branches');
    expect(outsideDistrictResolution.permissions).not.toContain('manage_roles');
  });

  test('church-wide admin can create districts and branches across any district', async () => {
    await signInAsChurchAdmin();

    const newDistrict = await createDistrict({
      name: 'Southern Heritage District',
      region: 'Southeast',
      country: 'United States'
    });
    expect(newDistrict.name).toBe('Southern Heritage District');

    const newBranch = await createChurchBranch({
      district_id: newDistrict.id,
      name: 'Atlanta Grace Fellowship',
      address: '500 Peachtree St',
      city: 'Atlanta',
      state: 'GA',
      is_main_branch: false
    });
    expect(newBranch.district_id).toBe(newDistrict.id);
    expect(newBranch.name).toBe('Atlanta Grace Fellowship');
  });

  test('district_admin can create and edit branches in their district, but cannot create districts, set main HQ, or touch other districts', async () => {
    await signInAsDistrictAdmin('dist-1');

    await expect(
      createDistrict({ name: 'Unauthorized District', region: 'North', country: 'US' })
    ).rejects.toThrow();

    await expect(
      createChurchBranch({
        district_id: 'dist-1',
        name: 'Rogue HQ Branch',
        address: '1 Main St',
        city: 'Newark',
        state: 'NJ',
        is_main_branch: true
      })
    ).rejects.toThrow();

    await expect(
      createChurchBranch({
        district_id: 'dist-2',
        name: 'Out of District Branch',
        address: '10 Ocean Ave',
        city: 'San Diego',
        state: 'CA'
      })
    ).rejects.toThrow();

    const created = await createChurchBranch({
      district_id: 'dist-1',
      name: 'Harbor Light Chapel',
      address: '410 Harbor Blvd',
      city: 'Newark',
      state: 'NJ',
      is_main_branch: false
    });
    expect(created.district_id).toBe('dist-1');

    const updated = await updateChurchBranch({
      id: created.id,
      district_id: 'dist-1',
      name: 'Harbor Light Cathedral',
      address: '412 Harbor Blvd',
      city: 'Newark',
      state: 'NJ',
      is_main_branch: false
    });
    expect(updated.name).toBe('Harbor Light Cathedral');

    await expect(
      updateChurchBranch({
        id: created.id,
        district_id: 'dist-2',
        name: 'Harbor Light Cathedral',
        address: '412 Harbor Blvd',
        city: 'Newark',
        state: 'NJ',
        is_main_branch: false
      })
    ).rejects.toThrow();
  });

  test('district_admin can assign operational branch leadership in-district, but cannot escalate to super_admin, admin, or district_admin', async () => {
    await signInAsDistrictAdmin('dist-1');

    const { data: districts } = await supabase.from('districts').select('*');
    const { data: branches } = await supabase.from('church_branches').select('*');
    const scope = await resolveActorBranchGovernanceScope('usr-bishop-1', districts || [], branches || []);
    expect(scope.canCreateDistrict).toBe(false);
    expect(scope.manageableDistrictIds).toEqual(['dist-1']);
    expect(scope.assignableBranchIds).toContain('branch-1');
    expect(scope.assignableBranchIds).not.toContain('branch-3');

    const appointPastor = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'mem-6',
      p_role_id: 'mock-role-pastor',
      p_scope_type: 'branch',
      p_branch_id: 'branch-2',
      p_district_id: null
    });
    expect(appointPastor.error).toBeNull();
    expect(appointPastor.data?.scope_type).toBe('branch');
    expect(appointPastor.data?.branch_id).toBe('branch-2');

    const escalateAdmin = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'mem-6',
      p_role_id: 'mock-role-admin',
      p_scope_type: 'branch',
      p_branch_id: 'branch-2',
      p_district_id: null
    });
    expect(escalateAdmin.error?.code).toBe('42501');

    const escalateSuperAdmin = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'mem-6',
      p_role_id: 'mock-role-super-admin',
      p_scope_type: 'branch',
      p_branch_id: 'branch-2',
      p_district_id: null
    });
    expect(escalateSuperAdmin.error?.code).toBe('42501');

    const outsideBranch = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'mem-6',
      p_role_id: 'mock-role-pastor',
      p_scope_type: 'branch',
      p_branch_id: 'branch-3',
      p_district_id: null
    });
    expect(outsideBranch.error?.code).toBe('42501');

    expect(canManageTargetRoleByScope(false, 'pastor')).toBe(true);
    expect(canManageTargetRoleByScope(false, 'finance_officer')).toBe(true);
    expect(canManageTargetRoleByScope(false, 'super_admin')).toBe(false);
    expect(canManageTargetRoleByScope(true, 'super_admin')).toBe(true);
  });

  test('ADMIN_CONSOLE_PERMISSION_KEYS includes manage_branches and view_audit_logs', () => {
    expect(ADMIN_CONSOLE_PERMISSION_KEYS).toContain('manage_branches');
    expect(ADMIN_CONSOLE_PERMISSION_KEYS).toContain('view_audit_logs');
  });

  test('church-wide admin can customize districts, switch HQ via updateDistrict, and delete empty districts', async () => {
    await signInAsChurchAdmin();

    const createdDistrict = await createDistrict({
      name: 'Midwest Heritage District',
      region: 'Midwest',
      country: 'United States',
      description: 'Original regional coverage'
    });
    expect(createdDistrict.description).toBe('Original regional coverage');

    const b1 = await createChurchBranch({
      district_id: createdDistrict.id,
      name: 'Chicago Central',
      address: '100 State St',
      city: 'Chicago',
      state: 'IL',
      is_main_branch: true
    });
    const b2 = await createChurchBranch({
      district_id: createdDistrict.id,
      name: 'Evanston Sanctuary',
      address: '200 Ridge Ave',
      city: 'Evanston',
      state: 'IL',
      is_main_branch: false
    });
    expect(b1.is_main_branch).toBe(true);
    expect(b2.is_main_branch).toBe(false);

    // Non-empty district cannot be deleted
    await expect(deleteDistrict(createdDistrict.id)).rejects.toThrow();

    // Customize district metadata + transfer District HQ to b2
    const customized = await updateDistrict({
      id: createdDistrict.id,
      name: 'Great Lakes District',
      region: 'Upper Midwest',
      country: 'United States',
      description: 'Expanded Illinois and Wisconsin parishes',
      hq_branch_id: b2.id,
      update_hq: true
    });
    expect(customized.name).toBe('Great Lakes District');
    expect(customized.region).toBe('Upper Midwest');
    expect(customized.description).toBe('Expanded Illinois and Wisconsin parishes');

    const { data: districtBranches } = await supabase
      .from('church_branches')
      .select('*')
      .eq('district_id', createdDistrict.id);
    const hqBranches = (districtBranches || []).filter((b: { is_main_branch: boolean }) => b.is_main_branch);
    expect(hqBranches).toHaveLength(1);
    expect(hqBranches[0].id).toBe(b2.id);

    // Empty district can be created and deleted cleanly
    const emptyDistrict = await createDistrict({
      name: 'Temporary Holding District',
      region: 'East',
      country: 'United States'
    });
    const deleted = await deleteDistrict(emptyDistrict.id);
    expect(deleted).toBe(true);

    const { data: remainingDistricts } = await supabase.from('districts').select('*');
    expect((remainingDistricts || []).some((d: { id: string }) => d.id === emptyDistrict.id)).toBe(false);
  });

  test('enforces strictly one HQ branch per district while allowing independent HQs across different districts', async () => {
    await signInAsChurchAdmin();

    // Promote branch-2 inside dist-1 -> should demote branch-1 in dist-1
    await updateChurchBranch({
      id: 'branch-2',
      district_id: 'dist-1',
      name: 'Brooklyn Heights Sanctuary',
      address: '420 Atlantic Avenue',
      city: 'Brooklyn',
      state: 'NY',
      is_main_branch: true
    });

    // Promote branch-3 inside dist-2 -> should NOT affect dist-1 HQ (branch-2)
    await updateChurchBranch({
      id: 'branch-3',
      district_id: 'dist-2',
      name: 'West Coast Lighthouse',
      address: '890 Sunset Boulevard',
      city: 'Los Angeles',
      state: 'CA',
      is_main_branch: true
    });

    const { data: allBranches } = await supabase.from('church_branches').select('*');
    const dist1Hqs = (allBranches || []).filter(
      (b: { district_id: string | null; is_main_branch: boolean }) => b.district_id === 'dist-1' && b.is_main_branch
    );
    const dist2Hqs = (allBranches || []).filter(
      (b: { district_id: string | null; is_main_branch: boolean }) => b.district_id === 'dist-2' && b.is_main_branch
    );

    expect(dist1Hqs).toHaveLength(1);
    expect(dist1Hqs[0].id).toBe('branch-2');
    expect(dist2Hqs).toHaveLength(1);
    expect(dist2Hqs[0].id).toBe('branch-3');
  });

  test('district_admin can customize their own district details but cannot modify other districts or change HQ', async () => {
    await signInAsDistrictAdmin('dist-1');

    const updatedOwn = await updateDistrict({
      id: 'dist-1',
      name: 'Metro Northeast Hub',
      region: 'Tri-State North',
      country: 'United States',
      description: 'Updated by district overseer',
      update_hq: false
    });
    expect(updatedOwn.name).toBe('Metro Northeast Hub');
    expect(updatedOwn.description).toBe('Updated by district overseer');

    // Cannot update District HQ designation
    await expect(
      updateDistrict({
        id: 'dist-1',
        name: 'Metro Northeast Hub',
        region: 'Tri-State North',
        country: 'United States',
        hq_branch_id: 'branch-2',
        update_hq: true
      })
    ).rejects.toThrow();

    // Cannot customize another district
    await expect(
      updateDistrict({
        id: 'dist-2',
        name: 'Unauthorized Rename',
        region: 'West',
        country: 'United States',
        update_hq: false
      })
    ).rejects.toThrow();

    // Cannot delete any district
    await expect(deleteDistrict('dist-1')).rejects.toThrow();
  });

  test('buildDistrictPortalSummaries aggregates branch member counts, identifies HQ branch first, and tracks district leadership', async () => {
    await signInAsChurchAdmin();

    const emptyDistrict = await createDistrict({
      name: 'Frontier Mission District',
      region: 'Northwest',
      country: 'United States'
    });

    const data = await getBranchGovernanceData();
    const summaries = buildDistrictPortalSummaries({
      districts: data.districts,
      branches: data.branches,
      profiles: data.profiles,
      assignments: data.assignments,
      roles: data.roles
    });

    const dist1Summary = summaries.find(s => s.district.id === 'dist-1');
    expect(dist1Summary).toBeDefined();
    expect(dist1Summary?.totalBranches).toBe(2);
    expect(dist1Summary?.hqBranch?.id).toBe('branch-1');
    expect(dist1Summary?.branchSummaries[0]?.branch.id).toBe('branch-1');
    expect(dist1Summary?.branchSummaries[0]?.branch.is_main_branch).toBe(true);
    expect(dist1Summary?.totalMembers).toBe(7);
    expect(dist1Summary?.activeMembers).toBe(6);

    const dist2Summary = summaries.find(s => s.district.id === 'dist-2');
    expect(dist2Summary).toBeDefined();
    expect(dist2Summary?.totalBranches).toBe(1);
    expect(dist2Summary?.hqBranch).toBeNull();
    expect(dist2Summary?.totalMembers).toBe(1);

    const dist3Summary = summaries.find(s => s.district.id === 'dist-3');
    expect(dist3Summary).toBeDefined();
    expect(dist3Summary?.totalBranches).toBe(1);
    expect(dist3Summary?.hqBranch).toBeNull();
    expect(dist3Summary?.totalMembers).toBe(1);

    const emptySummary = summaries.find(s => s.district.id === emptyDistrict.id);
    expect(emptySummary).toBeDefined();
    expect(emptySummary?.totalBranches).toBe(0);
    expect(emptySummary?.totalMembers).toBe(0);
    expect(emptySummary?.hqBranch).toBeNull();
  });

  test('supports standalone branches without districts, enforces single standalone Church Main Branch, and summarizes branchMemberCounts', async () => {
    await signInAsChurchAdmin();

    const standaloneMain = await createChurchBranch({
      district_id: null,
      name: 'Grace Standalone Main',
      address: '100 Central Way',
      city: 'Newark',
      state: 'NJ',
      is_main_branch: true
    });
    expect(standaloneMain.district_id).toBeNull();
    expect(standaloneMain.is_main_branch).toBe(true);

    // Creating a second standalone Church Main Branch demotes the first standalone main, without disturbing dist-1 HQ.
    const secondStandaloneMain = await createChurchBranch({
      district_id: null,
      name: 'Grace Standalone North',
      address: '200 North Ave',
      city: 'Albany',
      state: 'NY',
      is_main_branch: true
    });
    expect(secondStandaloneMain.is_main_branch).toBe(true);

    const data = await getBranchGovernanceData();
    const firstReloaded = data.branches.find(b => b.id === standaloneMain.id);
    const dist1Hq = data.branches.find(b => b.id === 'branch-1');
    expect(firstReloaded?.is_main_branch).toBe(false);
    expect(dist1Hq?.is_main_branch).toBe(true);

    const standaloneSummaries = buildStandaloneBranchSummaries({
      branches: data.branches,
      profiles: data.profiles,
      assignments: data.assignments,
      roles: data.roles,
      branchMemberCounts: {
        ...data.branchMemberCounts,
        [secondStandaloneMain.id]: { total: 42, active: 39 }
      }
    });
    expect(standaloneSummaries[0]?.branch.id).toBe(secondStandaloneMain.id);
    expect(standaloneSummaries[0]?.memberCount).toBe(42);
    expect(standaloneSummaries[0]?.activeMemberCount).toBe(39);
  });
});

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
  createChurchBranch,
  updateChurchBranch,
  resolveActorBranchGovernanceScope
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
});

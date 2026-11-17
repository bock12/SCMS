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

beforeEach(() => {
  memoryStorage.clear();
});

async function setActorAssignment(
  scopeType: 'church' | 'district' | 'branch',
  branchId: string | null = null,
  districtId: string | null = null,
  overrides: Record<string, unknown> = {}
) {
  await supabase.from('profile_role_assignments').delete().eq('profile_id', 'usr-admin-1');
  await supabase.from('profile_role_assignments').insert({
    id: 'actor-role-assignment',
    profile_id: 'usr-admin-1',
    role_id: 'mock-role-admin',
    scope_type: scopeType,
    branch_id: branchId,
    district_id: districtId,
    assigned_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    is_active: true,
    ...overrides
  });
  const signIn = await supabase.auth.signInWithPassword({
    email: 'admin@faithconnect.church',
    password: 'password123'
  });
  expect(signIn.error).toBeNull();
}

describe('mock role-assignment scope enforcement', () => {
  test('branch-scoped managers cannot create or deactivate district assignments', async () => {
    await setActorAssignment('branch', 'branch-1', null);

    const branchAssignment = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'usr-pastor-1',
      p_role_id: 'mock-role-leader',
      p_scope_type: 'branch',
      p_branch_id: 'branch-1',
      p_district_id: null
    });
    expect(branchAssignment.error).toBeNull();

    const districtAssignment = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'usr-pastor-1',
      p_role_id: 'mock-role-pastor',
      p_scope_type: 'district',
      p_branch_id: null,
      p_district_id: 'dist-1'
    });
    expect(districtAssignment.error?.code).toBe('42501');

    await supabase.from('profile_role_assignments').insert({
      id: 'target-district-assignment',
      profile_id: 'usr-pastor-1',
      role_id: 'mock-role-pastor',
      scope_type: 'district',
      branch_id: null,
      district_id: 'dist-1',
      assigned_at: '2026-01-01T00:00:00.000Z',
      expires_at: null,
      is_active: true
    });

    const deactivate = await supabase.rpc('deactivate_profile_role_assignment', {
      p_assignment_id: 'target-district-assignment'
    });
    expect(deactivate.error?.code).toBe('42501');

    const stillActive = await supabase.from('profile_role_assignments')
      .select('*').eq('id', 'target-district-assignment').single();
    expect(stillActive.data?.is_active).toBe(true);
  });

  test('district-scoped managers can manage their district but not another district', async () => {
    await setActorAssignment('district', null, 'dist-1');

    const districtAssignment = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'usr-pastor-1',
      p_role_id: 'mock-role-pastor',
      p_scope_type: 'district',
      p_branch_id: null,
      p_district_id: 'dist-1'
    });
    expect(districtAssignment.error).toBeNull();

    const branchAssignment = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'usr-pastor-1',
      p_role_id: 'mock-role-leader',
      p_scope_type: 'branch',
      p_branch_id: 'branch-2',
      p_district_id: null
    });
    expect(branchAssignment.error).toBeNull();

    const outsideDistrict = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'usr-pastor-1',
      p_role_id: 'mock-role-pastor',
      p_scope_type: 'district',
      p_branch_id: null,
      p_district_id: 'dist-2'
    });
    expect(outsideDistrict.error?.code).toBe('42501');

    const deactivated = await supabase.rpc('deactivate_profile_role_assignment', {
      p_assignment_id: districtAssignment.data.id
    });
    expect(deactivated.data).toBe(true);
  });

  test('church-scoped managers can manage district assignments church-wide', async () => {
    await setActorAssignment('church', null, null);

    const result = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'usr-pastor-1',
      p_role_id: 'mock-role-pastor',
      p_scope_type: 'district',
      p_branch_id: null,
      p_district_id: 'dist-2'
    });
    expect(result.error).toBeNull();
  });

  test('inactive, expired, and future-dated actor assignments fail closed', async () => {
    await setActorAssignment('district', null, 'dist-1', { is_active: false });
    const inactive = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'usr-pastor-1',
      p_role_id: 'mock-role-pastor',
      p_scope_type: 'district',
      p_district_id: 'dist-1'
    });
    expect(inactive.error?.code).toBe('42501');

    await setActorAssignment('district', null, 'dist-1', {
      expires_at: '2026-01-01T00:00:00.000Z'
    });
    const expired = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'usr-pastor-1',
      p_role_id: 'mock-role-pastor',
      p_scope_type: 'district',
      p_district_id: 'dist-1'
    });
    expect(expired.error?.code).toBe('42501');

    await setActorAssignment('district', null, 'dist-1', {
      assigned_at: '2999-01-01T00:00:00.000Z'
    });
    const future = await supabase.rpc('assign_profile_role', {
      p_profile_id: 'usr-pastor-1',
      p_role_id: 'mock-role-pastor',
      p_scope_type: 'district',
      p_district_id: 'dist-1'
    });
    expect(future.error?.code).toBe('42501');
  });
});

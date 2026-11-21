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
const { loadPermissionResolution } = await import('./permissionResolutionService');
const { updateRolePermissions } = await import('./profileRoleAssignmentService');

beforeEach(() => {
  memoryStorage.clear();
});

async function signInAsActor(scopeType: 'church' | 'district' | 'branch', branchId: string | null = null, districtId: string | null = null) {
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
    is_active: true
  });
  const signIn = await supabase.auth.signInWithPassword({
    email: 'admin@faithconnect.church',
    password: 'password123'
  });
  expect(signIn.error).toBeNull();
}

describe('customizable role permissions', () => {
  test('church-wide manage_roles admin can add and remove role permissions persistently across reloads', async () => {
    await signInAsActor('church');

    const { data: allPermissions } = await supabase.from('permissions').select('*');
    const permByKey = new Map((allPermissions || []).map((p: any) => [p.key, p.id]));
    const viewFinancesId = permByKey.get('view_finances');
    const manageFinancesId = permByKey.get('manage_finances');
    const manageEventsId = permByKey.get('manage_events');
    expect(viewFinancesId).toBeTruthy();
    expect(manageFinancesId).toBeTruthy();
    expect(manageEventsId).toBeTruthy();

    // Pastor starts with manage_events and view_finances, but without manage_finances
    const beforePastor = await loadPermissionResolution('usr-pastor-1', 'branch-1');
    expect(beforePastor.permissions).toContain('manage_events');
    expect(beforePastor.permissions).toContain('view_finances');
    expect(beforePastor.permissions).not.toContain('manage_finances');

    // Remove manage_events and add manage_finances for pastor role
    const { data: currentPastorLinks } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role_id', 'mock-role-pastor');
    const updatedIds = [
      ...(currentPastorLinks || [])
        .map((link: any) => link.permission_id)
        .filter((id: string) => id !== manageEventsId),
      manageFinancesId
    ];

    const saved = await updateRolePermissions('mock-role-pastor', updatedIds);
    expect(saved.some(link => link.permission_id === manageFinancesId)).toBe(true);
    expect(saved.some(link => link.permission_id === manageEventsId)).toBe(false);

    // Effective permissions for pastor update immediately
    const afterPastor = await loadPermissionResolution('usr-pastor-1', 'branch-1');
    expect(afterPastor.permissions).toContain('manage_finances');
    expect(afterPastor.permissions).not.toContain('manage_events');

    // Simulating a subsequent query / DB reload must NOT restore removed seed permissions
    const { data: reloadedPastorLinks } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role_id', 'mock-role-pastor');
    const reloadedIds = (reloadedPastorLinks || []).map((link: any) => link.permission_id);
    expect(reloadedIds).toContain(manageFinancesId);
    expect(reloadedIds).not.toContain(manageEventsId);
  });

  test('branch and district scoped managers cannot customize global role permissions', async () => {
    await signInAsActor('branch', 'branch-1', null);
    const branchAttempt = await supabase.rpc('update_role_permissions', {
      p_role_id: 'mock-role-member',
      p_permission_ids: ['mock-perm-view-events']
    });
    expect(branchAttempt.error?.code).toBe('42501');

    await signInAsActor('district', null, 'dist-1');
    const districtAttempt = await supabase.rpc('update_role_permissions', {
      p_role_id: 'mock-role-member',
      p_permission_ids: ['mock-perm-view-events']
    });
    expect(districtAttempt.error?.code).toBe('42501');
  });

  test('super_admin must retain manage_roles permission', async () => {
    await signInAsActor('church');
    const attempt = await supabase.rpc('update_role_permissions', {
      p_role_id: 'mock-role-super-admin',
      p_permission_ids: ['mock-perm-view-members']
    });
    expect(attempt.error?.code).toBe('42501');
    expect(attempt.error?.message).toContain('manage_roles');
  });
});

import { describe, expect, test } from 'bun:test';
import {
  hasEffectivePermission,
  resolveEffectivePermissions,
  type PermissionResolutionInput
} from './permissionResolutionService';

const NOW = new Date('2026-11-16T12:00:00.000Z');

function fixture(overrides: Partial<PermissionResolutionInput> = {}): PermissionResolutionInput {
  return {
    profileId: 'profile-a',
    branchId: 'branch-a',
    now: NOW,
    assignments: [
      {
        id: 'church-assignment',
        profile_id: 'profile-a',
        role_id: 'role-church',
        scope_type: 'church',
        branch_id: null,
        district_id: null,
        assigned_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
        is_active: true
      },
      {
        id: 'branch-assignment',
        profile_id: 'profile-a',
        role_id: 'role-branch',
        scope_type: 'branch',
        branch_id: 'branch-a',
        district_id: null,
        assigned_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
        is_active: true
      },
      {
        id: 'district-assignment',
        profile_id: 'profile-a',
        role_id: 'role-district',
        scope_type: 'district',
        branch_id: null,
        district_id: 'district-a',
        assigned_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
        is_active: true
      },
      {
        id: 'inactive-assignment',
        profile_id: 'profile-a',
        role_id: 'role-inactive',
        scope_type: 'church',
        branch_id: null,
        district_id: null,
        assigned_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
        is_active: false
      },
      {
        id: 'expired-assignment',
        profile_id: 'profile-a',
        role_id: 'role-expired',
        scope_type: 'church',
        branch_id: null,
        district_id: null,
        assigned_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-11-16T11:59:59.000Z',
        is_active: true
      },
      {
        id: 'other-profile-assignment',
        profile_id: 'profile-b',
        role_id: 'role-other',
        scope_type: 'church',
        branch_id: null,
        district_id: null,
        assigned_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
        is_active: true
      }
    ],
    roles: [
      { id: 'role-church', is_active: true },
      { id: 'role-branch', is_active: true },
      { id: 'role-district', is_active: true },
      { id: 'role-inactive', is_active: true },
      { id: 'role-expired', is_active: true },
      { id: 'role-other', is_active: true }
    ],
    permissions: [
      { id: 'perm-read', key: 'view_members' },
      { id: 'perm-manage', key: 'manage_members' },
      { id: 'perm-finance', key: 'manage_finances' }
    ],
    rolePermissions: [
      { role_id: 'role-church', permission_id: 'perm-read' },
      { role_id: 'role-branch', permission_id: 'perm-manage' },
      { role_id: 'role-district', permission_id: 'perm-finance' },
      { role_id: 'role-inactive', permission_id: 'perm-finance' },
      { role_id: 'role-expired', permission_id: 'perm-finance' },
      { role_id: 'role-other', permission_id: 'perm-finance' }
    ],
    branches: [
      { id: 'branch-a', district_id: 'district-a' },
      { id: 'branch-b', district_id: 'district-b' }
    ],
    ...overrides
  };
}

describe('database-backed permission resolution', () => {
  test('combines church, matching branch, and matching district grants', () => {
    const result = resolveEffectivePermissions(fixture());
    expect(result.permissions).toEqual(['manage_finances', 'manage_members', 'view_members']);
    expect(result.assignmentIds).toEqual(['church-assignment', 'branch-assignment', 'district-assignment']);
  });

  test('does not apply branch or district grants to a different branch', () => {
    const result = resolveEffectivePermissions(fixture({ branchId: 'branch-b' }));
    expect(result.permissions).toEqual(['view_members']);
    expect(result.assignmentIds).toEqual(['church-assignment']);
  });

  test('does not apply district or branch grants without a branch context', () => {
    const result = resolveEffectivePermissions(fixture({ branchId: null }));
    expect(result.permissions).toEqual(['view_members']);
  });

  test('excludes inactive, expired, future-dated, and other-profile assignments', () => {
    const data = fixture();
    data.assignments.push({
      id: 'future-assignment',
      profile_id: 'profile-a',
      role_id: 'role-future',
      scope_type: 'church',
      branch_id: null,
      district_id: null,
      assigned_at: '2026-11-16T12:00:01.000Z',
      expires_at: null,
      is_active: true
    });
    data.roles.push({ id: 'role-future', is_active: true });
    data.rolePermissions.push({ role_id: 'role-future', permission_id: 'perm-finance' });

    const result = resolveEffectivePermissions(data);
    // manage_finances remains granted by the valid district assignment.
    expect(result.permissions).toContain('manage_finances');
    expect(result.assignmentIds).not.toContain('inactive-assignment');
    expect(result.assignmentIds).not.toContain('expired-assignment');
    expect(result.assignmentIds).not.toContain('other-profile-assignment');
    expect(result.assignmentIds).not.toContain('future-assignment');
  });

  test('ignores assignments whose role is inactive', () => {
    const data = fixture();
    data.roles = data.roles.map(role => role.id === 'role-branch' ? { ...role, is_active: false } : role);
    const result = resolveEffectivePermissions(data);
    expect(result.permissions).not.toContain('manage_members');
  });

  test('fails closed for a malformed scoped assignment', () => {
    const data = fixture();
    data.assignments.push({
      id: 'malformed',
      profile_id: 'profile-a',
      role_id: 'role-branch',
      scope_type: 'branch',
      branch_id: null,
      district_id: null,
      assigned_at: '2026-01-01T00:00:00.000Z',
      expires_at: null,
      is_active: true
    });
    expect(resolveEffectivePermissions(data).assignmentIds).not.toContain('malformed');
  });

  test('permission checks fail closed when no resolution is available', () => {
    expect(hasEffectivePermission(null, 'manage_roles')).toBe(false);
    expect(hasEffectivePermission({ permissions: ['view_members'], assignmentIds: [] }, 'manage_roles')).toBe(false);
  });
});

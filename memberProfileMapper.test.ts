import { describe, expect, test } from 'bun:test';
import {
  mapCanonicalProfileToProfile,
  mapProfileInputToCanonicalInsert,
  mapProfileInputToCanonicalUpdate
} from './memberProfileMapper';
import type { CanonicalProfileRow } from './memberProfileMapper';

const baseRow: CanonicalProfileRow = {
  id: 'ea787874-ac3e-4399-8f83-80547d286844',
  auth_user_id: null,
  avatar_url: null,
  baptism_date: null,
  baptized_by_name_snapshot: null,
  baptized_by_profile_id: null,
  branch_id: null,
  created_at: '2026-11-16T10:00:00.000Z',
  date_of_birth: null,
  email: null,
  first_name: 'Kadiatu',
  gender: 'female',
  is_baptized: false,
  last_name: 'Sesay',
  marital_status: null,
  marriage_date: null,
  membership_date: '2026-11-16',
  membership_status: 'active',
  phone: null,
  portal_access_status: 'not_invited',
  record_status: 'active',
  updated_at: '2026-11-16T10:00:00.000Z'
};

describe('canonical member profile mapping', () => {
  test('maps a member without portal access without inventing an auth link', () => {
    const profile = mapCanonicalProfileToProfile(baseRow);
    expect(profile.id).toBe(baseRow.id);
    expect(profile.auth_user_id).toBeNull();
    expect(profile.branch_id).toBeNull();
    expect(profile.email).toBe('');
    expect(profile.portal_access_status).toBe('not_invited');
    expect(profile.status).toBeUndefined();
    expect(profile.primary_role).toBe('member');
    expect(profile.membership_status).toBe('active');
  });

  test('maps an invited or active portal lifecycle independently from membership', () => {
    const invited = mapCanonicalProfileToProfile({
      ...baseRow,
      portal_access_status: 'invited',
      membership_status: 'inactive'
    });
    expect(invited.portal_access_status).toBe('invited');
    expect(invited.status).toBeUndefined();
    expect(invited.membership_status).toBe('inactive');

    const active = mapCanonicalProfileToProfile({
      ...baseRow,
      auth_user_id: 'auth-user-uuid',
      portal_access_status: 'active'
    });
    expect(active.auth_user_id).toBe('auth-user-uuid');
    expect(active.status).toBe('active');
  });

  test('creates canonical insert payload with nullable optional fields and no legacy role columns', () => {
    const payload = mapProfileInputToCanonicalInsert({
      first_name: '  Mariama ',
      last_name: 'Koroma',
      email: '  MARIAMA@EXAMPLE.ORG ',
      phone: ' +23276000000 '
    });
    expect(payload.email).toBe('mariama@example.org');
    expect(payload.phone).toBe('+23276000000');
    expect(payload.branch_id).toBeNull();
    expect(payload.auth_user_id).toBeNull();
    expect(payload.portal_access_status).toBe('not_invited');
    expect('primary_role' in payload).toBe(false);
    expect('status' in payload).toBe(false);
    expect('department_name' in payload).toBe(false);
  });

  test('whitelists profile updates and excludes authentication and role assignment fields', () => {
    const update = mapProfileInputToCanonicalUpdate({
      first_name: 'Updated',
      membership_status: 'suspended'
    });
    expect(update.first_name).toBe('Updated');
    expect(update.membership_status).toBe('suspended');
    expect('auth_user_id' in update).toBe(false);
    expect('portal_access_status' in update).toBe(false);
    expect('primary_role' in update).toBe(false);
    expect('branch_id' in update).toBe(false);
  });
});

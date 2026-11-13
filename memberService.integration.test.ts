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

const {
  getMembers,
  hasPortalAccess,
  registerUnifiedMember,
  updateUnifiedMember,
  updateMembershipStatus,
  updatePortalAccountStatus,
  enablePortalAccess,
  disablePortalAccess
} = await import('./memberService');
const { supabase } = await import('./supabaseClient');

beforeEach(() => {
  memoryStorage.clear();
});

describe('Unified canonical Member Directory (profiles)', () => {
  test('registers a directory-only member without email or portal auth user', async () => {
    const before = await getMembers();
    const result = await registerUnifiedMember({
      first_name: 'Kadiatu',
      last_name: 'Sesay',
      branch_id: 'branch-1',
      membership_date: '2026-11-12',
      gender: 'female',
      phone: '+23276000001',
      is_baptized: true,
      baptism_date: '2022-04-10',
      enable_portal_access: false
    });

    expect(result.portalInvite).toBeUndefined();
    expect(result.profile.auth_user_id ?? null).toBeNull();
    expect(hasPortalAccess(result.profile)).toBe(false);
    expect(result.profile.membership_status).toBe('active');
    expect(result.profile.membership_date).toBe('2026-11-12');
    expect(result.profile.is_baptized).toBe(true);
    expect((await getMembers()).length).toBe(before.length + 1);

    const rawUsers = JSON.parse(memoryStorage.getItem('faithconnect_auth_users_v2') || '{}');
    expect(Object.values(rawUsers).some((u: any) => u.id === result.profile.id)).toBe(false);
  });

  test('provisions optional portal access via setup token without storing passwords on profiles', async () => {
    await expect(registerUnifiedMember({
      first_name: 'Samuel',
      last_name: 'Bangura',
      branch_id: 'branch-1',
      membership_date: '2026-11-12',
      enable_portal_access: true
    })).rejects.toThrow('A valid email address is required when Portal Access is enabled.');

    const result = await registerUnifiedMember({
      first_name: 'Samuel',
      last_name: 'Bangura',
      branch_id: 'branch-1',
      membership_date: '2026-11-12',
      email: '  SAMUEL.BANGURA@Example.ORG  ',
      primary_role: 'leader',
      enable_portal_access: true
    });

    expect(result.portalInvite).toBeDefined();
    expect(result.profile.auth_user_id).toBe(result.portalInvite?.authUserId);
    expect(result.profile.email).toBe('samuel.bangura@example.org');
    expect(result.profile.primary_role).toBe('leader');
    expect(hasPortalAccess(result.profile)).toBe(true);

    const rawDb = JSON.parse(memoryStorage.getItem('faithconnect_db_v2') || '{}');
    const savedRow = rawDb.profiles.find((p: any) => p.id === result.profile.id);
    expect(savedRow.temporary_password).toBeUndefined();
    expect(savedRow.login_email).toBeUndefined();
    expect(savedRow.has_login_credentials).toBeUndefined();

    // Cannot sign in until the activation setup link is completed
    const preActivationSignIn = await supabase.auth.signInWithPassword({
      email: 'samuel.bangura@example.org',
      password: 'AnyPassword123!'
    });
    expect(preActivationSignIn.error?.message).toContain('Portal invitation pending activation');

    // Complete password setup and sign in cleanly
    const activation = await supabase.auth.completePasswordSetup({
      email: result.portalInvite!.email,
      setupToken: result.portalInvite!.setupToken,
      newPassword: 'MyNewPassword123!'
    });
    expect(activation.error).toBeNull();
    expect(activation.data.user?.id).toBe(result.profile.auth_user_id);

    await supabase.auth.signOut();
    const postActivationSignIn = await supabase.auth.signInWithPassword({
      email: 'samuel.bangura@example.org',
      password: 'MyNewPassword123!'
    });
    expect(postActivationSignIn.error).toBeNull();
    expect(postActivationSignIn.data.user?.id).toBe(result.profile.auth_user_id);
  });

  test('rejects unknown-email sign-in without creating an auth user or person', async () => {
    const beforeMembers = await getMembers();
    const beforeUsers = JSON.parse(memoryStorage.getItem('faithconnect_auth_users_v2') || '{}');

    const result = await supabase.auth.signInWithPassword({
      email: 'unknown.person@example.org',
      password: 'AnyPassword123!'
    });

    expect(result.error?.message).toContain('Invalid login credentials');
    expect(result.data.user).toBeNull();
    expect((await getMembers()).length).toBe(beforeMembers.length);
    expect(JSON.parse(memoryStorage.getItem('faithconnect_auth_users_v2') || '{}')).toEqual(beforeUsers);
  });

  test('does not allow sign-up to claim an existing unlinked directory person by email', async () => {
    const person = await registerUnifiedMember({
      first_name: 'Hawa',
      last_name: 'Kamara',
      branch_id: 'branch-1',
      membership_date: '2026-11-13',
      email: 'hawa.kamara@example.org',
      enable_portal_access: false
    });

    const result = await supabase.auth.signUp({
      email: 'hawa.kamara@example.org',
      password: 'NewPassword123!',
      options: { data: { first_name: 'Impostor', last_name: 'Account' } }
    });

    expect(result.error?.message).toContain('ask a church administrator');
    expect(result.data.user).toBeNull();
    const after = (await getMembers()).find(p => p.id === person.profile.id);
    expect(after?.auth_user_id ?? null).toBeNull();
    expect(after?.first_name).toBe('Hawa');
  });

  test('sign-up with an already registered auth email does not authenticate as that user', async () => {
    const created = await registerUnifiedMember({
      first_name: 'Musa',
      last_name: 'Conteh',
      branch_id: 'branch-1',
      membership_date: '2026-11-13',
      email: 'musa.conteh@example.org',
      enable_portal_access: true
    });
    await supabase.auth.completePasswordSetup({
      email: created.portalInvite!.email,
      setupToken: created.portalInvite!.setupToken,
      newPassword: 'OriginalPassword123!'
    });
    await supabase.auth.signOut();

    const result = await supabase.auth.signUp({
      email: 'musa.conteh@example.org',
      password: 'AttackerPassword123!'
    });

    expect(result.error?.message).toContain('already exists');
    expect(result.data.user).toBeNull();
    expect((await supabase.auth.getSession()).data.session).toBeNull();
  });

  test('enforces unique non-null auth_user_id across profiles', async () => {
    const first = await registerUnifiedMember({
      first_name: 'Joseph',
      last_name: 'Turay',
      branch_id: 'branch-1',
      membership_date: '2026-11-12',
      email: 'joseph.turay@example.org',
      enable_portal_access: true
    });

    const duplicateInsert = await supabase.from('profiles').insert({
      id: 'per-duplicate-auth',
      auth_user_id: first.profile.auth_user_id,
      branch_id: 'branch-1',
      first_name: 'Other',
      last_name: 'Person',
      email: 'other.person@example.org',
      phone: '',
      primary_role: 'member',
      status: 'active',
      membership_status: 'active',
      created_at: new Date().toISOString()
    });
    expect(duplicateInsert.error?.code).toBe('23505');
  });

  test('enabling and revoking portal access clears auth_user_id without deleting church membership', async () => {
    const created = await registerUnifiedMember({
      first_name: 'Mariama',
      last_name: 'Koroma',
      branch_id: 'branch-1',
      membership_date: '2026-11-12',
      email: 'mariama.koroma@example.org',
      enable_portal_access: false
    });
    expect(hasPortalAccess(created.profile)).toBe(false);

    const enabled = await enablePortalAccess(created.profile.id);
    expect(hasPortalAccess(enabled.profile)).toBe(true);
    expect(enabled.portalInvite?.authUserId).toBeTruthy();

    const afterDisable = await disablePortalAccess(created.profile.id);
    expect(afterDisable.id).toBe(created.profile.id);
    expect(afterDisable.auth_user_id ?? null).toBeNull();
    expect(afterDisable.membership_status).toBe('active');

    // Re-enable then delete auth user directly via supabase.auth.deleteUser
    const reEnabled = await enablePortalAccess(created.profile.id);
    const authId = reEnabled.profile.auth_user_id!;
    await supabase.auth.deleteUser({ id: authId });

    const { data: persisted } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', created.profile.id)
      .single();
    expect(persisted).toBeTruthy();
    expect(persisted.auth_user_id ?? null).toBeNull();
    expect(persisted.membership_status).toBe('active');
  });

  test('keeps membership lifecycle and portal-account lifecycle independent', async () => {
    const created = await registerUnifiedMember({
      first_name: 'Aminata',
      last_name: 'Bangura',
      branch_id: 'branch-1',
      membership_date: '2025-03-01',
      email: 'aminata.bangura@example.org',
      enable_portal_access: true
    });

    await supabase.auth.completePasswordSetup({
      email: created.portalInvite!.email,
      setupToken: created.portalInvite!.setupToken,
      newPassword: 'Password123!'
    });
    await supabase.auth.signOut();

    // Suspend portal account: sign-in is blocked, membership stays active
    const suspendedPortal = await updatePortalAccountStatus(created.profile.id, 'suspended');
    expect(suspendedPortal.status).toBe('suspended');
    expect(suspendedPortal.membership_status).toBe('active');
    expect(suspendedPortal.auth_user_id).toBe(created.profile.auth_user_id);

    const blockedSignIn = await supabase.auth.signInWithPassword({
      email: 'aminata.bangura@example.org',
      password: 'Password123!'
    });
    expect(blockedSignIn.error?.message).toContain('suspended or archived');

    // Restore portal account, then mark church membership inactive: portal link stays intact
    await updatePortalAccountStatus(created.profile.id, 'active');
    const inactiveMember = await updateMembershipStatus(created.profile.id, 'inactive');
    expect(inactiveMember.membership_status).toBe('inactive');
    expect(inactiveMember.status).toBe('active');
    expect(inactiveMember.auth_user_id).toBe(created.profile.auth_user_id);
  });

  test('validates names, branch, dates, enums, duplicate contacts, and email normalization', async () => {
    await expect(registerUnifiedMember({
      first_name: ' ',
      last_name: 'Sesay',
      branch_id: 'branch-1',
      membership_date: '2026-11-12'
    })).rejects.toThrow('First name and last name are required.');

    await expect(registerUnifiedMember({
      first_name: 'Kadiatu',
      last_name: 'Sesay',
      branch_id: 'missing-branch',
      membership_date: '2026-11-12'
    })).rejects.toThrow('The selected branch does not exist.');

    await expect(registerUnifiedMember({
      first_name: 'Kadiatu',
      last_name: 'Sesay',
      branch_id: 'branch-1',
      membership_date: '2026-02-30'
    })).rejects.toThrow('A valid membership date is required (YYYY-MM-DD).');

    const base = {
      first_name: 'Ibrahim',
      last_name: 'Kamara',
      branch_id: 'branch-1',
      membership_date: '2026-11-12'
    };
    await expect(registerUnifiedMember({ ...base, date_of_birth: '2026-02-30' }))
      .rejects.toThrow('Date of birth must be a valid date in YYYY-MM-DD format.');
    await expect(registerUnifiedMember({ ...base, date_of_birth: '2999-01-01' }))
      .rejects.toThrow('Date of birth cannot be in the future.');
    await expect(registerUnifiedMember({ ...base, baptism_date: 'not-a-date' }))
      .rejects.toThrow('Baptism date must be a valid date in YYYY-MM-DD format.');
    await expect(registerUnifiedMember({ ...base, is_baptized: false, baptism_date: '2020-01-01' }))
      .rejects.toThrow('A baptism date cannot be set when the member is not baptized.');
    await expect(registerUnifiedMember({ ...base, gender: 'unknown' as any }))
      .rejects.toThrow('Invalid gender value.');
    await expect(registerUnifiedMember({ ...base, marital_status: 'Complicated' as any }))
      .rejects.toThrow('Invalid marital status.');
    await expect(registerUnifiedMember({ ...base, email: 'not-an-email' }))
      .rejects.toThrow('Enter a valid email address.');

    const saved = await registerUnifiedMember({
      ...base,
      email: '  Ibrahim.Kamara@Example.ORG  ',
      phone: '+23277000123'
    });
    expect(saved.profile.email).toBe('ibrahim.kamara@example.org');

    await expect(registerUnifiedMember({
      ...base,
      first_name: 'Duplicate',
      email: 'ibrahim.kamara@example.org'
    })).rejects.toThrow('already registered');

    await expect(updateUnifiedMember(saved.profile.id, {
      first_name: 'Ibrahim',
      last_name: 'Kamara',
      membership_date: '2026-02-30'
    })).rejects.toThrow('A valid membership date is required (YYYY-MM-DD).');
  });

  test('migrates legacy members table and strips temporary_password cleanly on load', async () => {
    memoryStorage.setItem('faithconnect_db_v2', JSON.stringify({
      church_branches: [{ id: 'branch-1', name: 'Grace Cathedral' }],
      profiles: [{
        id: 'usr-member-1',
        branch_id: 'branch-1',
        first_name: 'Grace',
        last_name: 'Campbell',
        email: 'member@faithconnect.church',
        phone: '+1 (555) 456-7890',
        primary_role: 'member',
        temporary_password: 'legacy-plaintext-password',
        login_email: 'member@faithconnect.church',
        has_login_credentials: true,
        created_at: '2026-01-01T00:00:00.000Z'
      }],
      members: [
        {
          id: 'mem-5',
          profile_id: 'usr-member-1',
          branch_id: 'branch-1',
          first_name: 'Grace',
          last_name: 'Campbell',
          gender: 'female',
          status: 'active',
          membership_date: '2024-02-15',
          is_baptized: true,
          baptism_date: '2022-10-17'
        },
        {
          id: 'mem-standalone-legacy',
          profile_id: null,
          branch_id: 'branch-1',
          first_name: 'Legacy',
          last_name: 'Standalone',
          gender: 'male',
          status: 'inactive',
          membership_date: '2025-05-01',
          email: '',
          phone: '+23279000999'
        }
      ],
      member_transfers: [{ id: 'tr-legacy', member_id: 'mem-5', from_branch_id: 'branch-1', to_branch_id: 'branch-2', status: 'pending' }],
      event_registrations: [{ id: 'reg-legacy', event_id: 'evt-1', member_id: 'mem-5', member_name: 'Grace Campbell', email: 'member@faithconnect.church', status: 'confirmed' }]
    }));

    const members = await getMembers();
    const linked = members.find(p => p.id === 'usr-member-1');
    const standalone = members.find(p => p.id === 'mem-standalone-legacy');

    expect(linked).toBeDefined();
    expect(linked?.auth_user_id).toBe('usr-member-1');
    expect(linked?.membership_date).toBe('2024-02-15');
    expect((linked as any).temporary_password).toBeUndefined();
    expect((linked as any).login_email).toBeUndefined();

    expect(standalone).toBeDefined();
    expect(standalone?.auth_user_id ?? null).toBeNull();
    expect(standalone?.membership_status).toBe('inactive');

    const { data: transfers } = await supabase.from('member_transfers').select('*').eq('id', 'tr-legacy');
    expect(transfers?.[0]?.member_id).toBe('usr-member-1');

    const { data: regs } = await supabase.from('event_registrations').select('*').eq('id', 'reg-legacy');
    expect(regs?.[0]?.member_id).toBe('usr-member-1');

    const migratedDb = JSON.parse(memoryStorage.getItem('faithconnect_db_v2') || '{}');
    expect(migratedDb.members).toBeUndefined();
  });
});

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

const { ensureLinkedMemberRecord, getMembers, registerChurchMember, updateChurchMemberRecord, updateLinkedMemberDetails } = await import('./memberService');

beforeEach(() => {
  memoryStorage.clear();
});

describe('Membership record integration', () => {
  test('creates a membership record linked to an existing portal profile', async () => {
    const member = await ensureLinkedMemberRecord({
      id: 'usr-new-member',
      branch_id: 'branch-1',
      first_name: 'Ada',
      last_name: 'Kamara',
      email: 'ada@example.org',
      phone: '+232000000',
      primary_role: 'member',
      created_at: new Date().toISOString(),
      is_baptized: true,
      baptism_date: '2024-05-12'
    }, 'female');

    expect(member.profile_id).toBe('usr-new-member');
    expect(member.branch_id).toBe('branch-1');
    expect(member.gender).toBe('female');
    expect(member.status).toBe('active');
    expect(member.is_baptized).toBe(true);
    expect((await getMembers()).some(row => row.id === member.id)).toBe(true);
  });

  test('is idempotent and does not create duplicate membership rows for one profile', async () => {
    const profile = {
      id: 'usr-idempotent',
      branch_id: 'branch-1',
      first_name: 'John',
      last_name: 'Conteh',
      email: 'john@example.org',
      phone: '',
      primary_role: 'member' as const,
      created_at: new Date().toISOString()
    };

    const first = await ensureLinkedMemberRecord(profile);
    const second = await ensureLinkedMemberRecord({ ...profile, first_name: 'Jonathan' });

    expect(second.id).toBe(first.id);
    expect(second.first_name).toBe('Jonathan');
    expect((await getMembers()).filter(row => row.profile_id === profile.id)).toHaveLength(1);
  });

  test('updates shared profile details without changing membership status', async () => {
    await ensureLinkedMemberRecord({
      id: 'usr-update',
      branch_id: 'branch-1',
      first_name: 'Mary',
      last_name: 'Koroma',
      email: 'mary@example.org',
      phone: '',
      primary_role: 'member',
      created_at: new Date().toISOString()
    });

    await updateLinkedMemberDetails('usr-update', {
      first_name: 'Maryam',
      last_name: 'Koroma',
      email: 'maryam@example.org',
      phone: '+232111111'
    });

    const member = (await getMembers()).find(row => row.profile_id === 'usr-update');
    expect(member?.first_name).toBe('Maryam');
    expect(member?.email).toBe('maryam@example.org');
    expect(member?.phone).toBe('+232111111');
    expect(member?.status).toBe('active');
  });

  test('rejects incomplete profile identity before writing a membership record', async () => {
    await expect(ensureLinkedMemberRecord({
      id: 'usr-invalid',
      branch_id: 'branch-1',
      first_name: ' ',
      last_name: 'Missing',
      email: '',
      phone: '',
      primary_role: 'member',
      created_at: new Date().toISOString()
    })).rejects.toThrow('First name and last name are required.');

    expect((await getMembers()).some(row => row.profile_id === 'usr-invalid')).toBe(false);
  });
});


describe('Standalone church membership registration', () => {
  test('registers a member without creating a portal profile or login', async () => {
    const beforeMembers = await getMembers();
    const member = await registerChurchMember({
      first_name: 'Kadiatu',
      last_name: 'Sesay',
      branch_id: 'branch-1',
      membership_date: '2026-11-12',
      gender: 'female',
      email: 'kadiatu@example.org',
      phone: '+23276000000',
      is_baptized: true,
      baptism_date: '2022-04-10'
    });

    expect(member.profile_id ?? null).toBeNull();
    expect(member.status).toBe('active');
    expect(member.membership_date).toBe('2026-11-12');
    expect(member.is_baptized).toBe(true);
    expect((await getMembers()).length).toBe(beforeMembers.length + 1);

    const { supabase } = await import('./supabaseClient');
    const { data: profiles } = await supabase.from('profiles').select('*').eq('email', 'kadiatu@example.org');
    expect(profiles).toHaveLength(0);
  });

  test('updates membership details and status without changing portal profile data', async () => {
    const { supabase } = await import('./supabaseClient');
    const profile = {
      id: 'usr-independent-status',
      branch_id: 'branch-1',
      first_name: 'Aminata',
      last_name: 'Bangura',
      email: 'aminata@example.org',
      phone: '',
      primary_role: 'member' as const,
      created_at: new Date().toISOString()
    };
    await supabase.from('profiles').insert(profile);
    const member = await registerChurchMember({
      first_name: 'Aminata',
      last_name: 'Bangura',
      branch_id: 'branch-1',
      membership_date: '2025-03-01',
      profile_id: profile.id
    });

    const updated = await updateChurchMemberRecord(member.id, {
      first_name: 'Aminata',
      last_name: 'Kamara',
      email: 'aminata.kamara@example.org',
      phone: '+23276000000',
      gender: 'female',
      membership_date: '2025-03-02',
      status: 'inactive',
      is_baptized: true,
      baptism_date: '2024-08-10'
    });

    expect(updated.last_name).toBe('Kamara');
    expect(updated.status).toBe('inactive');
    expect(updated.is_baptized).toBe(true);
    const storedMember = (await getMembers()).find(row => row.id === member.id);
    expect(storedMember?.status).toBe('inactive');
    const { data: storedProfile } = await supabase.from('profiles').select('*').eq('id', profile.id).single();
    expect(storedProfile?.status ?? 'active').toBe('active');
    expect(storedProfile?.last_name).toBe('Bangura');
  });

  test('rejects invalid membership updates before writing', async () => {
    const member = await registerChurchMember({
      first_name: 'Ibrahim',
      last_name: 'Sesay',
      branch_id: 'branch-1',
      membership_date: '2026-11-12'
    });
    await expect(updateChurchMemberRecord(member.id, {
      first_name: 'Ibrahim',
      last_name: 'Sesay',
      gender: 'male',
      membership_date: 'invalid',
      status: 'active'
    })).rejects.toThrow('A valid membership date is required (YYYY-MM-DD).');
    await expect(updateChurchMemberRecord(member.id, {
      first_name: 'Ibrahim',
      last_name: 'Sesay',
      gender: 'male',
      membership_date: '2026-02-30',
      status: 'active'
    })).rejects.toThrow('A valid membership date is required (YYYY-MM-DD).');
    await expect(updateChurchMemberRecord(member.id, {
      first_name: ' ',
      last_name: 'Sesay',
      gender: 'male',
      membership_date: '2026-11-12',
      status: 'active'
    })).rejects.toThrow('First name and last name are required.');
    expect((await getMembers()).find(row => row.id === member.id)?.membership_date).toBe('2026-11-12');
  });

  test('requires names, branch and a valid membership date', async () => {
    await expect(registerChurchMember({
      first_name: ' ',
      last_name: 'Sesay',
      branch_id: 'branch-1',
      membership_date: '2026-11-12'
    })).rejects.toThrow('First name and last name are required.');

    await expect(registerChurchMember({
      first_name: 'Kadiatu',
      last_name: 'Sesay',
      branch_id: 'missing-branch',
      membership_date: '2026-11-12'
    })).rejects.toThrow('The selected branch does not exist.');

    await expect(registerChurchMember({
      first_name: 'Kadiatu',
      last_name: 'Sesay',
      branch_id: 'branch-1',
      membership_date: 'not-a-date'
    })).rejects.toThrow('A valid membership date is required (YYYY-MM-DD).');
    await expect(registerChurchMember({
      first_name: 'Kadiatu',
      last_name: 'Sesay',
      branch_id: 'branch-1',
      membership_date: '2026-02-30'
    })).rejects.toThrow('A valid membership date is required (YYYY-MM-DD).');
  });

  test('validates optional dates, member attributes and normalized email addresses', async () => {
    const base = {
      first_name: 'Mariama',
      last_name: 'Kamara',
      branch_id: 'branch-1',
      membership_date: '2026-11-12'
    };
    await expect(registerChurchMember({ ...base, date_of_birth: '2026-02-30' }))
      .rejects.toThrow('Date of birth must be a valid date in YYYY-MM-DD format.');
    await expect(registerChurchMember({ ...base, date_of_birth: '2999-01-01' }))
      .rejects.toThrow('Date of birth cannot be in the future.');
    await expect(registerChurchMember({ ...base, baptism_date: 'not-a-date' }))
      .rejects.toThrow('Baptism date must be a valid date in YYYY-MM-DD format.');
    await expect(registerChurchMember({ ...base, is_baptized: false, baptism_date: '2020-01-01' }))
      .rejects.toThrow('A baptism date cannot be set when the member is not baptized.');
    await expect(registerChurchMember({ ...base, gender: 'unknown' as any }))
      .rejects.toThrow('Invalid gender value.');
    await expect(registerChurchMember({ ...base, marital_status: 'Complicated' as any }))
      .rejects.toThrow('Invalid marital status.');
    await expect(registerChurchMember({ ...base, email: 'not-an-email' }))
      .rejects.toThrow('Enter a valid email address.');

    const normalized = await registerChurchMember({ ...base, email: '  Mariama@Example.ORG  ' });
    expect(normalized.email).toBe('mariama@example.org');
  });

  test('links only an existing same-branch profile and prevents duplicate links', async () => {
    const profile = {
      id: 'usr-explicit-link',
      branch_id: 'branch-1',
      first_name: 'Joseph',
      last_name: 'Turay',
      email: 'joseph@example.org',
      phone: '',
      primary_role: 'member' as const,
      created_at: new Date().toISOString()
    };
    const { supabase } = await import('./supabaseClient');
    await supabase.from('profiles').insert(profile);

    const member = await registerChurchMember({
      first_name: 'Joseph',
      last_name: 'Turay',
      branch_id: 'branch-1',
      membership_date: '2026-11-12',
      profile_id: profile.id
    });
    expect(member.profile_id).toBe(profile.id);

    const duplicateInsert = await supabase.from('members').insert({
      profile_id: profile.id,
      branch_id: 'branch-1',
      first_name: 'Joseph',
      last_name: 'Turay',
      gender: 'male',
      status: 'active',
      membership_date: '2026-11-12'
    });
    expect(duplicateInsert.error?.code).toBe('23505');

    await expect(registerChurchMember({
      first_name: 'Joseph',
      last_name: 'Turay',
      branch_id: 'branch-1',
      membership_date: '2026-11-12',
      profile_id: profile.id
    })).rejects.toThrow('This portal profile is already linked to a membership record.');

    await expect(registerChurchMember({
      first_name: 'Joseph',
      last_name: 'Turay',
      branch_id: 'branch-2',
      membership_date: '2026-11-12',
      profile_id: profile.id
    })).rejects.toThrow('The member and linked portal profile must belong to the same branch.');
  });
});

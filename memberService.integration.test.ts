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

const { ensureLinkedMemberRecord, getMembers, updateLinkedMemberDetails } = await import('./memberService');

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

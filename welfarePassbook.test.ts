import { beforeEach, describe, expect, test } from 'bun:test';

const values = new Map<string, string>();
const memoryStorage = {
  getItem(key: string) {
    return values.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    values.set(key, String(value));
  },
  removeItem(key: string) {
    values.delete(key);
  },
  clear() {
    values.clear();
  },
  key(index: number) {
    return [...values.keys()][index] ?? null;
  },
  get length() {
    return values.size;
  }
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: memoryStorage
});

if (typeof (globalThis as any).window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      dispatchEvent: () => true
    }
  });
}

const {
  getMemberWelfareCard,
  getMemberPassbookDetails,
  getPassbooksForMember,
  matchesWelfareCardSearch,
  buildPassbookCsv,
  sanitizeCsvCell,
  saveMemberContribution,
  saveWelfareCampaign,
  generatePassbookVerificationCode
} = await import('./welfareContributionService');

const DEPT = 'Test Choir Ministry';

beforeEach(() => {
  memoryStorage.clear();
});

describe('Member Digital Welfare Passbook Service', () => {
  test('marks member Good Standing only when current cycle dues meet expected threshold and reciprocity >= 50%', () => {
    // Seed a member who paid welfare only (no monthly dues in current cycle)
    saveMemberContribution({
      id: 'c-welfare-only',
      department_name: DEPT,
      member_id: 'mem-1',
      member_name: 'Alice Kamara',
      welfare_card_number: 'WEL-TCM-2026-EM1',
      category: 'welfare',
      welfare_reason: 'marriage',
      amount: 500,
      currency: 'USD',
      date: '2026-11-05T10:00:00.000Z',
      payment_method: 'mobile_money',
      recorded_by: 'Dept Secretary'
    });

    const pendingCard = getMemberWelfareCard('mem-1', 'Alice Kamara', DEPT, {
      currentCycle: '2026-11',
      expectedMonthlyDues: 200,
      currency: 'USD'
    });

    expect(pendingCard.status).toBe('Dues Pending');
    expect(pendingCard.total_welfare_paid).toBe(500);
    expect(pendingCard.total_dues_paid).toBe(0);
    expect(pendingCard.current_cycle_dues_paid).toBe(0);
    expect(pendingCard.currency).toBe('USD');

    // Now pay current cycle monthly dues
    saveMemberContribution({
      id: 'c-dues-nov',
      department_name: DEPT,
      member_id: 'mem-1',
      member_name: 'Alice Kamara',
      welfare_card_number: 'WEL-TCM-2026-EM1',
      category: 'monthly_dues',
      period_month_year: '2026-11',
      amount: 200,
      currency: 'USD',
      date: '2026-11-10T10:00:00.000Z',
      payment_method: 'cash',
      recorded_by: 'Dept Treasurer'
    });

    const goodCard = getMemberWelfareCard('mem-1', 'Alice Kamara', DEPT, {
      currentCycle: '2026-11',
      expectedMonthlyDues: 200,
      currency: 'USD'
    });

    expect(goodCard.status).toBe('Good Standing');
    expect(goodCard.current_cycle_dues_paid).toBe(200);
    expect(goodCard.dues_months_paid).toContain('2026-11');
    expect(goodCard.entry_count).toBeGreaterThanOrEqual(2);
    expect(goodCard.verification_code).toMatch(/^FC-PB-[0-9A-F]{8}$/);
  });

  test('marks member Restricted Standing when drive reciprocity falls below 50% even if dues are paid', () => {
    // Seed 3 active campaigns for other beneficiaries; default seed adds 2 campaigns, so clear or seed against custom dept
    saveWelfareCampaign({
      id: 'drive-extra-1',
      department_name: DEPT,
      beneficiary_member_id: 'other-1',
      beneficiary_member_name: 'John Conteh',
      reason: 'burial_bereavement',
      title: 'Bereavement Support Drive',
      expected_amount_per_member: 200,
      target_total_amount: 2000,
      deadline: '2026-11-25',
      status: 'active',
      created_at: '2026-11-01T00:00:00.000Z',
      created_by: 'Leader'
    });

    saveMemberContribution({
      id: 'c-dues-only',
      department_name: DEPT,
      member_id: 'mem-2',
      member_name: 'Peter Mansaray',
      welfare_card_number: 'WEL-TCM-2026-EM2',
      category: 'monthly_dues',
      period_month_year: '2026-11',
      amount: 200,
      currency: 'SLE',
      date: '2026-11-12T10:00:00.000Z',
      payment_method: 'cash',
      recorded_by: 'Dept Treasurer'
    });

    const restrictedCard = getMemberWelfareCard('mem-2', 'Peter Mansaray', DEPT, {
      currentCycle: '2026-11',
      expectedMonthlyDues: 200
    });

    expect(restrictedCard.status).toBe('Restricted Standing');
    expect(restrictedCard.reciprocity_rate).toBe(0);
  });

  test('builds chronological statement, 12-month annual dues matrix, and deterministic seal', () => {
    saveMemberContribution({
      id: 'c-jan',
      department_name: DEPT,
      member_id: 'mem-3',
      member_name: 'Grace Sesay',
      welfare_card_number: 'WEL-TCM-2026-EM3',
      category: 'monthly_dues',
      period_month_year: '2026-01',
      amount: 200,
      currency: 'SLE',
      date: '2026-01-15T10:00:00.000Z',
      payment_method: 'mobile_money',
      transaction_ref: 'MM-101',
      recorded_by: 'Secretary'
    });

    saveMemberContribution({
      id: 'c-feb-partial',
      department_name: DEPT,
      member_id: 'mem-3',
      member_name: 'Grace Sesay',
      welfare_card_number: 'WEL-TCM-2026-EM3',
      category: 'monthly_dues',
      period_month_year: '2026-02',
      amount: 100,
      currency: 'SLE',
      date: '2026-02-15T10:00:00.000Z',
      payment_method: 'cash',
      recorded_by: 'Secretary'
    });

    saveMemberContribution({
      id: 'c-nov-dues',
      department_name: DEPT,
      member_id: 'mem-3',
      member_name: 'Grace Sesay',
      welfare_card_number: 'WEL-TCM-2026-EM3',
      category: 'monthly_dues',
      period_month_year: '2026-11',
      amount: 200,
      currency: 'SLE',
      date: '2026-11-18T10:00:00.000Z',
      payment_method: 'bank_transfer',
      transaction_ref: 'BNK-99',
      recorded_by: 'Treasurer'
    });

    const detail = getMemberPassbookDetails('mem-3', 'Grace Sesay', DEPT, {
      currentCycle: '2026-11',
      expectedMonthlyDues: 200,
      year: 2026
    });

    expect(detail.duesMatrix).toHaveLength(12);
    expect(detail.duesMatrix[0].status).toBe('paid'); // Jan
    expect(detail.duesMatrix[1].status).toBe('partial'); // Feb
    expect(detail.duesMatrix[2].status).toBe('pending'); // Mar
    expect(detail.duesMatrix[10].status).toBe('paid'); // Nov
    expect(detail.duesMatrix[11].status).toBe('upcoming'); // Dec

    // Entries are sorted newest first
    expect(detail.entries[0].id).toBe('c-nov-dues');
    expect(detail.entries[detail.entries.length - 1].id).toBe('c-jan');

    const expectedSeal = generatePassbookVerificationCode(
      detail.card.card_number,
      'mem-3',
      detail.card.total_welfare_paid + detail.card.total_dues_paid + detail.card.total_support_paid,
      detail.entries.length
    );
    expect(detail.card.verification_code).toBe(expectedSeal);
  });

  test('supports searching passbooks by member name, card number, or verification seal', () => {
    const card = getMemberWelfareCard('r-1', 'David Koroma', DEPT, {
      currentCycle: '2026-11'
    });

    expect(matchesWelfareCardSearch('David Koroma', card, 'koroma')).toBe(true);
    expect(matchesWelfareCardSearch('David Koroma', card, card.card_number.toLowerCase())).toBe(true);
    expect(matchesWelfareCardSearch('David Koroma', card, card.verification_code || '')).toBe(true);
    expect(matchesWelfareCardSearch('David Koroma', card, 'WEL-NONEXISTENT-999')).toBe(false);
  });

  test('aggregates unique department passbooks per member and neutralizes CSV formula injection', () => {
    saveMemberContribution({
      id: 'c-formula',
      department_name: DEPT,
      member_id: 'mem-csv',
      member_name: '=CMD("calc")',
      welfare_card_number: 'WEL-TCM-2026-CSV',
      category: 'special_support',
      special_support_purpose: '+SUM(A1:A2)',
      amount: 150,
      currency: 'SLE',
      date: '2026-11-19T12:00:00.000Z',
      payment_method: 'cash',
      transaction_ref: '@evil',
      recorded_by: '-admin',
      notes: '=HYPERLINK("http://bad")'
    });

    const passbooks = getPassbooksForMember({
      id: 'mem-csv',
      name: '=CMD("calc")',
      departmentNames: [DEPT, '  test choir ministry ', 'Ushering Team']
    });

    expect(passbooks).toHaveLength(2);

    const csv = buildPassbookCsv(passbooks[0]);
    expect(csv).toContain(`"'=CMD(""calc"")"`);
    expect(csv).toContain(`"'+SUM(A1:A2)"`);
    expect(csv).toContain(`"'@evil"`);
    expect(csv).toContain(`"'-admin"`);
    expect(sanitizeCsvCell('=1+1')).toBe(`"'=1+1"`);
    expect(sanitizeCsvCell('Normal Note')).toBe(`"Normal Note"`);
  });
});

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

describe('supabaseClient mock finance RPC routing', () => {
  test('routes requisition and event-budget RPCs to mockFinanceRpc instead of failing as unimplemented', async () => {
    const signIn = await supabase.auth.signInWithPassword({
      email: 'admin@faithconnect.church',
      password: 'password123'
    });
    expect(signIn.error).toBeNull();

    const branches = await supabase.from('church_branches').select('id').limit(1);
    const branchId = branches.data?.[0]?.id ?? 'branch-main';

    const routedRpcs: Array<[string, Record<string, unknown>]> = [
      ['get_requisition_approval_configuration', { p_branch_id: branchId }],
      ['save_requisition_approval_policy', { p_branch_id: branchId }],
      ['get_department_requisitions', { p_branch_id: branchId }],
      ['get_department_requisition_submission_options', { p_branch_id: branchId }],
      ['submit_department_requisition', { p_branch_id: branchId }],
      ['decide_department_requisition_approval', {}],
      ['create_department_requisition_payment', {}],
      ['get_department_requisition_payment_summary', { p_branch_id: branchId }],
      ['get_event_budget_submission_options', { p_event_id: 'missing-event' }],
      ['get_my_event_budgets', {}],
      ['get_payment_channel_configuration', { p_scope_type: 'branch', p_scope_id: branchId }],
      ['save_payment_channel', { p_scope_type: 'branch', p_scope_id: branchId, p_channel: {} }],
      ['set_payment_channel_status', { p_channel_id: 'missing-channel', p_is_active: false }],
      ['delete_payment_channel', { p_channel_id: 'missing-channel' }],
      ['get_member_giving_channels', { p_branch_id: branchId }]
    ];

    for (const [fnName, args] of routedRpcs) {
      const result = await supabase.rpc(fnName, args);
      if (result.error) {
        expect(result.error.message).not.toContain('Mock RPC function not implemented');
      }
    }

    const summary = await supabase.rpc('get_department_requisition_payment_summary', { p_branch_id: branchId });
    expect(summary.error).toBeNull();
    expect(Array.isArray(summary.data)).toBe(true);

    const givingChannels = await supabase.rpc('get_member_giving_channels', { p_branch_id: branchId });
    expect(givingChannels.error).toBeNull();
    expect(Array.isArray(givingChannels.data?.channels)).toBe(true);
  });
});

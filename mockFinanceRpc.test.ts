import { describe, expect, test } from 'bun:test';
import { createEmptyMockFinanceState, createMockFinanceRpc, type MockFinanceState } from './mockFinanceRpc';

function fixture() {
  const state: MockFinanceState = {
    ...createEmptyMockFinanceState(),
    profiles: [
      { id: 'creator', auth_user_id: 'user-creator' },
      { id: 'approver-1', auth_user_id: 'user-approver-1' },
      { id: 'approver-2', auth_user_id: 'user-approver-2' }
    ],
    permissions: [
      { profile_id: 'creator', permission: 'manage_finances', branch_id: 'branch-a' },
      { profile_id: 'approver-1', permission: 'approve_finances', branch_id: 'branch-a' },
      { profile_id: 'approver-2', permission: 'approve_finances', branch_id: 'branch-a' }
    ],
    currencies: ['SLL', 'USD'],
    baseCurrencyCode: 'SLL',
    chartAccounts: [
      { id: 'cash-chart', is_active: true, account_type: 'asset' },
      { id: 'income-chart', is_active: true, account_type: 'income' },
      { id: 'expense-chart', is_active: true, account_type: 'expense' }
    ],
    financialAccounts: [
      { id: 'cash-account', branch_id: 'branch-a', currency_code: 'SLL', is_active: true, chart_account_id: 'cash-chart' }
    ],
    funds: [{ id: 'fund-a', is_active: true }],
    periods: [{ id: 'period-a', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open', year_status: 'open' }],
    approvalPolicies: [{
      id: 'policy-a', is_active: true, transaction_type: 'financial_document',
      branch_id: 'branch-a', min_amount: 0.01, max_amount: 1000000,
      approver_profile_ids: ['approver-1', 'approver-2']
    }]
  };
  let current = structuredClone(state);
  let authUserId: string | null = 'user-creator';
  const storage = {
    load: () => structuredClone(current),
    save: (next: MockFinanceState) => { current = structuredClone(next); }
  };
  const rpc = createMockFinanceRpc(storage, () => ({ userId: authUserId }));
  const setUser = (userId: string | null) => { authUserId = userId; };
  const read = () => structuredClone(current);
  return { rpc, setUser, read };
}

const args = {
  p_document_type: 'receipt', p_transaction_date: '2026-06-10', p_branch_id: 'branch-a',
  p_profile_id: null, p_party_name: ' Sunday Service ', p_amount: 250,
  p_currency_code: 'SLL', p_payment_method: 'cash', p_financial_account_id: 'cash-account',
  p_category_account_id: 'income-chart', p_fund_id: 'fund-a',
  p_external_reference: ' RCPT-1 ', p_description: ' Sunday offering ', p_exchange_rate_to_base: 1
};

describe('deterministic mock financial-document RPC', () => {
  test('creates a balanced pending receipt and persists canonical records', async () => {
    const ctx = fixture();
    const result = await ctx.rpc.rpc('create_financial_document_transaction', args);
    expect(result.error).toBeNull();
    expect(result.data.status).toBe('pending_approval');
    const state = ctx.read();
    expect(state.documents).toHaveLength(1);
    expect(state.journals[0].source_type).toBe('financial_document_pending');
    expect(state.documents[0].journal_entry_id).toBeNull();
    expect(state.journalLines.reduce((n, l) => n + l.debit_amount, 0)).toBe(250);
    expect(state.journalLines.reduce((n, l) => n + l.credit_amount, 0)).toBe(250);
    expect(state.journalLines.reduce((n, l) => n + l.base_debit_amount, 0)).toBe(250);
    expect(state.journalLines.reduce((n, l) => n + l.base_credit_amount, 0)).toBe(250);
    expect(state.documents[0].payee_or_payer_name).toBe('Sunday Service');
  });

  test('fails closed for missing approval policy and leaves no partial records', async () => {
    const ctx = fixture();
    const state = ctx.read();
    state.approvalPolicies = [];
    // Replace fixture storage through the adapter's public state contract.
    const isolated = createMockFinanceRpc({
      load: () => structuredClone(state),
      save: () => { throw new Error('unexpected persistence'); }
    }, () => ({ userId: 'user-creator' }));
    const result = await isolated.rpc('create_financial_document_transaction', args);
    expect(result.error?.message).toContain('No active approval policy');
    expect(state.documents).toHaveLength(0);
  });

  test('rejects cross-branch creation without writing data', async () => {
    const ctx = fixture();
    const result = await ctx.rpc.rpc('create_financial_document_transaction', { ...args, p_branch_id: 'branch-b' });
    expect(result.error?.code).toBe('42501');
    expect(ctx.read().documents).toHaveLength(0);
  });

  test('requires an authenticated linked profile', async () => {
    const ctx = fixture();
    ctx.setUser(null);
    const result = await ctx.rpc.rpc('create_financial_document_transaction', args);
    expect(result.error?.code).toBe('42501');
    expect(ctx.read().documents).toHaveLength(0);
  });

  test('requires first approval before second and links journal only after final approval', async () => {
    const ctx = fixture();
    const created = await ctx.rpc.rpc('create_financial_document_transaction', args);
    const steps = ctx.read().approvalSteps;
    ctx.setUser('user-approver-2');
    const outOfOrder = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: steps[1].id, p_decision: 'approved'
    });
    expect(outOfOrder.error).not.toBeNull();

    ctx.setUser('user-approver-1');
    const first = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: steps[0].id, p_decision: 'approved'
    });
    expect(first.data.approval_status).toBe('pending');
    expect(ctx.read().documents[0].journal_entry_id).toBeNull();

    ctx.setUser('user-approver-2');
    const final = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: steps[1].id, p_decision: 'approved'
    });
    expect(final.data.approval_status).toBe('approved');
    expect(ctx.read().documents[0].journal_entry_id).toBe(created.data.journal_entry_id);
    expect(ctx.read().journals[0].source_type).toBe('financial_document');
  });

  test('rejection leaves the journal pending and unlinked', async () => {
    const ctx = fixture();
    await ctx.rpc.rpc('create_financial_document_transaction', args);
    const step = ctx.read().approvalSteps[0];
    ctx.setUser('user-approver-1');
    const result = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: step.id, p_decision: 'rejected', p_comments: 'Not supported'
    });
    expect(result.data.approval_status).toBe('rejected');
    expect(ctx.read().documents[0].status).toBe('rejected');
    expect(ctx.read().documents[0].journal_entry_id).toBeNull();
    expect(ctx.read().journals[0].source_type).toBe('financial_document_pending');
  });

  test('does not post an unapproved pending journal', async () => {
    const ctx = fixture();
    await ctx.rpc.rpc('create_financial_document_transaction', args);
    const journal = ctx.read().journals[0];
    expect(journal.status).toBe('draft');
    expect(journal.source_type).toBe('financial_document_pending');
    // The canonical posting RPC is intentionally not exposed by this adapter.
    const result = await ctx.rpc.rpc('post_journal_entry', { p_journal_entry_id: journal.id });
    expect(result.error?.message).toContain('cannot be posted before approval');
    expect(ctx.read().journals[0].status).toBe('draft');
  });
});

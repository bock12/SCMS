import { describe, expect, test } from 'bun:test';
import { createEmptyMockFinanceState, createMockFinanceRpc, type MockFinanceState } from './mockFinanceRpc';

const eventUuid = '2f2b7e68-7b14-4b93-9f17-2e5c5b18b49a';

function fixture() {
  const state: MockFinanceState = {
    ...createEmptyMockFinanceState(),
    profiles: [
      { id: 'creator', auth_user_id: 'user-creator', status: 'active' },
      { id: 'approver-1', auth_user_id: 'user-approver-1', status: 'active' },
      { id: 'approver-2', auth_user_id: 'user-approver-2', status: 'active' },
      { id: 'event-manager', auth_user_id: 'user-event-manager', status: 'active' }
    ],
    permissions: [
      { profile_id: 'creator', permission: 'manage_finances', branch_id: 'branch-a' },
      { profile_id: 'creator', permission: 'post_journals', branch_id: 'branch-a' },
      { profile_id: 'creator', permission: 'manage_events', branch_id: 'branch-a' },
      { profile_id: 'creator', permission: 'submit_event_budgets', branch_id: 'branch-a' },
      { profile_id: 'event-manager', permission: 'manage_events', branch_id: 'branch-a' },
      { profile_id: 'event-manager', permission: 'submit_event_budgets', branch_id: 'branch-a' },
      { profile_id: 'approver-1', permission: 'approve_finances', branch_id: 'branch-a' },
      { profile_id: 'approver-2', permission: 'approve_finances', branch_id: 'branch-a' }
    ],
    events: [
      { id: eventUuid, branch_id: 'branch-a', title: 'Annual Conference' },
      { id: '8b2b7e68-7b14-4b93-9f17-2e5c5b18b49a', branch_id: 'branch-b', title: 'Other Branch Event' }
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
    funds: [{ id: 'fund-a', is_active: true }, { id: 'fund-b', is_active: true }],
    periods: [{ id: 'period-a', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open', year_status: 'open' }],
    approvalPolicies: [
      {
        id: 'document-policy', is_active: true, transaction_type: 'financial_document',
        branch_id: 'branch-a', min_amount: 0.01, max_amount: 1000000,
        approver_profile_ids: ['approver-1', 'approver-2']
      },
      {
        id: 'budget-policy', is_active: true, transaction_type: 'budget',
        branch_id: 'branch-a', min_amount: 0.01, max_amount: null, version: 1,
        effective_from: '2026-01-01', approver_profile_ids: ['approver-1']
      }
    ],
    approvalPolicyBands: [
      { id: 'budget-band', policy_id: 'budget-policy', min_amount_base: 0, max_amount_base: null }
    ],
    approvalPolicySteps: [
      {
        id: 'budget-step-config', band_id: 'budget-band', step_number: 1,
        required_permission_key: 'approve_finances', required_approvals: 1,
        prohibit_submitter_approval: true, approver_profile_ids: ['approver-1']
      }
    ]
  };
  let current = structuredClone(state);
  let authUserId: string | null = 'user-creator';
  const storage = {
    load: () => structuredClone(current),
    save: (next: MockFinanceState) => { current = structuredClone(next); }
  };
  const rpc = createMockFinanceRpc(storage, () => ({ userId: authUserId }));
  return {
    rpc,
    setUser: (userId: string | null) => { authUserId = userId; },
    read: () => structuredClone(current)
  };
}

const submitArgs = {
  p_event_id: eventUuid,
  p_period_id: 'period-a',
  p_name: 'Annual Conference Budget',
  p_currency_code: 'SLL',
  p_exchange_rate_to_base: 1,
  p_lines: [{ account_id: 'expense-chart', fund_id: 'fund-a', description: 'Venue and logistics', allocated_amount: 500 }]
};

async function submitAndApprove(ctx: ReturnType<typeof fixture>) {
  const submitted = await ctx.rpc.rpc('submit_event_budget_for_approval', submitArgs);
  expect(submitted.error).toBeNull();
  const step = ctx.read().approvalSteps.find(item => item.approval_request_id === submitted.data.approval_request_id);
  ctx.setUser('user-approver-1');
  const decision = await ctx.rpc.rpc('decide_event_budget_approval', {
    p_request_step_id: step.id, p_decision: 'approved', p_comments: 'Budget approved'
  });
  expect(decision.error).toBeNull();
  ctx.setUser('user-creator');
  return submitted.data;
}

const paymentArgs = (budgetId: string, overrides: Record<string, unknown> = {}) => ({
  p_budget_id: budgetId,
  p_transaction_date: '2026-06-15',
  p_profile_id: null,
  p_party_name: 'Conference supplier',
  p_amount: 300,
  p_payment_method: 'bank_transfer',
  p_financial_account_id: 'cash-account',
  p_category_account_id: 'expense-chart',
  p_fund_id: 'fund-a',
  p_external_reference: 'EVT-PAY-01',
  p_description: 'Conference venue deposit',
  p_exchange_rate_to_base: 1,
  ...overrides
});

async function approvePayment(ctx: ReturnType<typeof fixture>, documentId: string) {
  const request = ctx.read().approvalRequests.find(item => item.transaction_type === 'financial_document' && item.target_id === documentId);
  const steps = ctx.read().approvalSteps.filter(item => item.approval_request_id === request.id)
    .sort((a, b) => a.step_order - b.step_order);
  ctx.setUser('user-approver-1');
  const first = await ctx.rpc.rpc('decide_financial_document_approval', {
    p_request_step_id: steps[0].id, p_decision: 'approved'
  });
  expect(first.error).toBeNull();
  ctx.setUser('user-approver-2');
  const second = await ctx.rpc.rpc('decide_financial_document_approval', {
    p_request_step_id: steps[1].id, p_decision: 'approved'
  });
  expect(second.error).toBeNull();
}

describe('event budget mock finance RPC lifecycle', () => {
  test('submits a persisted event budget with lines and ordered approval records', async () => {
    const ctx = fixture();
    const result = await ctx.rpc.rpc('submit_event_budget_for_approval', submitArgs);
    expect(result.error).toBeNull();
    expect(result.data.status).toBe('pending_approval');
    expect(ctx.read().budgets).toHaveLength(1);
    expect(ctx.read().budgetLines).toHaveLength(1);
    expect(ctx.read().approvalRequests[0].transaction_type).toBe('budget');
    expect(ctx.read().approvalSteps[0].approver_profile_id).toBe('approver-1');
    expect(ctx.read().budgets[0].total_budget).toBe(500);
  });

  test('enforces branch permission and fails closed without budget policy', async () => {
    const ctx = fixture();
    const wrongBranch = await ctx.rpc.rpc('submit_event_budget_for_approval', {
      ...submitArgs, p_event_id: '8b2b7e68-7b14-4b93-9f17-2e5c5b18b49a'
    });
    expect(wrongBranch.error?.code).toBe('42501');
    expect(wrongBranch.error?.message).toContain('Insufficient permission');
    const state = ctx.read();
    state.approvalPolicies = state.approvalPolicies.filter(item => item.transaction_type !== 'budget');
    const isolated = createMockFinanceRpc({
      load: () => structuredClone(state),
      save: () => { throw new Error('unexpected persistence'); }
    }, () => ({ userId: 'user-creator' }));
    const noPolicy = await isolated.rpc('submit_event_budget_for_approval', submitArgs);
    expect(noPolicy.error?.message).toContain('No active event budget approval policy');
    expect(state.budgets).toHaveLength(0);
  });

  test('event managers can prepare budgets and read only their own submissions without finance access', async () => {
    const ctx = fixture();
    ctx.setUser('user-event-manager');
    const permissions = await ctx.rpc.rpc('get_event_budget_submission_options', { p_event_id: eventUuid });
    expect(permissions.error).toBeNull();
    expect(permissions.data.baseCurrencyCode).toBe('SLL');
    expect(permissions.data.chartAccounts.map((item: any) => item.id)).toContain('expense-chart');
    expect(permissions.data.chartAccounts.some((item: any) => item.account_type !== 'expense')).toBe(false);
    expect(permissions.data.periods).toHaveLength(1);

    const submitted = await ctx.rpc.rpc('submit_event_budget_for_approval', submitArgs);
    expect(submitted.error).toBeNull();
    let own = await ctx.rpc.rpc('get_my_event_budgets', { p_event_id: eventUuid });
    expect(own.error).toBeNull();
    expect(own.data.budgets).toHaveLength(1);
    expect(own.data.budgets[0].submitted_by_profile_id).toBe('event-manager');
    expect(own.data.budgets[0].approval_steps).toHaveLength(1);

    const broadListing = await ctx.rpc.rpc('get_event_budgets', { p_branch_id: 'branch-a' });
    expect(broadListing.error?.code).toBe('42501');
    const financeConfiguration = await ctx.rpc.rpc('get_finance_configuration');
    expect(financeConfiguration.error?.code).toBe('42501');

    ctx.setUser('user-creator');
    const other = await ctx.rpc.rpc('submit_event_budget_for_approval', {
      ...submitArgs, p_name: 'Finance-managed second budget'
    });
    expect(other.error).toBeNull();
    ctx.setUser('user-event-manager');
    own = await ctx.rpc.rpc('get_my_event_budgets', { p_event_id: eventUuid });
    expect(own.data.budgets).toHaveLength(1);
    expect(own.data.budgets[0].id).toBe(submitted.data.budget_id);
  });

  test('rejects payment for a rejected or unapproved budget', async () => {
    const ctx = fixture();
    const submitted = await ctx.rpc.rpc('submit_event_budget_for_approval', submitArgs);
    const step = ctx.read().approvalSteps[0];
    ctx.setUser('user-approver-1');
    const rejected = await ctx.rpc.rpc('decide_event_budget_approval', {
      p_request_step_id: step.id, p_decision: 'rejected', p_comments: 'Please revise'
    });
    expect(rejected.error).toBeNull();
    ctx.setUser('user-creator');
    const payment = await ctx.rpc.rpc('create_event_budget_payment', paymentArgs(submitted.data.budget_id));
    expect(payment.error?.message).toContain('Only an approved event budget');
    expect(ctx.read().documents).toHaveLength(0);
  });

  test('creates one canonical payment atomically and prevents duplicate source payment', async () => {
    const ctx = fixture();
    const budget = await submitAndApprove(ctx);
    const created = await ctx.rpc.rpc('create_event_budget_payment', paymentArgs(budget.budget_id));
    expect(created.error).toBeNull();
    expect(created.data.source_budget_id).toBe(budget.budget_id);
    expect(ctx.read().documents).toHaveLength(1);
    expect(ctx.read().documents[0].source_budget_id).toBe(budget.budget_id);
    expect(ctx.read().journals).toHaveLength(1);
    expect(ctx.read().journals[0].status).toBe('draft');
    expect(ctx.read().budgets[0].payment_document_id).toBe(created.data.document_id);

    const duplicate = await ctx.rpc.rpc('create_event_budget_payment', paymentArgs(budget.budget_id));
    expect(duplicate.error?.code).toBe('23505');
    expect(ctx.read().documents).toHaveLength(1);
    expect(ctx.read().journals).toHaveLength(1);
  });

  test('rejects currency, expense account and fund mismatches without partial writes', async () => {
    const ctx = fixture();
    const budget = await submitAndApprove(ctx);
    for (const overrides of [
      { p_currency_code: 'USD' },
      { p_category_account_id: 'income-chart' },
      { p_fund_id: 'fund-b' }
    ]) {
      const result = await ctx.rpc.rpc('create_event_budget_payment', paymentArgs(budget.budget_id, overrides));
      expect(result.error).not.toBeNull();
      expect(ctx.read().documents).toHaveLength(0);
      expect(ctx.read().journals).toHaveLength(0);
    }
  });

  test('counts event actuals only after payment approval and journal posting', async () => {
    const ctx = fixture();
    const budget = await submitAndApprove(ctx);
    const payment = await ctx.rpc.rpc('create_event_budget_payment', paymentArgs(budget.budget_id));
    expect(payment.error).toBeNull();

    let listing = await ctx.rpc.rpc('get_event_budgets', { p_branch_id: 'branch-a' });
    expect(listing.error).toBeNull();
    expect(listing.data.budgets[0].total_actual).toBe(0);

    await approvePayment(ctx, payment.data.document_id);
    ctx.setUser('user-creator');
    listing = await ctx.rpc.rpc('get_event_budgets', { p_branch_id: 'branch-a' });
    expect(listing.data.budgets[0].total_actual).toBe(0);

    const posted = await ctx.rpc.rpc('post_finance_journal_entry', {
      p_journal_entry_id: payment.data.journal_entry_id
    });
    expect(posted.error).toBeNull();
    listing = await ctx.rpc.rpc('get_event_budgets', { p_branch_id: 'branch-a' });
    expect(listing.data.budgets[0].total_actual).toBe(300);
    expect(listing.data.budgets[0].posted_journal_entry_id).toBe(payment.data.journal_entry_id);
  });
});

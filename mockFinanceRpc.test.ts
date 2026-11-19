import { describe, expect, test } from 'bun:test';
import { createBrowserMockFinanceStorage, createEmptyMockFinanceState, createMockFinanceRpc, expandMockFinancePermissions, type MockFinanceState } from './mockFinanceRpc';

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
      { profile_id: 'creator', permission: 'post_journals', branch_id: 'branch-a' },
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
      branch_id: 'branch-a', version: 1, effective_from: '2026-01-01'
    }],
    approvalPolicyBands: [{ id: 'band-a', policy_id: 'policy-a', min_amount_base: 0, max_amount_base: 1000000 }],
    approvalPolicySteps: [
      { id: 'policy-step-1', band_id: 'band-a', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
      { id: 'policy-step-2', band_id: 'band-a', step_number: 2, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
    ]
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

describe('mock finance permission scope bridge', () => {
  test('preserves finance, journal-posting and event-budget permissions for resolved scopes', () => {
    const permissions = expandMockFinancePermissions('staff-1', [
      'manage_finances', 'post_journals', 'manage_events', 'submit_event_budgets'
    ], ['branch-a', null, 'branch-a']);

    expect(permissions).toHaveLength(8);
    expect(permissions).toContainEqual({ profile_id: 'staff-1', permission: 'post_journals', branch_id: 'branch-a' });
    expect(permissions).toContainEqual({ profile_id: 'staff-1', permission: 'manage_events', branch_id: 'branch-a' });
    expect(permissions).toContainEqual({ profile_id: 'staff-1', permission: 'submit_event_budgets', branch_id: null });
  });
});

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

  test('lists canonical documents with approval progress and only the signed-in approver action', async () => {
    const ctx = fixture();
    const created = await ctx.rpc.rpc('create_financial_document_transaction', args);
    expect(created.error).toBeNull();
    ctx.setUser('user-approver-1');
    const listed = await ctx.rpc.rpc('get_finance_documents', { p_branch_id: 'branch-a' });
    expect(listed.error).toBeNull();
    expect(listed.data.documents).toHaveLength(1);
    expect(listed.data.documents[0].approval_request_id).toBe(created.data.approval_request_id);
    expect(listed.data.documents[0].actor_approval_step_id).toBe(ctx.read().approvalSteps[0].id);
    expect(listed.data.documents[0].approval_steps_total).toBe(2);
    expect(listed.data.documents[0].approval_steps_completed).toBe(0);
  });

  test('treats a null branch filter as church-wide scope instead of all branches', async () => {
    const ctx = fixture();
    const state = ctx.read();
    state.permissions.push({ profile_id: 'creator', permission: 'view_finances', branch_id: null });
    state.documents.push(
      { id: 'branch-document', branch_id: 'branch-a', transaction_date: '2026-06-10' },
      { id: 'church-document', branch_id: null, transaction_date: '2026-06-10' }
    );
    const rpc = createMockFinanceRpc({
      load: () => structuredClone(state),
      save: () => { throw new Error('unexpected persistence'); }
    }, () => ({ userId: 'user-creator' }));
    const result = await rpc.rpc('get_finance_documents', { p_branch_id: null });
    expect(result.error).toBeNull();
    expect(result.data.documents.map((document: any) => document.id)).toEqual(['church-document']);
  });

  test('does not expose finance documents to an unrelated branch or unauthorized profile', async () => {
    const ctx = fixture();
    await ctx.rpc.rpc('create_financial_document_transaction', args);
    ctx.setUser('user-creator');
    const crossBranch = await ctx.rpc.rpc('get_finance_documents', { p_branch_id: 'branch-b' });
    expect(crossBranch.data.documents).toHaveLength(0);
    ctx.setUser(null);
    const unauthenticated = await ctx.rpc.rpc('get_finance_documents', { p_branch_id: 'branch-a' });
    expect(unauthenticated.error?.code).toBe('42501');
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
    expect(result.error?.message).toContain('No active financial-document approval policy');
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

  test('does not post an unapproved pending journal or include it in account balances', async () => {
    const ctx = fixture();
    await ctx.rpc.rpc('create_financial_document_transaction', args);
    const journal = ctx.read().journals[0];
    expect(journal.status).toBe('draft');
    expect(journal.source_type).toBe('financial_document_pending');
    const result = await ctx.rpc.rpc('post_finance_journal_entry', { p_journal_entry_id: journal.id });
    expect(result.error?.message).toContain('cannot be posted before approval');
    expect(ctx.read().journals[0].status).toBe('draft');
    const listing = await ctx.rpc.rpc('get_finance_journals', { p_branch_id: 'branch-a' });
    expect(listing.error).toBeNull();
    expect(listing.data.journals[0].status).toBe('draft');
    expect(listing.data.journals[0].can_post).toBe(false);
    expect(listing.data.account_balances).toHaveLength(0);
  });

  test('posts only after final approval and derives balances from posted journal lines', async () => {
    const ctx = fixture();
    const created = await ctx.rpc.rpc('create_financial_document_transaction', args);
    const steps = ctx.read().approvalSteps;
    ctx.setUser('user-approver-1');
    const first = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: steps[0].id, p_decision: 'approved'
    });
    expect(first.data.approval_status).toBe('pending');
    ctx.setUser('user-approver-2');
    const final = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: steps[1].id, p_decision: 'approved'
    });
    expect(final.data.approval_status).toBe('approved');

    ctx.setUser('user-creator');
    const posted = await ctx.rpc.rpc('post_finance_journal_entry', {
      p_journal_entry_id: created.data.journal_entry_id
    });
    expect(posted.error).toBeNull();
    expect(posted.data.status).toBe('posted');
    expect(posted.data.already_posted).toBe(false);
    expect(ctx.read().journals[0].status).toBe('posted');

    const listing = await ctx.rpc.rpc('get_finance_journals', { p_branch_id: 'branch-a' });
    expect(listing.error).toBeNull();
    expect(listing.data.journals[0].can_post).toBe(false);
    expect(listing.data.account_balances).toHaveLength(2);
    const cash = listing.data.account_balances.find((item: any) => item.account_id === 'cash-chart');
    const income = listing.data.account_balances.find((item: any) => item.account_id === 'income-chart');
    expect(cash.debit_total).toBe(250);
    expect(cash.credit_total).toBe(0);
    expect(income.debit_total).toBe(0);
    expect(income.credit_total).toBe(250);

    const retry = await ctx.rpc.rpc('post_finance_journal_entry', {
      p_journal_entry_id: created.data.journal_entry_id
    });
    expect(retry.error).toBeNull();
    expect(retry.data.already_posted).toBe(true);
  });

  test('requires post_journals permission and respects closed periods', async () => {
    const ctx = fixture();
    const created = await ctx.rpc.rpc('create_financial_document_transaction', args);
    const steps = ctx.read().approvalSteps;
    ctx.setUser('user-approver-1');
    await ctx.rpc.rpc('decide_financial_document_approval', { p_request_step_id: steps[0].id, p_decision: 'approved' });
    ctx.setUser('user-approver-2');
    await ctx.rpc.rpc('decide_financial_document_approval', { p_request_step_id: steps[1].id, p_decision: 'approved' });
    ctx.setUser('user-approver-1');
    const denied = await ctx.rpc.rpc('post_finance_journal_entry', { p_journal_entry_id: created.data.journal_entry_id });
    expect(denied.error?.code).toBe('42501');
    expect(ctx.read().journals[0].status).toBe('draft');

    ctx.setUser('user-creator');
    const state = ctx.read();
    state.periods[0].status = 'closed';
    const closedPeriodRpc = createMockFinanceRpc({
      load: () => structuredClone(state),
      save: () => { throw new Error('unexpected persistence'); }
    }, () => ({ userId: 'user-creator' }));
    const closed = await closedPeriodRpc.rpc('post_finance_journal_entry', {
      p_journal_entry_id: created.data.journal_entry_id
    });
    expect(closed.error?.message).toContain('period or financial year is not open');
  });
});


describe('mock finance local persistence', () => {
  test('persists canonical finance state across adapter instances', async () => {
    const values = new Map<string, string>();
    const keyValue = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    };
    const firstStorage = createBrowserMockFinanceStorage(keyValue, 'test-finance');
    const state = createEmptyMockFinanceState();
    state.baseCurrencyCode = 'SLL';
    state.currencies = ['SLL'];
    firstStorage.save(state);

    const secondStorage = createBrowserMockFinanceStorage(keyValue, 'test-finance');
    expect(secondStorage.load().baseCurrencyCode).toBe('SLL');
    expect(secondStorage.load().currencies).toEqual(['SLL']);
  });

  test('rejects corrupt persisted finance state instead of silently resetting it', () => {
    const keyValue = {
      getItem: (_key: string) => '{broken json',
      setItem: () => undefined
    };
    const storage = createBrowserMockFinanceStorage(keyValue, 'test-corrupt-finance');
    expect(() => storage.load()).toThrow();
  });
});


describe('canonical finance configuration RPCs', () => {
  test('validates, saves and reloads canonical setup independently of legacy giving data', async () => {
    const ctx = fixture();
    const configuration = {
      currencies: ['SLL', 'USD'], baseCurrencyCode: 'SLL',
      chartAccounts: [
        { id: 'cash-chart', code: '1000', name: 'Cash', account_type: 'asset', normal_balance: 'debit', is_active: true },
        { id: 'income-chart', code: '4000', name: 'Offering Income', account_type: 'income', normal_balance: 'credit', is_active: true }
      ],
      financialAccounts: [
        { id: 'cash-account', chart_account_id: 'cash-chart', branch_id: 'branch-a', name: 'Main Cash', account_type: 'cash', currency_code: 'SLL', is_active: true }
      ],
      funds: [{ id: 'fund-a', code: 'GEN', name: 'General Fund', fund_type: 'general', is_default: true, is_active: true }],
      financialYears: [{ id: 'fy-2026', year_number: 2026, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
      periods: [{ id: 'period-a', financial_year_id: 'fy-2026', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
      approvalPolicies: [{ id: 'policy-a', name: 'Receipt and Payment Approval', transaction_type: 'financial_document', branch_id: 'branch-a', version: 1, effective_from: '2026-01-01', is_active: true }],
      approvalPolicyBands: [{ id: 'band-a', policy_id: 'policy-a', min_amount_base: 0, max_amount_base: 100 }],
      approvalPolicySteps: [{ id: 'step-a', band_id: 'band-a', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }]
    };
    const saved = await ctx.rpc.rpc('save_finance_configuration', {
      p_branch_id: 'branch-a', p_configuration: configuration
    });
    expect(saved.error).toBeNull();
    const loaded = await ctx.rpc.rpc('get_finance_configuration', { p_branch_id: 'branch-a' });
    expect(loaded.error).toBeNull();
    expect(loaded.data.baseCurrencyCode).toBe('SLL');
    expect(loaded.data.chartAccounts).toHaveLength(2);
    expect(loaded.data.approvalPolicyBands[0].max_amount_base).toBe(100);
    expect(ctx.read().financialYears).toHaveLength(1);
  });

  test('rejects incomplete or malformed configuration without persisting partial state', async () => {
    const ctx = fixture();
    const before = ctx.read();
    const result = await ctx.rpc.rpc('save_finance_configuration', {
      p_branch_id: 'branch-a',
      p_configuration: { currencies: ['SLE'], baseCurrencyCode: 'USD' }
    });
    expect(result.error?.message).toContain('incomplete');
    expect(ctx.read()).toEqual(before);
  });

  test('enforces approval amount bands rather than flattening them into one unlimited policy', async () => {
    const ctx = fixture();
    const configuration = {
      currencies: ['SLL'], baseCurrencyCode: 'SLL',
      chartAccounts: [
        { id: 'cash-chart', code: '1000', name: 'Cash', account_type: 'asset', is_active: true },
        { id: 'income-chart', code: '4000', name: 'Offering Income', account_type: 'income', is_active: true }
      ],
      financialAccounts: [{ id: 'cash-account', chart_account_id: 'cash-chart', branch_id: 'branch-a', name: 'Cash', account_type: 'cash', currency_code: 'SLL', is_active: true }],
      funds: [],
      financialYears: [{ id: 'fy', year_number: 2026, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
      periods: [{ id: 'period', financial_year_id: 'fy', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
      approvalPolicies: [{ id: 'policy', name: 'Limited Band', transaction_type: 'financial_document', branch_id: 'branch-a', version: 1, effective_from: '2026-01-01', is_active: true }],
      approvalPolicyBands: [{ id: 'band', policy_id: 'policy', min_amount_base: 0, max_amount_base: 100 }],
      approvalPolicySteps: [{ id: 'step', band_id: 'band', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }]
    };
    const saved = await ctx.rpc.rpc('save_finance_configuration', { p_branch_id: 'branch-a', p_configuration: configuration });
    expect(saved.error).toBeNull();
    const uncovered = await ctx.rpc.rpc('create_financial_document_transaction', { ...args, p_fund_id: null, p_amount: 150 });
    expect(uncovered.error?.message).toContain('No approval threshold band covers');
    expect(ctx.read().documents).toHaveLength(0);
    const covered = await ctx.rpc.rpc('create_financial_document_transaction', { ...args, p_fund_id: null, p_amount: 50 });
    expect(covered.error).toBeNull();
    expect(ctx.read().approvalSteps).toHaveLength(1);
  });

  test('allows only distinct profiles with the required permission to satisfy a multi-approval step', async () => {
    const ctx = fixture();
    const state = ctx.read();
    state.approvalPolicySteps = [{ id: 'two-approvals', band_id: 'band-a', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 2, prohibit_submitter_approval: true }];
    const rpc = createMockFinanceRpc({ load: () => structuredClone(state), save: next => Object.assign(state, structuredClone(next)) }, () => ({ userId: 'user-creator' }));
    const created = await rpc.rpc('create_financial_document_transaction', args);
    expect(created.error).toBeNull();
    const stepId = state.approvalSteps[0].id;
    const ctxRpc = createMockFinanceRpc({ load: () => structuredClone(state), save: next => Object.assign(state, structuredClone(next)) }, () => ({ userId: 'user-approver-1' }));
    const first = await ctxRpc.rpc('decide_financial_document_approval', { p_request_step_id: stepId, p_decision: 'approved' });
    expect(first.data.approval_status).toBe('pending');
    const duplicate = await ctxRpc.rpc('decide_financial_document_approval', { p_request_step_id: stepId, p_decision: 'approved' });
    expect(duplicate.error?.message).toContain('already decided');
    const secondRpc = createMockFinanceRpc({ load: () => structuredClone(state), save: next => Object.assign(state, structuredClone(next)) }, () => ({ userId: 'user-approver-2' }));
    const second = await secondRpc.rpc('decide_financial_document_approval', { p_request_step_id: stepId, p_decision: 'approved' });
    expect(second.data.approval_status).toBe('approved');
    expect(state.documents[0].journal_entry_id).toBe(created.data.journal_entry_id);
  });

  test('immediately approves a covered transaction when the configured band has no approval steps', async () => {
    const ctx = fixture();
    const state = ctx.read();
    state.approvalPolicySteps = [];
    const rpc = createMockFinanceRpc({ load: () => structuredClone(state), save: next => Object.assign(state, structuredClone(next)) }, () => ({ userId: 'user-creator' }));
    const result = await rpc.rpc('create_financial_document_transaction', args);
    expect(result.error).toBeNull();
    expect(result.data.status).toBe('approved');
    expect(result.data.approval_request_id).toBeNull();
    expect(state.documents[0].journal_entry_id).toBe(result.data.journal_entry_id);
    expect(state.journals[0].source_type).toBe('financial_document');
  });
});


describe('finance configuration scope', () => {
  test('preserves other branch configuration when a branch manager saves their own scope', async () => {
    const ctx = fixture();
    const state = ctx.read();
    state.permissions.push({ profile_id: 'creator', permission: 'view_finances', branch_id: 'branch-a' });
    state.chartAccounts = [
      { id: 'cash-a', code: '1000', name: 'Cash', account_type: 'asset', normal_balance: 'debit', is_active: true },
      { id: 'income-a', code: '4000', name: 'Income', account_type: 'income', normal_balance: 'credit', is_active: true }
    ];
    state.financialAccounts = [
      { id: 'cash-account', branch_id: 'branch-a', name: 'Main Cash', account_type: 'cash', currency_code: 'SLL', is_active: true, chart_account_id: 'cash-a' },
      { id: 'account-b', branch_id: 'branch-b', name: 'Other Branch Account', account_type: 'bank', currency_code: 'SLL', is_active: true, chart_account_id: 'cash-a' }
    ];
    state.funds = [{ id: 'fund-a', code: 'GEN', name: 'General Fund', fund_type: 'general', is_default: true, is_active: true }];
    state.approvalPolicies[0].name = 'Branch Financial Policy';
    state.periods = [];
    state.financialYears = [];
    const rpc = createMockFinanceRpc({ load: () => structuredClone(state), save: next => Object.assign(state, structuredClone(next)) },
      () => ({ userId: 'user-creator' }));
    const loaded = await rpc.rpc('get_finance_configuration', { p_branch_id: 'branch-a' });
    expect(loaded.error).toBeNull();
    const saved = await rpc.rpc('save_finance_configuration', {
      p_branch_id: 'branch-a', p_configuration: loaded.data
    });
    expect(saved.error).toBeNull();
    expect(state.financialAccounts.some(account => account.id === 'account-b' && account.branch_id === 'branch-b')).toBe(true);
  });

  test('returns only requested branch accounts and branch or church-wide approval policies', async () => {
    const ctx = fixture();
    const state = ctx.read();
    state.permissions.push({ profile_id: 'creator', permission: 'view_finances', branch_id: 'branch-a' });
    state.financialAccounts.push(
      { id: 'account-a', branch_id: 'branch-a', name: 'A', currency_code: 'SLE', is_active: true, chart_account_id: 'cash-a' },
      { id: 'account-b', branch_id: 'branch-b', name: 'B', currency_code: 'SLE', is_active: true, chart_account_id: 'cash-a' }
    );
    state.approvalPolicies.push(
      { id: 'policy-global', branch_id: null, transaction_type: 'financial_document', is_active: true },
      { id: 'policy-other', branch_id: 'branch-b', transaction_type: 'financial_document', is_active: true }
    );
    const rpc = createMockFinanceRpc({ load: () => structuredClone(state), save: () => { throw new Error('unexpected save'); } },
      () => ({ userId: 'user-creator' }));
    const result = await rpc.rpc('get_finance_configuration', { p_branch_id: 'branch-a' });
    expect(result.error).toBeNull();
    expect(result.data.financialAccounts.map((item: any) => item.id)).toEqual(['cash-account', 'account-a']);
    expect(result.data.approvalPolicies.map((item: any) => item.id)).toContain('policy-global');
    expect(result.data.approvalPolicies.map((item: any) => item.id)).not.toContain('policy-other');
  });
});

describe('canonical finance transaction setup guards', () => {
  test('rejects an inactive financial account', async () => {
    const base = fixture();
    const state = base.read();
    state.financialAccounts[0].is_active = false;
    const rpc = createMockFinanceRpc({
      load: () => structuredClone(state),
      save: () => { throw new Error('unexpected persistence'); }
    }, () => ({ userId: 'user-creator' }));
    const result = await rpc.rpc('create_financial_document_transaction', args);
    expect(result.error?.message).toContain('Financial account is inactive');
    expect(state.documents).toHaveLength(0);
  });

  test('rejects a transaction dated in a closed financial period', async () => {
    const base = fixture();
    const state = base.read();
    state.periods[0].status = 'closed';
    const rpc = createMockFinanceRpc({
      load: () => structuredClone(state),
      save: () => { throw new Error('unexpected persistence'); }
    }, () => ({ userId: 'user-creator' }));
    const result = await rpc.rpc('create_financial_document_transaction', args);
    expect(result.error?.message).toContain('No open financial period');
    expect(state.documents).toHaveLength(0);
  });
});

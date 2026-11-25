import { describe, expect, test } from 'bun:test';
import { createBrowserMockFinanceStorage, createEmptyMockFinanceState, createMockFinanceRpc, expandMockFinancePermissions, type MockFinanceState } from './mockFinanceRpc';

function fixture(options: { churchFinance?: boolean; districtFinance?: boolean; emptyApprovalPolicy?: boolean } = {}) {
  const state: MockFinanceState = {
    ...createEmptyMockFinanceState(),
    profiles: [
      { id: 'creator', auth_user_id: 'user-creator', branch_id: 'branch-a', first_name: 'Test', last_name: 'Submitter', membership_status: 'active', record_status: 'active' },
      { id: 'approver-1', auth_user_id: 'user-approver-1', branch_id: 'branch-a', membership_status: 'active', record_status: 'active' },
      { id: 'approver-2', auth_user_id: 'user-approver-2', branch_id: 'branch-a', membership_status: 'active', record_status: 'active' },
      { id: 'member', auth_user_id: 'user-member', branch_id: 'branch-a', membership_status: 'active', record_status: 'active' }
    ],
    permissions: [
      { profile_id: 'creator', permission: 'manage_finances', branch_id: 'branch-a' },
      { profile_id: 'creator', permission: 'submit_requisitions', branch_id: 'branch-a' },
      { profile_id: 'approver-1', permission: 'approve_requisitions', branch_id: 'branch-a' },
      { profile_id: 'approver-2', permission: 'approve_requisitions', branch_id: 'branch-a' },
      ...(options.churchFinance ? [{ profile_id: 'creator', permission: 'manage_finances', branch_id: null }] : []),
      ...(options.districtFinance ? [
        { profile_id: 'creator', permission: 'manage_finances', branch_id: null, district_id: 'district-a' },
        { profile_id: 'creator', permission: 'view_finances', branch_id: null, district_id: 'district-a' }
      ] : []),
      { profile_id: 'creator', permission: 'post_journals', branch_id: 'branch-a' },
      { profile_id: 'approver-1', permission: 'approve_finances', branch_id: 'branch-a' },
      { profile_id: 'approver-2', permission: 'approve_finances', branch_id: 'branch-a' }
    ],
    districts: [{ id: 'district-a', name: 'District A', status: 'active' }, { id: 'district-b', name: 'District B', status: 'active' }],
    branches: [{ id: 'branch-a', district_id: 'district-a', name: 'Branch A', status: 'active' }],
    ministries: [{ id: 'ministry-a', branch_id: 'branch-a', name: 'Worship Ministry', entity_type: 'department', status: 'active' }],
    currencies: ['SLL', 'USD'],
    baseCurrencyCode: 'SLL',
    chartAccounts: [
      { id: 'cash-chart', code: '1000', name: 'Cash', normal_balance: 'debit', is_active: true, account_type: 'asset', is_control_account: false },
      { id: 'income-chart', code: '4000', name: 'Offering Income', normal_balance: 'credit', is_active: true, account_type: 'income', is_control_account: false },
      { id: 'expense-chart', code: '5000', name: 'Operating Expense', normal_balance: 'debit', is_active: true, account_type: 'expense', is_control_account: false }
    ],
    financialAccounts: [
      { id: 'cash-account', branch_id: 'branch-a', district_id: 'district-a', name: 'Main Cash', account_type: 'cash', currency_code: 'SLL', is_active: true, chart_account_id: 'cash-chart' }
    ],
    funds: [{ id: 'fund-a', code: 'GEN', name: 'General Fund', fund_type: 'general', is_default: true, is_active: true }],
    financialYears: [{ id: 'fy-2026', year_number: 2026, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
    periods: [{ id: 'period-a', financial_year_id: 'fy-2026', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open', year_status: 'open' }],
    approvalPolicies: options.emptyApprovalPolicy ? [] : [{
      id: 'policy-a', name: 'Receipt and Payment Approval', is_active: true, transaction_type: 'financial_document',
      branch_id: 'branch-a', version: 1, effective_from: '2026-01-01'
    }],
    approvalPolicyBands: options.emptyApprovalPolicy ? [] : [{ id: 'band-a', policy_id: 'policy-a', min_amount_base: 0, max_amount_base: 1000000 }],
    approvalPolicySteps: options.emptyApprovalPolicy ? [] : [
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
  const write = (next: MockFinanceState) => { current = structuredClone(next); };
  return { rpc, setUser, read, write };
}

const args = {
  p_document_type: 'receipt', p_transaction_date: '2026-06-10', p_branch_id: 'branch-a',
  p_profile_id: null, p_party_name: ' Sunday Service ', p_amount: 250,
  p_currency_code: 'SLL', p_payment_method: 'cash', p_financial_account_id: 'cash-account',
  p_category_account_id: 'income-chart', p_fund_id: 'fund-a',
  p_external_reference: ' RCPT-1 ', p_description: ' Sunday offering ', p_exchange_rate_to_base: 1,
  p_idempotency_key: '00000000-0000-4000-8000-000000000001'
};


function transferFixture(withApprovalSteps = false) {
  const ctx = fixture();
  const state = ctx.read();
  state.branches.push({ id: 'branch-b', district_id: 'district-a', name: 'Branch B', status: 'active' });
  state.permissions.push(
    { profile_id: 'creator', permission: 'manage_finances', branch_id: 'branch-b' },
    { profile_id: 'creator', permission: 'post_journals', branch_id: 'branch-b' },
    { profile_id: 'approver-1', permission: 'approve_finances', branch_id: 'branch-a' },
    { profile_id: 'approver-2', permission: 'approve_finances', branch_id: 'branch-b' }
  );
  state.chartAccounts.push(
    { id: 'bank-chart-a', code: '1010', name: 'Branch A Bank', normal_balance: 'debit', is_active: true, account_type: 'asset', is_control_account: false },
    { id: 'bank-chart-b', code: '1020', name: 'Branch B Bank', normal_balance: 'debit', is_active: true, account_type: 'asset', is_control_account: false },
    { id: 'due-from-chart', code: '1300', name: 'Due From Branch', normal_balance: 'debit', is_active: true, account_type: 'asset', is_control_account: false },
    { id: 'due-to-chart', code: '2300', name: 'Due To Branch', normal_balance: 'credit', is_active: true, account_type: 'liability', is_control_account: false }
  );
  state.financialAccounts.push(
    { id: 'bank-account-a', branch_id: 'branch-a', district_id: 'district-a', name: 'Branch A Bank', account_type: 'bank', currency_code: 'SLL', is_active: true, chart_account_id: 'bank-chart-a' },
    { id: 'bank-account-b', branch_id: 'branch-b', district_id: 'district-a', name: 'Branch B Bank', account_type: 'bank', currency_code: 'SLL', is_active: true, chart_account_id: 'bank-chart-b' }
  );
  state.branchClearingAccounts.push(
    { branch_id: 'branch-a', due_from_chart_account_id: 'due-from-chart', due_to_chart_account_id: 'due-to-chart', is_active: true },
    { branch_id: 'branch-b', due_from_chart_account_id: 'due-from-chart', due_to_chart_account_id: 'due-to-chart', is_active: true }
  );
  state.approvalPolicies.push(
    { id: 'transfer-policy-a', name: 'Branch A Transfer Policy', is_active: true, transaction_type: 'financial_transfer', branch_id: 'branch-a', district_id: 'district-a', version: 1, effective_from: '2026-01-01' },
    { id: 'transfer-policy-b', name: 'Branch B Transfer Policy', is_active: true, transaction_type: 'financial_transfer', branch_id: 'branch-b', district_id: 'district-a', version: 1, effective_from: '2026-01-01' }
  );
  state.approvalPolicyBands.push(
    { id: 'transfer-band-a', policy_id: 'transfer-policy-a', min_amount_base: 0, max_amount_base: null },
    { id: 'transfer-band-b', policy_id: 'transfer-policy-b', min_amount_base: 0, max_amount_base: null }
  );
  if (withApprovalSteps) {
    state.approvalPolicySteps.push(
      { id: 'transfer-policy-step-a', band_id: 'transfer-band-a', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
      { id: 'transfer-policy-step-b', band_id: 'transfer-band-b', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
    );
  }
  ctx.write(state);
  return ctx;
}

const transferArgs = {
  p_transaction_date: '2026-06-10',
  p_source_branch_id: 'branch-a',
  p_source_financial_account_id: 'cash-account',
  p_destination_branch_id: 'branch-b',
  p_destination_financial_account_id: 'bank-account-b',
  p_amount: 250,
  p_currency_code: 'SLL',
  p_exchange_rate_to_base: 1,
  p_description: 'Internal branch transfer',
  p_external_reference: 'TR-001',
  p_idempotency_key: '00000000-0000-4000-8000-000000000101'
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
    const result = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
    expect(result.error).toBeNull();
    expect(result.data.status).toBe('pending_approval');
    expect(result.data.document_number).toBe(1);
    const state = ctx.read();
    expect(state.documents).toHaveLength(1);
    expect(state.journals[0].source_type).toBe('financial_document_pending');
    expect(state.documents[0].journal_entry_id).toBeNull();
    expect(state.journalLines.reduce((n, l) => n + l.debit_amount, 0)).toBe(250);
    expect(state.journalLines.reduce((n, l) => n + l.credit_amount, 0)).toBe(250);
    expect(state.journalLines.reduce((n, l) => n + l.base_debit_amount, 0)).toBe(250);
    expect(state.journalLines.reduce((n, l) => n + l.base_credit_amount, 0)).toBe(250);
    expect(state.documents[0].payee_or_payer_name).toBe('Sunday Service');
    expect(state.documents[0].document_number).toBe(1);
  });

  test('assigns unique sequential numbers across receipt and payment documents', async () => {
    const ctx = fixture();
    const receipt = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
    const payment = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_document_type: 'payment', p_category_account_id: 'expense-chart',
      p_idempotency_key: '00000000-0000-4000-8000-000000000002'
    });
    expect(receipt.error).toBeNull();
    expect(payment.error).toBeNull();
    expect(receipt.data.document_number).toBe(1);
    expect(payment.data.document_number).toBe(2);
    expect(ctx.read().documents.map(document => document.document_number)).toEqual([1, 2]);
  });

  test('creates a balanced pending payment with expense debit and cash credit', async () => {
    const ctx = fixture();
    const result = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_document_type: 'payment', p_category_account_id: 'expense-chart',
      p_party_name: 'Utility provider', p_external_reference: 'PAY-1'
    });

    expect(result.error).toBeNull();
    expect(result.data.status).toBe('pending_approval');
    const state = ctx.read();
    expect(state.documents[0].document_type).toBe('payment');
    expect(state.journalLines).toHaveLength(2);
    const expense = state.journalLines.find(line => line.account_id === 'expense-chart');
    const cash = state.journalLines.find(line => line.account_id === 'cash-chart');
    expect(expense?.debit_amount).toBe(250);
    expect(expense?.credit_amount).toBe(0);
    expect(expense?.fund_id).toBe('fund-a');
    expect(cash?.debit_amount).toBe(0);
    expect(cash?.credit_amount).toBe(250);
    expect(cash?.fund_id).toBeNull();
    expect(state.journalLines.reduce((sum, line) => sum + line.base_debit_amount, 0)).toBe(250);
    expect(state.journalLines.reduce((sum, line) => sum + line.base_credit_amount, 0)).toBe(250);
  });

  test('approves and posts a payment into expense and cash ledger balances', async () => {
    const ctx = fixture();
    const created = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_document_type: 'payment', p_category_account_id: 'expense-chart'
    });
    expect(created.error).toBeNull();
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

    const ledger = await ctx.rpc.rpc('get_finance_journals', { p_branch_id: 'branch-a' });
    expect(ledger.error).toBeNull();
    const expense = ledger.data.account_balances.find((item: any) => item.account_id === 'expense-chart');
    const cash = ledger.data.account_balances.find((item: any) => item.account_id === 'cash-chart');
    expect(expense.debit_total).toBe(250);
    expect(expense.credit_total).toBe(0);
    expect(cash.debit_total).toBe(0);
    expect(cash.credit_total).toBe(250);
  });

  test('lists canonical documents with approval progress and only the signed-in approver action', async () => {
    const ctx = fixture();
    const created = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
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

  test('defaults an unspecified branch filter to the signed-in profile branch', async () => {
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
    expect(result.data.documents.map((document: any) => document.id)).toEqual(['branch-document']);
  });

  test('does not expose finance documents to an unrelated branch or unauthorized profile', async () => {
    const ctx = fixture();
    await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
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
    const result = await isolated.rpc('create_financial_document_transaction_idempotent', args);
    expect(result.error?.message).toContain('No active financial-document approval policy');
    expect(state.documents).toHaveLength(0);
  });

  test('rejects cross-branch creation without writing data', async () => {
    const ctx = fixture();
    const result = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', { ...args, p_branch_id: 'branch-b' });
    expect(result.error?.code).toBe('42501');
    expect(ctx.read().documents).toHaveLength(0);
  });

  test('requires an authenticated linked profile', async () => {
    const ctx = fixture();
    ctx.setUser(null);
    const result = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
    expect(result.error?.code).toBe('42501');
    expect(ctx.read().documents).toHaveLength(0);
  });

  test('requires first approval before second and links journal only after final approval', async () => {
    const ctx = fixture();
    const created = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
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
    await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
    const step = ctx.read().approvalSteps[0];
    ctx.setUser('user-approver-1');
    const result = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: step.id, p_decision: 'rejected', p_comments: 'Not supported'
    });
    expect(result.data.approval_status).toBe('rejected');
    expect(ctx.read().documents[0].status).toBe('rejected');
    expect(ctx.read().documents[0].journal_entry_id).toBeNull();
    expect(ctx.read().journals[0].source_type).toBe('financial_document_pending');

    ctx.setUser('user-creator');
    const posting = await ctx.rpc.rpc('post_finance_journal_entry', {
      p_journal_entry_id: ctx.read().journals[0].id
    });
    expect(posting.error?.message).toContain('cannot be posted before approval');
    expect(ctx.read().journals[0].status).toBe('draft');

    const ledger = await ctx.rpc.rpc('get_finance_journals', { p_branch_id: 'branch-a' });
    expect(ledger.error).toBeNull();
    expect(ledger.data.account_balances).toHaveLength(0);
  });

  test('does not post an unapproved pending journal or include it in account balances', async () => {
    const ctx = fixture();
    await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
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
    const created = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
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
    const created = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
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
    const ctx = fixture({ churchFinance: true });
    const configuration = {
      currencies: ['SLL', 'USD'], baseCurrencyCode: 'SLL',
      chartAccounts: [
        { id: 'cash-chart', code: '1000', name: 'Cash', account_type: 'asset', normal_balance: 'debit', is_active: true },
        { id: 'income-chart', code: '4000', name: 'Offering Income', account_type: 'income', normal_balance: 'credit', is_active: true },
        { id: 'expense-chart', code: '5000', name: 'Operating Expense', account_type: 'expense', normal_balance: 'debit', is_active: true }
      ],
      financialAccounts: [
        { id: 'cash-account', chart_account_id: 'cash-chart', branch_id: 'branch-a', name: 'Main Cash', account_type: 'cash', currency_code: 'SLL', is_active: true }
      ],
      funds: [{ id: 'fund-a', code: 'GEN', name: 'General Fund', fund_type: 'general', is_default: true, is_active: true }],
      financialYears: [{ id: 'fy-2026', year_number: 2026, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
      periods: [{ id: 'period-a', financial_year_id: 'fy-2026', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
      approvalPolicies: [{ id: 'policy-a', name: 'Receipt and Payment Approval', transaction_type: 'financial_document', branch_id: 'branch-a', version: 1, effective_from: '2026-01-01', is_active: true }],
      approvalPolicyBands: [{ id: 'band-a', policy_id: 'policy-a', min_amount_base: 0, max_amount_base: 1000000 }],
      approvalPolicySteps: [
        { id: 'policy-step-1', band_id: 'band-a', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
        { id: 'policy-step-2', band_id: 'band-a', step_number: 2, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
      ]
    };
    const saved = await ctx.rpc.rpc('save_finance_configuration', {
      p_branch_id: 'branch-a', p_configuration: configuration
    });
    expect(saved.error).toBeNull();
    const loaded = await ctx.rpc.rpc('get_finance_configuration', { p_branch_id: 'branch-a' });
    expect(loaded.error).toBeNull();
    expect(loaded.data.baseCurrencyCode).toBe('SLL');
    expect(loaded.data.chartAccounts).toHaveLength(3);
    expect(loaded.data.approvalPolicyBands[0].max_amount_base).toBe(1000000);
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
    const ctx = fixture({ churchFinance: true, emptyApprovalPolicy: true });
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
    const uncovered = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', { ...args, p_fund_id: null, p_amount: 150 });
    expect(uncovered.error?.message).toContain('No approval threshold band covers');
    expect(ctx.read().documents).toHaveLength(0);
    const covered = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', { ...args, p_fund_id: null, p_amount: 50 });
    expect(covered.error).toBeNull();
    expect(ctx.read().approvalSteps).toHaveLength(1);
  });

  test('allows only distinct profiles with the required permission to satisfy a multi-approval step', async () => {
    const ctx = fixture();
    const state = ctx.read();
    state.approvalPolicySteps = [{ id: 'two-approvals', band_id: 'band-a', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 2, prohibit_submitter_approval: true }];
    const rpc = createMockFinanceRpc({ load: () => structuredClone(state), save: next => Object.assign(state, structuredClone(next)) }, () => ({ userId: 'user-creator' }));
    const created = await rpc.rpc('create_financial_document_transaction_idempotent', args);
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
    const result = await rpc.rpc('create_financial_document_transaction_idempotent', args);
    expect(result.error).toBeNull();
    expect(result.data.status).toBe('approved');
    expect(result.data.approval_request_id).toBeNull();
    expect(state.documents[0].journal_entry_id).toBe(result.data.journal_entry_id);
    expect(state.journals[0].source_type).toBe('financial_document');
  });
});


describe('finance configuration authorization parity', () => {
  test('branch finance managers cannot modify church-wide chart configuration', async () => {
    const ctx = fixture();
    const loaded = await ctx.rpc.rpc('get_finance_configuration', { p_branch_id: 'branch-a' });
    expect(loaded.error).toBeNull();
    const before = ctx.read();
    const changed = structuredClone(loaded.data);
    changed.chartAccounts[0].name = 'Unauthorized chart change';

    const saved = await ctx.rpc.rpc('save_finance_configuration', {
      p_branch_id: 'branch-a',
      p_configuration: changed
    });

    expect(saved.error?.code).toBe('42501');
    expect(saved.error?.message).toContain('church-level');
    expect(ctx.read().chartAccounts).toEqual(before.chartAccounts);
  });

  test('branch finance managers cannot add a church-wide approval policy', async () => {
    const ctx = fixture();
    const loaded = await ctx.rpc.rpc('get_finance_configuration', { p_branch_id: 'branch-a' });
    expect(loaded.error).toBeNull();
    const changed = structuredClone(loaded.data);
    changed.approvalPolicies.push({
      id: 'church-policy-new', name: 'Church-wide policy',
      transaction_type: 'financial_document', branch_id: null,
      version: 1, effective_from: '2026-11-19', is_active: true
    });

    const saved = await ctx.rpc.rpc('save_finance_configuration', {
      p_branch_id: 'branch-a',
      p_configuration: changed
    });

    expect(saved.error?.code).toBe('42501');
    expect(saved.error?.message).toContain('Church-wide approval policies');
    expect(ctx.read().approvalPolicies.some(policy => policy.id === 'church-policy-new')).toBe(false);
  });

  test('branch finance managers cannot create a financial account in another branch', async () => {
    const ctx = fixture();
    const loaded = await ctx.rpc.rpc('get_finance_configuration', { p_branch_id: 'branch-a' });
    expect(loaded.error).toBeNull();
    const changed = structuredClone(loaded.data);
    changed.financialAccounts.push({
      id: 'cross-branch-account', branch_id: 'branch-b',
      chart_account_id: 'cash-chart', name: 'Other Branch Cash',
      account_type: 'cash', currency_code: 'SLL', is_active: true
    });

    const saved = await ctx.rpc.rpc('save_finance_configuration', {
      p_branch_id: 'branch-a',
      p_configuration: changed
    });

    expect(saved.error?.message).toContain('must match the requested branch');
    expect(ctx.read().financialAccounts.some(account => account.id === 'cross-branch-account')).toBe(false);
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
    const result = await rpc.rpc('create_financial_document_transaction_idempotent', args);
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
    const result = await rpc.rpc('create_financial_document_transaction_idempotent', args);
    expect(result.error?.message).toContain('No open financial period');
    expect(state.documents).toHaveLength(0);
  });
});


describe('mock requisition approval configuration RPCs', () => {
  test('creates an immutable branch-scoped policy with ordered requisition-only approval steps', async () => {
    const ctx = fixture();
    const saved = await ctx.rpc.rpc('save_requisition_approval_policy', {
      p_branch_id: 'branch-a',
      p_name: 'Department Requisition Policy',
      p_min_amount_base: 0,
      p_max_amount_base: 5000,
      p_steps: [
        { step_number: 1, required_approvals: 1 },
        { step_number: 2, required_approvals: 2 }
      ]
    });

    expect(saved.error).toBeNull();
    expect(saved.data.step_count).toBe(2);
    expect(saved.data.version).toBe(1);

    const configuration = await ctx.rpc.rpc('get_requisition_approval_configuration', {
      p_branch_id: 'branch-a'
    });
    expect(configuration.error).toBeNull();
    expect(configuration.data.policies).toHaveLength(1);
    expect(configuration.data.policies[0].transaction_type).toBe('requisition');
    expect(configuration.data.bands[0].max_amount_base).toBe(5000);
    expect(configuration.data.steps.map((step: any) => step.step_number)).toEqual([1, 2]);
    expect(configuration.data.steps.every((step: any) =>
      step.required_permission_key === 'approve_requisitions' &&
      step.prohibit_submitter_approval === true
    )).toBe(true);

    const generalFinance = await ctx.rpc.rpc('get_finance_configuration', { p_branch_id: 'branch-a' });
    expect(generalFinance.error).toBeNull();
    expect(generalFinance.data.approvalPolicies.some((policy: any) =>
      policy.transaction_type === 'requisition'
    )).toBe(false);
  });

  test('branch finance managers cannot create church-wide requisition policies', async () => {
    const ctx = fixture();
    const result = await ctx.rpc.rpc('save_requisition_approval_policy', {
      p_branch_id: null,
      p_name: 'Church-wide Requisition Policy',
      p_min_amount_base: 0,
      p_max_amount_base: null,
      p_steps: [{ step_number: 1, required_approvals: 1 }]
    });

    expect(result.error?.message).toContain('Insufficient permission');
    expect(ctx.read().approvalPolicies.some(policy => policy.transaction_type === 'requisition')).toBe(false);
  });

  test('approvers without finance configuration permission cannot create policies', async () => {
    const ctx = fixture();
    ctx.setUser('user-approver-1');
    const result = await ctx.rpc.rpc('save_requisition_approval_policy', {
      p_branch_id: 'branch-a',
      p_name: 'Unauthorized Policy',
      p_min_amount_base: 0,
      p_max_amount_base: null,
      p_steps: [{ step_number: 1, required_approvals: 1 }]
    });

    expect(result.error?.message).toContain('Insufficient permission');
    expect(ctx.read().approvalPolicies.some(policy => policy.transaction_type === 'requisition')).toBe(false);
  });

  test('rejects gaps and invalid approval counts without persisting a policy', async () => {
    const ctx = fixture();
    const result = await ctx.rpc.rpc('save_requisition_approval_policy', {
      p_branch_id: 'branch-a',
      p_name: 'Invalid Policy',
      p_min_amount_base: 0,
      p_max_amount_base: null,
      p_steps: [
        { step_number: 1, required_approvals: 1 },
        { step_number: 3, required_approvals: 0 }
      ]
    });

    expect(result.error?.message).toContain('numbered consecutively');
    expect(ctx.read().approvalPolicies.some(policy => policy.transaction_type === 'requisition')).toBe(false);
  });
});


describe('mock department requisition lifecycle RPCs', () => {
  async function createRequisitionPolicy(ctx: ReturnType<typeof fixture>) {
    const result = await ctx.rpc.rpc('save_requisition_approval_policy', {
      p_branch_id: 'branch-a',
      p_name: 'Department Requisition Policy',
      p_min_amount_base: 0,
      p_max_amount_base: null,
      p_steps: [
        { step_number: 1, required_approvals: 1 },
        { step_number: 2, required_approvals: 1 }
      ]
    });
    expect(result.error).toBeNull();
    return result.data;
  }

  const requisitionArgs = {
    p_branch_id: 'branch-a',
    p_ministry_id: 'ministry-a',
    p_title: 'Audio equipment for worship team',
    p_description: 'Replacement equipment for weekly services',
    p_requested_amount: 150,
    p_currency_code: 'SLL',
    p_exchange_rate_to_base: 1,
    p_priority: 'high',
    p_needed_by_date: '2026-12-15',
    p_vendor_quote_reference: 'QUOTE-001',
    p_items: [
      { item_name: 'Microphone stand', quantity: 2, unit_price: 50 },
      { item_name: 'Audio cable', quantity: 1, unit_price: 50 }
    ]
  };

  test('returns branch-scoped submission options only to authorized ministry leaders', async () => {
    const ctx = fixture();
    const options = await ctx.rpc.rpc('get_department_requisition_submission_options', {
      p_branch_id: 'branch-a', p_ministry_id: 'ministry-a'
    });
    expect(options.error).toBeNull();
    expect(options.data.ministry_name).toBe('Worship Ministry');
    expect(options.data.base_currency_code).toBe('SLL');
    expect(options.data.currencies).toContain('SLL');

    ctx.setUser('user-member');
    const denied = await ctx.rpc.rpc('get_department_requisition_submission_options', {
      p_branch_id: 'branch-a', p_ministry_id: 'ministry-a'
    });
    expect(denied.error?.message).toContain('Insufficient permission');
  });

  test('submits a pending requisition with reconciled item lines and no payment journal', async () => {
    const ctx = fixture();
    await createRequisitionPolicy(ctx);
    const result = await ctx.rpc.rpc('submit_department_requisition', requisitionArgs);

    expect(result.error).toBeNull();
    expect(result.data.status).toBe('pending_approval');
    const state = ctx.read();
    expect(state.requisitions).toHaveLength(1);
    expect(state.requisitionItems).toHaveLength(2);
    expect(state.requisitionItems.reduce((sum, item) => sum + Number(item.line_total), 0)).toBe(150);
    expect(state.approvalRequests.find(item => item.id === result.data.approval_request_id)?.transaction_type).toBe('requisition');
    expect(state.documents).toHaveLength(0);
    expect(state.journals).toHaveLength(0);
  });

  test('exposes the current approval step and advances through ordered decisions', async () => {
    const ctx = fixture();
    await createRequisitionPolicy(ctx);
    const submitted = await ctx.rpc.rpc('submit_department_requisition', requisitionArgs);
    expect(submitted.error).toBeNull();

    const submitterView = await ctx.rpc.rpc('get_department_requisitions', { p_branch_id: 'branch-a' });
    expect(submitterView.error).toBeNull();
    expect(submitterView.data).toHaveLength(1);
    expect(submitterView.data[0].approval_steps[0].actor_can_decide).toBe(false);

    const requestId = submitted.data.approval_request_id;
    const steps = ctx.read().approvalSteps.filter(step => step.approval_request_id === requestId)
      .sort((a, b) => a.step_order - b.step_order);
    ctx.setUser('user-approver-1');
    const firstApproverView = await ctx.rpc.rpc('get_department_requisitions', { p_branch_id: 'branch-a' });
    expect(firstApproverView.data[0].approval_steps[0].actor_can_decide).toBe(true);
    const firstDecision = await ctx.rpc.rpc('decide_department_requisition_approval', {
      p_request_step_id: steps[0].id, p_decision: 'approved', p_comments: 'Pastoral approval'
    });
    expect(firstDecision.error).toBeNull();
    expect(firstDecision.data.status).toBe('pending_approval');

    ctx.setUser('user-approver-2');
    const secondApproverView = await ctx.rpc.rpc('get_department_requisitions', { p_branch_id: 'branch-a' });
    expect(secondApproverView.data[0].approval_steps[0].actor_can_decide).toBe(false);
    expect(secondApproverView.data[0].approval_steps[1].actor_can_decide).toBe(true);
    const finalDecision = await ctx.rpc.rpc('decide_department_requisition_approval', {
      p_request_step_id: steps[1].id, p_decision: 'approved', p_comments: 'Finance approval'
    });
    expect(finalDecision.error).toBeNull();
    expect(finalDecision.data.status).toBe('approved');
    expect(ctx.read().requisitions[0].approved_by_profile_id).toBe('approver-2');
  });

  test('creates idempotent partial requisition payments and counts paid amounts only after posting', async () => {
    const ctx = fixture();
    await createRequisitionPolicy(ctx);
    const submitted = await ctx.rpc.rpc('submit_department_requisition', requisitionArgs);
    expect(submitted.error).toBeNull();
    const requisitionSteps = ctx.read().approvalSteps
      .filter(step => step.approval_request_id === submitted.data.approval_request_id)
      .sort((a, b) => a.step_order - b.step_order);
    ctx.setUser('user-approver-1');
    expect((await ctx.rpc.rpc('decide_department_requisition_approval', {
      p_request_step_id: requisitionSteps[0].id, p_decision: 'approved'
    })).error).toBeNull();
    ctx.setUser('user-approver-2');
    expect((await ctx.rpc.rpc('decide_department_requisition_approval', {
      p_request_step_id: requisitionSteps[1].id, p_decision: 'approved'
    })).error).toBeNull();

    const paymentArgs = {
      p_requisition_id: submitted.data.requisition_id,
      p_transaction_date: '2026-06-10',
      p_profile_id: null,
      p_party_name: 'Equipment supplier',
      p_amount: 80,
      p_payment_method: 'bank_transfer',
      p_financial_account_id: 'cash-account',
      p_category_account_id: 'expense-chart',
      p_fund_id: 'fund-a',
      p_external_reference: 'REQ-PAY-001',
      p_description: 'First partial payment',
      p_request_key: 'attempt-1'
    };
    ctx.setUser('user-creator');
    const created = await ctx.rpc.rpc('create_department_requisition_payment', paymentArgs);
    expect(created.error).toBeNull();
    expect(created.data.status).toBe('pending_approval');

    const retry = await ctx.rpc.rpc('create_department_requisition_payment', paymentArgs);
    expect(retry.error).toBeNull();
    expect(retry.data.document_id).toBe(created.data.document_id);
    expect(retry.data.already_exists).toBe(true);
    expect(ctx.read().documents.filter(item => item.source_requisition_id === submitted.data.requisition_id)).toHaveLength(1);

    const over = await ctx.rpc.rpc('create_department_requisition_payment', {
      ...paymentArgs, p_amount: 80, p_request_key: 'attempt-over'
    });
    expect(over.error?.message).toContain('remaining approved requisition amount');

    const paymentRequest = ctx.read().approvalRequests.find(item => item.id === created.data.approval_request_id);
    const paymentSteps = ctx.read().approvalSteps
      .filter(step => step.approval_request_id === paymentRequest.id)
      .sort((a, b) => a.step_order - b.step_order);
    ctx.setUser('user-approver-1');
    await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: paymentSteps[0].id, p_decision: 'approved'
    });
    ctx.setUser('user-approver-2');
    await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: paymentSteps[1].id, p_decision: 'approved'
    });

    ctx.setUser('user-creator');
    let summary = await ctx.rpc.rpc('get_department_requisition_payment_summary', { p_branch_id: 'branch-a' });
    expect(summary.error).toBeNull();
    expect(summary.data[0].payment_status).toBe('payment_pending');
    expect(summary.data[0].paid_amount).toBe(0);
    expect(summary.data[0].reserved_amount).toBe(80);

    const posted = await ctx.rpc.rpc('post_finance_journal_entry', {
      p_journal_entry_id: created.data.journal_entry_id
    });
    expect(posted.error).toBeNull();
    summary = await ctx.rpc.rpc('get_department_requisition_payment_summary', { p_branch_id: 'branch-a' });
    expect(summary.data[0].payment_status).toBe('partially_paid');
    expect(summary.data[0].paid_amount).toBe(80);
    expect(summary.data[0].remaining_amount).toBe(70);
  });

  test('fails closed for missing policy, invalid item totals and unauthorized submitters', async () => {
    const ctx = fixture();
    const noPolicy = await ctx.rpc.rpc('submit_department_requisition', requisitionArgs);
    expect(noPolicy.error?.message).toContain('No active requisition approval policy');

    await createRequisitionPolicy(ctx);
    const invalidTotal = await ctx.rpc.rpc('submit_department_requisition', {
      ...requisitionArgs, p_requested_amount: 151
    });
    expect(invalidTotal.error?.message).toContain('sum of the requisition item lines');

    ctx.setUser('user-member');
    const unauthorized = await ctx.rpc.rpc('submit_department_requisition', requisitionArgs);
    expect(unauthorized.error?.message).toContain('Insufficient permission');
    expect(ctx.read().requisitions).toHaveLength(0);
  });
});

describe('mock finance scope discovery RPC', () => {
  test('returns only branch scopes for a branch-scoped finance user', async () => {
    const ctx = fixture();
    const result = await ctx.rpc.rpc('get_my_finance_scopes');
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { scope_type: 'branch', scope_id: 'branch-a', scope_name: 'Branch A', district_id: 'district-a', branch_id: 'branch-a' }
    ]);
  });

  test('returns district and its branches for a district-scoped finance user', async () => {
    const ctx = fixture({ districtFinance: true });
    const result = await ctx.rpc.rpc('get_my_finance_scopes');
    expect(result.error).toBeNull();
    expect(result.data.map((scope: any) => scope.scope_type + ':' + (scope.scope_id || 'church'))).toEqual([
      'district:district-a', 'branch:branch-a'
    ]);
  });

  test('returns church, districts and branches only when church finance permission exists', async () => {
    const ctx = fixture({ churchFinance: true });
    const result = await ctx.rpc.rpc('get_my_finance_scopes');
    expect(result.error).toBeNull();
    expect(result.data.map((scope: any) => scope.scope_type)).toEqual([
      'church', 'district', 'district', 'branch'
    ]);
  });

  test('fails closed for unauthenticated and unrelated users', async () => {
    const ctx = fixture();
    ctx.setUser(null);
    const anonymous = await ctx.rpc.rpc('get_my_finance_scopes');
    expect(anonymous.error?.code).toBe('42501');
    ctx.setUser('not-linked');
    const unlinked = await ctx.rpc.rpc('get_my_finance_scopes');
    expect(unlinked.error?.code).toBe('42501');
  });
});
describe('mock finance scope discovery RPC', () => {
  test('returns only branch scopes for a branch-scoped finance user', async () => {
    const ctx = fixture();
    const result = await ctx.rpc.rpc('get_my_finance_scopes');
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { scope_type: 'branch', scope_id: 'branch-a', scope_name: 'Branch A', district_id: 'district-a', branch_id: 'branch-a' }
    ]);
  });

  test('returns district and its branches for a district-scoped finance user', async () => {
    const ctx = fixture({ districtFinance: true });
    const result = await ctx.rpc.rpc('get_my_finance_scopes');
    expect(result.error).toBeNull();
    expect(result.data.map((scope: any) => scope.scope_type + ':' + (scope.scope_id || 'church'))).toEqual([
      'district:district-a', 'branch:branch-a'
    ]);
  });

  test('returns church, districts and branches only when church finance permission exists', async () => {
    const ctx = fixture({ churchFinance: true });
    const result = await ctx.rpc.rpc('get_my_finance_scopes');
    expect(result.error).toBeNull();
    expect(result.data.map((scope: any) => scope.scope_type)).toEqual([
      'church', 'district', 'district', 'branch'
    ]);
  });

  test('fails closed for unauthenticated and unlinked users', async () => {
    const ctx = fixture();
    ctx.setUser(null);
    const anonymous = await ctx.rpc.rpc('get_my_finance_scopes');
    expect(anonymous.error?.code).toBe('42501');
    ctx.setUser('not-linked');
    const unlinked = await ctx.rpc.rpc('get_my_finance_scopes');
    expect(unlinked.error?.code).toBe('42501');
  });
});

describe('mock scoped finance approval policy writes', () => {
  test('creates immutable district-owned approval policies, bands and steps', async () => {
    const ctx = fixture({ districtFinance: true });
    const result = await ctx.rpc.rpc('save_finance_scope_approval_policies', {
      p_scope_type: 'district', p_scope_id: 'district-a',
      p_policies: [{
        id: 'district-policy', name: 'District Receipts and Payments',
        transaction_type: 'financial_document', branch_id: null, district_id: 'district-a',
        version: 1, effective_from: '2026-01-01', is_active: true
      }],
      p_bands: [{ id: 'district-band', policy_id: 'district-policy', min_amount_base: 0, max_amount_base: null }],
      p_steps: [{
        id: 'district-step', band_id: 'district-band', step_number: 1,
        required_permission_key: 'approve_finances', required_approvals: 2,
        prohibit_submitter_approval: true
      }]
    });
    expect(result.error).toBeNull();
    expect(result.data.policies_created).toBe(1);
    const saved = ctx.read();
    expect(saved.approvalPolicies.find(item => item.id === 'district-policy')?.district_id).toBe('district-a');
    expect(saved.approvalPolicyBands.find(item => item.id === 'district-band')?.policy_id).toBe('district-policy');
    expect(saved.approvalPolicySteps.find(item => item.id === 'district-step')?.required_approvals).toBe(2);
  });

  test('denies a branch finance user from writing a district approval policy', async () => {
    const ctx = fixture();
    const result = await ctx.rpc.rpc('save_finance_scope_approval_policies', {
      p_scope_type: 'district', p_scope_id: 'district-a',
      p_policies: [], p_bands: [], p_steps: []
    });
    expect(result.error?.code).toBe('42501');
    expect(ctx.read().approvalPolicies).toHaveLength(1);
  });

  test('rejects bands and steps that attempt to mutate an existing policy version', async () => {
    const ctx = fixture({ districtFinance: true });
    const result = await ctx.rpc.rpc('save_finance_scope_approval_policies', {
      p_scope_type: 'district', p_scope_id: 'district-a',
      p_policies: [],
      p_bands: [{ id: 'band-a', policy_id: 'policy-a', min_amount_base: 0, max_amount_base: 900000 }],
      p_steps: []
    });
    expect(result.error?.message).toContain('immutable');
  });

  test('validates multi-band non-overlap and multi-step ordering on scoped policies', async () => {
    const ctx = fixture({ districtFinance: true });
    const overlapping = await ctx.rpc.rpc('save_finance_scope_approval_policies', {
      p_scope_type: 'district', p_scope_id: 'district-a',
      p_policies: [{
        id: 'overlap-policy', name: 'Overlapping', transaction_type: 'financial_document',
        branch_id: null, district_id: 'district-a', version: 1, effective_from: '2026-01-01', is_active: true
      }],
      p_bands: [
        { id: 'b1', policy_id: 'overlap-policy', min_amount_base: 0, max_amount_base: 1000 },
        { id: 'b2', policy_id: 'overlap-policy', min_amount_base: 500, max_amount_base: null }
      ],
      p_steps: [
        { id: 's1', band_id: 'b1', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
        { id: 's2', band_id: 'b2', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
      ]
    });
    expect(overlapping.error?.message).toContain('overlap');
    expect(ctx.read().approvalPolicies.some(item => item.id === 'overlap-policy')).toBe(false);

    const multiBand = await ctx.rpc.rpc('save_finance_scope_approval_policies', {
      p_scope_type: 'district', p_scope_id: 'district-a',
      p_policies: [{
        id: 'district-multi-policy', name: 'District Multi-Band', transaction_type: 'financial_document',
        branch_id: null, district_id: 'district-a', version: 1, effective_from: '2026-01-01', is_active: true
      }],
      p_bands: [
        { id: 'db1', policy_id: 'district-multi-policy', min_amount_base: 0, max_amount_base: 1000 },
        { id: 'db2', policy_id: 'district-multi-policy', min_amount_base: 1000, max_amount_base: null }
      ],
      p_steps: [
        { id: 'ds1', band_id: 'db1', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
        { id: 'ds2', band_id: 'db2', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
        { id: 'ds3', band_id: 'db2', step_number: 2, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
      ]
    });
    expect(multiBand.error).toBeNull();
    expect(multiBand.data.bands_created).toBe(2);
    expect(multiBand.data.steps_created).toBe(3);
  });
});

describe('mock scope-aware finance transactions, options and journals', () => {
  function scopedFixture() {
    const ctx = fixture({ churchFinance: true, districtFinance: true });
    const state = ctx.read();
    state.branches.push(
      { id: 'branch-b', district_id: 'district-b', name: 'Branch B', status: 'active' }
    );
    state.profiles.push(
      { id: 'branch-only', auth_user_id: 'user-branch-only', branch_id: 'branch-a', membership_status: 'active', record_status: 'active' },
      { id: 'district-approver-1', auth_user_id: 'user-dist-app-1', branch_id: 'branch-a', membership_status: 'active', record_status: 'active' },
      { id: 'district-approver-2', auth_user_id: 'user-dist-app-2', branch_id: 'branch-a', membership_status: 'active', record_status: 'active' },
      { id: 'other-district-approver', auth_user_id: 'user-other-dist', branch_id: 'branch-b', membership_status: 'active', record_status: 'active' }
    );
    state.permissions.push(
      { profile_id: 'branch-only', permission: 'manage_finances', branch_id: 'branch-a', district_id: null },
      { profile_id: 'district-approver-1', permission: 'approve_finances', branch_id: null, district_id: 'district-a' },
      { profile_id: 'district-approver-2', permission: 'approve_finances', branch_id: null, district_id: 'district-a' },
      { profile_id: 'other-district-approver', permission: 'approve_finances', branch_id: null, district_id: 'district-b' },
      { profile_id: 'creator', permission: 'post_journals', branch_id: null, district_id: 'district-a' },
      { profile_id: 'creator', permission: 'post_journals', branch_id: null, district_id: null }
    );
    state.financialAccounts.push(
      { id: 'church-cash', branch_id: null, district_id: null, name: 'HQ Cash', account_type: 'cash', currency_code: 'SLL', is_active: true, chart_account_id: 'cash-chart' },
      { id: 'district-cash', branch_id: null, district_id: 'district-a', name: 'District A Cash', account_type: 'cash', currency_code: 'SLL', is_active: true, chart_account_id: 'cash-chart' },
      { id: 'other-district-cash', branch_id: null, district_id: 'district-b', name: 'District B Cash', account_type: 'cash', currency_code: 'SLL', is_active: true, chart_account_id: 'cash-chart' }
    );
    state.approvalPolicies.push(
      { id: 'church-pol', name: 'Church Policy', transaction_type: 'financial_document', branch_id: null, district_id: null, version: 1, effective_from: '2026-01-01', is_active: true },
      { id: 'district-pol', name: 'District Multi Policy', transaction_type: 'financial_document', branch_id: null, district_id: 'district-a', version: 1, effective_from: '2026-01-01', is_active: true }
    );
    state.approvalPolicyBands.push(
      { id: 'church-band', policy_id: 'church-pol', min_amount_base: 0, max_amount_base: null },
      { id: 'dist-band-low', policy_id: 'district-pol', min_amount_base: 0, max_amount_base: 1000 },
      { id: 'dist-band-high', policy_id: 'district-pol', min_amount_base: 1000, max_amount_base: null }
    );
    state.approvalPolicySteps.push(
      { id: 'ch-s1', band_id: 'church-band', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
      { id: 'dl-s1', band_id: 'dist-band-low', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
      { id: 'dh-s1', band_id: 'dist-band-high', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
      { id: 'dh-s2', band_id: 'dist-band-high', step_number: 2, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
    );

    let current = structuredClone(state);
    let authUserId: string | null = 'user-creator';
    const rpc = createMockFinanceRpc({
      load: () => structuredClone(current),
      save: (next) => { current = structuredClone(next); }
    }, () => ({ userId: authUserId }));
    return {
      rpc,
      setUser: (id: string | null) => { authUserId = id; },
      read: () => structuredClone(current)
    };
  }

  test('returns hierarchical finance options without sibling district or child branch leakage', async () => {
    const ctx = scopedFixture();
    const churchOpts = await ctx.rpc.rpc('get_finance_scope_transaction_options', { p_scope_type: 'church', p_scope_id: null });
    expect(churchOpts.error).toBeNull();
    expect(churchOpts.data.financialAccounts.map((a: any) => a.id)).toEqual(['church-cash']);

    const distOpts = await ctx.rpc.rpc('get_finance_scope_transaction_options', { p_scope_type: 'district', p_scope_id: 'district-a' });
    expect(distOpts.error).toBeNull();
    expect(distOpts.data.financialAccounts.map((a: any) => a.id)).toEqual(['church-cash', 'district-cash']);

    const branchOpts = await ctx.rpc.rpc('get_finance_scope_transaction_options', { p_scope_type: 'branch', p_scope_id: 'branch-a' });
    expect(branchOpts.error).toBeNull();
    expect(branchOpts.data.financialAccounts.map((a: any) => a.id)).toEqual(['cash-account', 'church-cash', 'district-cash']);
  });

  test('executes full district multi-step lifecycle, enforces scope isolation and idempotency', async () => {
    const ctx = scopedFixture();
    // Cross-scope account denied
    const crossAccount = await ctx.rpc.rpc('create_finance_scope_document_transaction', {
      p_scope_type: 'district', p_scope_id: 'district-a',
      p_document_type: 'payment', p_transaction_date: '2026-06-15',
      p_profile_id: null, p_party_name: 'Vendor', p_amount: 1500,
      p_currency_code: 'SLL', p_payment_method: 'bank_transfer',
      p_financial_account_id: 'other-district-cash', p_category_account_id: 'expense-chart',
      p_fund_id: 'fund-a', p_external_reference: null, p_description: 'Test',
      p_exchange_rate_to_base: 1, p_idempotency_key: '00000000-0000-4000-8000-000000000101'
    });
    expect(crossAccount.error).not.toBeNull();

    // Branch user cannot create church or district transactions
    ctx.setUser('user-branch-only');
    const deniedChurch = await ctx.rpc.rpc('create_finance_scope_document_transaction', {
      p_scope_type: 'church', p_scope_id: null,
      p_document_type: 'receipt', p_transaction_date: '2026-06-15',
      p_profile_id: null, p_party_name: 'HQ Donor', p_amount: 100,
      p_currency_code: 'SLL', p_payment_method: 'cash',
      p_financial_account_id: 'church-cash', p_category_account_id: 'income-chart',
      p_fund_id: 'fund-a', p_external_reference: null, p_description: 'HQ gift',
      p_exchange_rate_to_base: 1, p_idempotency_key: '00000000-0000-4000-8000-000000000102'
    });
    expect(deniedChurch.error?.code).toBe('42501');

    // High-band district payment uses 2-step band
    ctx.setUser('user-creator');
    const distPaymentArgs = {
      p_scope_type: 'district', p_scope_id: 'district-a',
      p_document_type: 'payment', p_transaction_date: '2026-06-15',
      p_profile_id: null, p_party_name: 'Convention Hall', p_amount: 1500,
      p_currency_code: 'SLL', p_payment_method: 'bank_transfer',
      p_financial_account_id: 'district-cash', p_category_account_id: 'expense-chart',
      p_fund_id: 'fund-a', p_external_reference: 'DIST-PAY-1', p_description: 'District retreat venue',
      p_exchange_rate_to_base: 1, p_idempotency_key: '00000000-0000-4000-8000-000000000103'
    };
    const created = await ctx.rpc.rpc('create_finance_scope_document_transaction', distPaymentArgs);
    expect(created.error).toBeNull();
    expect(created.data.status).toBe('pending_approval');

    const replay = await ctx.rpc.rpc('create_finance_scope_document_transaction', distPaymentArgs);
    expect(replay.error).toBeNull();
    expect(replay.data.document_id).toBe(created.data.document_id);
    expect(replay.data.idempotent_replay).toBe(true);

    const conflict = await ctx.rpc.rpc('create_finance_scope_document_transaction', {
      ...distPaymentArgs, p_amount: 1600
    });
    expect(conflict.error?.message).toContain('different transaction details');

    const steps = ctx.read().approvalSteps
      .filter(step => step.approval_request_id === created.data.approval_request_id)
      .sort((a, b) => Number(a.step_order) - Number(b.step_order));
    expect(steps).toHaveLength(2);

    // Other-district approver denied
    ctx.setUser('user-other-dist');
    const wrongDistrict = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: steps[0].id, p_decision: 'approved'
    });
    expect(wrongDistrict.error?.code).toBe('42501');

    // Step 1 and Step 2 approved
    ctx.setUser('user-dist-app-1');
    const step1 = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: steps[0].id, p_decision: 'approved'
    });
    expect(step1.error).toBeNull();
    expect(step1.data.approval_status).toBe('pending');

    ctx.setUser('user-dist-app-2');
    const step2 = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: steps[1].id, p_decision: 'approved'
    });
    expect(step2.error).toBeNull();
    expect(step2.data.approval_status).toBe('approved');

    // Post journal & inspect scope isolation
    ctx.setUser('user-creator');
    const posted = await ctx.rpc.rpc('post_finance_journal_entry', {
      p_journal_entry_id: created.data.journal_entry_id
    });
    expect(posted.error).toBeNull();
    expect(posted.data.status).toBe('posted');

    const districtDocs = await ctx.rpc.rpc('get_finance_scope_documents', { p_scope_type: 'district', p_scope_id: 'district-a' });
    expect(districtDocs.data.documents).toHaveLength(1);
    const branchDocs = await ctx.rpc.rpc('get_finance_scope_documents', { p_scope_type: 'branch', p_scope_id: 'branch-a' });
    expect(branchDocs.data.documents).toHaveLength(0);
    const churchDocs = await ctx.rpc.rpc('get_finance_scope_documents', { p_scope_type: 'church', p_scope_id: null });
    expect(churchDocs.data.documents).toHaveLength(0);

    const districtJournals = await ctx.rpc.rpc('get_finance_scope_journals', { p_scope_type: 'district', p_scope_id: 'district-a' });
    expect(districtJournals.data.journals).toHaveLength(1);
    expect(districtJournals.data.account_balances.find((row: any) => row.account_id === 'expense-chart')?.debit_total).toBe(1500);
    const branchJournals = await ctx.rpc.rpc('get_finance_scope_journals', { p_scope_type: 'branch', p_scope_id: 'branch-a' });
    expect(branchJournals.data.journals).toHaveLength(0);
    expect(branchJournals.data.account_balances).toHaveLength(0);
  });
});

describe('finance transaction creation & posting hardening', () => {
  test('enforces distinct approvers across approval levels and hides step 2 action from step 1 approver', async () => {
    const ctx = fixture();
    const created = await ctx.rpc.rpc('create_financial_document_transaction_idempotent', args);
    expect(created.error).toBeNull();
    const steps = ctx.read().approvalSteps.sort((a, b) => a.step_order - b.step_order);

    ctx.setUser('user-approver-1');
    const step1 = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: steps[0].id, p_decision: 'approved'
    });
    expect(step1.error).toBeNull();
    expect(step1.data.approval_status).toBe('pending');

    // Step 1 approver must not see step 2 as actionable
    const docsForApprover1 = await ctx.rpc.rpc('get_finance_documents', { p_branch_id: 'branch-a' });
    expect(docsForApprover1.error).toBeNull();
    expect(docsForApprover1.data.documents[0].actor_approval_step_id).toBeNull();

    // Attempting to approve step 2 with same approver must fail
    const sameApproverStep2 = await ctx.rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: steps[1].id, p_decision: 'approved'
    });
    expect(sameApproverStep2.error?.message).toContain('Each approval level requires a different approver');

    // Step 2 approver sees step 2 and completes approval
    ctx.setUser('user-approver-2');
    const docsForApprover2 = await ctx.rpc.rpc('get_finance_documents', { p_branch_id: 'branch-a' });
    expect(docsForApprover2.data.documents[0].actor_approval_step_id).toBe(steps[1].id);
  });

  test('blocks submitter self-approval and unauthorized approvers without mutating approval state', async () => {
    const ctx = fixture();
    const state = ctx.read();
    state.permissions.push({ profile_id: 'creator', permission: 'approve_finances', branch_id: 'branch-a' });
    let authUser: string | null = 'user-creator';
    const rpc = createMockFinanceRpc({
      load: () => structuredClone(state),
      save: next => Object.assign(state, structuredClone(next))
    }, () => ({ userId: authUser }));

    const created = await rpc.rpc('create_financial_document_transaction_idempotent', args);
    expect(created.error).toBeNull();
    const stepId = state.approvalSteps[0].id;

    const selfApprove = await rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: stepId, p_decision: 'approved'
    });
    expect(selfApprove.error?.code).toBe('42501');
    expect(selfApprove.error?.message).toContain('submitter cannot approve');

    authUser = 'user-member';
    const memberApprove = await rpc.rpc('decide_financial_document_approval', {
      p_request_step_id: stepId, p_decision: 'approved'
    });
    expect(memberApprove.error?.code).toBe('42501');
    expect(state.approvalDecisions).toHaveLength(0);
  });

  test('validates amount, calendar date, currency, FX rate, category type, and counterparty/description', async () => {
    const ctx = fixture();
    const state = ctx.read();
    state.chartAccounts.push({
      id: 'control-income', code: '4999', name: 'Control Income', normal_balance: 'credit',
      is_active: true, account_type: 'income', is_control_account: true
    });
    state.financialAccounts.push({
      id: 'usd-account', branch_id: 'branch-a', district_id: 'district-a', name: 'USD Cash',
      account_type: 'cash', currency_code: 'USD', is_active: true, chart_account_id: 'cash-chart'
    });
    const rpc = createMockFinanceRpc({
      load: () => structuredClone(state),
      save: next => Object.assign(state, structuredClone(next))
    }, () => ({ userId: 'user-creator' }));

    expect((await rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_amount: 0, p_idempotency_key: 'val-1'
    })).error?.message).toContain('positive amount');

    expect((await rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_amount: -50, p_idempotency_key: 'val-2'
    })).error?.message).toContain('positive amount');

    expect((await rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_transaction_date: '2026-02-30', p_idempotency_key: 'val-3'
    })).error?.message).toContain('Transaction date');

    expect((await rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_currency_code: 'EUR', p_idempotency_key: 'val-4'
    })).error?.message).toContain('valid transaction currency');

    expect((await rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_exchange_rate_to_base: 2, p_idempotency_key: 'val-5'
    })).error?.message).toContain('Exchange rate must be 1');

    expect((await rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_category_account_id: 'expense-chart', p_idempotency_key: 'val-6'
    })).error?.message).toContain('non-control account of the correct type');

    expect((await rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_category_account_id: 'control-income', p_idempotency_key: 'val-7'
    })).error?.message).toContain('non-control account of the correct type');

    expect((await rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args, p_party_name: '   ', p_idempotency_key: 'val-8'
    })).error?.message).toContain('Counterparty name and description');

    expect(state.documents).toHaveLength(0);

    // Valid FX receipt creates balanced lines in both USD and base SLL
    const fxReceipt = await rpc.rpc('create_financial_document_transaction_idempotent', {
      ...args,
      p_currency_code: 'USD',
      p_financial_account_id: 'usd-account',
      p_amount: 100,
      p_exchange_rate_to_base: 22.5,
      p_idempotency_key: 'val-fx-ok'
    });
    expect(fxReceipt.error).toBeNull();
    expect(state.journalLines).toHaveLength(2);
    expect(state.journalLines.reduce((sum, l) => sum + l.debit_amount, 0)).toBe(100);
    expect(state.journalLines.reduce((sum, l) => sum + l.credit_amount, 0)).toBe(100);
    expect(state.journalLines.reduce((sum, l) => sum + l.base_debit_amount, 0)).toBe(2250);
    expect(state.journalLines.reduce((sum, l) => sum + l.base_credit_amount, 0)).toBe(2250);
  });

  test('blocks posting unbalanced or single-line journals', async () => {
    const ctx = fixture();
    const state = ctx.read();
    state.approvalPolicySteps = [];
    const rpc = createMockFinanceRpc({
      load: () => structuredClone(state),
      save: next => Object.assign(state, structuredClone(next))
    }, () => ({ userId: 'user-creator' }));

    const created = await rpc.rpc('create_financial_document_transaction_idempotent', args);
    expect(created.error).toBeNull();
    expect(created.data.status).toBe('approved');

    // Corrupt a journal line to simulate an unbalanced journal
    state.journalLines[0].debit_amount = 300;
    state.journalLines[0].base_debit_amount = 300;
    const unbalanced = await rpc.rpc('post_finance_journal_entry', {
      p_journal_entry_id: created.data.journal_entry_id
    });
    expect(unbalanced.error?.message).toContain('not balanced');
    expect(state.journals[0].status).toBe('draft');

    // Remove one line to simulate < 2 lines
    state.journalLines.pop();
    const tooFewLines = await rpc.rpc('post_finance_journal_entry', {
      p_journal_entry_id: created.data.journal_entry_id
    });
    expect(tooFewLines.error?.message).toContain('at least two lines');
  });

  test('persists receipt and payment creation, approval, and posted balances across storage reloads', async () => {
    const store = new Map<string, string>();
    const kv = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); }
    };
    const baseState = fixture().read();
    createBrowserMockFinanceStorage(kv, 'reload-test').save(baseState);

    // Session 1: Create receipt
    let activeUser: string | null = 'user-creator';
    const session1 = createMockFinanceRpc(createBrowserMockFinanceStorage(kv, 'reload-test'), () => ({ userId: activeUser }));
    const created = await session1.rpc('create_financial_document_transaction_idempotent', args);
    expect(created.error).toBeNull();

    // Session 2 (fresh RPC instance loading from storage): Approve step 1 and step 2
    const session2 = createMockFinanceRpc(createBrowserMockFinanceStorage(kv, 'reload-test'), () => ({ userId: activeUser }));
    activeUser = 'user-approver-1';
    const docs1 = await session2.rpc('get_finance_documents', { p_branch_id: 'branch-a' });
    const step1Id = docs1.data.documents[0].actor_approval_step_id;
    expect((await session2.rpc('decide_financial_document_approval', { p_request_step_id: step1Id, p_decision: 'approved' })).error).toBeNull();

    activeUser = 'user-approver-2';
    const docs2 = await session2.rpc('get_finance_documents', { p_branch_id: 'branch-a' });
    const step2Id = docs2.data.documents[0].actor_approval_step_id;
    expect((await session2.rpc('decide_financial_document_approval', { p_request_step_id: step2Id, p_decision: 'approved' })).error).toBeNull();

    // Session 3 (fresh RPC instance): Post journal and verify persisted posted ledger balances
    activeUser = 'user-creator';
    const session3 = createMockFinanceRpc(createBrowserMockFinanceStorage(kv, 'reload-test'), () => ({ userId: activeUser }));
    const postResult = await session3.rpc('post_finance_journal_entry', { p_journal_entry_id: created.data.journal_entry_id });
    expect(postResult.error).toBeNull();

    const session4 = createMockFinanceRpc(createBrowserMockFinanceStorage(kv, 'reload-test'), () => ({ userId: activeUser }));
    const journals = await session4.rpc('get_finance_journals', { p_branch_id: 'branch-a' });
    expect(journals.error).toBeNull();
    expect(journals.data.journals[0].status).toBe('posted');
    expect(journals.data.account_balances.find((b: any) => b.account_id === 'cash-chart')?.debit_total).toBe(250);
    expect(journals.data.account_balances.find((b: any) => b.account_id === 'income-chart')?.credit_total).toBe(250);
  });
});




describe('mock internal financial transfer RPC', () => {
  test('creates and atomically posts a same-branch transfer as one balanced journal', async () => {
    const ctx = transferFixture();
    const result = await ctx.rpc.rpc('create_financial_transfer', {
      ...transferArgs,
      p_destination_branch_id: 'branch-a',
      p_destination_financial_account_id: 'bank-account-a'
    });
    expect(result.error).toBeNull();
    expect(result.data.status).toBe('approved');
    expect(result.data.destination_journal_entry_id).toBeNull();
    const state = ctx.read();
    expect(state.transfers).toHaveLength(1);
    const journal = state.journals.find(item => item.id === result.data.source_journal_entry_id)!;
    const lines = state.journalLines.filter(item => item.journal_entry_id === journal.id);
    expect(journal.source_type).toBe('financial_transfer');
    expect(lines).toHaveLength(2);
    expect(lines.find(item => item.account_id === 'bank-chart-a')?.debit_amount).toBe(250);
    expect(lines.find(item => item.account_id === 'cash-chart')?.credit_amount).toBe(250);

    const posted = await ctx.rpc.rpc('post_financial_transfer', { p_transfer_id: result.data.transfer_id });
    expect(posted.error).toBeNull();
    expect(ctx.read().transfers[0].status).toBe('posted');
    expect(ctx.read().journals.find(item => item.id === journal.id)?.status).toBe('posted');
  });

  test('creates cross-branch reciprocal clearing journals and posts both atomically', async () => {
    const ctx = transferFixture();
    const result = await ctx.rpc.rpc('create_financial_transfer', transferArgs);
    expect(result.error).toBeNull();
    expect(result.data.status).toBe('approved');
    expect(result.data.destination_journal_entry_id).toBeTruthy();
    const state = ctx.read();
    const sourceLines = state.journalLines.filter(item => item.journal_entry_id === result.data.source_journal_entry_id);
    const destinationLines = state.journalLines.filter(item => item.journal_entry_id === result.data.destination_journal_entry_id);
    expect(sourceLines.find(item => item.account_id === 'due-from-chart')?.debit_amount).toBe(250);
    expect(sourceLines.find(item => item.account_id === 'cash-chart')?.credit_amount).toBe(250);
    expect(destinationLines.find(item => item.account_id === 'bank-chart-b')?.debit_amount).toBe(250);
    expect(destinationLines.find(item => item.account_id === 'due-to-chart')?.credit_amount).toBe(250);

    const unilateral = await ctx.rpc.rpc('post_finance_journal_entry', { p_journal_entry_id: result.data.source_journal_entry_id });
    expect(unilateral.error?.message).toContain('posted together');
    expect(ctx.read().journals.filter(item => item.source_id === result.data.transfer_id).every(item => item.status === 'draft')).toBe(true);

    const posted = await ctx.rpc.rpc('post_financial_transfer', { p_transfer_id: result.data.transfer_id });
    expect(posted.error).toBeNull();
    expect(ctx.read().journals.filter(item => item.source_id === result.data.transfer_id).every(item => item.status === 'posted')).toBe(true);
  });

  test('requires both branch approval workflows and rejects self-approval', async () => {
    const ctx = transferFixture(true);
    const created = await ctx.rpc.rpc('create_financial_transfer', transferArgs);
    expect(created.error).toBeNull();
    expect(created.data.status).toBe('pending_approval');
    const pending = ctx.read();
    const sourceRequest = pending.approvalRequests.find(item => item.id === created.data.source_approval_request_id)!;
    const destinationRequest = pending.approvalRequests.find(item => item.id === created.data.destination_approval_request_id)!;
    const sourceStep = pending.approvalSteps.find(item => item.approval_request_id === sourceRequest.id)!;
    const destinationStep = pending.approvalSteps.find(item => item.approval_request_id === destinationRequest.id)!;

    const selfApproval = await ctx.rpc.rpc('decide_financial_transfer_approval', {
      p_request_step_id: sourceStep.id, p_decision: 'approved'
    });
    expect(selfApproval.error?.message).toContain('submitter cannot approve');

    ctx.setUser('user-approver-1');
    const first = await ctx.rpc.rpc('decide_financial_transfer_approval', {
      p_request_step_id: sourceStep.id, p_decision: 'approved'
    });
    expect(first.error).toBeNull();
    expect(first.data.status).toBe('pending_approval');
    const prematurePost = await ctx.rpc.rpc('post_financial_transfer', { p_transfer_id: created.data.transfer_id });
    expect(prematurePost.error?.message).toContain('approval workflows');

    ctx.setUser('user-approver-2');
    const second = await ctx.rpc.rpc('decide_financial_transfer_approval', {
      p_request_step_id: destinationStep.id, p_decision: 'approved'
    });
    expect(second.error).toBeNull();
    expect(second.data.status).toBe('approved');
  });

  test('rejects cross-currency and missing clearing-account transfers', async () => {
    const ctx = transferFixture();
    const crossCurrency = await ctx.rpc.rpc('create_financial_transfer', {
      ...transferArgs, p_currency_code: 'USD'
    });
    expect(crossCurrency.error?.message).toContain('same currency');
    const state = ctx.read();
    state.branchClearingAccounts = state.branchClearingAccounts.filter(item => item.branch_id !== 'branch-b');
    ctx.write(state);
    const missingClearing = await ctx.rpc.rpc('create_financial_transfer', {
      ...transferArgs, p_idempotency_key: '00000000-0000-4000-8000-000000000102'
    });
    expect(missingClearing.error?.message).toContain('clearing accounts');
  });
});


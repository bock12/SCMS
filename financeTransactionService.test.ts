import { describe, expect, test } from 'bun:test';
import { createEmptyMockFinanceState, createMockFinanceRpc, type MockFinanceState } from './mockFinanceRpc';
import {
  createFinancialDocumentTransaction,
  decideFinancialDocumentApproval,
  type CreateFinancialDocumentTransactionInput
} from './financeTransactionService';

const baseInput: CreateFinancialDocumentTransactionInput = {
  documentType: 'receipt',
  transactionDate: '2026-11-17',
  branchId: 'branch-1',
  partyName: '  Grace Campbell  ',
  amount: 125,
  currencyCode: ' sll ',
  paymentMethod: 'mobile_money',
  financialAccountId: 'cash-account-1',
  categoryAccountId: 'income-account-1',
  externalReference: '  TX-100  ',
  description: '  Sunday offering  '
};

describe('finance transaction RPC service', () => {
  test('maps receipt input to the secure database RPC contract', async () => {
    let calledName = '';
    let calledArgs: Record<string, unknown> = {};
    const client = {
      async rpc(name: string, args: Record<string, unknown>) {
        calledName = name;
        calledArgs = args;
        return { data: { document_id: 'doc-1', journal_entry_id: 'journal-1', approval_request_id: 'approval-1', status: 'pending' }, error: null };
      }
    };

    const result = await createFinancialDocumentTransaction(baseInput, client as any);

    expect(calledName).toBe('create_financial_document_transaction');
    expect(calledArgs).toEqual({
      p_document_type: 'receipt',
      p_transaction_date: '2026-11-17',
      p_branch_id: 'branch-1',
      p_profile_id: null,
      p_party_name: 'Grace Campbell',
      p_amount: 125,
      p_currency_code: 'SLL',
      p_payment_method: 'mobile_money',
      p_financial_account_id: 'cash-account-1',
      p_category_account_id: 'income-account-1',
      p_fund_id: null,
      p_external_reference: 'TX-100',
      p_description: 'Sunday offering',
      p_exchange_rate_to_base: 1
    });
    expect(result.error).toBeNull();
    expect(result.data?.document_id).toBe('doc-1');
  });

  test('maps optional member, fund and foreign-currency values for a payment', async () => {
    let calledArgs: Record<string, unknown> = {};
    const client = {
      async rpc(_name: string, args: Record<string, unknown>) {
        calledArgs = args;
        return { data: null, error: { code: '42501', message: 'Permission denied' } };
      }
    };

    const result = await createFinancialDocumentTransaction({
      ...baseInput,
      documentType: 'payment',
      profileId: 'profile-1',
      fundId: 'fund-1',
      currencyCode: 'USD',
      exchangeRateToBase: 22.5,
      externalReference: ' ',
    }, client as any);

    expect(calledArgs.p_document_type).toBe('payment');
    expect(calledArgs.p_profile_id).toBe('profile-1');
    expect(calledArgs.p_fund_id).toBe('fund-1');
    expect(calledArgs.p_exchange_rate_to_base).toBe(22.5);
    expect(calledArgs.p_external_reference).toBeNull();
    expect(result.error?.code).toBe('42501');
  });

  test('routes approval decisions through the database workflow and normalizes comments', async () => {
    let calledName = '';
    let calledArgs: Record<string, unknown> = {};
    const client = {
      async rpc(name: string, args: Record<string, unknown>) {
        calledName = name;
        calledArgs = args;
        return { data: { document_id: 'doc-1', approval_request_id: 'request-1', journal_entry_id: null, approval_status: 'pending' }, error: null };
      }
    };

    await decideFinancialDocumentApproval({
      requestStepId: 'step-1',
      decision: 'approved',
      comments: '  Checked and verified  '
    }, client as any);

    expect(calledName).toBe('decide_financial_document_approval');
    expect(calledArgs).toEqual({
      p_request_step_id: 'step-1',
      p_decision: 'approved',
      p_comments: 'Checked and verified'
    });
  });
});


describe('finance transaction service end-to-end adapter integration', () => {
  test('creates, approves, posts and reports a payment through the typed service boundary', async () => {
    const initial: MockFinanceState = {
      ...createEmptyMockFinanceState(),
      profiles: [
        { id: 'creator', auth_user_id: 'user-creator', branch_id: 'branch-1' },
        { id: 'approver-1', auth_user_id: 'user-approver-1', branch_id: 'branch-1' },
        { id: 'approver-2', auth_user_id: 'user-approver-2', branch_id: 'branch-1' }
      ],
      permissions: [
        { profile_id: 'creator', permission: 'manage_finances', branch_id: 'branch-1' },
        { profile_id: 'creator', permission: 'post_journals', branch_id: 'branch-1' },
        { profile_id: 'approver-1', permission: 'approve_finances', branch_id: 'branch-1' },
        { profile_id: 'approver-2', permission: 'approve_finances', branch_id: 'branch-1' }
      ],
      currencies: ['SLL'],
      baseCurrencyCode: 'SLL',
      chartAccounts: [
        { id: 'cash-chart', code: '1000', name: 'Cash', account_type: 'asset', normal_balance: 'debit', is_active: true },
        { id: 'expense-chart', code: '5000', name: 'Operating Expense', account_type: 'expense', normal_balance: 'debit', is_active: true }
      ],
      financialAccounts: [{
        id: 'cash-account-1', branch_id: 'branch-1', name: 'Main Cash',
        account_type: 'cash', currency_code: 'SLL', is_active: true, chart_account_id: 'cash-chart'
      }],
      financialYears: [{ id: 'year-1', year_number: 2026, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
      periods: [{ id: 'period-1', financial_year_id: 'year-1', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open', year_status: 'open' }],
      approvalPolicies: [{
        id: 'policy-1', name: 'Two-step payment policy', transaction_type: 'financial_document',
        branch_id: 'branch-1', is_active: true, min_amount: 0, max_amount: null,
        approver_profile_ids: ['approver-1', 'approver-2']
      }],
      approvalPolicyBands: [{ id: 'band-1', policy_id: 'policy-1', min_amount_base: 0, max_amount_base: 100000 }],
      approvalPolicySteps: [
        { id: 'policy-step-1', band_id: 'band-1', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true },
        { id: 'policy-step-2', band_id: 'band-1', step_number: 2, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
      ]
    };
    let current = structuredClone(initial);
    let authUserId: string | null = 'user-creator';
    const client = createMockFinanceRpc({
      load: () => structuredClone(current),
      save: next => { current = structuredClone(next); }
    }, () => ({ userId: authUserId }));

    const created = await createFinancialDocumentTransaction({
      ...baseInput,
      documentType: 'payment',
      branchId: 'branch-1',
      financialAccountId: 'cash-account-1',
      categoryAccountId: 'expense-chart',
      currencyCode: 'SLL',
      amount: 125,
      partyName: 'Utility provider',
      description: 'Electricity bill'
    }, client);

    expect(created.error).toBeNull();
    expect(created.data?.status).toBe('pending_approval');
    expect(current.documents).toHaveLength(1);
    expect(current.journals).toHaveLength(1);
    expect(current.journalLines).toHaveLength(2);

    const steps = [...current.approvalSteps];
    authUserId = 'user-approver-1';
    const first = await decideFinancialDocumentApproval({
      requestStepId: steps[0].id, decision: 'approved'
    }, client);
    expect(first.error).toBeNull();
    expect(first.data?.approval_status).toBe('pending');

    authUserId = 'user-approver-2';
    const second = await decideFinancialDocumentApproval({
      requestStepId: steps[1].id, decision: 'approved'
    }, client);
    expect(second.error).toBeNull();
    expect(second.data?.approval_status).toBe('approved');

    authUserId = 'user-creator';
    const posted = await client.rpc('post_finance_journal_entry', {
      p_journal_entry_id: created.data!.journal_entry_id
    });
    expect(posted.error).toBeNull();
    expect(posted.data.status).toBe('posted');

    const ledger = await client.rpc('get_finance_journals', { p_branch_id: 'branch-1' });
    expect(ledger.error).toBeNull();
    expect(ledger.data.journals[0].status).toBe('posted');
    expect(ledger.data.journals[0].total_debits).toBe(125);
    expect(ledger.data.journals[0].total_credits).toBe(125);
    expect(ledger.data.account_balances.find((row: any) => row.account_id === 'expense-chart')?.debit_total).toBe(125);
    expect(ledger.data.account_balances.find((row: any) => row.account_id === 'cash-chart')?.credit_total).toBe(125);
    expect(current.documents[0].status).toBe('posted');
  });
});


function createTransactionSecurityFixture(): MockFinanceState {
  return {
    ...createEmptyMockFinanceState(),
    profiles: [
      { id: 'creator', auth_user_id: 'user-creator', branch_id: 'branch-1' },
      { id: 'approver', auth_user_id: 'user-approver', branch_id: 'branch-1' }
    ],
    permissions: [
      { profile_id: 'creator', permission: 'manage_finances', branch_id: 'branch-1' },
      { profile_id: 'creator', permission: 'post_journals', branch_id: 'branch-1' },
      { profile_id: 'approver', permission: 'approve_finances', branch_id: 'branch-1' }
    ],
    currencies: ['SLL'],
    baseCurrencyCode: 'SLL',
    chartAccounts: [
      { id: 'cash-chart', code: '1000', name: 'Cash', account_type: 'asset', normal_balance: 'debit', is_active: true },
      { id: 'income-chart', code: '4000', name: 'Offering Income', account_type: 'income', normal_balance: 'credit', is_active: true }
    ],
    financialAccounts: [{
      id: 'cash-account-1', branch_id: 'branch-1', name: 'Main Cash',
      account_type: 'cash', currency_code: 'SLL', is_active: true, chart_account_id: 'cash-chart'
    }],
    financialYears: [{ id: 'year-1', year_number: 2026, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
    periods: [{ id: 'period-1', financial_year_id: 'year-1', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open', year_status: 'open' }],
    approvalPolicies: [{
      id: 'policy-1', name: 'Receipt policy', transaction_type: 'financial_document',
      branch_id: 'branch-1', is_active: true, min_amount: 0, max_amount: null,
      approver_profile_ids: []
    }],
    approvalPolicyBands: [{ id: 'band-1', policy_id: 'policy-1', min_amount_base: 0, max_amount_base: 100000 }],
    approvalPolicySteps: [{
      id: 'policy-step-1', band_id: 'band-1', step_number: 1,
      required_permission_key: 'approve_finances', required_approvals: 1,
      prohibit_submitter_approval: true
    }]
  };
}

describe('financial transaction creation security and fail-closed validation', () => {
  const cases: Array<{ name: string; mutate?: (state: MockFinanceState) => void; auth?: string | null; branchId?: string }> = [
    { name: 'rejects unauthenticated callers', auth: null },
    { name: 'rejects accounts without an active linked profile', auth: 'unlinked-user' },
    { name: 'rejects callers without manage_finances permission', mutate: s => { s.permissions = []; } },
    { name: 'rejects permission granted only in another branch', mutate: s => { s.permissions[0].branch_id = 'branch-2'; } },
    { name: 'rejects an unconfigured base currency', mutate: s => { s.baseCurrencyCode = null; } },
    { name: 'rejects a missing active financial-document approval policy', mutate: s => { s.approvalPolicies = []; } },
    { name: 'rejects an approval policy without a covering amount band', mutate: s => { s.approvalPolicyBands = []; } },
    { name: 'rejects an inactive financial account', mutate: s => { s.financialAccounts[0].is_active = false; } },
    { name: 'rejects an account belonging to another branch', mutate: s => { s.financialAccounts[0].branch_id = 'branch-2'; } },
    { name: 'rejects an inactive category account', mutate: s => { s.chartAccounts[1].is_active = false; } },
    { name: 'rejects a category account of the wrong type', mutate: s => { s.chartAccounts[1].account_type = 'expense'; } },
    { name: 'rejects a closed financial period', mutate: s => { s.periods[0].status = 'closed'; } },
    { name: 'rejects a closed financial year', mutate: s => { s.periods[0].year_status = 'closed'; } }
  ];

  for (const scenario of cases) {
    test(scenario.name + ' without persisting partial transaction records', async () => {
      let current = createTransactionSecurityFixture();
      scenario.mutate?.(current);
      const before = structuredClone(current);
      const client = createMockFinanceRpc({
        load: () => structuredClone(current),
        save: next => { current = structuredClone(next); }
      }, () => ({ userId: scenario.auth === undefined ? 'user-creator' : scenario.auth }));

      const result = await createFinancialDocumentTransaction({
        ...baseInput,
        branchId: scenario.branchId ?? 'branch-1'
      }, client);

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
      expect(current).toEqual(before);
      expect(current.documents).toHaveLength(0);
      expect(current.journals).toHaveLength(0);
      expect(current.journalLines).toHaveLength(0);
      expect(current.approvalRequests).toHaveLength(0);
      expect(current.approvalSteps).toHaveLength(0);
    });
  }
});


describe('financial document approval and rejection lifecycle', () => {
  async function createPendingReceipt() {
    let current = createTransactionSecurityFixture();
    let authUserId: string | null = 'user-creator';
    const client = createMockFinanceRpc({
      load: () => structuredClone(current),
      save: next => { current = structuredClone(next); }
    }, () => ({ userId: authUserId }));
    const created = await createFinancialDocumentTransaction(baseInput, client);
    expect(created.error).toBeNull();
    expect(created.data?.status).toBe('pending_approval');
    return {
      client,
      getState: () => current,
      setAuth: (userId: string | null) => { authUserId = userId; },
      requestStepId: current.approvalSteps[0].id,
      journalId: current.journals[0].id
    };
  }

  test('prevents the transaction submitter from approving their own request', async () => {
    const flow = await createPendingReceipt();
    const before = flow.getState();
    flow.setAuth('user-creator');

    const result = await decideFinancialDocumentApproval({
      requestStepId: flow.requestStepId,
      decision: 'approved'
    }, flow.client);

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('42501');
    expect(flow.getState()).toEqual(before);
    expect(flow.getState().documents[0].status).toBe('pending_approval');
    expect(flow.getState().approvalDecisions).toHaveLength(0);
  });

  test('rejects an approval decision from a profile without the required scoped permission', async () => {
    const flow = await createPendingReceipt();
    const before = flow.getState();
    flow.setAuth('user-unlinked-approver');

    const result = await decideFinancialDocumentApproval({
      requestStepId: flow.requestStepId,
      decision: 'approved'
    }, flow.client);

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('42501');
    expect(flow.getState()).toEqual(before);
  });

  test('rejects out-of-order approval steps without recording a decision', async () => {
    const flow = await createPendingReceipt();
    const state = flow.getState();
    state.profiles.push({ id: 'approver-2', auth_user_id: 'user-approver-2', branch_id: 'branch-1' });
    state.permissions.push({ profile_id: 'approver-2', permission: 'approve_finances', branch_id: 'branch-1' });
    state.approvalSteps.push({
      id: 'step-2', approval_request_id: state.approvalRequests[0].id,
      step_order: 2, required_permission_key: 'approve_finances',
      required_approvals: 1, prohibit_submitter_approval: true, status: 'pending'
    });
    const before = structuredClone(state);
    flow.setAuth('user-approver-2');

    const result = await decideFinancialDocumentApproval({
      requestStepId: 'step-2',
      decision: 'approved'
    }, flow.client);

    expect(result.data).toBeNull();
    expect(result.error?.message).toContain('Earlier approval steps');
    expect(flow.getState()).toEqual(before);
  });

  test('rejection closes the document and permanently blocks posting its pending journal', async () => {
    const flow = await createPendingReceipt();
    flow.setAuth('user-approver');

    const rejected = await decideFinancialDocumentApproval({
      requestStepId: flow.requestStepId,
      decision: 'rejected',
      comments: 'Supporting documentation is incomplete'
    }, flow.client);

    expect(rejected.error).toBeNull();
    expect(rejected.data?.approval_status).toBe('rejected');
    expect(flow.getState().documents[0].status).toBe('rejected');
    expect(flow.getState().approvalRequests[0].status).toBe('rejected');
    expect(flow.getState().journals[0].status).toBe('draft');
    expect(flow.getState().journals[0].source_type).toBe('financial_document_pending');

    flow.setAuth('user-creator');
    const posting = await flow.client.rpc('post_finance_journal_entry', {
      p_journal_entry_id: flow.journalId
    });

    expect(posting.data).toBeNull();
    expect(posting.error).not.toBeNull();
    expect(flow.getState().journals[0].status).toBe('draft');
    expect(flow.getState().documents[0].status).toBe('rejected');
  });
});

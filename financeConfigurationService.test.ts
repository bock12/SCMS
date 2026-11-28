import { describe, expect, test } from 'bun:test';
import {
  evaluateTransactionEntryReadiness,
  getFinanceConfiguration,
  getFinanceScopeConfiguration,
  getFinanceScopeTransactionOptions,
  getMyFinanceScopes,
  getRequisitionApprovalConfiguration,
  saveFinanceConfiguration,
  saveFinanceScopeApprovalPolicies,
  saveFinanceScopeResources,
  saveRequisitionApprovalPolicy,
  type FinanceConfiguration
} from './financeConfigurationService';
import { createEmptyMockFinanceState, createMockFinanceRpc, type MockFinanceState } from './mockFinanceRpc';

const config: FinanceConfiguration = {
  currencies: ['SLE', 'USD'], baseCurrencyCode: 'SLE',
  chartAccounts: [
    { id: 'cash', code: '1000', name: 'Cash', account_type: 'asset', normal_balance: 'debit', is_active: true },
    { id: 'income', code: '4000', name: 'Offering Income', account_type: 'income', normal_balance: 'credit', is_active: true }
  ],
  financialAccounts: [{
    id: 'cash-account', chart_account_id: 'cash', branch_id: null, name: 'Main Cash',
    account_type: 'cash', currency_code: 'SLE', is_active: true
  }],
  funds: [{ id: 'general', code: 'GEN', name: 'General Fund', fund_type: 'general', is_default: true, is_active: true }],
  financialYears: [{ id: 'fy-2026', year_number: 2026, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
  periods: [{ id: 'p-2026', financial_year_id: 'fy-2026', name: 'January', start_date: '2026-01-01', end_date: '2026-01-31', status: 'open' }],
  approvalPolicies: [{ id: 'policy', name: 'Financial Documents', transaction_type: 'financial_document', branch_id: null, version: 1, effective_from: '2026-01-01', is_active: true }],
  approvalPolicyBands: [{ id: 'band', policy_id: 'policy', min_amount_base: 0, max_amount_base: null }],
  approvalPolicySteps: [{ id: 'step', band_id: 'band', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true, approver_profile_ids: ['approver'] }]
};

describe('finance configuration service', () => {
  test('loads only the authorized finance scopes returned by the database', async () => {
    let called = '';
    const scopes = [
      { scope_type: 'church' as const, scope_id: null, scope_name: 'Church-wide', district_id: null, branch_id: null },
      { scope_type: 'branch' as const, scope_id: 'branch-a', scope_name: 'Main Branch', district_id: null, branch_id: 'branch-a' }
    ];
    const result = await getMyFinanceScopes({
      rpc: async name => { called = name; return { data: scopes, error: null }; }
    });
    expect(called).toBe('get_my_finance_scopes');
    expect(result.data).toEqual(scopes);
  });

  test('propagates finance scope discovery authorization failures', async () => {
    const result = await getMyFinanceScopes({
      rpc: async () => ({ data: null, error: { code: '42501', message: 'Authentication required' } })
    });
    expect(result.error?.code).toBe('42501');
    expect(result.data).toBeNull();
  });

  test('loads canonical configuration through the mock/database RPC boundary', async () => {
    let called = '';
    const result = await getFinanceConfiguration(null, {
      rpc: async name => { called = name; return { data: config, error: null }; }
    });
    expect(called).toBe('get_finance_configuration');
    expect(result.data?.chartAccounts).toHaveLength(2);
    expect(result.data?.approvalPolicyBands[0].max_amount_base).toBeNull();
  });

  test('forwards the active branch when loading scoped configuration', async () => {
    let branchId: unknown = undefined;
    const result = await getFinanceConfiguration('branch-a', {
      rpc: async (_name, args) => {
        branchId = args?.p_branch_id;
        return { data: config, error: null };
      }
    });
    expect(branchId).toBe('branch-a');
    expect(result.error).toBeNull();
  });

  test('loads exactly the requested district ownership scope', async () => {
    let call: { name: string; args?: Record<string, unknown> } | null = null;
    const result = await getFinanceScopeConfiguration(
      { type: 'district', id: 'district-a' },
      {
        rpc: async (name, args) => {
          call = { name, args };
          return { data: { ...config, scope: { type: 'district', id: 'district-a' } }, error: null };
        }
      }
    );
    expect(call?.name).toBe('get_finance_scope_configuration');
    expect(call?.args?.p_scope_type).toBe('district');
    expect(call?.args?.p_scope_id).toBe('district-a');
    expect(result.data?.scope.type).toBe('district');
  });

  test('uses a null ID only for church-wide ownership scope', async () => {
    let scopeArgs: Record<string, unknown> | undefined;
    await getFinanceScopeConfiguration(
      { type: 'church', id: null },
      {
        rpc: async (_name, args) => {
          scopeArgs = args;
          return { data: { ...config, scope: { type: 'church', id: null } }, error: null };
        }
      }
    );
    expect(scopeArgs?.p_scope_type).toBe('church');
    expect(scopeArgs?.p_scope_id).toBeNull();
  });

  test('saves canonical configuration as one validated payload', async () => {
    let call: { name: string; args?: Record<string, unknown> } | null = null;
    const result = await saveFinanceConfiguration(config, 'branch-a', {
      rpc: async (name, args) => { call = { name, args }; return { data: { saved: true }, error: null }; }
    });
    expect(call?.name).toBe('save_finance_configuration');
    expect(call?.args?.p_branch_id).toBe('branch-a');
    expect(call?.args?.p_configuration).toEqual(config);
    expect(result.data?.saved).toBe(true);
  });

  test('writes operational accounts and funds through the exact-scope resource RPC', async () => {
    let call: { name: string; args?: Record<string, unknown> } | null = null;
    const accounts = [{ ...config.financialAccounts[0], branch_id: null, district_id: 'district-a' }];
    const funds = [{ ...config.funds[0], branch_id: null, district_id: 'district-a' }];
    const result = await saveFinanceScopeResources(
      { type: 'district', id: 'district-a' }, accounts, funds,
      {
        rpc: async (name, args) => {
          call = { name, args };
          return { data: {
            saved: true, financial_accounts_created: 1, funds_created: 1,
            scope_type: 'district', scope_id: 'district-a'
          }, error: null };
        }
      }
    );
    expect(call?.name).toBe('save_finance_scope_resources');
    expect(call?.args?.p_scope_type).toBe('district');
    expect(call?.args?.p_scope_id).toBe('district-a');
    expect(call?.args?.p_financial_accounts).toEqual(accounts);
    expect(call?.args?.p_funds).toEqual(funds);
    expect(result.data?.financial_accounts_created).toBe(1);
    expect(result.data?.funds_created).toBe(1);
  });

  test('writes district approval policies, amount bands and ordered steps through the scoped RPC', async () => {
    let call: { name: string; args?: Record<string, unknown> } | null = null;
    const policies = [{ ...config.approvalPolicies[0], branch_id: null, district_id: 'district-a' }];
    const bands = config.approvalPolicyBands;
    const steps = config.approvalPolicySteps;
    const result = await saveFinanceScopeApprovalPolicies(
      { type: 'district', id: 'district-a' }, policies, bands, steps,
      {
        rpc: async (name, args) => {
          call = { name, args };
          return { data: {
            saved: true, policies_created: 1, bands_created: 1, steps_created: 1,
            scope_type: 'district', scope_id: 'district-a'
          }, error: null };
        }
      }
    );
    expect(call?.name).toBe('save_finance_scope_approval_policies');
    expect(call?.args?.p_scope_type).toBe('district');
    expect(call?.args?.p_scope_id).toBe('district-a');
    expect(call?.args?.p_policies).toEqual(policies);
    expect(call?.args?.p_bands).toEqual(bands);
    expect(call?.args?.p_steps).toEqual(steps);
    expect(result.data?.policies_created).toBe(1);
  });

  test('propagates scoped approval policy authorization errors', async () => {
    const result = await saveFinanceScopeApprovalPolicies(
      { type: 'district', id: 'district-a' }, [], [], [],
      { rpc: async () => ({ data: null, error: { code: '42501', message: 'Insufficient permission' } }) }
    );
    expect(result.error?.code).toBe('42501');
    expect(result.data).toBeNull();
  });

  test('propagates scoped resource write authorization errors', async () => {
    const result = await saveFinanceScopeResources(
      { type: 'branch', id: 'branch-a' }, [], [],
      { rpc: async () => ({ data: null, error: { code: '42501', message: 'Insufficient permission' } }) }
    );
    expect(result.error?.code).toBe('42501');
    expect(result.data).toBeNull();
  });

  test('propagates configuration authorization errors', async () => {
    const result = await saveFinanceConfiguration(config, null, {
      rpc: async () => ({ data: null, error: { code: '42501', message: 'Insufficient permission' } })
    });
    expect(result.error?.code).toBe('42501');
    expect(result.data).toBeNull();
  });

  test('evaluateTransactionEntryReadiness detects all missing prerequisites and rejects control chart accounts', () => {
    const partial: FinanceConfiguration = {
      currencies: ['SLE'],
      baseCurrencyCode: 'SLE',
      chartAccounts: [
        { id: 'ctrl-inc', code: '4000', name: 'Income Control', account_type: 'income', is_active: true, is_control_account: true },
        { id: 'ctrl-exp', code: '5000', name: 'Expense Control', account_type: 'expense', is_active: true, is_control_account: true }
      ],
      financialAccounts: [],
      funds: [],
      financialYears: [],
      periods: [],
      approvalPolicies: [],
      approvalPolicyBands: [],
      approvalPolicySteps: []
    };

    const readiness = evaluateTransactionEntryReadiness(partial, {
      scope: { type: 'church', id: null },
      effectiveBranchId: null,
      transactionDate: '2026-11-25',
      amount: '',
      exchangeRate: '1',
      today: '2026-11-25'
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.hasSupportedCurrency).toBe(true);
    expect(readiness.hasIncomeChartAccount).toBe(false);
    expect(readiness.hasExpenseChartAccount).toBe(false);
    expect(readiness.hasScopeFinancialAccount).toBe(false);
    expect(readiness.hasOpenPeriodForDate).toBe(false);
    expect(readiness.hasApprovalBand).toBe(false);
    expect(readiness.missingReasons).toEqual([
      'an active scope-compatible financial account',
      'an active non-control income chart account',
      'an active non-control expense chart account',
      'an open financial period covering 2026-11-25',
      'an active financial-document approval policy band covering this amount'
    ]);
  });

  test('evaluateTransactionEntryReadiness unlocks only when non-control chart accounts, open period/year, scoped account and covering approval band exist', () => {
    const full: FinanceConfiguration = {
      ...config,
      chartAccounts: [
        ...config.chartAccounts,
        { id: 'expense', code: '5000', name: 'Operations', account_type: 'expense', normal_balance: 'debit', is_active: true, is_control_account: false }
      ],
      periods: [
        { id: 'p-2026', financial_year_id: 'fy-2026', name: 'FY 2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }
      ],
      approvalPolicyBands: [
        { id: 'band', policy_id: 'policy', min_amount_base: 0, max_amount_base: 5000 }
      ]
    };

    const ready = evaluateTransactionEntryReadiness(full, {
      scope: { type: 'church', id: null },
      effectiveBranchId: null,
      transactionDate: '2026-11-25',
      amount: '250',
      exchangeRate: '1',
      today: '2026-11-25'
    });
    expect(ready.ready).toBe(true);
    expect(ready.missingReasons).toEqual([]);

    const outOfBand = evaluateTransactionEntryReadiness(full, {
      scope: { type: 'church', id: null },
      effectiveBranchId: null,
      transactionDate: '2026-11-25',
      amount: '5000',
      exchangeRate: '1',
      today: '2026-11-25'
    });
    expect(outOfBand.ready).toBe(false);
    expect(outOfBand.hasApprovalBand).toBe(false);
  });

  test('church-wide saveFinanceConfiguration preserves existing district/branch accounts and funds and hydrates period year_status', async () => {
    const initial: MockFinanceState = {
      ...createEmptyMockFinanceState(),
      profiles: [{ id: 'admin', auth_user_id: 'auth-admin', branch_id: null, status: 'active' }],
      permissions: [
        { profile_id: 'admin', permission: 'manage_finances', branch_id: null },
        { profile_id: 'admin', permission: 'view_finances', branch_id: null }
      ],
      districts: [{ id: 'district-1', name: 'Western District', status: 'active' }],
      branches: [{ id: 'branch-1', district_id: 'district-1', name: 'HQ Branch', status: 'active' }],
      currencies: ['SLE'],
      baseCurrencyCode: 'SLE',
      chartAccounts: [
        { id: 'asset-1010', code: '1010', name: 'Cash on Hand', account_type: 'asset', normal_balance: 'debit', is_active: true, is_control_account: false }
      ],
      financialAccounts: [
        { id: 'dist-cash', chart_account_id: 'asset-1010', branch_id: null, district_id: 'district-1', name: 'District Cash', account_type: 'cash', currency_code: 'SLE', is_active: true }
      ],
      funds: [
        { id: 'branch-fund', branch_id: 'branch-1', district_id: 'district-1', name: 'Branch Building Fund', code: 'BLD', fund_type: 'designated', is_default: false, is_active: true }
      ]
    };
    let state = structuredClone(initial);
    const rpc = createMockFinanceRpc(
      { load: () => structuredClone(state), save: next => { state = structuredClone(next); } },
      () => ({ userId: 'auth-admin' })
    );

    const churchLoaded = await getFinanceScopeConfiguration({ type: 'church', id: null }, rpc);
    expect(churchLoaded.error).toBeNull();
    expect(churchLoaded.data?.financialAccounts).toHaveLength(0);
    expect(churchLoaded.data?.funds).toHaveLength(0);

    const today = new Date().toISOString().slice(0, 10);
    const yearNumber = Number(today.slice(0, 4));
    const draft: FinanceConfiguration = {
      ...churchLoaded.data!,
      chartAccounts: [
        ...churchLoaded.data!.chartAccounts,
        { id: 'inc-4000', code: '4000', name: 'Tithes & Offerings', account_type: 'income', normal_balance: 'credit', is_active: true, is_control_account: false },
        { id: 'exp-5000', code: '5000', name: 'Ministry Expenses', account_type: 'expense', normal_balance: 'debit', is_active: true, is_control_account: false }
      ],
      financialAccounts: [
        { id: 'hq-cash', chart_account_id: 'asset-1010', branch_id: null, district_id: null, name: 'HQ Cash', account_type: 'cash', currency_code: 'SLE', is_active: true }
      ],
      financialYears: [
        { id: 'fy-current', year_number: yearNumber, start_date: `${yearNumber}-01-01`, end_date: `${yearNumber}-12-31`, status: 'open' }
      ],
      periods: [
        { id: 'p-current', financial_year_id: 'fy-current', name: 'Annual', start_date: `${yearNumber}-01-01`, end_date: `${yearNumber}-12-31`, status: 'open' }
      ],
      approvalPolicies: [
        { id: 'pol-church', name: 'HQ Approval', transaction_type: 'financial_document', branch_id: null, district_id: null, version: 1, effective_from: today, is_active: true }
      ],
      approvalPolicyBands: [
        { id: 'band-church', policy_id: 'pol-church', min_amount_base: 0, max_amount_base: null }
      ],
      approvalPolicySteps: [
        { id: 'step-church', band_id: 'band-church', step_number: 1, required_permission_key: 'approve_finances', required_approvals: 1, prohibit_submitter_approval: true }
      ]
    };

    const saved = await saveFinanceConfiguration(draft, null, rpc);
    expect(saved.error).toBeNull();
    expect(state.financialAccounts.some(a => a.id === 'dist-cash')).toBe(true);
    expect(state.financialAccounts.some(a => a.id === 'hq-cash')).toBe(true);
    expect(state.funds.some(f => f.id === 'branch-fund')).toBe(true);

    const options = await getFinanceScopeTransactionOptions({ type: 'church', id: null }, rpc);
    expect(options.error).toBeNull();
    expect(options.data?.periods[0]?.year_status).toBe('open');
    const readiness = evaluateTransactionEntryReadiness(options.data!, {
      scope: { type: 'church', id: null },
      effectiveBranchId: null,
      transactionDate: today,
      amount: '100',
      exchangeRate: '1',
      today
    });
    expect(readiness.ready).toBe(true);
  });

  test('saves and loads branch-scoped requisition approval policies and supports period closing', async () => {
    const initial: MockFinanceState = {
      ...createEmptyMockFinanceState(),
      profiles: [{ id: 'admin', auth_user_id: 'auth-admin', branch_id: 'branch-1', status: 'active' }],
      permissions: [
        { profile_id: 'admin', permission: 'manage_finances', branch_id: null },
        { profile_id: 'admin', permission: 'manage_finances', branch_id: 'branch-1' },
        { profile_id: 'admin', permission: 'view_finances', branch_id: null }
      ],
      districts: [{ id: 'district-1', name: 'Western District', status: 'active' }],
      branches: [{ id: 'branch-1', district_id: 'district-1', name: 'HQ Branch', status: 'active' }],
      currencies: ['SLE'],
      baseCurrencyCode: 'SLE',
      chartAccounts: [
        { id: 'asset-1010', code: '1010', name: 'Cash on Hand', account_type: 'asset', normal_balance: 'debit', is_active: true, is_control_account: false },
        { id: 'inc-4000', code: '4000', name: 'Offering Income', account_type: 'income', normal_balance: 'credit', is_active: true, is_control_account: false },
        { id: 'exp-5000', code: '5000', name: 'Expense', account_type: 'expense', normal_balance: 'debit', is_active: true, is_control_account: false }
      ],
      financialAccounts: [
        { id: 'cash-hq', chart_account_id: 'asset-1010', branch_id: null, district_id: null, name: 'HQ Cash', account_type: 'cash', currency_code: 'SLE', is_active: true }
      ],
      financialYears: [
        { id: 'fy-2026', year_number: 2026, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }
      ],
      periods: [
        { id: 'p-2026', financial_year_id: 'fy-2026', name: 'Annual', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open', year_status: 'open' }
      ]
    };
    let state = structuredClone(initial);
    const rpc = createMockFinanceRpc(
      { load: () => structuredClone(state), save: next => { state = structuredClone(next); } },
      () => ({ userId: 'auth-admin' })
    );

    const savedPolicy = await saveRequisitionApprovalPolicy(
      'branch-1',
      'Branch Department Policy',
      0,
      null,
      [{ step_number: 1, required_approvals: 1 }, { step_number: 2, required_approvals: 2 }],
      rpc
    );
    expect(savedPolicy.error).toBeNull();
    expect(savedPolicy.data?.step_count).toBe(2);

    const loadedReqConfig = await getRequisitionApprovalConfiguration('branch-1', rpc);
    expect(loadedReqConfig.error).toBeNull();
    expect(loadedReqConfig.data?.policies).toHaveLength(1);
    expect(loadedReqConfig.data?.policies[0]?.branch_id).toBe('branch-1');
    expect(loadedReqConfig.data?.steps).toHaveLength(2);

    const churchLoaded = await getFinanceScopeConfiguration({ type: 'church', id: null }, rpc);
    expect(churchLoaded.error).toBeNull();
    const closedDraft: FinanceConfiguration = {
      ...churchLoaded.data!,
      periods: churchLoaded.data!.periods.map(period => ({ ...period, status: 'closed' }))
    };
    const closedSave = await saveFinanceConfiguration(closedDraft, null, rpc);
    expect(closedSave.error).toBeNull();

    const readinessAfterClose = evaluateTransactionEntryReadiness(closedDraft, {
      scope: { type: 'church', id: null },
      effectiveBranchId: null,
      transactionDate: '2026-11-27',
      amount: '',
      exchangeRate: '1',
      today: '2026-11-27'
    });
    expect(readinessAfterClose.hasOpenPeriodForDate).toBe(false);
  });
});



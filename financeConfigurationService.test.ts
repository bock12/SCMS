import { describe, expect, test } from 'bun:test';
import { getFinanceConfiguration, getFinanceScopeConfiguration, saveFinanceConfiguration, type FinanceConfiguration } from './financeConfigurationService';

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

  test('propagates configuration authorization errors', async () => {
    const result = await saveFinanceConfiguration(config, null, {
      rpc: async () => ({ data: null, error: { code: '42501', message: 'Insufficient permission' } })
    });
    expect(result.error?.code).toBe('42501');
    expect(result.data).toBeNull();
  });
});

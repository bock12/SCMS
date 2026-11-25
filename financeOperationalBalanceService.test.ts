import { describe, expect, test } from 'bun:test';
import { getFinanceOperationalBalances } from './financeOperationalBalanceService';

describe('financeOperationalBalanceService', () => {
  test('requests operational balances for the selected authorized scope', async () => {
    let rpcName = '';
    let args: Record<string, unknown> = {};
    const client = {
      rpc: async (name: string, rpcArgs: Record<string, unknown>) => {
        rpcName = name;
        args = rpcArgs;
        return {
          data: {
            actor_profile_id: 'profile-a',
            scope_type: 'district',
            scope_id: 'district-a',
            accounts: [{
              financial_account_id: 'financial-account-a',
              chart_account_id: 'chart-account-a',
              branch_id: 'branch-a',
              district_id: 'district-a',
              account_name: 'Main Bank',
              operational_account_type: 'bank',
              currency_code: 'SLE',
              provider_name: 'Bank',
              account_reference: null,
              chart_account_code: '1020',
              chart_account_name: 'Bank',
              normal_balance: 'debit',
              base_currency_code: 'SLE',
              debit_total: 1250,
              credit_total: 250,
              balance: 1000
            }]
          },
          error: null
        };
      }
    };

    const result = await getFinanceOperationalBalances(
      { type: 'district', id: 'district-a' }, client
    );

    expect(rpcName).toBe('get_finance_scope_operational_balances');
    expect(args).toEqual({ p_scope_type: 'district', p_scope_id: 'district-a' });
    expect(result.data?.accounts[0]).toMatchObject({
      operational_account_type: 'bank',
      base_currency_code: 'SLE',
      balance: 1000
    });
  });

  test('preserves database authorization errors', async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { message: 'Insufficient permission', code: '42501' }
      })
    };
    const result = await getFinanceOperationalBalances(
      { type: 'branch', id: 'branch-a' }, client
    );
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('42501');
  });
});

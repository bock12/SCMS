import { financeSupabase } from './financeSupabaseClient';
import type { FinanceOwnershipScope } from './financeConfigurationService';

export type FinanceOperationalBalanceAccountType = 'cash' | 'bank' | 'mobile_money';

export interface FinanceOperationalBalanceAccount {
  financial_account_id: string;
  chart_account_id: string;
  branch_id: string | null;
  district_id: string | null;
  account_name: string;
  operational_account_type: FinanceOperationalBalanceAccountType;
  currency_code: string;
  provider_name: string | null;
  account_reference: string | null;
  chart_account_code: string;
  chart_account_name: string;
  normal_balance: 'debit' | 'credit' | null;
  base_currency_code: string;
  debit_total: number;
  credit_total: number;
  balance: number;
}

export interface FinanceOperationalBalanceReport {
  actor_profile_id: string;
  scope_type: FinanceOwnershipScope['type'];
  scope_id: string | null;
  accounts: FinanceOperationalBalanceAccount[];
}

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: FinanceOperationalBalanceReport | null;
    error: { message: string; code?: string } | null;
  }>;
};

const defaultRpcClient = financeSupabase as unknown as RpcClient;

/** Reads cash, bank and mobile-money balances from posted journal lines in an authorized scope. */
export async function getFinanceOperationalBalances(
  scope: FinanceOwnershipScope,
  client: RpcClient = defaultRpcClient
): Promise<{
  data: FinanceOperationalBalanceReport | null;
  error: { message: string; code?: string } | null;
}> {
  const result = await client.rpc('get_finance_scope_operational_balances', {
    p_scope_type: scope.type,
    p_scope_id: scope.id
  });
  return { data: result.data, error: result.error };
}

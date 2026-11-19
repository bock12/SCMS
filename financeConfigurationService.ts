import { supabase } from './supabaseClient';

export type FinanceChartAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type FinanceOperationalAccountType = 'cash' | 'bank' | 'mobile_money' | 'clearing';
export type FinanceApprovalPermission = 'approve_finances' | 'post_journals' | 'manage_finances';

export interface FinanceConfiguration {
  currencies: string[];
  baseCurrencyCode: string | null;
  chartAccounts: Array<{
    id: string; code: string; name: string; account_type: FinanceChartAccountType;
    normal_balance?: 'debit' | 'credit'; description?: string | null;
    is_control_account?: boolean; is_system?: boolean; is_active: boolean;
  }>;
  financialAccounts: Array<{
    id: string; chart_account_id: string; branch_id: string | null; name: string;
    account_type: FinanceOperationalAccountType; currency_code: string;
    provider_name?: string | null; account_reference?: string | null; is_active: boolean;
  }>;
  funds: Array<{
    id: string; name: string; code: string; description?: string | null;
    fund_type: 'general' | 'designated' | 'restricted'; is_default: boolean; is_active: boolean;
  }>;
  financialYears: Array<{
    id: string; year_number: number; start_date: string; end_date: string; status: 'open' | 'closed';
  }>;
  periods: Array<{
    id: string; financial_year_id: string; name: string; start_date: string;
    end_date: string; status: 'open' | 'closed'; year_status?: string;
  }>;
  approvalPolicies: Array<{
    id: string; name: string; transaction_type: 'financial_document' | 'budget'; branch_id: string | null;
    version: number; effective_from: string; effective_to?: string | null; is_active: boolean;
  }>;
  approvalPolicyBands: Array<{
    id: string; policy_id: string; min_amount_base: number; max_amount_base: number | null;
  }>;
  approvalPolicySteps: Array<{
    id: string; band_id: string; step_number: number; required_permission_key: FinanceApprovalPermission;
    required_approvals: number; prohibit_submitter_approval: boolean; approver_profile_ids: string[];
  }>;
}

type RpcResponse<T> = { data: T | null; error: { message: string; code?: string } | null };
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResponse<any>> };
const defaultRpcClient = supabase as unknown as RpcClient;

export async function getFinanceConfiguration(
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinanceConfiguration>> {
  return client.rpc('get_finance_configuration');
}

export async function saveFinanceConfiguration(
  configuration: FinanceConfiguration,
  branchId: string | null = null,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<{ saved: boolean }>> {
  return client.rpc('save_finance_configuration', {
    p_branch_id: branchId,
    p_configuration: configuration
  });
}

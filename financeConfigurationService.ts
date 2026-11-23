import { financeSupabase } from './financeSupabaseClient';

export type FinanceChartAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type FinanceOperationalAccountType = 'cash' | 'bank' | 'mobile_money' | 'clearing';
export type FinanceApprovalPermission = 'approve_finances' | 'post_journals' | 'manage_finances';
export type FinanceOwnershipScope =
  | { type: 'church'; id: null }
  | { type: 'district' | 'branch'; id: string };

export interface FinanceScopeOption {
  scope_type: 'church' | 'district' | 'branch';
  scope_id: string | null;
  scope_name: string;
  district_id: string | null;
  branch_id: string | null;
}

export async function getMyFinanceScopes(
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinanceScopeOption[]>> {
  return client.rpc('get_my_finance_scopes');
}

export interface FinanceConfiguration {
  currencies: string[];
  baseCurrencyCode: string | null;
  chartAccounts: Array<{
    id: string; code: string; name: string; account_type: FinanceChartAccountType;
    normal_balance?: 'debit' | 'credit'; description?: string | null;
    is_control_account?: boolean; is_system?: boolean; is_active: boolean;
  }>;
  financialAccounts: Array<{
    id: string; chart_account_id: string; branch_id: string | null; district_id?: string | null; name: string;
    account_type: FinanceOperationalAccountType; currency_code: string;
    provider_name?: string | null; account_reference?: string | null; is_active: boolean;
  }>;
  funds: Array<{
    id: string; branch_id?: string | null; district_id?: string | null; name: string; code: string; description?: string | null;
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
    id: string; name: string; transaction_type: 'financial_document' | 'budget'; branch_id: string | null; district_id?: string | null;
    version: number; effective_from: string; effective_to?: string | null; is_active: boolean;
  }>;
  approvalPolicyBands: Array<{
    id: string; policy_id: string; min_amount_base: number; max_amount_base: number | null;
  }>;
  approvalPolicySteps: Array<{
    id: string; band_id: string; step_number: number; required_permission_key: FinanceApprovalPermission;
    required_approvals: number; prohibit_submitter_approval: boolean; approver_profile_ids?: string[];
  }>;
}

type RpcResponse<T> = { data: T | null; error: { message: string; code?: string } | null };
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResponse<any>> };
const defaultRpcClient = financeSupabase as unknown as RpcClient;

export async function getFinanceConfiguration(
  branchId: string | null = null,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinanceConfiguration>> {
  return client.rpc('get_finance_configuration', { p_branch_id: branchId });
}

/** Loads records owned by exactly one authorized church, district or branch scope. */
export async function getFinanceScopeConfiguration(
  scope: FinanceOwnershipScope,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinanceConfiguration & { scope: FinanceOwnershipScope }>> {
  return client.rpc('get_finance_scope_configuration', {
    p_scope_type: scope.type,
    p_scope_id: scope.id
  });
}

/** Loads transaction entry options including hierarchically eligible accounts, funds and approval policies for one authorized scope. */
export async function getFinanceScopeTransactionOptions(
  scope: FinanceOwnershipScope,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinanceConfiguration & { scope: FinanceOwnershipScope }>> {
  return client.rpc('get_finance_scope_transaction_options', {
    p_scope_type: scope.type,
    p_scope_id: scope.id
  });
}

export interface FinanceScopeApprovalPolicyWriteResult {
  saved: boolean;
  policies_created: number;
  bands_created: number;
  steps_created: number;
  scope_type: FinanceOwnershipScope['type'];
  scope_id: string | null;
}

/** Creates immutable, versioned approval policies and their bands/steps in one exact scope. */
export async function saveFinanceScopeApprovalPolicies(
  scope: FinanceOwnershipScope,
  policies: FinanceConfiguration['approvalPolicies'],
  bands: FinanceConfiguration['approvalPolicyBands'],
  steps: FinanceConfiguration['approvalPolicySteps'],
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinanceScopeApprovalPolicyWriteResult>> {
  return client.rpc('save_finance_scope_approval_policies', {
    p_scope_type: scope.type,
    p_scope_id: scope.id,
    p_policies: policies,
    p_bands: bands,
    p_steps: steps
  });
}

export interface FinanceScopeResourceWriteResult {
  saved: boolean;
  financial_accounts_created: number;
  funds_created: number;
  scope_type: FinanceOwnershipScope['type'];
  scope_id: string | null;
}

/** Creates accounts and funds owned by exactly one authorized organizational scope. */
export async function saveFinanceScopeResources(
  scope: FinanceOwnershipScope,
  financialAccounts: FinanceConfiguration['financialAccounts'],
  funds: FinanceConfiguration['funds'],
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinanceScopeResourceWriteResult>> {
  return client.rpc('save_finance_scope_resources', {
    p_scope_type: scope.type,
    p_scope_id: scope.id,
    p_financial_accounts: financialAccounts,
    p_funds: funds
  });
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

export interface RequisitionApprovalConfiguration {
  policies: Array<{
    id: string; name: string; transaction_type: 'requisition'; branch_id: string | null;
    version: number; effective_from: string; effective_to?: string | null; is_active: boolean;
  }>;
  bands: Array<{
    id: string; policy_id: string; min_amount_base: number; max_amount_base: number | null;
  }>;
  steps: Array<{
    id: string; band_id: string; step_number: number; required_permission_key: 'approve_requisitions';
    required_approvals: number; prohibit_submitter_approval: boolean;
  }>;
}

export async function getRequisitionApprovalConfiguration(
  branchId: string | null = null,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<RequisitionApprovalConfiguration>> {
  return client.rpc('get_requisition_approval_configuration', { p_branch_id: branchId });
}

export async function saveRequisitionApprovalPolicy(
  branchId: string | null,
  name: string,
  minAmountBase: number,
  maxAmountBase: number | null,
  steps: Array<{ step_number: number; required_approvals: number }>,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<{ policy_id: string; band_id: string; step_count: number; version: number }>> {
  return client.rpc('save_requisition_approval_policy', {
    p_branch_id: branchId,
    p_name: name,
    p_min_amount_base: minAmountBase,
    p_max_amount_base: maxAmountBase,
    p_steps: steps
  });
}

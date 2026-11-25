import { financeSupabase } from './financeSupabaseClient';

export interface CreateFinancialTransferInput {
  transactionDate: string;
  sourceBranchId: string;
  sourceFinancialAccountId: string;
  destinationBranchId: string;
  destinationFinancialAccountId: string;
  amount: number;
  currencyCode: string;
  exchangeRateToBase: number;
  description: string;
  externalReference?: string | null;
  idempotencyKey: string;
}

export interface FinancialTransferRecord {
  id: string;
  transfer_number: number;
  transaction_date: string;
  source_branch_id: string;
  destination_branch_id: string;
  source_financial_account_id: string;
  destination_financial_account_id: string;
  amount: number;
  currency_code: string;
  description: string;
  external_reference: string | null;
  status: 'pending_approval' | 'approved' | 'rejected' | 'posted';
  source_approval_request_id: string | null;
  destination_approval_request_id: string | null;
  source_approval_status: string | null;
  destination_approval_status: string | null;
  source_journal_entry_id: string | null;
  destination_journal_entry_id: string | null;
  source_actor_approval_step_id?: string | null;
  destination_actor_approval_step_id?: string | null;
  source_approval_steps?: Array<Record<string, unknown>>;
  destination_approval_steps?: Array<Record<string, unknown>>;
  created_at: string;
}

export interface FinancialTransferResult {
  transfer_id: string;
  transfer_number: number;
  source_approval_request_id: string | null;
  destination_approval_request_id: string | null;
  source_journal_entry_id: string;
  destination_journal_entry_id: string | null;
  status: FinancialTransferRecord['status'];
  idempotent_replay?: boolean;
}

export interface FinancialTransferDecisionResult {
  transfer_id: string;
  approval_request_id: string;
  approval_status: string;
  status: FinancialTransferRecord['status'];
}

export interface FinancialTransferPostingResult {
  transfer_id: string;
  status: 'posted';
  already_posted: boolean;
  source_journal_entry_id: string;
  destination_journal_entry_id: string | null;
}

export interface FinanceBranchClearingAccountsInput {
  branchId: string;
  dueFromChartAccountId: string;
  dueToChartAccountId: string;
}

type RpcResponse<T> = { data: T | null; error: { message: string; code?: string } | null };
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResponse<any>> };
const defaultRpcClient = financeSupabase as unknown as RpcClient;

/** Creates a same-branch or cross-branch internal transfer through the canonical RPC. */
export async function createFinancialTransfer(
  input: CreateFinancialTransferInput,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinancialTransferResult>> {
  return client.rpc('create_financial_transfer', {
    p_transaction_date: input.transactionDate,
    p_source_branch_id: input.sourceBranchId,
    p_source_financial_account_id: input.sourceFinancialAccountId,
    p_destination_branch_id: input.destinationBranchId,
    p_destination_financial_account_id: input.destinationFinancialAccountId,
    p_amount: input.amount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_exchange_rate_to_base: input.exchangeRateToBase,
    p_description: input.description.trim(),
    p_external_reference: input.externalReference?.trim() || null,
    p_idempotency_key: input.idempotencyKey
  });
}

/** Lists transfers touching the requested branch; database scope authorization remains authoritative. */
export async function getFinancialTransfers(
  branchId: string,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<{ actor_profile_id: string; transfers: FinancialTransferRecord[] }>> {
  return client.rpc('get_financial_transfers', { p_branch_id: branchId });
}

export async function decideFinancialTransferApproval(
  input: { requestStepId: string; decision: 'approved' | 'rejected'; comments?: string | null },
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinancialTransferDecisionResult>> {
  return client.rpc('decide_financial_transfer_approval', {
    p_request_step_id: input.requestStepId,
    p_decision: input.decision,
    p_comments: input.comments?.trim() || null
  });
}

export async function postFinancialTransfer(
  transferId: string,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinancialTransferPostingResult>> {
  return client.rpc('post_financial_transfer', { p_transfer_id: transferId });
}

export interface FinanceBranchClearingAccounts {
  branch_id: string;
  due_from_chart_account_id: string;
  due_to_chart_account_id: string;
  is_active: boolean;
  updated_at?: string;
}

export async function getFinanceBranchClearingAccounts(
  branchId: string,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinanceBranchClearingAccounts | null>> {
  return client.rpc('get_finance_branch_clearing_accounts', { p_branch_id: branchId });
}

export async function setFinanceBranchClearingAccounts(
  input: FinanceBranchClearingAccountsInput,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<{ saved: boolean; branch_id: string }>> {
  return client.rpc('set_finance_branch_clearing_accounts', {
    p_branch_id: input.branchId,
    p_due_from_chart_account_id: input.dueFromChartAccountId,
    p_due_to_chart_account_id: input.dueToChartAccountId
  });
}

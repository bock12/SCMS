import { financeSupabase } from './financeSupabaseClient';
import type { FinanceOwnershipScope } from './financeConfigurationService';

export type FinancialDocumentType = 'receipt' | 'payment';
export type FinancialPaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'mobile_money'
  | 'card'
  | 'cheque'
  | 'other';

export interface CreateFinancialDocumentTransactionInput {
  documentType: FinancialDocumentType;
  transactionDate: string;
  branchId: string;
  profileId?: string | null;
  partyName: string;
  amount: number;
  currencyCode: string;
  paymentMethod: FinancialPaymentMethod;
  financialAccountId: string;
  categoryAccountId: string;
  fundId?: string | null;
  externalReference?: string | null;
  description: string;
  exchangeRateToBase?: number;
  idempotencyKey: string;
}

export interface CreateScopedFinancialDocumentTransactionInput {
  scope: FinanceOwnershipScope;
  documentType: FinancialDocumentType;
  transactionDate: string;
  profileId?: string | null;
  partyName: string;
  amount: number;
  currencyCode: string;
  paymentMethod: FinancialPaymentMethod;
  financialAccountId: string;
  categoryAccountId: string;
  fundId?: string | null;
  externalReference?: string | null;
  description: string;
  exchangeRateToBase?: number;
  idempotencyKey: string;
}

export interface FinancialDocumentTransactionResult {
  document_id: string;
  document_number: number;
  journal_entry_id: string;
  approval_request_id: string | null;
  status: string;
  scope_type?: FinanceOwnershipScope['type'];
  scope_id?: string | null;
  idempotent_replay?: boolean;
}

export interface DecideFinancialDocumentApprovalResult {
  document_id: string;
  approval_request_id: string;
  journal_entry_id: string | null;
  approval_status: string;
}

type RpcResponse<T> = { data: T | null; error: { message: string; code?: string } | null };
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResponse<any>>;
};

const defaultRpcClient = financeSupabase as unknown as RpcClient;

/**
 * Typed boundary for the secure database transaction RPC.
 *
 * This deliberately does not write to localStorage or emulate accounting
 * balances. The browser mock client routes these calls to the isolated,
 * deterministic canonical-finance adapter; a configured Supabase client can
 * be injected without changing callers. Legacy FinancialRecord data is not
 * read or written by this service.
 */
export async function createFinancialDocumentTransaction(
  input: CreateFinancialDocumentTransactionInput,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinancialDocumentTransactionResult>> {
  return client.rpc('create_financial_document_transaction_idempotent', {
    p_document_type: input.documentType,
    p_transaction_date: input.transactionDate,
    p_branch_id: input.branchId,
    p_profile_id: input.profileId ?? null,
    p_party_name: input.partyName.trim(),
    p_amount: input.amount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_payment_method: input.paymentMethod,
    p_financial_account_id: input.financialAccountId,
    p_category_account_id: input.categoryAccountId,
    p_fund_id: input.fundId ?? null,
    p_external_reference: input.externalReference?.trim() || null,
    p_description: input.description.trim(),
    p_exchange_rate_to_base: input.exchangeRateToBase ?? 1,
    p_idempotency_key: input.idempotencyKey
  });
}

export async function createScopedFinancialDocumentTransaction(
  input: CreateScopedFinancialDocumentTransactionInput,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<FinancialDocumentTransactionResult>> {
  return client.rpc('create_finance_scope_document_transaction', {
    p_scope_type: input.scope.type,
    p_scope_id: input.scope.id,
    p_document_type: input.documentType,
    p_transaction_date: input.transactionDate,
    p_profile_id: input.profileId ?? null,
    p_party_name: input.partyName.trim(),
    p_amount: input.amount,
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_payment_method: input.paymentMethod,
    p_financial_account_id: input.financialAccountId,
    p_category_account_id: input.categoryAccountId,
    p_fund_id: input.fundId ?? null,
    p_external_reference: input.externalReference?.trim() || null,
    p_description: input.description.trim(),
    p_exchange_rate_to_base: input.exchangeRateToBase ?? 1,
    p_idempotency_key: input.idempotencyKey
  });
}

export async function decideFinancialDocumentApproval(
  input: { requestStepId: string; decision: 'approved' | 'rejected'; comments?: string | null },
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<DecideFinancialDocumentApprovalResult>> {
  return client.rpc('decide_financial_document_approval', {
    p_request_step_id: input.requestStepId,
    p_decision: input.decision,
    p_comments: input.comments?.trim() || null
  });
}

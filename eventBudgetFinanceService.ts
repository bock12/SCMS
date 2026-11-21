import { financeSupabase } from './financeSupabaseClient';
import { getFinanceEventUuid, type FinanceEventIdentity } from './eventFinanceIdentity';
import type { FinancialPaymentMethod } from './financeTransactionService';

type RpcResponse<T> = { data: T | null; error: { message: string; code?: string } | null };
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResponse<any>> };
const defaultRpcClient = financeSupabase as unknown as RpcClient;

export interface EventBudgetLineInput {
  accountId: string;
  fundId?: string | null;
  description?: string | null;
  allocatedAmount: number;
}

export interface SubmitEventBudgetInput {
  event: FinanceEventIdentity;
  periodId: string;
  name: string;
  currencyCode: string;
  exchangeRateToBase: number;
  lines: EventBudgetLineInput[];
}

export interface EventBudgetPaymentInput {
  budgetId: string;
  transactionDate: string;
  profileId?: string | null;
  partyName: string;
  amount: number;
  paymentMethod: FinancialPaymentMethod;
  financialAccountId: string;
  categoryAccountId: string;
  fundId?: string | null;
  externalReference?: string | null;
  description?: string | null;
  exchangeRateToBase: number;
}

export interface EventBudgetSubmissionOptions {
  currencies: string[];
  baseCurrencyCode: string | null;
  chartAccounts: Array<{ id: string; code: string; name: string; account_type: string; is_control_account: boolean; is_active: boolean }>;
  funds: Array<{ id: string; name: string; code: string; fund_type: 'general' | 'designated' | 'restricted'; is_default: boolean; is_active: boolean }>;
  periods: Array<{ id: string; financial_year_id: string; name: string; start_date: string; end_date: string; status: 'open' | 'closed'; year_status: string }>;
}

export interface EventBudgetRpcResult {
  budget_id: string;
  approval_request_id: string;
  status: string;
  total_budget?: number;
  currency_code?: string;
}

export interface EventBudgetPaymentResult {
  document_id: string;
  journal_entry_id: string;
  approval_request_id: string | null;
  status: string;
  source_budget_id: string;
}

export async function submitEventBudgetForApproval(
  input: SubmitEventBudgetInput,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<EventBudgetRpcResult>> {
  return client.rpc('submit_event_budget_for_approval', {
    p_event_id: getFinanceEventUuid(input.event),
    p_period_id: input.periodId,
    p_name: input.name.trim(),
    p_currency_code: input.currencyCode.trim().toUpperCase(),
    p_exchange_rate_to_base: input.exchangeRateToBase,
    p_lines: input.lines.map(line => ({
      account_id: line.accountId,
      fund_id: line.fundId ?? null,
      description: line.description?.trim() || null,
      allocated_amount: line.allocatedAmount
    }))
  });
}

export async function decideEventBudgetApproval(
  input: { requestStepId: string; decision: 'approved' | 'rejected'; comments?: string | null },
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<{ approval_status: string; budget_id: string; status: string }>> {
  return client.rpc('decide_event_budget_approval', {
    p_request_step_id: input.requestStepId,
    p_decision: input.decision,
    p_comments: input.comments?.trim() || null
  });
}

export async function createEventBudgetPayment(
  input: EventBudgetPaymentInput,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<EventBudgetPaymentResult>> {
  return client.rpc('create_event_budget_payment', {
    p_budget_id: input.budgetId,
    p_transaction_date: input.transactionDate,
    p_profile_id: input.profileId ?? null,
    p_party_name: input.partyName.trim(),
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_financial_account_id: input.financialAccountId,
    p_category_account_id: input.categoryAccountId,
    p_fund_id: input.fundId ?? null,
    p_external_reference: input.externalReference?.trim() || null,
    p_description: input.description?.trim() || null,
    p_exchange_rate_to_base: input.exchangeRateToBase
  });
}

export async function getEventBudgets(
  branchId?: string | null,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<{ budgets: Array<Record<string, any>> }>> {
  return client.rpc('get_event_budgets', { p_branch_id: branchId ?? null });
}


export async function getEventBudgetSubmissionOptions(
  event: FinanceEventIdentity,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<EventBudgetSubmissionOptions>> {
  return client.rpc('get_event_budget_submission_options', {
    p_event_id: getFinanceEventUuid(event)
  });
}

export async function getMyEventBudgets(
  event: FinanceEventIdentity,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<{ budgets: Array<Record<string, any>> }>> {
  return client.rpc('get_my_event_budgets', {
    p_event_id: getFinanceEventUuid(event)
  });
}

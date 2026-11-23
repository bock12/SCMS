import { financeSupabase } from './financeSupabaseClient';
import type { FinanceOwnershipScope } from './financeConfigurationService';
import { decideFinancialDocumentApproval, type DecideFinancialDocumentApprovalResult } from './financeTransactionService';

export interface FinanceWorkflowDocument {
  id: string;
  document_number: number;
  document_type: 'receipt' | 'payment';
  transaction_date: string;
  branch_id: string | null;
  district_id?: string | null;
  profile_id: string | null;
  payee_or_payer_name: string;
  amount: number;
  currency_code: string;
  payment_method: string;
  fund_id: string | null;
  external_reference: string | null;
  description: string | null;
  status: string;
  journal_entry_id: string | null;
  approval_request_id: string | null;
  approval_status: string | null;
  actor_approval_step_id: string | null;
  approval_steps_completed: number;
  approval_steps_total: number;
  approval_steps: Array<{ id: string; step_order: number; approver_profile_id: string | null; status: string; decision: string | null; comments: string | null }>;
}

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string; code?: string } | null }>;
};

const rpc = financeSupabase as unknown as RpcClient;

export async function getFinanceWorkflowDocuments(branchId: string | null): Promise<{
  data: { actor_profile_id: string; documents: FinanceWorkflowDocument[] } | null;
  error: { message: string; code?: string } | null;
}> {
  const result = await rpc.rpc('get_finance_documents', { p_branch_id: branchId });
  return { data: result.data, error: result.error };
}

export async function getScopedFinanceWorkflowDocuments(
  scope: FinanceOwnershipScope,
  client: RpcClient = rpc
): Promise<{
  data: { actor_profile_id: string; documents: FinanceWorkflowDocument[] } | null;
  error: { message: string; code?: string } | null;
}> {
  const result = await client.rpc('get_finance_scope_documents', {
    p_scope_type: scope.type,
    p_scope_id: scope.id
  });
  return { data: result.data, error: result.error };
}

export function decideFinanceWorkflowApproval(input: {
  requestStepId: string;
  decision: 'approved' | 'rejected';
  comments?: string | null;
}): Promise<{ data: DecideFinancialDocumentApprovalResult | null; error: { message: string; code?: string } | null }> {
  return decideFinancialDocumentApproval(input);
}

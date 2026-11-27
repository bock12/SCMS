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

export async function getFinanceWorkflowDocuments(
  branchId: string | null,
  client: RpcClient = rpc
): Promise<{
  data: { actor_profile_id: string; documents: FinanceWorkflowDocument[] } | null;
  error: { message: string; code?: string } | null;
}> {
  const result = await client.rpc('get_finance_documents', { p_branch_id: branchId });
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

export function decideFinanceWorkflowApproval(
  input: {
    requestStepId: string;
    decision: 'approved' | 'rejected';
    comments?: string | null;
  },
  client: RpcClient = rpc
): Promise<{ data: DecideFinancialDocumentApprovalResult | null; error: { message: string; code?: string } | null }> {
  return decideFinancialDocumentApproval(input, client as any);
}

export type PendingApprovalFilter = 'all' | 'receipt' | 'payment' | 'actionable';

export interface PendingApprovalCurrencySummary {
  currencyCode: string;
  totalAmount: number;
  receiptAmount: number;
  paymentAmount: number;
}

export interface PendingApprovalSummary {
  totalPending: number;
  pendingReceipts: number;
  pendingPayments: number;
  awaitingMyDecision: number;
  totalsByCurrency: PendingApprovalCurrencySummary[];
}

export function isPendingFinancialDocument(document: FinanceWorkflowDocument): boolean {
  return (
    document.status === 'pending_approval' &&
    (document.document_type === 'receipt' || document.document_type === 'payment')
  );
}

export function filterPendingFinanceDocuments(
  documents: FinanceWorkflowDocument[],
  filter: PendingApprovalFilter = 'all',
  searchQuery = ''
): FinanceWorkflowDocument[] {
  const query = searchQuery.trim().toLowerCase();
  return documents.filter(document => {
    if (!isPendingFinancialDocument(document)) return false;
    if (filter === 'receipt' && document.document_type !== 'receipt') return false;
    if (filter === 'payment' && document.document_type !== 'payment') return false;
    if (filter === 'actionable' && !document.actor_approval_step_id) return false;
    if (!query) return true;

    const reference = `${document.document_type === 'receipt' ? 'rec' : 'pay'}-${String(document.document_number).padStart(6, '0')}`;
    return (
      reference.includes(query) ||
      document.payee_or_payer_name.toLowerCase().includes(query) ||
      (document.description || '').toLowerCase().includes(query) ||
      (document.external_reference || '').toLowerCase().includes(query) ||
      (document.payment_method || '').toLowerCase().includes(query)
    );
  });
}

export function summarizePendingFinanceDocuments(documents: FinanceWorkflowDocument[]): PendingApprovalSummary {
  const pending = documents.filter(isPendingFinancialDocument);
  const currencyMap = new Map<string, PendingApprovalCurrencySummary>();

  let pendingReceipts = 0;
  let pendingPayments = 0;
  let awaitingMyDecision = 0;

  for (const document of pending) {
    const amount = Number(document.amount) || 0;
    const currencyCode = (document.currency_code || 'SLE').toUpperCase();
    const existing = currencyMap.get(currencyCode) || {
      currencyCode,
      totalAmount: 0,
      receiptAmount: 0,
      paymentAmount: 0
    };
    existing.totalAmount += amount;
    if (document.document_type === 'receipt') {
      pendingReceipts += 1;
      existing.receiptAmount += amount;
    } else {
      pendingPayments += 1;
      existing.paymentAmount += amount;
    }
    if (document.actor_approval_step_id) {
      awaitingMyDecision += 1;
    }
    currencyMap.set(currencyCode, existing);
  }

  return {
    totalPending: pending.length,
    pendingReceipts,
    pendingPayments,
    awaitingMyDecision,
    totalsByCurrency: [...currencyMap.values()].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
  };
}

export function validateApprovalDecisionReason(
  decision: 'approved' | 'rejected',
  reason?: string | null
): { valid: true; trimmedReason: string | null } | { valid: false; message: string } {
  const trimmed = String(reason || '').trim();
  if (decision === 'rejected' && !trimmed) {
    return {
      valid: false,
      message: 'Enter a rejection reason before rejecting this transaction.'
    };
  }
  return { valid: true, trimmedReason: trimmed || null };
}

export async function submitFinanceApprovalDecision(
  input: {
    requestStepId: string;
    decision: 'approved' | 'rejected';
    reason?: string | null;
  },
  client: RpcClient = rpc
): Promise<{ data: DecideFinancialDocumentApprovalResult | null; error: { message: string; code?: string } | null }> {
  const validation = validateApprovalDecisionReason(input.decision, input.reason);
  if ('message' in validation) {
    return {
      data: null,
      error: { message: validation.message, code: 'VALIDATION_ERROR' }
    };
  }
  return decideFinanceWorkflowApproval(
    {
      requestStepId: input.requestStepId,
      decision: input.decision,
      comments: 'trimmedReason' in validation ? validation.trimmedReason : null
    },
    client
  );
}


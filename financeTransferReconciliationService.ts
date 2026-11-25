import { financeSupabase } from './financeSupabaseClient';
import type { FinanceOwnershipScope } from './financeConfigurationService';

export interface FinanceTransferReconciliationRow {
  transfer_id: string;
  transfer_number: number;
  transaction_date: string;
  source_branch_id: string;
  source_branch_name: string;
  destination_branch_id: string;
  destination_branch_name: string;
  amount: number;
  currency_code: string;
  base_currency_code: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'posted';
  description: string;
  external_reference: string | null;
  source_journal_entry_id: string | null;
  source_journal_status: 'draft' | 'posted' | null;
  source_entry_number: number | null;
  source_posted_at: string | null;
  destination_journal_entry_id: string | null;
  destination_journal_status: 'draft' | 'posted' | null;
  destination_entry_number: number | null;
  destination_posted_at: string | null;
  source_due_from_base_amount: number;
  destination_due_to_base_amount: number;
  source_clearing_account_id: string | null;
  destination_clearing_account_id: string | null;
  both_sides_in_scope: boolean;
  reconciliation_status: 'rejected' | 'not_posted' | 'not_required' | 'counterpart_outside_scope' | 'matched' | 'mismatch';
  elimination_base_amount: number;
}

export interface FinanceTransferClearingSummary {
  base_currency_code: string;
  due_from_balance: number;
  due_to_balance: number;
  elimination_amount: number;
  remaining_due_from: number;
  remaining_due_to: number;
}

export interface FinanceTransferReconciliation {
  actor_profile_id: string;
  scope_type: FinanceOwnershipScope['type'];
  scope_id: string | null;
  transfers: FinanceTransferReconciliationRow[];
  clearing_summary: FinanceTransferClearingSummary[];
}

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: FinanceTransferReconciliation | null;
    error: { message: string; code?: string } | null;
  }>;
};

const defaultRpcClient = financeSupabase as unknown as RpcClient;

/** Reads authorized transfer reconciliation for one branch, district or consolidated church scope. */
export async function getFinanceTransferReconciliation(
  scope: FinanceOwnershipScope,
  client: RpcClient = defaultRpcClient
): Promise<{
  data: FinanceTransferReconciliation | null;
  error: { message: string; code?: string } | null;
}> {
  const result = await client.rpc('get_finance_transfer_reconciliation', {
    p_scope_type: scope.type,
    p_scope_id: scope.id
  });
  return { data: result.data, error: result.error };
}

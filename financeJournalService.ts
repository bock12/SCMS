import { financeSupabase } from './financeSupabaseClient';

export interface FinanceJournalLine {
  id: string;
  line_number: number;
  account_id: string;
  account_code: string | null;
  account_name: string;
  account_type: string | null;
  normal_balance: string | null;
  fund_id: string | null;
  branch_id: string | null;
  profile_id: string | null;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  base_debit_amount: number;
  base_credit_amount: number;
}

export interface FinanceJournal {
  id: string;
  entry_number: number | null;
  period_id: string;
  branch_id: string | null;
  entry_date: string;
  description: string;
  reference: string | null;
  currency_code: string;
  exchange_rate_to_base: number;
  base_currency_code: string;
  status: 'draft' | 'posted';
  source_type: string | null;
  source_id: string | null;
  source_document_status: string | null;
  posted_at: string | null;
  total_debits: number;
  total_credits: number;
  base_total_debits: number;
  base_total_credits: number;
  can_post: boolean;
  lines: FinanceJournalLine[];
}

export interface FinanceAccountBalance {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: string | null;
  base_currency_code: string;
  debit_total: number;
  credit_total: number;
  net_debit_balance: number;
}

export interface FinanceJournalLedger {
  actor_profile_id: string;
  journals: FinanceJournal[];
  account_balances: FinanceAccountBalance[];
}

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: any;
    error: { message: string; code?: string } | null;
  }>;
};

const rpc = financeSupabase as unknown as RpcClient;

export async function getFinanceJournalLedger(branchId: string | null): Promise<{
  data: FinanceJournalLedger | null;
  error: { message: string; code?: string } | null;
}> {
  const result = await rpc.rpc('get_finance_journals', { p_branch_id: branchId });
  return { data: result.data as FinanceJournalLedger | null, error: result.error };
}

export async function postFinanceJournalEntry(journalEntryId: string): Promise<{
  data: { journal_entry_id: string; status: 'posted'; already_posted: boolean } | null;
  error: { message: string; code?: string } | null;
}> {
  const result = await rpc.rpc('post_finance_journal_entry', {
    p_journal_entry_id: journalEntryId
  });
  return { data: result.data, error: result.error };
}

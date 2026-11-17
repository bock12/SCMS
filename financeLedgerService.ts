import { supabase } from './supabaseClient';

export type FinancialDocumentType = 'receipt' | 'payment' | 'transfer' | 'adjustment';
export type FinancialDocumentStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'cancelled';

export interface FinancialDocumentRow {
  id: string;
  document_number?: number;
  document_type: FinancialDocumentType;
  transaction_date: string;
  branch_id: string | null;
  profile_id: string | null;
  payee_or_payer_name: string;
  amount: number;
  currency_code: string;
  payment_method: string;
  financial_account_id: string | null;
  external_reference: string | null;
  description: string | null;
  status: FinancialDocumentStatus;
  journal_entry_id: string | null;
  approval_request_id: string | null;
  created_by_profile_id: string | null;
  approved_by_profile_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GivingRecordRow {
  id: string;
  financial_document_id: string;
  giver_profile_id: string | null;
  giver_name: string;
  giving_type: 'tithe' | 'offering' | 'donation' | 'pledge' | 'other';
  fund_id: string | null;
  campaign_or_appeal: string | null;
}

export interface FinanceLedgerEntry extends FinancialDocumentRow {
  giving_record: GivingRecordRow | null;
}

/**
 * Joins the source document to its optional giving detail without changing
 * accounting status. A document is not a posted ledger entry until its linked
 * journal has actually been posted.
 */
export const mapFinanceLedgerEntries = (
  documents: FinancialDocumentRow[],
  givingRecords: GivingRecordRow[]
): FinanceLedgerEntry[] => {
  const givingByDocumentId = new Map(
    givingRecords.map(record => [record.financial_document_id, record])
  );

  return [...documents]
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    .map(document => ({
      ...document,
      giving_record: givingByDocumentId.get(document.id) ?? null
    }));
};

export const getFinanceLedgerEntries = async (): Promise<{
  data: FinanceLedgerEntry[] | null;
  error: { message: string; code?: string } | null;
}> => {
  const { data: documents, error: documentError } = await supabase
    .from('financial_documents')
    .select('*')
    .order('transaction_date', { ascending: false });

  if (documentError) {
    return { data: null, error: documentError };
  }

  const documentRows = (documents || []) as unknown as FinancialDocumentRow[];
  if (documentRows.length === 0) {
    return { data: [], error: null };
  }

  const { data: givingRecords, error: givingError } = await supabase
    .from('giving_records')
    .select('*');

  if (givingError) {
    return { data: null, error: givingError };
  }

  return {
    data: mapFinanceLedgerEntries(
      documentRows,
      (givingRecords || []) as unknown as GivingRecordRow[]
    ),
    error: null
  };
};

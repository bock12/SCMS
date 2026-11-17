import { describe, expect, test } from 'bun:test';
import {
  mapFinanceLedgerEntries,
  type FinancialDocumentRow,
  type GivingRecordRow
} from './financeLedgerService';

const receipt: FinancialDocumentRow = {
  id: 'doc-receipt',
  document_number: 12,
  document_type: 'receipt',
  transaction_date: '2026-11-16',
  branch_id: 'branch-a',
  profile_id: 'member-a',
  payee_or_payer_name: 'Grace Campbell',
  amount: 1500,
  currency_code: 'SLE',
  payment_method: 'cash',
  financial_account_id: 'cash-account',
  external_reference: null,
  description: 'Sunday tithe',
  status: 'pending_approval',
  journal_entry_id: null,
  approval_request_id: 'approval-a',
  created_by_profile_id: 'finance-a',
  approved_by_profile_id: null,
  approved_at: null,
  created_at: '2026-11-16T10:00:00.000Z',
  updated_at: '2026-11-16T10:00:00.000Z'
};

const payment: FinancialDocumentRow = {
  ...receipt,
  id: 'doc-payment',
  document_number: 11,
  document_type: 'payment',
  transaction_date: '2026-11-15',
  payee_or_payer_name: 'Electricity provider',
  amount: 800,
  status: 'posted',
  journal_entry_id: 'journal-a',
  approval_request_id: null
};

const tithe: GivingRecordRow = {
  id: 'giving-a',
  financial_document_id: 'doc-receipt',
  giver_profile_id: 'member-a',
  giver_name: 'Grace Campbell',
  giving_type: 'tithe',
  fund_id: 'fund-tithe',
  campaign_or_appeal: null
};

describe('finance ledger document projection', () => {
  test('joins giving detail to its source financial document', () => {
    const [entry] = mapFinanceLedgerEntries([receipt], [tithe]);

    expect(entry.id).toBe('doc-receipt');
    expect(entry.giving_record?.giving_type).toBe('tithe');
    expect(entry.giving_record?.fund_id).toBe('fund-tithe');
    expect(entry.status).toBe('pending_approval');
  });

  test('preserves source document state and does not treat approval as posting', () => {
    const [entry] = mapFinanceLedgerEntries([receipt], []);

    expect(entry.status).toBe('pending_approval');
    expect(entry.journal_entry_id).toBeNull();
    expect(entry.giving_record).toBeNull();
  });

  test('preserves posted state only when the database document has a journal link', () => {
    const [entry] = mapFinanceLedgerEntries([payment], []);

    expect(entry.status).toBe('posted');
    expect(entry.journal_entry_id).toBe('journal-a');
    expect(entry.document_type).toBe('payment');
  });

  test('returns entries in descending transaction date order', () => {
    const entries = mapFinanceLedgerEntries([payment, receipt], [tithe]);

    expect(entries.map(entry => entry.id)).toEqual(['doc-receipt', 'doc-payment']);
  });

  test('does not invent a giving record for payments or unrelated documents', () => {
    const [entry] = mapFinanceLedgerEntries([payment], [tithe]);

    expect(entry.giving_record).toBeNull();
  });
});

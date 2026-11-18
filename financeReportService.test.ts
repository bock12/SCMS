import { describe, expect, test } from 'bun:test';
import { buildPostedFinanceReport, isWithinFinanceReportPeriod } from './financeReportService';
import type { FinanceJournal, FinanceJournalLedger } from './financeJournalService';

function journal(overrides: Partial<FinanceJournal> = {}): FinanceJournal {
  return {
    id: 'journal-1', entry_number: 1, period_id: 'period-1', branch_id: 'branch-1',
    entry_date: '2026-11-12', description: 'Sunday offering', reference: 'RCPT-1',
    currency_code: 'SLE', exchange_rate_to_base: 1, base_currency_code: 'SLE',
    status: 'posted', source_type: 'financial_document', source_id: 'document-1',
    source_document_status: 'approved', posted_at: '2026-11-12T10:00:00.000Z',
    total_debits: 100, total_credits: 100, base_total_debits: 100, base_total_credits: 100,
    can_post: false,
    lines: [
      { id: 'line-1', line_number: 1, account_id: 'cash', account_code: '1000', account_name: 'Cash', account_type: 'asset', normal_balance: 'debit', fund_id: null, branch_id: 'branch-1', profile_id: null, description: null, debit_amount: 100, credit_amount: 0, base_debit_amount: 100, base_credit_amount: 0 },
      { id: 'line-2', line_number: 2, account_id: 'offering', account_code: '4000', account_name: 'Offering Income', account_type: 'income', normal_balance: 'credit', fund_id: null, branch_id: 'branch-1', profile_id: null, description: null, debit_amount: 0, credit_amount: 100, base_debit_amount: 0, base_credit_amount: 100 }
    ],
    ...overrides
  };
}

const ledger = (...journals: FinanceJournal[]): FinanceJournalLedger => ({
  actor_profile_id: 'finance-user', journals, account_balances: []
});

describe('posted journal financial reports', () => {
  test('includes only posted journals and excludes approved drafts and rejected/pending source entries', () => {
    const posted = journal();
    const draft = journal({ id: 'draft', status: 'draft', entry_number: 2, entry_date: '2026-11-13' });
    const report = buildPostedFinanceReport(ledger(
      posted,
      draft,
      journal({ id: 'rejected-draft', status: 'draft', source_document_status: 'rejected', entry_date: '2026-11-14' })
    ), 'all', new Date('2026-11-18T12:00:00'));
    expect(report.journals.map(item => item.id)).toEqual(['journal-1']);
    expect(report.lines).toHaveLength(2);
    expect(report.currency_summaries[0].revenue).toBe(100);
    expect(report.currency_summaries[0].expenses).toBe(0);
  });

  test('calculates posted expense and income balances in base currency', () => {
    const expense = journal({
      id: 'payment-1', entry_number: 2, description: 'Utilities payment',
      lines: [
        { id: 'line-3', line_number: 1, account_id: 'utilities', account_code: '6000', account_name: 'Utilities', account_type: 'expense', normal_balance: 'debit', fund_id: null, branch_id: 'branch-1', profile_id: null, description: null, debit_amount: 35, credit_amount: 0, base_debit_amount: 35, base_credit_amount: 0 },
        { id: 'line-4', line_number: 2, account_id: 'cash', account_code: '1000', account_name: 'Cash', account_type: 'asset', normal_balance: 'debit', fund_id: null, branch_id: 'branch-1', profile_id: null, description: null, debit_amount: 0, credit_amount: 35, base_debit_amount: 0, base_credit_amount: 35 }
      ]
    });
    const report = buildPostedFinanceReport(ledger(journal(), expense));
    expect(report.currency_summaries).toEqual([{
      base_currency_code: 'SLE', revenue: 100, expenses: 35, net_operating_position: 65
    }]);
    expect(report.account_balances.find(item => item.account_id === 'utilities')?.balance).toBe(35);
    expect(report.account_balances.find(item => item.account_id === 'offering')?.balance).toBe(100);
  });

  test('keeps operating totals separated by base currency', () => {
    const usdJournal = journal({
      id: 'usd-receipt', entry_number: 3, base_currency_code: 'USD', currency_code: 'USD',
      lines: [
        { id: 'usd-cash', line_number: 1, account_id: 'usd-cash', account_code: '1010', account_name: 'USD Cash', account_type: 'asset', normal_balance: 'debit', fund_id: null, branch_id: 'branch-1', profile_id: null, description: null, debit_amount: 50, credit_amount: 0, base_debit_amount: 50, base_credit_amount: 0 },
        { id: 'usd-income', line_number: 2, account_id: 'usd-income', account_code: '4010', account_name: 'USD Income', account_type: 'income', normal_balance: 'credit', fund_id: null, branch_id: 'branch-1', profile_id: null, description: null, debit_amount: 0, credit_amount: 50, base_debit_amount: 0, base_credit_amount: 50 }
      ]
    });
    const report = buildPostedFinanceReport(ledger(journal(), usdJournal));
    expect(report.currency_summaries).toHaveLength(2);
    expect(report.currency_summaries.find(item => item.base_currency_code === 'SLE')?.revenue).toBe(100);
    expect(report.currency_summaries.find(item => item.base_currency_code === 'USD')?.revenue).toBe(50);
  });

  test('applies calendar week, month, quarter and year boundaries', () => {
    const now = new Date('2026-11-18T12:00:00');
    expect(isWithinFinanceReportPeriod('2026-11-12', 'week', now)).toBe(true);
    expect(isWithinFinanceReportPeriod('2026-11-11', 'week', now)).toBe(false);
    expect(isWithinFinanceReportPeriod('2026-11-01', 'month', now)).toBe(true);
    expect(isWithinFinanceReportPeriod('2026-10-31', 'month', now)).toBe(false);
    expect(isWithinFinanceReportPeriod('2026-10-01', 'quarter', now)).toBe(true);
    expect(isWithinFinanceReportPeriod('2026-07-01', 'quarter', now)).toBe(false);
    expect(isWithinFinanceReportPeriod('2025-12-31', 'year', now)).toBe(false);
  });
});

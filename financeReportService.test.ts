import { describe, expect, test } from 'bun:test';
import { applyFinanceTransferEliminations, buildFinanceConsolidatedPositionReport, buildFinanceOrganizationalPerformanceReport, buildFinanceTransferClearingSummary, buildFinanceTransferOutstandingRows, buildPostedFinanceReport, isWithinFinanceReportPeriod, serializeFinanceCsv } from './financeReportService';
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

describe('finance report CSV serialization', () => {
  test('quotes fields and escapes embedded quotes, commas and line breaks', () => {
    expect(serializeFinanceCsv(['Account', 'Description'], [
      ['Cash, bank', 'Offering "Sunday"\nservice']
    ])).toBe('"Account","Description"\r\n"Cash, bank","Offering ""Sunday""\nservice"');
  });
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


describe('consolidated transfer eliminations', () => {
  test('eliminates equal reciprocal due-from and due-to balances in the consolidated view only', () => {
    const balances = [
      { account_id: 'due-from-a', account_code: '1900', account_name: 'Due from branches', account_type: 'asset', normal_balance: 'debit', base_currency_code: 'SLE', debit_total: 250, credit_total: 0, balance: 250 },
      { account_id: 'due-to-b', account_code: '2900', account_name: 'Due to branches', account_type: 'liability', normal_balance: 'credit', base_currency_code: 'SLE', debit_total: 0, credit_total: 250, balance: 250 },
      { account_id: 'cash', account_code: '1000', account_name: 'Cash', account_type: 'asset', normal_balance: 'debit', base_currency_code: 'SLE', debit_total: 500, credit_total: 250, balance: 250 }
    ];
    const transfers = [{
      transfer_id: 'transfer-1', transfer_number: 1, transaction_date: '2026-11-25',
      source_branch_id: 'branch-a', source_branch_name: 'Branch A',
      destination_branch_id: 'branch-b', destination_branch_name: 'Branch B',
      amount: 250, currency_code: 'SLE', base_currency_code: 'SLE', status: 'posted',
      description: 'Branch transfer', external_reference: null,
      source_journal_entry_id: 'journal-a', source_journal_status: 'posted',
      source_entry_number: 1, source_posted_at: '2026-11-25T10:00:00Z',
      destination_journal_entry_id: 'journal-b', destination_journal_status: 'posted',
      destination_entry_number: 2, destination_posted_at: '2026-11-25T10:00:00Z',
      source_due_from_base_amount: 250, destination_due_to_base_amount: 250,
      source_clearing_account_id: 'due-from-a', destination_clearing_account_id: 'due-to-b',
      both_sides_in_scope: true, reconciliation_status: 'matched', elimination_base_amount: 250
    }] as const;
    const consolidated = applyFinanceTransferEliminations(balances, transfers as any);
    expect(consolidated.find(item => item.account_id === 'due-from-a')?.elimination_amount).toBe(250);
    expect(consolidated.find(item => item.account_id === 'due-from-a')?.consolidated_balance).toBe(0);
    expect(consolidated.find(item => item.account_id === 'due-to-b')?.consolidated_balance).toBe(0);
    expect(consolidated.find(item => item.account_id === 'cash')?.consolidated_balance).toBe(250);
    expect(balances[0].balance).toBe(250);
  });

  test('builds clearing summaries within the selected report period and branch scope', () => {
    const base = {
      transfer_id: 'transfer-period', transfer_number: 2, transaction_date: '2026-11-20',
      source_branch_id: 'branch-a', source_branch_name: 'Branch A',
      destination_branch_id: 'branch-b', destination_branch_name: 'Branch B',
      amount: 250, currency_code: 'SLE', base_currency_code: 'SLE', status: 'posted',
      description: 'Branch transfer', external_reference: null,
      source_journal_entry_id: 'journal-a', source_journal_status: 'posted',
      source_entry_number: 1, source_posted_at: '2026-11-20T10:00:00Z',
      destination_journal_entry_id: 'journal-b', destination_journal_status: 'posted',
      destination_entry_number: 2, destination_posted_at: '2026-11-20T10:00:00Z',
      source_due_from_base_amount: 250, destination_due_to_base_amount: 250,
      source_clearing_account_id: 'due-from-a', destination_clearing_account_id: 'due-to-b',
      both_sides_in_scope: true, source_in_scope: true, destination_in_scope: true,
      reconciliation_status: 'matched', elimination_base_amount: 250
    };
    const inPeriod = buildFinanceTransferClearingSummary([base as any], 'month', new Date('2026-11-25T12:00:00'));
    expect(inPeriod).toEqual([{
      base_currency_code: 'SLE', due_from_balance: 250, due_to_balance: 250,
      elimination_amount: 250, remaining_due_from: 0, remaining_due_to: 0
    }]);
    const branchOnly = buildFinanceTransferClearingSummary([{
      ...base, both_sides_in_scope: false, destination_in_scope: false,
      reconciliation_status: 'counterpart_outside_scope', elimination_base_amount: 0
    } as any], 'month', new Date('2026-11-25T12:00:00'));
    expect(branchOnly[0]).toMatchObject({
      due_from_balance: 250, due_to_balance: 0, elimination_amount: 0,
      remaining_due_from: 250, remaining_due_to: 0
    });
    expect(buildFinanceTransferClearingSummary([base as any], 'month', new Date('2026-12-25T12:00:00'))).toEqual([]);
  });

  test('shows open due-from and due-to exposure by transfer without eliminating unmatched balances', () => {
    const rows = [
      {
        transfer_id: 'outside-scope', transfer_number: 11, transaction_date: '2026-11-25',
        source_branch_id: 'branch-a', source_branch_name: 'Branch A',
        destination_branch_id: 'branch-b', destination_branch_name: 'Branch B',
        amount: 300, currency_code: 'SLE', base_currency_code: 'SLE', status: 'posted' as const,
        description: 'Counterpart outside scope', external_reference: null,
        source_journal_entry_id: 'source-je', source_journal_status: 'posted' as const,
        source_entry_number: 11, source_posted_at: null,
        destination_journal_entry_id: 'destination-je', destination_journal_status: 'posted' as const,
        destination_entry_number: 12, destination_posted_at: null,
        source_due_from_base_amount: 300, destination_due_to_base_amount: 300,
        source_clearing_account_id: 'due-from', destination_clearing_account_id: 'due-to',
        both_sides_in_scope: false, source_in_scope: true, destination_in_scope: false,
        reconciliation_status: 'counterpart_outside_scope' as const, elimination_base_amount: 0
      },
      {
        transfer_id: 'mismatch', transfer_number: 12, transaction_date: '2026-11-25',
        source_branch_id: 'branch-c', source_branch_name: 'Branch C',
        destination_branch_id: 'branch-d', destination_branch_name: 'Branch D',
        amount: 200, currency_code: 'SLE', base_currency_code: 'SLE', status: 'posted' as const,
        description: 'Mismatched journals', external_reference: null,
        source_journal_entry_id: 'source-je-2', source_journal_status: 'posted' as const,
        source_entry_number: 13, source_posted_at: null,
        destination_journal_entry_id: 'destination-je-2', destination_journal_status: 'posted' as const,
        destination_entry_number: 14, destination_posted_at: null,
        source_due_from_base_amount: 200, destination_due_to_base_amount: 175,
        source_clearing_account_id: 'due-from-2', destination_clearing_account_id: 'due-to-2',
        both_sides_in_scope: true, source_in_scope: true, destination_in_scope: true,
        reconciliation_status: 'mismatch' as const, elimination_base_amount: 0
      },
      {
        transfer_id: 'pending', transfer_number: 13, transaction_date: '2026-11-25',
        source_branch_id: 'branch-e', source_branch_name: 'Branch E',
        destination_branch_id: 'branch-f', destination_branch_name: 'Branch F',
        amount: 100, currency_code: 'SLE', base_currency_code: 'SLE', status: 'approved' as const,
        description: 'Not posted', external_reference: null,
        source_journal_entry_id: null, source_journal_status: null,
        source_entry_number: null, source_posted_at: null,
        destination_journal_entry_id: null, destination_journal_status: null,
        destination_entry_number: null, destination_posted_at: null,
        source_due_from_base_amount: 0, destination_due_to_base_amount: 0,
        source_clearing_account_id: null, destination_clearing_account_id: null,
        both_sides_in_scope: true, source_in_scope: true, destination_in_scope: true,
        reconciliation_status: 'not_posted' as const, elimination_base_amount: 0
      }
    ] as any;
    expect(buildFinanceTransferOutstandingRows(rows)).toEqual([
      {
        transfer_id: 'outside-scope', transfer_number: 11, transaction_date: '2026-11-25',
        source_branch_name: 'Branch A', destination_branch_name: 'Branch B',
        base_currency_code: 'SLE', reconciliation_status: 'counterpart_outside_scope',
        due_from_balance: 300, due_to_balance: 0, eliminated_due_from: 0, eliminated_due_to: 0,
        outstanding_due_from: 300, outstanding_due_to: 0
      },
      {
        transfer_id: 'mismatch', transfer_number: 12, transaction_date: '2026-11-25',
        source_branch_name: 'Branch C', destination_branch_name: 'Branch D',
        base_currency_code: 'SLE', reconciliation_status: 'mismatch',
        due_from_balance: 200, due_to_balance: 175, eliminated_due_from: 0, eliminated_due_to: 0,
        outstanding_due_from: 200, outstanding_due_to: 175
      }
    ]);
  });

  test('does not eliminate branch-only, unmatched or unposted transfer balances', () => {
    const balances = [
      { account_id: 'due-from-a', account_code: '1900', account_name: 'Due from branches', account_type: 'asset', normal_balance: 'debit', base_currency_code: 'SLE', debit_total: 250, credit_total: 0, balance: 250 },
      { account_id: 'due-to-b', account_code: '2900', account_name: 'Due to branches', account_type: 'liability', normal_balance: 'credit', base_currency_code: 'SLE', debit_total: 0, credit_total: 250, balance: 250 }
    ];
    const transfer = {
      transfer_id: 'transfer-1', transfer_number: 1, transaction_date: '2026-11-25',
      source_branch_id: 'branch-a', source_branch_name: 'Branch A',
      destination_branch_id: 'branch-b', destination_branch_name: 'Branch B',
      amount: 250, currency_code: 'SLE', base_currency_code: 'SLE', status: 'posted',
      description: 'Branch transfer', external_reference: null,
      source_journal_entry_id: 'journal-a', source_journal_status: 'posted',
      source_entry_number: 1, source_posted_at: '2026-11-25T10:00:00Z',
      destination_journal_entry_id: 'journal-b', destination_journal_status: 'posted',
      destination_entry_number: 2, destination_posted_at: '2026-11-25T10:00:00Z',
      source_due_from_base_amount: 250, destination_due_to_base_amount: 250,
      source_clearing_account_id: 'due-from-a', destination_clearing_account_id: 'due-to-b',
      both_sides_in_scope: false, reconciliation_status: 'counterpart_outside_scope', elimination_base_amount: 0
    };
    const consolidated = applyFinanceTransferEliminations(balances, [transfer as any]);
    expect(consolidated.every(item => item.elimination_amount === 0)).toBe(true);
    expect(consolidated.find(item => item.account_id === 'due-from-a')?.consolidated_balance).toBe(250);
  });
});


describe('branch and district financial performance', () => {
  test('compares posted income and expenditure by branch and district without mixing currencies', () => {
    const branchOne = journal({ district_id: 'district-1' });
    const branchTwo = journal({
      id: 'branch-two', branch_id: 'branch-2', district_id: 'district-1',
      entry_number: 2,
      lines: [
        { id: 'cash-2', line_number: 1, account_id: 'cash', account_code: '1000', account_name: 'Cash', account_type: 'asset', normal_balance: 'debit', fund_id: null, branch_id: 'branch-2', profile_id: null, description: null, debit_amount: 70, credit_amount: 0, base_debit_amount: 70, base_credit_amount: 0 },
        { id: 'income-2', line_number: 2, account_id: 'offering', account_code: '4000', account_name: 'Offering Income', account_type: 'income', normal_balance: 'credit', fund_id: null, branch_id: 'branch-2', profile_id: null, description: null, debit_amount: 0, credit_amount: 70, base_debit_amount: 0, base_credit_amount: 70 }
      ]
    });
    const branchThree = journal({
      id: 'branch-three', branch_id: 'branch-3', district_id: 'district-2',
      entry_number: 3, base_currency_code: 'USD', currency_code: 'USD',
      lines: [
        { id: 'cash-3', line_number: 1, account_id: 'cash-usd', account_code: '1010', account_name: 'Cash USD', account_type: 'asset', normal_balance: 'debit', fund_id: null, branch_id: 'branch-3', profile_id: null, description: null, debit_amount: 50, credit_amount: 0, base_debit_amount: 50, base_credit_amount: 0 },
        { id: 'income-3', line_number: 2, account_id: 'income-usd', account_code: '4010', account_name: 'Income USD', account_type: 'income', normal_balance: 'credit', fund_id: null, branch_id: 'branch-3', profile_id: null, description: null, debit_amount: 0, credit_amount: 50, base_debit_amount: 0, base_credit_amount: 50 }
      ]
    });
    const unposted = journal({
      id: 'branch-one-draft', status: 'draft', entry_number: 4,
      district_id: 'district-1'
    });

    const report = buildFinanceOrganizationalPerformanceReport(
      ledger(branchOne, branchTwo, branchThree, unposted)
    );

    expect(report.branches).toEqual([
      { scope_id: 'branch-1', base_currency_code: 'SLE', revenue: 100, expenses: 0, net_operating_position: 100, posted_journal_count: 1 },
      { scope_id: 'branch-2', base_currency_code: 'SLE', revenue: 70, expenses: 0, net_operating_position: 70, posted_journal_count: 1 },
      { scope_id: 'branch-3', base_currency_code: 'USD', revenue: 50, expenses: 0, net_operating_position: 50, posted_journal_count: 1 }
    ]);
    expect(report.districts).toEqual([
      { scope_id: 'district-1', base_currency_code: 'SLE', revenue: 170, expenses: 0, net_operating_position: 170, posted_journal_count: 2 },
      { scope_id: 'district-2', base_currency_code: 'USD', revenue: 50, expenses: 0, net_operating_position: 50, posted_journal_count: 1 }
    ]);
  });

  test('calculates expenditure and respects the selected reporting period', () => {
    const payment = journal({
      id: 'branch-one-payment', entry_number: 5, district_id: 'district-1',
      entry_date: '2026-11-18',
      lines: [
        { id: 'utilities', line_number: 1, account_id: 'utilities', account_code: '6000', account_name: 'Utilities', account_type: 'expense', normal_balance: 'debit', fund_id: null, branch_id: 'branch-1', profile_id: null, description: null, debit_amount: 25, credit_amount: 0, base_debit_amount: 25, base_credit_amount: 0 },
        { id: 'cash-out', line_number: 2, account_id: 'cash', account_code: '1000', account_name: 'Cash', account_type: 'asset', normal_balance: 'debit', fund_id: null, branch_id: 'branch-1', profile_id: null, description: null, debit_amount: 0, credit_amount: 25, base_debit_amount: 0, base_credit_amount: 25 }
      ]
    });
    const report = buildFinanceOrganizationalPerformanceReport(
      ledger(payment), 'month', new Date('2026-11-25T12:00:00')
    );
    expect(report.branches[0]).toMatchObject({
      scope_id: 'branch-1', revenue: 0, expenses: 25,
      net_operating_position: -25, posted_journal_count: 1
    });
    expect(report.districts[0]).toMatchObject({
      scope_id: 'district-1', expenses: 25, net_operating_position: -25
    });
    expect(buildFinanceOrganizationalPerformanceReport(
      ledger(payment), 'month', new Date('2026-12-25T12:00:00')
    ).branches).toEqual([]);
  });
});


describe('consolidated financial position', () => {
  test('eliminates matched inter-branch clearing and includes accumulated surplus in equity', () => {
    const balances = [
      { account_id: 'cash', account_code: '1000', account_name: 'Cash', account_type: 'asset', normal_balance: 'debit', base_currency_code: 'SLE', debit_total: 400, credit_total: 0, balance: 400 },
      { account_id: 'due-from', account_code: '1200', account_name: 'Due from branches', account_type: 'asset', normal_balance: 'debit', base_currency_code: 'SLE', debit_total: 100, credit_total: 0, balance: 100 },
      { account_id: 'due-to', account_code: '2200', account_name: 'Due to branches', account_type: 'liability', normal_balance: 'credit', base_currency_code: 'SLE', debit_total: 0, credit_total: 100, balance: 100 },
      { account_id: 'loan', account_code: '2300', account_name: 'Loan payable', account_type: 'liability', normal_balance: 'credit', base_currency_code: 'SLE', debit_total: 0, credit_total: 150, balance: 150 },
      { account_id: 'capital', account_code: '3000', account_name: 'Capital', account_type: 'equity', normal_balance: 'credit', base_currency_code: 'SLE', debit_total: 0, credit_total: 200, balance: 200 },
      { account_id: 'income', account_code: '4000', account_name: 'Income', account_type: 'income', normal_balance: 'credit', base_currency_code: 'SLE', debit_total: 0, credit_total: 100, balance: 100 },
      { account_id: 'expense', account_code: '6000', account_name: 'Expense', account_type: 'expense', normal_balance: 'debit', base_currency_code: 'SLE', debit_total: 50, credit_total: 0, balance: 50 }
    ];
    const transfers = [{
      transfer_id: 'transfer-1', transfer_number: 1, transaction_date: '2026-11-20',
      source_branch_id: 'branch-a', source_branch_name: 'Branch A',
      destination_branch_id: 'branch-b', destination_branch_name: 'Branch B',
      amount: 100, currency_code: 'SLE', base_currency_code: 'SLE',
      status: 'posted' as const, description: 'Inter-branch transfer', external_reference: null,
      source_journal_entry_id: 'source-je', source_journal_status: 'posted' as const,
      source_entry_number: 1, source_posted_at: null,
      destination_journal_entry_id: 'destination-je', destination_journal_status: 'posted' as const,
      destination_entry_number: 2, destination_posted_at: null,
      source_due_from_base_amount: 100, destination_due_to_base_amount: 100,
      source_clearing_account_id: 'due-from', destination_clearing_account_id: 'due-to',
      both_sides_in_scope: true, source_in_scope: true, destination_in_scope: true,
      reconciliation_status: 'matched' as const, elimination_base_amount: 100
    }];

    expect(buildFinanceConsolidatedPositionReport(balances, transfers)).toEqual([{
      base_currency_code: 'SLE',
      total_assets: 400,
      total_liabilities: 150,
      recorded_equity: 200,
      accumulated_surplus: 50,
      total_equity: 250,
      net_assets: 250,
      balance_check_difference: 0
    }]);
  });

  test('keeps currencies separate and does not eliminate unmatched transfers', () => {
    const balances = [
      { account_id: 'cash-sle', account_code: '1000', account_name: 'Cash SLE', account_type: 'asset', normal_balance: 'debit', base_currency_code: 'SLE', debit_total: 100, credit_total: 0, balance: 100 },
      { account_id: 'cash-usd', account_code: '1001', account_name: 'Cash USD', account_type: 'asset', normal_balance: 'debit', base_currency_code: 'USD', debit_total: 50, credit_total: 0, balance: 50 }
    ];
    expect(buildFinanceConsolidatedPositionReport(balances, [])).toMatchObject([
      { base_currency_code: 'SLE', total_assets: 100 },
      { base_currency_code: 'USD', total_assets: 50 }
    ]);
  });
});

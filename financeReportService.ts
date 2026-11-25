import type { FinanceJournal, FinanceJournalLedger, FinanceJournalLine } from './financeJournalService';
import type { FinanceTransferClearingSummary, FinanceTransferReconciliationRow } from './financeTransferReconciliationService';

export type FinanceReportPeriod = 'all' | 'week' | 'month' | 'quarter' | 'year';

/** Serializes report rows as RFC-4180-style CSV with quoted and escaped fields. */
export function serializeFinanceCsv(headers: string[], rows: unknown[][]): string {
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers, ...rows].map(row => row.map(quote).join(',')).join('\\r\\n');
}

export interface FinanceReportLine {
  journal_id: string;
  entry_number: number | null;
  entry_date: string;
  branch_id: string | null;
  district_id: string | null;
  description: string;
  reference: string | null;
  currency_code: string;
  base_currency_code: string;
  account_id: string;
  account_code: string | null;
  account_name: string;
  account_type: string | null;
  debit_amount: number;
  credit_amount: number;
  base_debit_amount: number;
  base_credit_amount: number;
}

export interface FinanceReportAccountBalance {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: string | null;
  base_currency_code: string;
  debit_total: number;
  credit_total: number;
  balance: number;
}

export interface FinanceReportCurrencySummary {
  base_currency_code: string;
  revenue: number;
  expenses: number;
  net_operating_position: number;
}

export interface PostedFinanceReport {
  period: FinanceReportPeriod;
  journals: FinanceJournal[];
  lines: FinanceReportLine[];
  account_balances: FinanceReportAccountBalance[];
  currency_summaries: FinanceReportCurrencySummary[];
}

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function isWithinFinanceReportPeriod(
  dateValue: string,
  period: FinanceReportPeriod,
  now = new Date()
): boolean {
  if (period === 'all') return true;
  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date(`${localDate(now)}T00:00:00`);
  if (period === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return date >= start && date <= today;
  }
  if (period === 'month') {
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  }
  if (period === 'quarter') {
    return date.getFullYear() === today.getFullYear()
      && Math.floor(date.getMonth() / 3) === Math.floor(today.getMonth() / 3);
  }
  return date.getFullYear() === today.getFullYear();
}

export function buildPostedFinanceReport(
  ledger: FinanceJournalLedger,
  period: FinanceReportPeriod = 'all',
  now = new Date()
): PostedFinanceReport {
  const journals = ledger.journals
    .filter(journal => journal.status === 'posted' && isWithinFinanceReportPeriod(journal.entry_date, period, now))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || String(a.entry_number ?? a.id).localeCompare(String(b.entry_number ?? b.id)));

  const lines: FinanceReportLine[] = [];
  const balances = new Map<string, FinanceReportAccountBalance>();
  const summaries = new Map<string, FinanceReportCurrencySummary>();

  for (const journal of journals) {
    const summary = summaries.get(journal.base_currency_code) ?? {
      base_currency_code: journal.base_currency_code,
      revenue: 0,
      expenses: 0,
      net_operating_position: 0
    };

    for (const line of journal.lines as FinanceJournalLine[]) {
      lines.push({
        journal_id: journal.id,
        entry_number: journal.entry_number,
        entry_date: journal.entry_date,
        branch_id: journal.branch_id,
        district_id: journal.district_id ?? null,
        description: journal.description,
        reference: journal.reference,
        currency_code: journal.currency_code,
        base_currency_code: journal.base_currency_code,
        account_id: line.account_id,
        account_code: line.account_code,
        account_name: line.account_name,
        account_type: line.account_type,
        debit_amount: Number(line.debit_amount || 0),
        credit_amount: Number(line.credit_amount || 0),
        base_debit_amount: Number(line.base_debit_amount || 0),
        base_credit_amount: Number(line.base_credit_amount || 0)
      });

      const key = `${line.account_id}:${journal.base_currency_code}`;
      const balance = balances.get(key) ?? {
        account_id: line.account_id,
        account_code: line.account_code ?? '',
        account_name: line.account_name,
        account_type: line.account_type ?? 'unknown',
        normal_balance: line.normal_balance,
        base_currency_code: journal.base_currency_code,
        debit_total: 0,
        credit_total: 0,
        balance: 0
      };
      balance.debit_total += Number(line.base_debit_amount || 0);
      balance.credit_total += Number(line.base_credit_amount || 0);
      balance.balance = balance.normal_balance === 'credit'
        ? balance.credit_total - balance.debit_total
        : balance.debit_total - balance.credit_total;
      balances.set(key, balance);

      if (line.account_type === 'income') {
        summary.revenue += Number(line.base_credit_amount || 0) - Number(line.base_debit_amount || 0);
      } else if (line.account_type === 'expense') {
        summary.expenses += Number(line.base_debit_amount || 0) - Number(line.base_credit_amount || 0);
      }
    }
    summaries.set(journal.base_currency_code, summary);
  }

  const currency_summaries = [...summaries.values()].map(summary => ({
    ...summary,
    net_operating_position: summary.revenue - summary.expenses
  })).sort((a, b) => a.base_currency_code.localeCompare(b.base_currency_code));

  return {
    period,
    journals,
    lines,
    account_balances: [...balances.values()].sort((a, b) => a.account_code.localeCompare(b.account_code)),
    currency_summaries
  };
}

export interface FinanceConsolidatedAccountBalance extends FinanceReportAccountBalance {
  elimination_amount: number;
  consolidated_balance: number;
}

/**
 * Applies reporting-only reciprocal clearing eliminations to consolidated
 * account balances. Source journals and branch ledgers remain unchanged.
 */
export function applyFinanceTransferEliminations(
  accountBalances: FinanceReportAccountBalance[],
  transfers: FinanceTransferReconciliationRow[],
  period: FinanceReportPeriod = 'all',
  now = new Date()
): FinanceConsolidatedAccountBalance[] {
  const eliminations = new Map<string, number>();
  for (const transfer of transfers) {
    const amount = Number(transfer.elimination_base_amount || 0);
    if (transfer.reconciliation_status !== 'matched' || amount <= 0 ||
        !isWithinFinanceReportPeriod(transfer.transaction_date, period, now)) continue;
    if (transfer.source_clearing_account_id) {
      const key = `${transfer.source_clearing_account_id}:${transfer.base_currency_code}`;
      eliminations.set(key, (eliminations.get(key) || 0) + amount);
    }
    if (transfer.destination_clearing_account_id) {
      const key = `${transfer.destination_clearing_account_id}:${transfer.base_currency_code}`;
      eliminations.set(key, (eliminations.get(key) || 0) + amount);
    }
  }
  return accountBalances.map(balance => {
    const elimination_amount = eliminations.get(`${balance.account_id}:${balance.base_currency_code}`) || 0;
    return {
      ...balance,
      elimination_amount,
      consolidated_balance: balance.balance - elimination_amount
    };
  });
}


export interface FinanceTransferOutstandingRow {
  transfer_id: string;
  transfer_number: number;
  transaction_date: string;
  source_branch_name: string;
  destination_branch_name: string;
  base_currency_code: string;
  reconciliation_status: FinanceTransferReconciliationRow['reconciliation_status'];
  due_from_balance: number;
  due_to_balance: number;
  eliminated_due_from: number;
  eliminated_due_to: number;
  outstanding_due_from: number;
  outstanding_due_to: number;
}

/**
 * Shows posted clearing exposure per transfer and per visible branch side.
 * Only matched transfers are eligible for reporting eliminations; an
 * out-of-scope counterpart or an unposted journal remains outstanding.
 */
export function buildFinanceTransferOutstandingRows(
  transfers: FinanceTransferReconciliationRow[]
): FinanceTransferOutstandingRow[] {
  return transfers
    .filter(transfer => transfer.status === 'posted' && transfer.source_branch_id !== transfer.destination_branch_id)
    .map(transfer => {
      const due_from_balance = transfer.source_in_scope && transfer.source_journal_status === 'posted'
        ? Number(transfer.source_due_from_base_amount || 0) : 0;
      const due_to_balance = transfer.destination_in_scope && transfer.destination_journal_status === 'posted'
        ? Number(transfer.destination_due_to_base_amount || 0) : 0;
      const eligibleElimination = transfer.reconciliation_status === 'matched'
        ? Number(transfer.elimination_base_amount || 0) : 0;
      const eliminated_due_from = Math.min(due_from_balance, eligibleElimination);
      const eliminated_due_to = Math.min(due_to_balance, eligibleElimination);
      return {
        transfer_id: transfer.transfer_id,
        transfer_number: transfer.transfer_number,
        transaction_date: transfer.transaction_date,
        source_branch_name: transfer.source_branch_name,
        destination_branch_name: transfer.destination_branch_name,
        base_currency_code: transfer.base_currency_code,
        reconciliation_status: transfer.reconciliation_status,
        due_from_balance,
        due_to_balance,
        eliminated_due_from,
        eliminated_due_to,
        outstanding_due_from: due_from_balance - eliminated_due_from,
        outstanding_due_to: due_to_balance - eliminated_due_to
      };
    });
}

/** Builds report-period clearing balances from the same posted transfer rows used for elimination. */
export function buildFinanceTransferClearingSummary(
  transfers: FinanceTransferReconciliationRow[],
  period: FinanceReportPeriod = 'all',
  now = new Date()
): FinanceTransferClearingSummary[] {
  const summaries = new Map<string, FinanceTransferClearingSummary>();
  for (const transfer of transfers) {
    if (transfer.status !== 'posted' || transfer.source_branch_id === transfer.destination_branch_id ||
        !isWithinFinanceReportPeriod(transfer.transaction_date, period, now)) continue;
    const summary = summaries.get(transfer.base_currency_code) || {
      base_currency_code: transfer.base_currency_code,
      due_from_balance: 0,
      due_to_balance: 0,
      elimination_amount: 0,
      remaining_due_from: 0,
      remaining_due_to: 0
    };
    if (transfer.source_in_scope && transfer.source_journal_status === 'posted') {
      summary.due_from_balance += Number(transfer.source_due_from_base_amount || 0);
    }
    if (transfer.destination_in_scope && transfer.destination_journal_status === 'posted') {
      summary.due_to_balance += Number(transfer.destination_due_to_base_amount || 0);
    }
    if (transfer.reconciliation_status === 'matched') {
      summary.elimination_amount += Number(transfer.elimination_base_amount || 0);
    }
    summaries.set(transfer.base_currency_code, summary);
  }
  return [...summaries.values()].map(summary => ({
    ...summary,
    remaining_due_from: summary.due_from_balance - summary.elimination_amount,
    remaining_due_to: summary.due_to_balance - summary.elimination_amount
  })).sort((a,b) => a.base_currency_code.localeCompare(b.base_currency_code));
}


export interface FinanceOrganizationalPerformanceSummary {
  scope_id: string;
  base_currency_code: string;
  revenue: number;
  expenses: number;
  net_operating_position: number;
  posted_journal_count: number;
}

export interface FinanceOrganizationalPerformanceReport {
  branches: FinanceOrganizationalPerformanceSummary[];
  districts: FinanceOrganizationalPerformanceSummary[];
}

/**
 * Builds branch and district comparisons from posted journals in an already
 * authorized ledger scope. Currency totals remain separate; unposted journals
 * and journals without the relevant organizational scope are excluded.
 */
export function buildFinanceOrganizationalPerformanceReport(
  ledger: FinanceJournalLedger,
  period: FinanceReportPeriod = 'all',
  now = new Date()
): FinanceOrganizationalPerformanceReport {
  type Bucket = FinanceOrganizationalPerformanceSummary & { journal_ids: Set<string> };
  const branchBuckets = new Map<string, Bucket>();
  const districtBuckets = new Map<string, Bucket>();

  const addJournal = (
    buckets: Map<string, Bucket>,
    scopeId: string | null | undefined,
    journal: FinanceJournal
  ) => {
    if (!scopeId) return;
    const key = `${scopeId}:${journal.base_currency_code}`;
    const bucket = buckets.get(key) ?? {
      scope_id: scopeId,
      base_currency_code: journal.base_currency_code,
      revenue: 0,
      expenses: 0,
      net_operating_position: 0,
      posted_journal_count: 0,
      journal_ids: new Set<string>()
    };
    if (!bucket.journal_ids.has(journal.id)) {
      bucket.journal_ids.add(journal.id);
      bucket.posted_journal_count += 1;
    }
    for (const line of journal.lines) {
      const debit = Number(line.base_debit_amount || 0);
      const credit = Number(line.base_credit_amount || 0);
      if (line.account_type === 'income') bucket.revenue += credit - debit;
      if (line.account_type === 'expense') bucket.expenses += debit - credit;
    }
    bucket.net_operating_position = bucket.revenue - bucket.expenses;
    buckets.set(key, bucket);
  };

  for (const journal of ledger.journals) {
    if (journal.status !== 'posted' || !isWithinFinanceReportPeriod(journal.entry_date, period, now)) continue;
    addJournal(branchBuckets, journal.branch_id, journal);
    addJournal(districtBuckets, journal.district_id, journal);
  }

  const toRows = (buckets: Map<string, Bucket>) => [...buckets.values()]
    .map(({ journal_ids: _journalIds, ...summary }) => summary)
    .sort((a, b) => a.scope_id.localeCompare(b.scope_id)
      || a.base_currency_code.localeCompare(b.base_currency_code));

  return {
    branches: toRows(branchBuckets),
    districts: toRows(districtBuckets)
  };
}


export interface FinanceConsolidatedPositionSummary {
  base_currency_code: string;
  total_assets: number;
  total_liabilities: number;
  recorded_equity: number;
  accumulated_surplus: number;
  total_equity: number;
  net_assets: number;
  balance_check_difference: number;
}

/**
 * Builds an as-of-now financial position from cumulative posted balances.
 * Matched inter-branch clearing balances are eliminated for presentation only.
 * Accumulated surplus (income less expenses) is included in total equity so
 * the balance check reflects unclosed operating results.
 */
export function buildFinanceConsolidatedPositionReport(
  accountBalances: FinanceReportAccountBalance[],
  transfers: FinanceTransferReconciliationRow[]
): FinanceConsolidatedPositionSummary[] {
  const consolidated = applyFinanceTransferEliminations(accountBalances, transfers, 'all');
  const summaries = new Map<string, FinanceConsolidatedPositionSummary>();

  for (const account of consolidated) {
    const summary = summaries.get(account.base_currency_code) ?? {
      base_currency_code: account.base_currency_code,
      total_assets: 0,
      total_liabilities: 0,
      recorded_equity: 0,
      accumulated_surplus: 0,
      total_equity: 0,
      net_assets: 0,
      balance_check_difference: 0
    };
    const balance = Number(account.consolidated_balance || 0);
    if (account.account_type === 'asset') summary.total_assets += balance;
    if (account.account_type === 'liability') summary.total_liabilities += balance;
    if (account.account_type === 'equity') summary.recorded_equity += balance;
    if (account.account_type === 'income') summary.accumulated_surplus += balance;
    if (account.account_type === 'expense') summary.accumulated_surplus -= balance;
    summaries.set(account.base_currency_code, summary);
  }

  return [...summaries.values()].map(summary => {
    const total_equity = summary.recorded_equity + summary.accumulated_surplus;
    const net_assets = summary.total_assets - summary.total_liabilities;
    return {
      ...summary,
      total_equity,
      net_assets,
      balance_check_difference: net_assets - total_equity
    };
  }).sort((a, b) => a.base_currency_code.localeCompare(b.base_currency_code));
}

import type { FinanceJournal, FinanceJournalLedger, FinanceJournalLine } from './financeJournalService';
import type { FinanceTransferReconciliationRow } from './financeTransferReconciliationService';

export type FinanceReportPeriod = 'all' | 'week' | 'month' | 'quarter' | 'year';

export interface FinanceReportLine {
  journal_id: string;
  entry_number: number | null;
  entry_date: string;
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
  transfers: FinanceTransferReconciliationRow[]
): FinanceConsolidatedAccountBalance[] {
  const eliminations = new Map<string, number>();
  for (const transfer of transfers) {
    const amount = Number(transfer.elimination_base_amount || 0);
    if (transfer.reconciliation_status !== 'matched' || amount <= 0) continue;
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

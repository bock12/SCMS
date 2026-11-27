import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  Download,
  Printer,
  RefreshCw,
  Search,
  UploadCloud,
  X
} from 'lucide-react';
import { type FinanceOwnershipScope, type FinanceScopeOption } from './financeConfigurationService';
import {
  getFinanceJournalLedger,
  getScopedFinanceJournalLedger,
  postFinanceJournalEntry,
  type FinanceJournal
} from './financeJournalService';
import {
  applyFinanceTransferEliminations,
  buildFinanceConsolidatedPositionReport,
  buildFinanceOrganizationalPerformanceReport,
  buildFinanceTransferClearingSummary,
  buildFinanceTransferOutstandingRows,
  buildPostedFinanceReport,
  isWithinFinanceReportPeriod,
  serializeFinanceCsv,
  type FinanceReportPeriod
} from './financeReportService';
import {
  getFinanceTransferReconciliation,
  type FinanceTransferReconciliation
} from './financeTransferReconciliationService';
import {
  getFinanceOperationalBalances,
  type FinanceOperationalBalanceReport
} from './financeOperationalBalanceService';

interface Props {
  branchId: string | null;
  scope?: FinanceOwnershipScope;
  scopeOptions?: FinanceScopeOption[];
}

type JournalStatusFilter = 'all' | 'can_post' | 'pending' | 'posted' | 'rejected';

const money = (currency: string, value: number) =>
  `${currency} ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const journalLabel = (journal: FinanceJournal) => {
  if (journal.status === 'posted') return 'Posted';
  if (journal.source_type === 'financial_document_pending') {
    return journal.source_document_status === 'rejected'
      ? 'Rejected — not posted'
      : 'Awaiting approval — not posted';
  }
  if (journal.source_type === 'financial_document' && journal.source_document_status === 'approved') {
    return 'Approved — awaiting posting';
  }
  return 'Draft — not posted';
};

const journalBadgeClass = (journal: FinanceJournal) => {
  if (journal.status === 'posted') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (journal.source_document_status === 'rejected') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (journal.source_type === 'financial_document_pending') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-indigo-200 bg-indigo-50 text-indigo-800';
};

const reconciliationBadgeClass = (status: string) => {
  if (status === 'matched' || status === 'not_required') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (status === 'mismatch') {
    return 'border-rose-200 bg-rose-50 text-rose-800';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800';
};

export const FinanceJournalWorkspace: React.FC<Props> = ({
  branchId,
  scope,
  scopeOptions = []
}) => {
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof getFinanceJournalLedger>>['data']>(null);
  const [loading, setLoading] = useState(true);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transferReconciliation, setTransferReconciliation] = useState<FinanceTransferReconciliation | null>(null);
  const [operationalBalances, setOperationalBalances] = useState<FinanceOperationalBalanceReport | null>(null);
  const [operationalBalanceError, setOperationalBalanceError] = useState<string | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [reportPeriod, setReportPeriod] = useState<FinanceReportPeriod>('all');
  const [journalFilter, setJournalFilter] = useState<JournalStatusFilter>('all');
  const [journalSearch, setJournalSearch] = useState('');
  const [showPrintReportModal, setShowPrintReportModal] = useState(false);

  const report = useMemo(
    () => (ledger ? buildPostedFinanceReport(ledger, reportPeriod) : null),
    [ledger, reportPeriod]
  );
  const organizationalPerformance = useMemo(
    () => (ledger ? buildFinanceOrganizationalPerformanceReport(ledger, reportPeriod) : null),
    [ledger, reportPeriod]
  );
  const allTimeReport = useMemo(
    () => (ledger ? buildPostedFinanceReport(ledger, 'all') : null),
    [ledger]
  );
  const consolidatedPosition = useMemo(
    () =>
      allTimeReport && transferReconciliation
        ? buildFinanceConsolidatedPositionReport(allTimeReport.account_balances, transferReconciliation.transfers)
        : [],
    [allTimeReport, transferReconciliation]
  );

  const scopeLabel = useCallback(
    (type: 'branch' | 'district', id: string) =>
      scopeOptions.find(option => option.scope_type === type && option.scope_id === id)?.scope_name ||
      `${type === 'branch' ? 'Branch ' : 'District '}${id.slice(0, 8)}`,
    [scopeOptions]
  );

  const periodTransfers = useMemo(
    () =>
      (transferReconciliation?.transfers || []).filter(item =>
        isWithinFinanceReportPeriod(item.transaction_date, reportPeriod)
      ),
    [transferReconciliation, reportPeriod]
  );
  const transferOutstandingRows = useMemo(
    () => buildFinanceTransferOutstandingRows(periodTransfers),
    [periodTransfers]
  );
  const periodClearingSummary = useMemo(
    () => buildFinanceTransferClearingSummary(transferReconciliation?.transfers || [], reportPeriod),
    [transferReconciliation, reportPeriod]
  );
  const consolidatedBalances = useMemo(
    () =>
      report && transferReconciliation
        ? applyFinanceTransferEliminations(report.account_balances, transferReconciliation.transfers, reportPeriod)
        : [],
    [report, transferReconciliation, reportPeriod]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReconciliationError(null);
    setOperationalBalanceError(null);
    const reconciliationScope = scope || (branchId ? { type: 'branch' as const, id: branchId } : null);
    const [result, reconciliationResult, operationalBalanceResult] = await Promise.all([
      scope ? getScopedFinanceJournalLedger(scope) : getFinanceJournalLedger(branchId),
      reconciliationScope
        ? getFinanceTransferReconciliation(reconciliationScope)
        : Promise.resolve({ data: null, error: null }),
      reconciliationScope
        ? getFinanceOperationalBalances(reconciliationScope)
        : Promise.resolve({ data: null, error: null })
    ]);
    if (result.error) {
      setLedger(null);
      setError(result.error.message);
    } else {
      setLedger(result.data);
    }
    if (reconciliationResult.error) {
      setTransferReconciliation(null);
      setReconciliationError(reconciliationResult.error.message);
    } else {
      setTransferReconciliation(reconciliationResult.data);
    }
    if (operationalBalanceResult.error) {
      setOperationalBalances(null);
      setOperationalBalanceError(operationalBalanceResult.error.message);
    } else {
      setOperationalBalances(operationalBalanceResult.data);
    }
    setLoading(false);
  }, [branchId, scope?.type, scope?.id]);

  useEffect(() => {
    void reload();
    const handleDocumentsUpdated = () => {
      void reload();
    };
    window.addEventListener('finance_documents_updated', handleDocumentsUpdated);
    window.addEventListener('finance_transfers_updated', handleDocumentsUpdated);
    return () => {
      window.removeEventListener('finance_documents_updated', handleDocumentsUpdated);
      window.removeEventListener('finance_transfers_updated', handleDocumentsUpdated);
    };
  }, [reload]);

  const triggerCsvDownload = (filename: string, csv: string) => {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPostedCsv = () => {
    if (!report) return;
    const headers = [
      'Journal ID',
      'Entry Number',
      'Date',
      'Description',
      'Reference',
      'Transaction Currency',
      'Base Currency',
      'Account Code',
      'Account Name',
      'Account Type',
      'Debit',
      'Credit',
      'Base Debit',
      'Base Credit'
    ];
    const rows = report.lines.map(line => [
      line.journal_id,
      line.entry_number ?? '',
      line.entry_date,
      line.description,
      line.reference ?? '',
      line.currency_code,
      line.base_currency_code,
      line.account_code ?? '',
      line.account_name,
      line.account_type ?? '',
      line.debit_amount,
      line.credit_amount,
      line.base_debit_amount,
      line.base_credit_amount
    ]);
    triggerCsvDownload(
      `scms_posted_finance_report_${reportPeriod}_${new Date().toISOString().slice(0, 10)}.csv`,
      serializeFinanceCsv(headers, rows)
    );
  };

  const downloadTransferReconciliationCsv = () => {
    if (!transferOutstandingRows.length) return;
    const headers = [
      'Transfer Number',
      'Date',
      'Source Branch',
      'Destination Branch',
      'Base Currency',
      'Reconciliation Status',
      'Due From',
      'Due To',
      'Eliminated Due From',
      'Eliminated Due To',
      'Outstanding Due From',
      'Outstanding Due To'
    ];
    const rows = transferOutstandingRows.map(item => [
      item.transfer_number,
      item.transaction_date,
      item.source_branch_name,
      item.destination_branch_name,
      item.base_currency_code,
      item.reconciliation_status,
      item.due_from_balance,
      item.due_to_balance,
      item.eliminated_due_from,
      item.eliminated_due_to,
      item.outstanding_due_from,
      item.outstanding_due_to
    ]);
    triggerCsvDownload(
      `scms_inter_branch_reconciliation_${reportPeriod}_${new Date().toISOString().slice(0, 10)}.csv`,
      serializeFinanceCsv(headers, rows)
    );
  };

  const downloadConsolidatedPositionCsv = () => {
    if (!consolidatedPosition.length) return;
    const headers = [
      'Base Currency',
      'Total Assets',
      'Total Liabilities',
      'Recorded Equity',
      'Accumulated Surplus',
      'Total Equity',
      'Net Assets',
      'Balance Check Difference'
    ];
    const rows = consolidatedPosition.map(row => [
      row.base_currency_code,
      row.total_assets,
      row.total_liabilities,
      row.recorded_equity,
      row.accumulated_surplus,
      row.total_equity,
      row.net_assets,
      row.balance_check_difference
    ]);
    triggerCsvDownload(
      `scms_consolidated_financial_position_as_of_latest_posting_${new Date().toISOString().slice(0, 10)}.csv`,
      serializeFinanceCsv(headers, rows)
    );
  };

  const downloadOrganizationalPerformanceCsv = () => {
    if (
      !organizationalPerformance ||
      (!organizationalPerformance.branches.length && !organizationalPerformance.districts.length)
    ) {
      return;
    }
    const headers = [
      'Scope Type',
      'Scope Name',
      'Base Currency',
      'Revenue',
      'Expenditure',
      'Net Operating Position',
      'Posted Journal Count'
    ];
    const branchRows = organizationalPerformance.branches.map(row => [
      'Branch',
      scopeLabel('branch', row.scope_id),
      row.base_currency_code,
      row.revenue,
      row.expenses,
      row.net_operating_position,
      row.posted_journal_count
    ]);
    const districtRows = organizationalPerformance.districts.map(row => [
      'District',
      scopeLabel('district', row.scope_id),
      row.base_currency_code,
      row.revenue,
      row.expenses,
      row.net_operating_position,
      row.posted_journal_count
    ]);
    triggerCsvDownload(
      `scms_branch_district_performance_${reportPeriod}_${new Date().toISOString().slice(0, 10)}.csv`,
      serializeFinanceCsv(headers, [...branchRows, ...districtRows])
    );
  };

  const post = async (journal: FinanceJournal) => {
    if (!journal.can_post || journal.status !== 'draft') return;
    setPostingId(journal.id);
    setError(null);
    setNotice(null);
    const result = await postFinanceJournalEntry(journal.id);
    if (result.error) {
      setError(result.error.message);
    } else {
      setNotice(
        result.data?.already_posted
          ? 'This journal was already posted; no duplicate posting was created.'
          : 'Journal posted successfully. Account balances now include its journal lines.'
      );
      await reload();
      window.dispatchEvent(new Event('finance_documents_updated'));
    }
    setPostingId(null);
  };

  const journalCounts = useMemo(() => {
    const journals = ledger?.journals || [];
    return {
      all: journals.length,
      can_post: journals.filter(j => j.can_post && j.status === 'draft').length,
      pending: journals.filter(
        j => j.status !== 'posted' && j.source_type === 'financial_document_pending' && j.source_document_status !== 'rejected'
      ).length,
      posted: journals.filter(j => j.status === 'posted').length,
      rejected: journals.filter(j => j.source_document_status === 'rejected').length
    };
  }, [ledger?.journals]);

  const filteredJournals = useMemo(() => {
    const journals = ledger?.journals || [];
    const query = journalSearch.trim().toLowerCase();
    return journals.filter(journal => {
      if (journalFilter === 'can_post' && !(journal.can_post && journal.status === 'draft')) return false;
      if (
        journalFilter === 'pending' &&
        !(
          journal.status !== 'posted' &&
          journal.source_type === 'financial_document_pending' &&
          journal.source_document_status !== 'rejected'
        )
      ) {
        return false;
      }
      if (journalFilter === 'posted' && journal.status !== 'posted') return false;
      if (journalFilter === 'rejected' && journal.source_document_status !== 'rejected') return false;
      if (!query) return true;
      const entryRef = `je-${journal.entry_number ?? journal.id}`.toLowerCase();
      return (
        entryRef.includes(query) ||
        journal.description.toLowerCase().includes(query) ||
        (journal.reference || '').toLowerCase().includes(query) ||
        journal.lines.some(
          line =>
            (line.account_code || '').toLowerCase().includes(query) ||
            line.account_name.toLowerCase().includes(query)
        )
      );
    });
  }, [ledger?.journals, journalFilter, journalSearch]);

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const expenseAccounts = useMemo(
    () => (report?.account_balances || []).filter(item => item.account_type === 'expense' && item.balance !== 0),
    [report?.account_balances]
  );

  return (
    <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      {/* Header & Quick Section Jump */}
      <div className="space-y-4 border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900">
              <BookOpen size={19} className="text-slate-700" />
              Journal register &amp; posted ledger balances
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Approved journals remain drafts until explicitly posted. Only posted journal lines contribute to balances and reports.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        <nav aria-label="Journal ledger sections" className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ledger-operational-balances', label: 'Cash & bank balances' },
            { id: 'ledger-consolidated-position', label: 'Financial position' },
            { id: 'official-financial-reports', label: 'Official reports' },
            { id: 'ledger-transfer-reconciliation', label: 'Transfer reconciliation' },
            { id: 'ledger-account-balances', label: 'Posted accounts' },
            { id: 'ledger-journal-entries', label: `Journal entries (${journalCounts.all})` }
          ].map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id)}
              className="min-h-[34px] whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 shrink-0 cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800">
          <AlertCircle size={17} className="mt-0.5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700" />
          <span>{notice}</span>
        </div>
      )}

      {/* 1. Operational Cash, Bank & Mobile Money Balances */}
      <div id="ledger-operational-balances" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
        <div>
          <h4 className="text-sm font-black text-slate-900">Cash, bank and mobile-money balances</h4>
          <p className="mt-1 text-xs text-slate-600">
            Current balances calculated from posted asset-account journal lines only, including inactive accounts that may retain funds. Pending, rejected and unposted entries are excluded. Amounts are shown in base currency.
          </p>
        </div>

        {operationalBalanceError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {operationalBalanceError}
          </p>
        )}

        {operationalBalances?.accounts.length ? (
          <>
            {/* Mobile cards */}
            <div className="space-y-2.5 md:hidden">
              {operationalBalances.accounts.map(account => (
                <article
                  key={`${account.financial_account_id}:${account.base_currency_code}:mobile`}
                  className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {account.account_name}
                        {!account.is_active && (
                          <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        <span className="font-mono">{account.chart_account_code}</span> · {account.chart_account_name}
                      </div>
                    </div>
                    <div className="text-right font-black tabular-nums text-slate-900 text-sm">
                      {money(account.base_currency_code, account.balance)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                    <span className="capitalize">{account.operational_account_type.replace('_', ' ')}</span>
                    <span>·</span>
                    <span>
                      {account.branch_id
                        ? scopeLabel('branch', account.branch_id)
                        : account.district_id
                          ? scopeLabel('district', account.district_id)
                          : 'Church-wide'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-[11px]">
                    <div>
                      <span className="text-slate-500">Debits:</span>{' '}
                      <strong className="tabular-nums text-slate-800">
                        {money(account.base_currency_code, account.debit_total)}
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500">Credits:</span>{' '}
                      <strong className="tabular-nums text-slate-800">
                        {money(account.base_currency_code, account.credit_total)}
                      </strong>
                    </div>
                  </div>
                  {account.mapping_is_ambiguous ? (
                    <div role="alert" className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">
                      <strong>Ambiguous mapping ({account.mapping_count})</strong>:{' '}
                      {account.mapping_warning ||
                        'Multiple operational accounts share this chart account and ownership scope.'}
                    </div>
                  ) : (
                    <div className="text-[11px] font-medium text-emerald-700">Unique mapping</div>
                  )}
                </article>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
              <table aria-label="Cash bank and mobile money balances" className="w-full min-w-[680px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3.5 py-2.5">Account</th>
                    <th className="px-3.5 py-2.5">Type</th>
                    <th className="px-3.5 py-2.5">Ownership</th>
                    <th className="px-3.5 py-2.5">Currency</th>
                    <th className="px-3.5 py-2.5 text-right">Debits</th>
                    <th className="px-3.5 py-2.5 text-right">Credits</th>
                    <th className="px-3.5 py-2.5 text-right">Balance</th>
                    <th className="px-3.5 py-2.5">Mapping integrity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {operationalBalances.accounts.map(account => (
                    <tr key={`${account.financial_account_id}:${account.base_currency_code}`} className="hover:bg-slate-50/70">
                      <td className="px-3.5 py-2.5">
                        <div className="font-semibold text-slate-900">
                          {account.account_name}
                          {!account.is_active && (
                            <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          <span className="font-mono">{account.chart_account_code}</span> · {account.chart_account_name}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 capitalize text-slate-700">
                        {account.operational_account_type.replace('_', ' ')}
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-700">
                        {account.branch_id
                          ? scopeLabel('branch', account.branch_id)
                          : account.district_id
                            ? scopeLabel('district', account.district_id)
                            : 'Church-wide'}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-700">{account.base_currency_code}</td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums text-slate-700">
                        {money(account.base_currency_code, account.debit_total)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums text-slate-700">
                        {money(account.base_currency_code, account.credit_total)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-black tabular-nums text-slate-900">
                        {money(account.base_currency_code, account.balance)}
                      </td>
                      <td className={`px-3.5 py-2.5 text-left ${account.mapping_is_ambiguous ? 'text-amber-800' : 'text-emerald-700'}`}>
                        {account.mapping_is_ambiguous ? (
                          <div role="alert">
                            <span className="font-bold">Ambiguous mapping ({account.mapping_count})</span>
                            <div className="max-w-xs whitespace-normal text-[11px]">
                              {account.mapping_warning ||
                                'Multiple operational accounts share this chart account and ownership scope. The ledger balance cannot be reliably split between them.'}
                            </div>
                          </div>
                        ) : (
                          <span className="font-medium">Unique mapping</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          !operationalBalanceError && (
            <p className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs text-slate-500">
              No active cash, bank or mobile-money accounts are configured in this scope.
            </p>
          )
        )}
      </div>

      {/* 2. Consolidated Financial Position */}
      <div id="ledger-consolidated-position" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
        <div>
          <h4 className="text-sm font-black text-slate-900">Consolidated financial position</h4>
          <p className="mt-1 text-xs text-slate-600">
            Cumulative posted balances as of the latest journal activity. Matched inter-branch due-from and due-to balances are eliminated for this report only; branch ledgers are unchanged. Accumulated surplus is included in equity.
          </p>
        </div>

        {consolidatedPosition.length ? (
          <>
            <div className="space-y-2.5 md:hidden">
              {consolidatedPosition.map(row => {
                const balanced = Math.abs(row.balance_check_difference) <= 0.01;
                return (
                  <article
                    key={`${row.base_currency_code}:mobile`}
                    className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-black text-slate-900">{row.base_currency_code}</span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                          balanced
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {balanced ? 'Balanced' : money(row.base_currency_code, row.balance_check_difference)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500">Assets</span>
                        <div className="font-bold tabular-nums text-slate-900">{money(row.base_currency_code, row.total_assets)}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Liabilities</span>
                        <div className="font-bold tabular-nums text-slate-900">{money(row.base_currency_code, row.total_liabilities)}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Total equity</span>
                        <div className="font-bold tabular-nums text-slate-900">{money(row.base_currency_code, row.total_equity)}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Net assets</span>
                        <div className="font-bold tabular-nums text-slate-900">{money(row.base_currency_code, row.net_assets)}</div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
              <table aria-label="Consolidated financial position" className="w-full min-w-[780px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3.5 py-2.5">Base currency</th>
                    <th className="px-3.5 py-2.5 text-right">Assets</th>
                    <th className="px-3.5 py-2.5 text-right">Liabilities</th>
                    <th className="px-3.5 py-2.5 text-right">Recorded equity</th>
                    <th className="px-3.5 py-2.5 text-right">Accumulated surplus</th>
                    <th className="px-3.5 py-2.5 text-right">Total equity</th>
                    <th className="px-3.5 py-2.5 text-right">Net assets</th>
                    <th className="px-3.5 py-2.5 text-right">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {consolidatedPosition.map(row => {
                    const balanced = Math.abs(row.balance_check_difference) <= 0.01;
                    return (
                      <tr key={row.base_currency_code} className="hover:bg-slate-50/70">
                        <td className="px-3.5 py-2.5 font-mono font-bold text-slate-900">{row.base_currency_code}</td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums">{money(row.base_currency_code, row.total_assets)}</td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums">{money(row.base_currency_code, row.total_liabilities)}</td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums">{money(row.base_currency_code, row.recorded_equity)}</td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums">{money(row.base_currency_code, row.accumulated_surplus)}</td>
                        <td className="px-3.5 py-2.5 text-right font-semibold tabular-nums">{money(row.base_currency_code, row.total_equity)}</td>
                        <td className="px-3.5 py-2.5 text-right font-semibold tabular-nums">{money(row.base_currency_code, row.net_assets)}</td>
                        <td className="px-3.5 py-2.5 text-right">
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                              balanced
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                            }`}
                          >
                            {balanced ? 'Balanced' : money(row.base_currency_code, row.balance_check_difference)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs text-slate-500">
            The financial position will appear when posted ledger balances and transfer reconciliation are available.
          </p>
        )}
      </div>

      {/* 3. Official Financial Reports & Transfer Reconciliation */}
      <div id="official-financial-reports" className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-sm font-black text-slate-900">Official financial reports</h4>
            <p className="mt-1 text-xs text-slate-600">
              Export posted journal, financial-position, branch/district and transfer reconciliation CSVs, or open the formatted consolidated report for print/PDF.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Report period"
              value={reportPeriod}
              onChange={event => setReportPeriod(event.target.value as FinanceReportPeriod)}
              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-slate-900"
            >
              <option value="all">All time</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
              <option value="quarter">This quarter</option>
              <option value="year">This year</option>
            </select>
            <button
              type="button"
              onClick={downloadPostedCsv}
              disabled={loading || !report?.lines.length}
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-40 shrink-0 cursor-pointer"
            >
              <Download size={13} />
              Export posted CSV
            </button>
            <button
              type="button"
              onClick={downloadTransferReconciliationCsv}
              disabled={loading || !transferOutstandingRows.length}
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-40 shrink-0 cursor-pointer"
            >
              <Download size={13} />
              Export transfer reconciliation CSV
            </button>
            <button
              type="button"
              onClick={downloadConsolidatedPositionCsv}
              disabled={loading || !consolidatedPosition.length}
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-40 shrink-0 cursor-pointer"
            >
              <Download size={13} />
              Export financial position CSV
            </button>
            <button
              type="button"
              onClick={downloadOrganizationalPerformanceCsv}
              disabled={
                loading ||
                !(organizationalPerformance?.branches.length || organizationalPerformance?.districts.length)
              }
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-40 shrink-0 cursor-pointer"
            >
              <Download size={13} />
              Export branch / district CSV
            </button>
            <button
              type="button"
              onClick={() => setShowPrintReportModal(true)}
              disabled={loading}
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-40 shrink-0 cursor-pointer"
            >
              <Printer size={14} />
              Print / PDF
            </button>
          </div>
        </div>

        {report?.currency_summaries.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {report.currency_summaries.map(summary => (
              <React.Fragment key={summary.base_currency_code}>
                <article className="rounded-lg border border-slate-200 bg-white p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {summary.base_currency_code} revenue
                  </div>
                  <div className="mt-1 text-lg font-black tabular-nums text-emerald-700">
                    {money(summary.base_currency_code, summary.revenue)}
                  </div>
                </article>
                <article className="rounded-lg border border-slate-200 bg-white p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {summary.base_currency_code} expenses
                  </div>
                  <div className="mt-1 text-lg font-black tabular-nums text-rose-700">
                    {money(summary.base_currency_code, summary.expenses)}
                  </div>
                </article>
                <article className="rounded-lg border border-slate-200 bg-white p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {summary.base_currency_code} net operating position
                  </div>
                  <div className="mt-1 text-lg font-black tabular-nums text-slate-900">
                    {money(summary.base_currency_code, summary.net_operating_position)}
                  </div>
                </article>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs text-slate-500">
            No posted transactions are available for this reporting period.
          </p>
        )}

        {expenseAccounts.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-xs font-black uppercase tracking-wide text-slate-600">
              Posted expenditure by expense account
            </h5>
            <div className="grid gap-2 sm:grid-cols-2">
              {expenseAccounts.map(item => (
                <div
                  key={`${item.account_id}:${item.base_currency_code}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs"
                >
                  <span className="font-semibold text-slate-700">
                    <span className="font-mono text-slate-500">{item.account_code}</span> · {item.account_name}
                  </span>
                  <strong className="tabular-nums text-slate-900">{money(item.base_currency_code, item.balance)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {organizationalPerformance &&
          (organizationalPerformance.branches.length > 0 || organizationalPerformance.districts.length > 0) && (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <h5 className="text-xs font-black uppercase tracking-wide text-slate-700">
                  Branch performance comparison
                </h5>
                <p className="mt-1 text-[11px] text-slate-500">
                  Actual revenue and expenditure from posted journals, separated by base currency.
                </p>
                {organizationalPerformance.branches.length ? (
                  <>
                    <div className="mt-2 space-y-2 md:hidden">
                      {organizationalPerformance.branches.map(row => (
                        <div
                          key={`${row.scope_id}:${row.base_currency_code}:mobile`}
                          className="rounded-lg border border-slate-200 p-3 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between font-bold text-slate-900">
                            <span>{scopeLabel('branch', row.scope_id)}</span>
                            <span className="font-mono">{row.base_currency_code}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Revenue: <strong className="tabular-nums text-emerald-700">{money(row.base_currency_code, row.revenue)}</strong></span>
                            <span>Expenses: <strong className="tabular-nums text-rose-700">{money(row.base_currency_code, row.expenses)}</strong></span>
                          </div>
                          <div className="flex justify-between border-t border-slate-100 pt-1.5">
                            <span className="text-slate-500">Net: <strong className="tabular-nums text-slate-900">{money(row.base_currency_code, row.net_operating_position)}</strong></span>
                            <span className="tabular-nums text-slate-500">{row.posted_journal_count} journals</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 hidden overflow-x-auto md:block">
                      <table aria-label="Branch financial performance comparison" className="w-full min-w-[620px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2">Branch</th>
                            <th className="py-2">Currency</th>
                            <th className="py-2 text-right">Revenue</th>
                            <th className="py-2 text-right">Expenditure</th>
                            <th className="py-2 text-right">Net position</th>
                            <th className="py-2 text-right">Posted journals</th>
                          </tr>
                        </thead>
                        <tbody>
                          {organizationalPerformance.branches.map(row => (
                            <tr key={`${row.scope_id}:${row.base_currency_code}`} className="border-b border-slate-100">
                              <td className="py-2 font-semibold text-slate-800">{scopeLabel('branch', row.scope_id)}</td>
                              <td className="py-2 font-mono text-slate-600">{row.base_currency_code}</td>
                              <td className="py-2 text-right tabular-nums">{money(row.base_currency_code, row.revenue)}</td>
                              <td className="py-2 text-right tabular-nums">{money(row.base_currency_code, row.expenses)}</td>
                              <td className="py-2 text-right font-black tabular-nums">{money(row.base_currency_code, row.net_operating_position)}</td>
                              <td className="py-2 text-right tabular-nums">{row.posted_journal_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No branch-level posted journals are available in this scope.</p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3">
                <h5 className="text-xs font-black uppercase tracking-wide text-slate-700">
                  District performance summary
                </h5>
                {organizationalPerformance.districts.length ? (
                  <>
                    <div className="mt-2 space-y-2 md:hidden">
                      {organizationalPerformance.districts.map(row => (
                        <div
                          key={`${row.scope_id}:${row.base_currency_code}:mobile`}
                          className="rounded-lg border border-slate-200 p-3 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between font-bold text-slate-900">
                            <span>{scopeLabel('district', row.scope_id)}</span>
                            <span className="font-mono">{row.base_currency_code}</span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Revenue: <strong className="tabular-nums text-emerald-700">{money(row.base_currency_code, row.revenue)}</strong></span>
                            <span>Expenses: <strong className="tabular-nums text-rose-700">{money(row.base_currency_code, row.expenses)}</strong></span>
                          </div>
                          <div className="border-t border-slate-100 pt-1.5 text-slate-700">
                            Net position: <strong className="tabular-nums text-slate-900">{money(row.base_currency_code, row.net_operating_position)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 hidden overflow-x-auto md:block">
                      <table aria-label="District financial performance summary" className="w-full min-w-[560px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2">District</th>
                            <th className="py-2">Currency</th>
                            <th className="py-2 text-right">Revenue</th>
                            <th className="py-2 text-right">Expenditure</th>
                            <th className="py-2 text-right">Net position</th>
                          </tr>
                        </thead>
                        <tbody>
                          {organizationalPerformance.districts.map(row => (
                            <tr key={`${row.scope_id}:${row.base_currency_code}`} className="border-b border-slate-100">
                              <td className="py-2 font-semibold text-slate-800">{scopeLabel('district', row.scope_id)}</td>
                              <td className="py-2 font-mono text-slate-600">{row.base_currency_code}</td>
                              <td className="py-2 text-right tabular-nums">{money(row.base_currency_code, row.revenue)}</td>
                              <td className="py-2 text-right tabular-nums">{money(row.base_currency_code, row.expenses)}</td>
                              <td className="py-2 text-right font-black tabular-nums">{money(row.base_currency_code, row.net_operating_position)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No district-level posted journals are available in this scope.</p>
                )}
              </div>
            </div>
          )}

        {/* Internal Transfer Reconciliation */}
        <div id="ledger-transfer-reconciliation" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={17} className="text-slate-700" />
            <h5 className="text-sm font-black text-slate-900">Internal transfer reconciliation</h5>
          </div>
          <p className="text-xs text-slate-500">
            Transfer journals are reconciled using their posted branch clearing lines. Consolidated eliminations are reporting-only and never modify either branch ledger.
          </p>
          {reconciliationError && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {reconciliationError}
            </p>
          )}
          {periodClearingSummary.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {periodClearingSummary.map(summary => (
                <React.Fragment key={summary.base_currency_code}>
                  <article className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-[11px] font-bold uppercase text-slate-500">
                      {summary.base_currency_code} Due from branches
                    </p>
                    <p className="mt-1 text-sm font-black tabular-nums text-slate-900">
                      {money(summary.base_currency_code, summary.due_from_balance)}
                    </p>
                  </article>
                  <article className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-[11px] font-bold uppercase text-slate-500">
                      {summary.base_currency_code} Due to branches
                    </p>
                    <p className="mt-1 text-sm font-black tabular-nums text-slate-900">
                      {money(summary.base_currency_code, summary.due_to_balance)}
                    </p>
                  </article>
                  <article className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                    <p className="text-[11px] font-bold uppercase text-emerald-700">
                      {summary.base_currency_code} Eliminated
                    </p>
                    <p className="mt-1 text-sm font-black tabular-nums text-emerald-800">
                      {money(summary.base_currency_code, summary.elimination_amount)}
                    </p>
                  </article>
                  <article className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                    <p className="text-[11px] font-bold uppercase text-amber-800">
                      {summary.base_currency_code} Remaining due-from / due-to
                    </p>
                    <p className="mt-1 text-sm font-black tabular-nums text-amber-900">
                      {money(summary.base_currency_code, summary.remaining_due_from)} /{' '}
                      {money(summary.base_currency_code, summary.remaining_due_to)}
                    </p>
                  </article>
                </React.Fragment>
              ))}
            </div>
          ) : !reconciliationError ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              No posted inter-branch clearing balances are available in this scope.
            </p>
          ) : null}

          {consolidatedBalances.some(item => item.elimination_amount > 0) && (
            <div>
              <h6 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">
                Consolidated clearing-account balances after elimination
              </h6>
              <div className="overflow-x-auto">
                <table aria-label="Consolidated clearing-account balances after elimination" className="w-full min-w-[540px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2">Account</th>
                      <th className="py-2 text-right">Pre-elimination</th>
                      <th className="py-2 text-right">Eliminated</th>
                      <th className="py-2 text-right">Consolidated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidatedBalances
                      .filter(item => item.elimination_amount > 0)
                      .map(item => (
                        <tr key={`${item.account_id}:${item.base_currency_code}`} className="border-b border-slate-100">
                          <td className="py-2">
                            <span className="font-mono text-slate-500">{item.account_code}</span> · {item.account_name}
                          </td>
                          <td className="py-2 text-right tabular-nums">{money(item.base_currency_code, item.balance)}</td>
                          <td className="py-2 text-right tabular-nums">{money(item.base_currency_code, item.elimination_amount)}</td>
                          <td className="py-2 text-right font-black tabular-nums">{money(item.base_currency_code, item.consolidated_balance)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {periodTransfers.length ? (
            <div>
              <h6 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">
                Transfer-to-journal trace
              </h6>
              <div className="space-y-2 md:hidden">
                {periodTransfers.map(item => {
                  const rowSummary = transferOutstandingRows.find(row => row.transfer_id === item.transfer_id);
                  return (
                    <article key={`${item.transfer_id}:mobile`} className="rounded-lg border border-slate-200 p-3 text-xs space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-slate-900">TR-{item.transfer_number}</span>
                          <span className="ml-2 text-slate-500">{item.transaction_date}</span>
                        </div>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${reconciliationBadgeClass(
                            item.reconciliation_status
                          )}`}
                        >
                          {item.reconciliation_status.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <div className="font-medium text-slate-800">
                        {item.source_branch_name} → {item.destination_branch_name}
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Amount: <strong className="tabular-nums text-slate-900">{money(item.currency_code, Number(item.amount))}</strong></span>
                        <span>Elimination: <strong className="tabular-nums">{money(item.base_currency_code, Number(item.elimination_base_amount))}</strong></span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Source: JE-{item.source_entry_number ?? '—'} ({item.source_journal_status || '—'}) · Dest:{' '}
                        {item.destination_journal_entry_id
                          ? `JE-${item.destination_entry_number ?? '—'} (${item.destination_journal_status || '—'})`
                          : 'Same-branch journal'}
                      </div>
                      {rowSummary && (
                        <div className="flex justify-between border-t border-slate-100 pt-1 text-[11px] text-slate-500">
                          <span>Open due from: <strong className="tabular-nums">{money(item.base_currency_code, rowSummary.outstanding_due_from)}</strong></span>
                          <span>Open due to: <strong className="tabular-nums">{money(item.base_currency_code, rowSummary.outstanding_due_to)}</strong></span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table aria-label="Internal transfer reconciliation and journal trace" className="w-full min-w-[1080px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2">Transfer</th>
                      <th className="py-2">Branch movement</th>
                      <th className="py-2">Amount</th>
                      <th className="py-2">Source journal</th>
                      <th className="py-2">Destination journal</th>
                      <th className="py-2">Reconciliation</th>
                      <th className="py-2 text-right">Due from</th>
                      <th className="py-2 text-right">Due to</th>
                      <th className="py-2 text-right">Open due from</th>
                      <th className="py-2 text-right">Open due to</th>
                      <th className="py-2 text-right">Elimination</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodTransfers.map(item => {
                      const rowSummary = transferOutstandingRows.find(row => row.transfer_id === item.transfer_id);
                      return (
                        <tr key={item.transfer_id} className="border-b border-slate-100">
                          <td className="py-2 font-mono font-bold text-slate-900">
                            TR-{item.transfer_number}
                            <div className="font-sans font-normal text-slate-500">{item.transaction_date}</div>
                          </td>
                          <td className="py-2 text-slate-700">
                            {item.source_branch_name} → {item.destination_branch_name}
                          </td>
                          <td className="py-2 tabular-nums">{money(item.currency_code, Number(item.amount))}</td>
                          <td className="py-2">
                            JE-{item.source_entry_number ?? '—'} · {item.source_journal_status || '—'}
                          </td>
                          <td className="py-2">
                            {item.destination_journal_entry_id
                              ? `JE-${item.destination_entry_number ?? '—'} · ${item.destination_journal_status || '—'}`
                              : 'Same-branch journal'}
                          </td>
                          <td className="py-2">
                            <span
                              className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${reconciliationBadgeClass(
                                item.reconciliation_status
                              )}`}
                            >
                              {item.reconciliation_status.replaceAll('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {money(item.base_currency_code, rowSummary?.due_from_balance || 0)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {money(item.base_currency_code, rowSummary?.due_to_balance || 0)}
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums">
                            {money(item.base_currency_code, rowSummary?.outstanding_due_from || 0)}
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums">
                            {money(item.base_currency_code, rowSummary?.outstanding_due_to || 0)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {money(item.base_currency_code, Number(item.elimination_base_amount))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 4. Posted Account Balances */}
      <div id="ledger-account-balances" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-black text-slate-900">Posted account balances</h4>
          {ledger?.account_balances.length ? (
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {ledger.account_balances.length} active ledger accounts
            </span>
          ) : null}
        </div>

        {loading ? (
          <p className="py-4 text-sm text-slate-500">Loading posted balances…</p>
        ) : !ledger?.account_balances.length ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No posted journal lines exist in this scope. Approved and pending drafts are excluded.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ledger.account_balances.map(balance => {
              const creditNormal = balance.normal_balance === 'credit';
              const value = creditNormal
                ? balance.credit_total - balance.debit_total
                : balance.debit_total - balance.credit_total;
              return (
                <article
                  key={`${balance.account_id}:${balance.base_currency_code}`}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5"
                >
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <span className="font-mono">{balance.account_code}</span> · {balance.account_type}
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{balance.account_name}</div>
                  <div className="mt-2 text-lg font-black tabular-nums text-slate-900">
                    {money(balance.base_currency_code, value)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                    Posted debits {money(balance.base_currency_code, balance.debit_total)} · credits{' '}
                    {money(balance.base_currency_code, balance.credit_total)}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Journal Entries Register */}
      <div id="ledger-journal-entries" className="space-y-3 border-t border-slate-200 pt-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-sm font-black text-slate-900">Journal entries</h4>
            <p className="text-xs text-slate-500">
              Review double-entry lines and explicitly post approved draft journals into posted balances.
            </p>
          </div>
          {!loading && (ledger?.journals.length || 0) > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: `All (${journalCounts.all})` },
                    { id: 'can_post', label: `Ready to post (${journalCounts.can_post})` },
                    { id: 'pending', label: `Pending (${journalCounts.pending})` },
                    { id: 'posted', label: `Posted (${journalCounts.posted})` },
                    { id: 'rejected', label: `Rejected (${journalCounts.rejected})` }
                  ] as Array<{ id: JournalStatusFilter; label: string }>
                ).map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setJournalFilter(item.id)}
                    className={`min-h-[34px] whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold transition-colors shrink-0 cursor-pointer ${
                      journalFilter === item.id
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="relative min-w-[200px]">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search journal entries"
                  value={journalSearch}
                  onChange={e => setJournalSearch(e.target.value)}
                  placeholder="Search JE-#, account, description…"
                  className="min-h-[36px] w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-slate-900"
                />
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <p className="py-4 text-sm text-slate-500">Loading journal register…</p>
        ) : !ledger?.journals.length ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No journal entries are available in this scope.
          </p>
        ) : filteredJournals.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center space-y-2">
            <p className="text-sm font-medium text-slate-600">No journal entries match the selected filters.</p>
            <button
              type="button"
              onClick={() => {
                setJournalFilter('all');
                setJournalSearch('');
              }}
              className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJournals.map(journal => (
              <article key={journal.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black text-slate-600">
                        JE-{journal.entry_number ?? journal.id}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${journalBadgeClass(
                          journal
                        )}`}
                      >
                        {journalLabel(journal)}
                      </span>
                    </div>
                    <h5 className="mt-1.5 font-bold text-slate-900">{journal.description}</h5>
                    <p className="text-xs text-slate-500">
                      <span className="tabular-nums">{journal.entry_date}</span> ·{' '}
                      <span className="font-mono">{journal.currency_code}</span> · {journal.reference || 'No reference'}
                    </p>
                  </div>
                  {journal.can_post && (
                    <button
                      type="button"
                      disabled={postingId === journal.id}
                      onClick={() => void post(journal)}
                      className="inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 shrink-0 cursor-pointer"
                    >
                      <UploadCloud size={14} />
                      {postingId === journal.id ? 'Posting…' : 'Post journal'}
                    </button>
                  )}
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3">Account</th>
                        <th className="py-2 px-2 text-right">Debit</th>
                        <th className="py-2 pl-2 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journal.lines.map(line => (
                        <tr key={line.id} className="border-b border-slate-100">
                          <td className="py-2 pr-3 text-slate-800">
                            <span className="font-mono text-slate-500">{line.account_code}</span> · {line.account_name}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                            {money(journal.currency_code, line.debit_amount)}
                          </td>
                          <td className="py-2 pl-2 text-right tabular-nums text-slate-700">
                            {money(journal.currency_code, line.credit_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-black text-slate-900">
                        <td className="py-2 pr-3">Totals</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {money(journal.currency_code, journal.total_debits)}
                        </td>
                        <td className="py-2 pl-2 text-right tabular-nums">
                          {money(journal.currency_code, journal.total_credits)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {journal.status === 'posted' && journal.posted_at && (
                  <p className="mt-2 text-[11px] font-medium text-emerald-700">
                    Posted {new Date(journal.posted_at).toLocaleString()}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Posting is re-authorized by the database RPC. The posting routine validates journal balance, active accounts, organizational scope consistency, exchange rate and open financial period/year. Pending or rejected financial-document journals cannot be posted.
      </p>

      {/* In-app Printable Consolidated Report Modal (iFrame-safe alternative to window.open) */}
      {showPrintReportModal && report && (
        <div
          className="finance-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Consolidated posted finance report preview"
        >
          <div className="finance-detail-panel">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 print:hidden">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Official report preview</p>
                <h3 className="text-lg font-black text-slate-900">Consolidated Posted Journal Financial Report</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex min-h-[38px] items-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
                >
                  <Printer size={14} /> Print / Save PDF
                </button>
                <button
                  type="button"
                  aria-label="Close report preview"
                  onClick={() => setShowPrintReportModal(false)}
                  className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="finance-print-sheet space-y-6 pt-4 text-xs text-slate-800">
              <div className="border-b-2 border-slate-900 pb-3">
                <h2 className="text-xl font-black text-slate-900">SCMS — Consolidated Posted Journal Financial Report</h2>
                <p className="mt-1 text-slate-600">
                  Period: <strong className="capitalize">{reportPeriod}</strong> · Generated:{' '}
                  {new Date().toLocaleString()}
                </p>
                <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-emerald-900">
                  This report includes posted journal entries only. Draft, pending approval, approved-but-unposted and rejected entries are excluded.
                </p>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-black text-slate-900">Operating summary by base currency</h4>
                <table className="w-full border-collapse border border-slate-200">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-200 p-2 text-left">Currency</th>
                      <th className="border border-slate-200 p-2 text-right">Revenue</th>
                      <th className="border border-slate-200 p-2 text-right">Expenses</th>
                      <th className="border border-slate-200 p-2 text-right">Net operating position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.currency_summaries.length ? (
                      report.currency_summaries.map(item => (
                        <tr key={item.base_currency_code}>
                          <td className="border border-slate-200 p-2 font-mono">{item.base_currency_code}</td>
                          <td className="border border-slate-200 p-2 text-right tabular-nums">{item.revenue.toFixed(2)}</td>
                          <td className="border border-slate-200 p-2 text-right tabular-nums">{item.expenses.toFixed(2)}</td>
                          <td className="border border-slate-200 p-2 text-right font-bold tabular-nums">{item.net_operating_position.toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="border border-slate-200 p-2 text-slate-500">
                          No posted transactions in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-black text-slate-900">Consolidated financial position — cumulative posted balances</h4>
                <table className="w-full border-collapse border border-slate-200">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-200 p-2 text-left">Currency</th>
                      <th className="border border-slate-200 p-2 text-right">Assets</th>
                      <th className="border border-slate-200 p-2 text-right">Liabilities</th>
                      <th className="border border-slate-200 p-2 text-right">Total equity</th>
                      <th className="border border-slate-200 p-2 text-right">Net assets</th>
                      <th className="border border-slate-200 p-2 text-right">Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidatedPosition.length ? (
                      consolidatedPosition.map(item => (
                        <tr key={item.base_currency_code}>
                          <td className="border border-slate-200 p-2 font-mono">{item.base_currency_code}</td>
                          <td className="border border-slate-200 p-2 text-right tabular-nums">{item.total_assets.toFixed(2)}</td>
                          <td className="border border-slate-200 p-2 text-right tabular-nums">{item.total_liabilities.toFixed(2)}</td>
                          <td className="border border-slate-200 p-2 text-right tabular-nums">{item.total_equity.toFixed(2)}</td>
                          <td className="border border-slate-200 p-2 text-right tabular-nums">{item.net_assets.toFixed(2)}</td>
                          <td className="border border-slate-200 p-2 text-right tabular-nums">{item.balance_check_difference.toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="border border-slate-200 p-2 text-slate-500">
                          No consolidated financial position is available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-black text-slate-900">Posted journal lines ({report.lines.length})</h4>
                <table className="w-full border-collapse border border-slate-200">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-200 p-2 text-left">Date</th>
                      <th className="border border-slate-200 p-2 text-left">Entry</th>
                      <th className="border border-slate-200 p-2 text-left">Description</th>
                      <th className="border border-slate-200 p-2 text-left">Account</th>
                      <th className="border border-slate-200 p-2 text-right">Debit</th>
                      <th className="border border-slate-200 p-2 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.length ? (
                      report.lines.map((line, idx) => (
                        <tr key={`${line.journal_id}-${line.account_id}-${idx}`}>
                          <td className="border border-slate-200 p-2 tabular-nums">{line.entry_date}</td>
                          <td className="border border-slate-200 p-2 font-mono">{line.entry_number ?? line.journal_id}</td>
                          <td className="border border-slate-200 p-2">{line.description}</td>
                          <td className="border border-slate-200 p-2">
                            {line.account_code} — {line.account_name}
                          </td>
                          <td className="border border-slate-200 p-2 text-right tabular-nums">{line.base_debit_amount.toFixed(2)}</td>
                          <td className="border border-slate-200 p-2 text-right tabular-nums">{line.base_credit_amount.toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="border border-slate-200 p-2 text-slate-500">
                          No posted journal lines.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

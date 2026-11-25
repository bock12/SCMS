import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeftRight, BookOpen, CheckCircle2, RefreshCw, UploadCloud } from 'lucide-react';
import { type FinanceOwnershipScope, type FinanceScopeOption } from './financeConfigurationService';
import { getFinanceJournalLedger, getScopedFinanceJournalLedger, postFinanceJournalEntry, type FinanceJournal } from './financeJournalService';
import { applyFinanceTransferEliminations, buildFinanceOrganizationalPerformanceReport, buildFinanceTransferClearingSummary, buildPostedFinanceReport, isWithinFinanceReportPeriod, type FinanceReportPeriod } from './financeReportService';
import { getFinanceTransferReconciliation, type FinanceTransferReconciliation } from './financeTransferReconciliationService';
import { getFinanceOperationalBalances, type FinanceOperationalBalanceReport } from './financeOperationalBalanceService';

interface Props {
  branchId: string | null;
  scope?: FinanceOwnershipScope;
  scopeOptions?: FinanceScopeOption[];
}

const money = (currency: string, value: number) =>
  currency + ' ' + Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const journalLabel = (journal: FinanceJournal) => {
  if (journal.status === 'posted') return 'Posted';
  if (journal.source_type === 'financial_document_pending') {
    return journal.source_document_status === 'rejected' ? 'Rejected — not posted' : 'Awaiting approval — not posted';
  }
  if (journal.source_type === 'financial_document' && journal.source_document_status === 'approved') {
    return 'Approved — awaiting posting';
  }
  return 'Draft — not posted';
};

export const FinanceJournalWorkspace: React.FC<Props> = ({ branchId, scope, scopeOptions = [] }) => {
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
  const report = useMemo(() => ledger ? buildPostedFinanceReport(ledger, reportPeriod) : null, [ledger, reportPeriod]);
  const organizationalPerformance = useMemo(() => ledger ? buildFinanceOrganizationalPerformanceReport(ledger, reportPeriod) : null, [ledger, reportPeriod]);
  const scopeLabel = (type: 'branch' | 'district', id: string) => scopeOptions.find(option => option.scope_type === type && option.scope_id === id)?.scope_name || (type === 'branch' ? 'Branch ' : 'District ') + id.slice(0, 8);
  const periodTransfers = useMemo(() => (transferReconciliation?.transfers || [])
    .filter(item => isWithinFinanceReportPeriod(item.transaction_date, reportPeriod)),
  [transferReconciliation, reportPeriod]);
  const periodClearingSummary = useMemo(() => buildFinanceTransferClearingSummary(
    transferReconciliation?.transfers || [], reportPeriod
  ), [transferReconciliation, reportPeriod]);
  const consolidatedBalances = useMemo(() => report && transferReconciliation
    ? applyFinanceTransferEliminations(report.account_balances, transferReconciliation.transfers, reportPeriod)
    : [], [report, transferReconciliation, reportPeriod]);

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
    const handleDocumentsUpdated = () => { void reload(); };
    window.addEventListener('finance_documents_updated', handleDocumentsUpdated);
    window.addEventListener('finance_transfers_updated', handleDocumentsUpdated);
    return () => {
      window.removeEventListener('finance_documents_updated', handleDocumentsUpdated);
      window.removeEventListener('finance_transfers_updated', handleDocumentsUpdated);
    }
  }, [reload]);

  const downloadPostedCsv = () => {
    if (!report) return;
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const headers = ['Journal ID', 'Entry Number', 'Date', 'Description', 'Reference', 'Transaction Currency', 'Base Currency', 'Account Code', 'Account Name', 'Account Type', 'Debit', 'Credit', 'Base Debit', 'Base Credit'];
    const rows = report.lines.map(line => [
      line.journal_id, line.entry_number ?? '', line.entry_date, line.description, line.reference ?? '',
      line.currency_code, line.base_currency_code, line.account_code ?? '', line.account_name,
      line.account_type ?? '', line.debit_amount, line.credit_amount, line.base_debit_amount, line.base_credit_amount
    ].map(quote).join(','));
    const csv = [headers.map(quote).join(','), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `scms_posted_finance_report_${reportPeriod}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const printPostedReport = () => {
    if (!report) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Allow pop-ups to print the posted-journal report.');
      return;
    }
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char] || char));
    const summaries = report.currency_summaries.map(item => `
      <tr><td>${escapeHtml(item.base_currency_code)}</td><td>${item.revenue.toFixed(2)}</td><td>${item.expenses.toFixed(2)}</td><td>${item.net_operating_position.toFixed(2)}</td></tr>
    `).join('');
    const accounts = report.account_balances.map(item => `
      <tr><td>${escapeHtml(item.account_code)}</td><td>${escapeHtml(item.account_name)}</td><td>${escapeHtml(item.account_type)}</td><td>${escapeHtml(item.base_currency_code)}</td><td>${item.debit_total.toFixed(2)}</td><td>${item.credit_total.toFixed(2)}</td><td>${item.balance.toFixed(2)}</td></tr>
    `).join('');
    const clearingSummaries = periodClearingSummary.map(item => `
      <tr><td>${escapeHtml(item.base_currency_code)}</td><td>${item.due_from_balance.toFixed(2)}</td><td>${item.due_to_balance.toFixed(2)}</td><td>${item.elimination_amount.toFixed(2)}</td><td>${item.remaining_due_from.toFixed(2)}</td><td>${item.remaining_due_to.toFixed(2)}</td></tr>
    `).join('');
    const clearingAccounts = consolidatedBalances.filter(item => item.elimination_amount > 0).map(item => `
      <tr><td>${escapeHtml(item.account_code)}</td><td>${escapeHtml(item.account_name)}</td><td>${escapeHtml(item.base_currency_code)}</td><td>${item.balance.toFixed(2)}</td><td>${item.elimination_amount.toFixed(2)}</td><td>${item.consolidated_balance.toFixed(2)}</td></tr>
    `).join('');
    const transferRows = periodTransfers.map(item => `
      <tr><td>TR-${escapeHtml(item.transfer_number)}</td><td>${escapeHtml(item.transaction_date)}</td><td>${escapeHtml(item.source_branch_name)} → ${escapeHtml(item.destination_branch_name)}</td><td>${escapeHtml(item.currency_code)} ${Number(item.amount).toFixed(2)}</td><td>JE-${escapeHtml(item.source_entry_number ?? '—')} / ${escapeHtml(item.destination_entry_number ?? '—')}</td><td>${escapeHtml(item.reconciliation_status)}</td><td>${Number(item.elimination_base_amount).toFixed(2)} ${escapeHtml(item.base_currency_code)}</td></tr>
    `).join('');
    const lines = report.lines.map(line => `
      <tr><td>${escapeHtml(line.entry_date)}</td><td>${escapeHtml(line.entry_number ?? line.journal_id)}</td><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.account_code)} — ${escapeHtml(line.account_name)}</td><td>${escapeHtml(line.base_currency_code)}</td><td class="number">${line.base_debit_amount.toFixed(2)}</td><td class="number">${line.base_credit_amount.toFixed(2)}</td></tr>
    `).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>SCMS Consolidated Posted Finance Report</title>
      <style>body{font:12px system-ui,sans-serif;color:#0f172a;padding:28px}h1{font-size:22px}h2{font-size:15px;margin-top:28px}p{color:#475569}.note{padding:10px;background:#ecfdf5;border:1px solid #a7f3d0}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px;border:1px solid #e2e8f0;text-align:left}th{background:#f1f5f9}.number{text-align:right}@media print{body{padding:0}}</style>
      </head><body><h1>SCMS — Consolidated Posted Journal Financial Report</h1>
      <p>Period: ${escapeHtml(reportPeriod)} · Generated: ${escapeHtml(new Date().toLocaleString())}</p>
      <p class="note">This report includes posted journal entries only. Draft, pending approval, approved-but-unposted and rejected entries are excluded.</p>
      <h2>Operating summary by base currency</h2><table><thead><tr><th>Currency</th><th>Revenue</th><th>Expenses</th><th>Net operating position</th></tr></thead><tbody>${summaries || '<tr><td colspan="4">No posted transactions in this period.</td></tr>'}</tbody></table>
      <h2>Posted account balances before consolidation eliminations</h2><table><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Currency</th><th>Debits</th><th>Credits</th><th>Balance</th></tr></thead><tbody>${accounts || '<tr><td colspan="7">No posted account balances.</td></tr>'}</tbody></table>
      <h2>Inter-branch clearing reconciliation and eliminations</h2><table><thead><tr><th>Base currency</th><th>Due from</th><th>Due to</th><th>Eliminated</th><th>Remaining due from</th><th>Remaining due to</th></tr></thead><tbody>${clearingSummaries || '<tr><td colspan="6">No posted inter-branch clearing balances in this period.</td></tr>'}</tbody></table>
      <h3>Consolidated clearing-account balances</h3><table><thead><tr><th>Code</th><th>Account</th><th>Currency</th><th>Before elimination</th><th>Eliminated</th><th>After elimination</th></tr></thead><tbody>${clearingAccounts || '<tr><td colspan="6">No clearing balances require elimination.</td></tr>'}</tbody></table>
      <h3>Transfer-to-journal trace</h3><table><thead><tr><th>Transfer</th><th>Date</th><th>Branch movement</th><th>Amount</th><th>Journal entries</th><th>Reconciliation</th><th>Elimination</th></tr></thead><tbody>${transferRows || '<tr><td colspan="7">No internal transfers in this period.</td></tr>'}</tbody></table>
      <h2>Posted journal lines (${report.lines.length})</h2><table><thead><tr><th>Date</th><th>Entry</th><th>Description</th><th>Account</th><th>Currency</th><th>Debit</th><th>Credit</th></tr></thead><tbody>${lines || '<tr><td colspan="7">No posted journal lines.</td></tr>'}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
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
      setNotice(result.data?.already_posted
        ? 'This journal was already posted; no duplicate posting was created.'
        : 'Journal posted successfully. Account balances now include its journal lines.');
      await reload();
      window.dispatchEvent(new Event('finance_documents_updated'));
    }
    setPostingId(null);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-900"><BookOpen size={19} /> Journal register & posted ledger balances</h3>
          <p className="mt-1 text-sm text-slate-500">Approved journals remain drafts until explicitly posted. Only posted journal lines contribute to the account balances below.</p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={17} />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} />{notice}</div>}

      <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
        <div>
          <h4 className="text-sm font-black text-slate-900">Cash, bank and mobile-money balances</h4>
          <p className="mt-1 text-xs text-slate-600">Current balances calculated from posted asset-account journal lines only, including inactive accounts that may retain funds. Pending, rejected and unposted entries are excluded. Amounts are shown in base currency.</p>
        </div>
        {operationalBalanceError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{operationalBalanceError}</p>}
        {operationalBalances?.accounts.length ? <div className="overflow-x-auto">
          <table aria-label="Cash bank and mobile money balances" className="w-full min-w-[620px] text-left text-xs">
            <thead><tr className="border-b border-sky-200 text-slate-500"><th className="py-2">Account</th><th className="py-2">Type</th><th className="py-2">Ownership</th><th className="py-2">Base currency</th><th className="py-2 text-right">Debits</th><th className="py-2 text-right">Credits</th><th className="py-2 text-right">Balance</th></tr></thead>
            <tbody>{operationalBalances.accounts.map(account => <tr key={account.financial_account_id + account.base_currency_code} className="border-b border-sky-100">
              <td className="py-2"><div className="font-semibold text-slate-800">{account.account_name}{!account.is_active && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">Inactive</span>}</div><div className="text-[10px] text-slate-500">{account.chart_account_code} · {account.chart_account_name}</div></td>
              <td className="py-2 capitalize">{account.operational_account_type.replace("_", " ")}</td>
              <td className="py-2">{account.branch_id ? scopeLabel("branch", account.branch_id) : account.district_id ? scopeLabel("district", account.district_id) : "Church-wide"}</td>
              <td className="py-2">{account.base_currency_code}</td>
              <td className="py-2 text-right tabular-nums">{money(account.base_currency_code, account.debit_total)}</td>
              <td className="py-2 text-right tabular-nums">{money(account.base_currency_code, account.credit_total)}</td>
              <td className="py-2 text-right font-black tabular-nums">{money(account.base_currency_code, account.balance)}</td>
            </tr>)}</tbody>
          </table>
        </div> : !operationalBalanceError && <p className="rounded-lg bg-white p-3 text-xs text-slate-500">No active cash, bank or mobile-money accounts are configured in this scope.</p>}
      </div>
      <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-slate-900">Official financial reports</h4>
            <p className="mt-1 text-xs text-slate-600">CSV and printable reports are generated from posted journal lines only. Approved budgets and unposted transactions are not reported as actual income or expenditure.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Report period" value={reportPeriod} onChange={event => setReportPeriod(event.target.value as FinanceReportPeriod)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold">
              <option value="all">All time</option><option value="week">Last 7 days</option><option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option>
            </select>
            <button type="button" onClick={downloadPostedCsv} disabled={loading || !report?.lines.length} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Export posted CSV</button>
            <button type="button" onClick={printPostedReport} disabled={loading} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Print / PDF</button>
          </div>
        </div>
        {report?.currency_summaries.length ? <div className="grid gap-3 sm:grid-cols-3">
          {report.currency_summaries.map(summary => <React.Fragment key={summary.base_currency_code}>
            <article className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[10px] font-bold uppercase text-slate-500">{summary.base_currency_code} revenue</div><div className="mt-1 text-lg font-black">{money(summary.base_currency_code, summary.revenue)}</div></article>
            <article className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[10px] font-bold uppercase text-slate-500">{summary.base_currency_code} expenses</div><div className="mt-1 text-lg font-black">{money(summary.base_currency_code, summary.expenses)}</div></article>
            <article className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[10px] font-bold uppercase text-slate-500">{summary.base_currency_code} net operating position</div><div className="mt-1 text-lg font-black">{money(summary.base_currency_code, summary.net_operating_position)}</div></article>
          </React.Fragment>)}
        </div> : <p className="rounded-lg bg-white p-3 text-xs text-slate-500">No posted transactions are available for this reporting period.</p>}
        {report?.account_balances.some(item => item.account_type === 'expense') && <div>
          <h5 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">Posted expenditure by expense account</h5>
          <div className="space-y-2">{report.account_balances.filter(item => item.account_type === 'expense' && item.balance !== 0).map(item => <div key={item.account_id + item.base_currency_code} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs"><span className="font-semibold text-slate-700">{item.account_code} · {item.account_name}</span><strong className="tabular-nums">{money(item.base_currency_code, item.balance)}</strong></div>)}</div>
        </div>}

        {organizationalPerformance && (organizationalPerformance.branches.length > 0 || organizationalPerformance.districts.length > 0) && <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3">
          <div>
            <h5 className="text-xs font-black uppercase tracking-wide text-slate-700">Branch performance comparison</h5>
            <p className="mt-1 text-[11px] text-slate-500">Actual revenue and expenditure from posted journals, separated by base currency.</p>
            {organizationalPerformance.branches.length ? <div className="mt-2 overflow-x-auto">
              <table aria-label="Branch financial performance comparison" className="w-full min-w-[620px] text-left text-xs">
                <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Branch</th><th className="py-2">Currency</th><th className="py-2 text-right">Revenue</th><th className="py-2 text-right">Expenditure</th><th className="py-2 text-right">Net position</th><th className="py-2 text-right">Posted journals</th></tr></thead>
                <tbody>{organizationalPerformance.branches.map(row => <tr key={row.scope_id + row.base_currency_code} className="border-b border-slate-100">
                  <td className="py-2 font-semibold">{scopeLabel('branch', row.scope_id)}</td><td className="py-2">{row.base_currency_code}</td>
                  <td className="py-2 text-right">{money(row.base_currency_code, row.revenue)}</td><td className="py-2 text-right">{money(row.base_currency_code, row.expenses)}</td>
                  <td className="py-2 text-right font-black">{money(row.base_currency_code, row.net_operating_position)}</td><td className="py-2 text-right">{row.posted_journal_count}</td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="mt-2 text-xs text-slate-500">No branch-level posted journals are available in this scope.</p>}
          </div>
          <div>
            <h5 className="text-xs font-black uppercase tracking-wide text-slate-700">District performance summary</h5>
            {organizationalPerformance.districts.length ? <div className="mt-2 overflow-x-auto">
              <table aria-label="District financial performance summary" className="w-full min-w-[560px] text-left text-xs">
                <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">District</th><th className="py-2">Currency</th><th className="py-2 text-right">Revenue</th><th className="py-2 text-right">Expenditure</th><th className="py-2 text-right">Net position</th></tr></thead>
                <tbody>{organizationalPerformance.districts.map(row => <tr key={row.scope_id + row.base_currency_code} className="border-b border-slate-100">
                  <td className="py-2 font-semibold">{scopeLabel('district', row.scope_id)}</td><td className="py-2">{row.base_currency_code}</td>
                  <td className="py-2 text-right">{money(row.base_currency_code, row.revenue)}</td><td className="py-2 text-right">{money(row.base_currency_code, row.expenses)}</td>
                  <td className="py-2 text-right font-black">{money(row.base_currency_code, row.net_operating_position)}</td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="mt-2 text-xs text-slate-500">No district-level posted journals are available in this scope.</p>}
          </div>
        </div>}
        <div className="rounded-xl border border-indigo-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={17} className="text-indigo-600" />
            <h5 className="text-sm font-black text-slate-900">Internal transfer reconciliation</h5>
          </div>
          <p className="text-xs text-slate-500">Transfer journals are reconciled using their posted branch clearing lines. Consolidated eliminations are reporting-only and never modify either branch ledger.</p>
          {reconciliationError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{reconciliationError}</p>}
          {periodClearingSummary.length ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {periodClearingSummary.map(summary => <React.Fragment key={summary.base_currency_code}>
                <article className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">{summary.base_currency_code} Due from branches</p><p className="mt-1 text-sm font-black">{money(summary.base_currency_code, summary.due_from_balance)}</p></article>
                <article className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">{summary.base_currency_code} Due to branches</p><p className="mt-1 text-sm font-black">{money(summary.base_currency_code, summary.due_to_balance)}</p></article>
                <article className="rounded-lg bg-emerald-50 p-3"><p className="text-[10px] font-bold uppercase text-emerald-700">{summary.base_currency_code} Eliminated</p><p className="mt-1 text-sm font-black text-emerald-800">{money(summary.base_currency_code, summary.elimination_amount)}</p></article>
                <article className="rounded-lg bg-amber-50 p-3"><p className="text-[10px] font-bold uppercase text-amber-700">{summary.base_currency_code} Remaining due-from / due-to</p><p className="mt-1 text-sm font-black text-amber-800">{money(summary.base_currency_code, summary.remaining_due_from)} / {money(summary.base_currency_code, summary.remaining_due_to)}</p></article>
              </React.Fragment>)}
            </div>
          ) : !reconciliationError ? <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">No posted inter-branch clearing balances are available in this scope.</p> : null}
          {consolidatedBalances.some(item => item.elimination_amount > 0) && (
            <div>
              <h6 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">Consolidated clearing-account balances after elimination</h6>
              <div className="overflow-x-auto">
                <table aria-label="Consolidated clearing-account balances after elimination" className="w-full min-w-[560px] text-left text-xs">
                  <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Account</th><th className="py-2 text-right">Pre-elimination</th><th className="py-2 text-right">Eliminated</th><th className="py-2 text-right">Consolidated</th></tr></thead>
                  <tbody>{consolidatedBalances.filter(item => item.elimination_amount > 0).map(item => <tr key={item.account_id + item.base_currency_code} className="border-b border-slate-100"><td className="py-2">{item.account_code} · {item.account_name}</td><td className="py-2 text-right">{money(item.base_currency_code, item.balance)}</td><td className="py-2 text-right">{money(item.base_currency_code, item.elimination_amount)}</td><td className="py-2 text-right font-black">{money(item.base_currency_code, item.consolidated_balance)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          {periodTransfers.length ? (
            <div className="overflow-x-auto">
              <h6 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600">Transfer-to-journal trace</h6>
              <table aria-label="Internal transfer reconciliation and journal trace" className="w-full min-w-[850px] text-left text-xs">
                <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Transfer</th><th className="py-2">Branch movement</th><th className="py-2">Amount</th><th className="py-2">Source journal</th><th className="py-2">Destination journal</th><th className="py-2">Reconciliation</th><th className="py-2 text-right">Elimination</th></tr></thead>
                <tbody>{periodTransfers.map(item => <tr key={item.transfer_id} className="border-b border-slate-100">
                  <td className="py-2 font-bold">TR-{item.transfer_number}<div className="font-normal text-slate-500">{item.transaction_date}</div></td>
                  <td className="py-2">{item.source_branch_name} → {item.destination_branch_name}</td>
                  <td className="py-2">{money(item.currency_code, Number(item.amount))}</td>
                  <td className="py-2">JE-{item.source_entry_number ?? '—'} · {item.source_journal_status || '—'}</td>
                  <td className="py-2">{item.destination_journal_entry_id ? `JE-${item.destination_entry_number ?? '—'} · ${item.destination_journal_status || '—'}` : 'Same-branch journal'}</td>
                  <td className="py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.reconciliation_status === 'matched' || item.reconciliation_status === 'not_required' ? 'bg-emerald-100 text-emerald-800' : item.reconciliation_status === 'mismatch' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{item.reconciliation_status.replaceAll('_', ' ')}</span></td>
                  <td className="py-2 text-right">{money(item.base_currency_code, Number(item.elimination_base_amount))}</td>
                </tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-black text-slate-800">Posted account balances</h4>
        {loading ? <p className="py-4 text-sm text-slate-500">Loading posted balances…</p> :
          !ledger?.account_balances.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No posted journal lines exist in this scope. Approved and pending drafts are excluded.</p> :
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ledger.account_balances.map(balance => {
              const creditNormal = balance.normal_balance === 'credit';
              const value = creditNormal ? balance.credit_total - balance.debit_total : balance.debit_total - balance.credit_total;
              return <article key={balance.account_id + balance.base_currency_code} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{balance.account_code} · {balance.account_type}</div>
                <div className="mt-1 text-sm font-bold text-slate-800">{balance.account_name}</div>
                <div className="mt-2 text-lg font-black tabular-nums text-slate-900">{money(balance.base_currency_code, value)}</div>
                <div className="mt-1 text-[10px] text-slate-500">Posted debits {money(balance.base_currency_code, balance.debit_total)} · credits {money(balance.base_currency_code, balance.credit_total)}</div>
              </article>;
            })}
          </div>}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-black text-slate-800">Journal entries</h4>
        {loading ? <p className="py-4 text-sm text-slate-500">Loading journal register…</p> :
          !ledger?.journals.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No journal entries are available in this scope.</p> :
          <div className="space-y-3">
            {ledger.journals.map(journal => (
              <article key={journal.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-slate-500">JE-{journal.entry_number ?? journal.id}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${journal.status === 'posted' ? 'bg-emerald-100 text-emerald-800' : journal.source_document_status === 'rejected' ? 'bg-rose-100 text-rose-800' : journal.source_type === 'financial_document_pending' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>{journalLabel(journal)}</span>
                    </div>
                    <h5 className="mt-2 font-bold text-slate-900">{journal.description}</h5>
                    <p className="text-xs text-slate-500">{journal.entry_date} · {journal.currency_code} · {journal.reference || 'No reference'}</p>
                  </div>
                  {journal.can_post && <button type="button" disabled={postingId === journal.id} onClick={() => void post(journal)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><UploadCloud size={14} />{postingId === journal.id ? 'Posting…' : 'Post journal'}</button>}
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[540px] text-left text-xs">
                    <thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Account</th><th className="py-2 text-right">Debit</th><th className="py-2 text-right">Credit</th></tr></thead>
                    <tbody>{journal.lines.map(line => <tr key={line.id} className="border-b border-slate-100"><td className="py-2"><span className="font-mono text-slate-500">{line.account_code}</span> · {line.account_name}</td><td className="py-2 text-right tabular-nums">{money(journal.currency_code, line.debit_amount)}</td><td className="py-2 text-right tabular-nums">{money(journal.currency_code, line.credit_amount)}</td></tr>)}</tbody>
                    <tfoot><tr className="font-black text-slate-800"><td className="py-2">Totals</td><td className="py-2 text-right">{money(journal.currency_code, journal.total_debits)}</td><td className="py-2 text-right">{money(journal.currency_code, journal.total_credits)}</td></tr></tfoot>
                  </table>
                </div>
                {journal.status === 'posted' && journal.posted_at && <p className="mt-2 text-[10px] text-emerald-700">Posted {new Date(journal.posted_at).toLocaleString()}</p>}
              </article>
            ))}
          </div>}
      </div>
      <p className="text-xs text-slate-400">Posting is re-authorized by the database RPC. The posting routine validates journal balance, active accounts, organizational scope consistency, exchange rate and open financial period/year. Pending or rejected financial-document journals cannot be posted.</p>
    </section>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, RefreshCw, UploadCloud } from 'lucide-react';
import { getFinanceJournalLedger, postFinanceJournalEntry, type FinanceJournal } from './financeJournalService';

interface Props { branchId: string | null; }

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

export const FinanceJournalWorkspace: React.FC<Props> = ({ branchId }) => {
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof getFinanceJournalLedger>>['data']>(null);
  const [loading, setLoading] = useState(true);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getFinanceJournalLedger(branchId);
    if (result.error) {
      setLedger(null);
      setError(result.error.message);
    } else {
      setLedger(result.data);
    }
    setLoading(false);
  }, [branchId]);

  useEffect(() => { void reload(); }, [reload]);

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

      <div>
        <h4 className="mb-2 text-sm font-black text-slate-800">Posted account balances</h4>
        {loading ? <p className="py-4 text-sm text-slate-500">Loading posted balances…</p> :
          !ledger?.account_balances.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No posted journal lines exist in this branch. Approved and pending drafts are excluded.</p> :
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
          !ledger?.journals.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No journal entries are available in this branch.</p> :
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
      <p className="text-xs text-slate-400">Posting is re-authorized by the database RPC. The posting routine validates journal balance, active accounts, branch consistency, exchange rate and open financial period/year. Pending or rejected financial-document journals cannot be posted.</p>
    </section>
  );
};

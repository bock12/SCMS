import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, Wallet, ShieldCheck } from 'lucide-react';
import {
  createEventBudgetPayment,
  decideEventBudgetApproval,
  getEventBudgets
} from './eventBudgetFinanceService';
import { getFinanceConfiguration, type FinanceConfiguration } from './financeConfigurationService';
import type { FinancialPaymentMethod } from './financeTransactionService';

interface Props { branchId: string | null; profileId: string | null; }
type BudgetRecord = Record<string, any>;
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';

export const EventBudgetFinanceWorkspace: React.FC<Props> = ({ branchId, profileId }) => {
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [configuration, setConfiguration] = useState<FinanceConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paymentBudget, setPaymentBudget] = useState<BudgetRecord | null>(null);
  const [partyName, setPartyName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancialPaymentMethod>('bank_transfer');
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [categoryAccountId, setCategoryAccountId] = useState('');
  const [fundId, setFundId] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');

  const reload = async () => {
    setLoading(true); setError(null);
    const [budgetResult, configResult] = await Promise.all([
      getEventBudgets(branchId),
      getFinanceConfiguration()
    ]);
    if (budgetResult.error) setError(budgetResult.error.message);
    else setBudgets(budgetResult.data?.budgets || []);
    if (configResult.error) setError(current => current || configResult.error!.message);
    else setConfiguration(configResult.data);
    setLoading(false);
  };

  useEffect(() => { void reload(); }, [branchId]);

  const availableFinancialAccounts = useMemo(() => {
    if (!configuration || !paymentBudget) return [];
    return configuration.financialAccounts.filter(account => account.is_active &&
      account.currency_code === paymentBudget.currency_code &&
      (!account.branch_id || account.branch_id === paymentBudget.branch_id));
  }, [configuration, paymentBudget]);

  const openPayment = (budget: BudgetRecord) => {
    setPaymentBudget(budget);
    setPartyName(budget.name || 'Event supplier');
    setAmount(String(budget.total_budget || ''));
    setTransactionDate(new Date().toISOString().slice(0, 10));
    setReference('');
    setDescription(`Event budget payment: ${budget.name}`);
    const firstLine = budget.lines?.[0];
    setCategoryAccountId(firstLine?.account_id || '');
    setFundId(firstLine?.fund_id || '');
    const account = configuration?.financialAccounts.find(item => item.is_active &&
      item.currency_code === budget.currency_code &&
      (!item.branch_id || item.branch_id === budget.branch_id));
    setFinancialAccountId(account?.id || '');
  };

  const closePayment = () => { setPaymentBudget(null); setError(null); };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentBudget) return;
    setSaving(true); setError(null); setNotice(null);
    const result = await createEventBudgetPayment({
      budgetId: paymentBudget.id,
      transactionDate,
      partyName,
      amount: Number(amount),
      paymentMethod,
      financialAccountId,
      categoryAccountId,
      fundId: fundId || null,
      externalReference: reference,
      description,
      exchangeRateToBase: Number(paymentBudget.exchange_rate_to_base)
    });
    if (result.error) setError(result.error.message);
    else {
      setNotice('Canonical payment created and linked to the approved event budget. It is awaiting its own payment approval and journal posting.');
      setPaymentBudget(null);
      await reload();
    }
    setSaving(false);
  };

  const decide = async (budget: BudgetRecord, decision: 'approved' | 'rejected') => {
    const step = (budget.approval_steps || []).find((item: any) =>
      item.status === 'pending' && item.approver_profile_id === profileId);
    if (!step) { setError('No pending approval step is assigned to your profile for this budget.'); return; }
    const comments = decision === 'rejected'
      ? window.prompt('Enter the reason for rejecting this event budget:')
      : window.prompt('Optional approval comment:') || '';
    if (decision === 'rejected' && !comments?.trim()) return;
    setSaving(true); setError(null); setNotice(null);
    const result = await decideEventBudgetApproval({
      requestStepId: step.id, decision, comments
    });
    if (result.error) setError(result.error.message);
    else { setNotice(`Event budget ${decision} successfully recorded in the canonical approval workflow.`); await reload(); }
    setSaving(false);
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading canonical event budgets…</div>;

  return (
    <section className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-indigo-700" /><h3 className="text-lg font-black text-slate-900">Canonical event budget workflow</h3></div>
          <p className="mt-1 max-w-3xl text-xs text-slate-600">These budgets, approvals and payments are stored in the canonical finance workflow. Legacy localStorage proposals below are retained for reference and are not treated as approved accounting budgets.</p>
        </div>
        <button type="button" className={buttonClass} onClick={() => void reload()}><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={16} />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={16} />{notice}</div>}

      {budgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-indigo-200 bg-white p-5 text-center text-sm text-slate-500">
          No canonical event budgets have been submitted for this branch yet. Legacy proposals are not automatically imported or approved.
        </div>
      ) : (
        <div className="grid gap-3">
          {budgets.map(budget => {
            const myStep = (budget.approval_steps || []).find((step: any) =>
              step.status === 'pending' && step.approver_profile_id === profileId);
            const canPay = budget.status === 'approved' && !budget.payment_document_id;
            return (
              <article key={budget.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900">{budget.name}</h4>
                    <p className="mt-1 text-xs text-slate-500">Event ID: {budget.event_id} · Submitted {budget.created_at ? new Date(budget.created_at).toLocaleDateString() : ''}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${budget.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : budget.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{String(budget.status).replaceAll('_', ' ')}</span>
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                  <div><span className="text-slate-500">Budget</span><p className="font-black text-slate-900">{budget.currency_code} {Number(budget.total_budget).toLocaleString()}</p></div>
                  <div><span className="text-slate-500">Actual posted</span><p className="font-black text-slate-900">{budget.currency_code} {Number(budget.total_actual || 0).toLocaleString()}</p></div>
                  <div><span className="text-slate-500">Payment status</span><p className="font-bold text-slate-900">{budget.payment_document ? budget.payment_document.status : 'Not created'}</p></div>
                  <div><span className="text-slate-500">Approval steps</span><p className="font-bold text-slate-900">{(budget.approval_steps || []).filter((step: any) => step.status === 'approved').length} / {(budget.approval_steps || []).length} approved</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {myStep && <><button type="button" disabled={saving} className={buttonClass} onClick={() => void decide(budget, 'approved')}>Approve budget</button><button type="button" disabled={saving} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50" onClick={() => void decide(budget, 'rejected')}>Reject budget</button></>}
                  {canPay && <button type="button" disabled={saving} className={buttonClass} onClick={() => openPayment(budget)}><Wallet size={14} /> Create canonical payment</button>}
                  {budget.payment_document && <span className="self-center text-xs text-slate-500">Payment {budget.payment_document.document_number || budget.payment_document.id} · journal {budget.payment_document.journal_entry_id || 'pending'}</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {paymentBudget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={submitPayment} className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div><h4 className="text-lg font-black text-slate-900">Create canonical event payment</h4><p className="text-xs text-slate-500">The payment will enter its own approval workflow. It will not count as actual expenditure until the journal is posted.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">Payee / supplier<input required className={fieldClass + ' mt-1'} value={partyName} onChange={e => setPartyName(e.target.value)} /></label>
              <label className="text-xs font-bold text-slate-600">Amount ({paymentBudget.currency_code})<input required type="number" min="0.01" max={paymentBudget.total_budget} step="0.01" className={fieldClass + ' mt-1'} value={amount} onChange={e => setAmount(e.target.value)} /></label>
              <label className="text-xs font-bold text-slate-600">Transaction date<input required type="date" className={fieldClass + ' mt-1'} value={transactionDate} onChange={e => setTransactionDate(e.target.value)} /></label>
              <label className="text-xs font-bold text-slate-600">Payment method<select className={fieldClass + ' mt-1'} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as FinancialPaymentMethod)}>{['cash','bank_transfer','mobile_money','card','cheque','other'].map(value => <option key={value} value={value}>{value.replace('_',' ')}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Financial account<select required className={fieldClass + ' mt-1'} value={financialAccountId} onChange={e => setFinancialAccountId(e.target.value)}><option value="">Select account</option>{availableFinancialAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency_code}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Approved expense line<select required className={fieldClass + ' mt-1'} value={categoryAccountId} onChange={e => { setCategoryAccountId(e.target.value); const line = paymentBudget.lines?.find((item: any) => item.account_id === e.target.value); setFundId(line?.fund_id || ''); }}><option value="">Select budget line</option>{(paymentBudget.lines || []).map((line: any) => <option key={line.id} value={line.account_id}>{line.description || line.account_id} · {line.allocated_amount}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Fund<select className={fieldClass + ' mt-1'} value={fundId} onChange={e => setFundId(e.target.value)}><option value="">No fund</option>{(configuration?.funds || []).filter(fund => fund.is_active).map(fund => <option key={fund.id} value={fund.id}>{fund.code} · {fund.name}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">External reference<input className={fieldClass + ' mt-1'} value={reference} onChange={e => setReference(e.target.value)} /></label>
            </div>
            <label className="block text-xs font-bold text-slate-600">Description<textarea required className={fieldClass + ' mt-1'} value={description} onChange={e => setDescription(e.target.value)} /></label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold" onClick={closePayment}>Cancel</button><button type="submit" className={buttonClass} disabled={saving || !financialAccountId || !categoryAccountId}>{saving ? 'Creating…' : 'Create payment'}</button></div>
          </form>
        </div>
      )}
    </section>
  );
};

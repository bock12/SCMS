import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, Wallet, ShieldCheck, Plus } from 'lucide-react';
import { financeSupabase } from './financeSupabaseClient';
import {
  createEventBudgetPayment,
  decideEventBudgetApproval,
  getEventBudgets,
  submitEventBudgetForApproval,
  getEventBudgetSubmissionOptions,
  getMyEventBudgets
} from './eventBudgetFinanceService';
import { getFinanceConfiguration, type FinanceConfiguration } from './financeConfigurationService';
import type { FinancialPaymentMethod } from './financeTransactionService';

interface Props { branchId: string | null; profileId: string | null; fixedEvent?: { id: string; title: string; finance_event_id?: string; branch_id?: string }; submissionOnly?: boolean; }
type BudgetRecord = Record<string, any>;
type WorkspaceConfiguration = Pick<FinanceConfiguration, 'currencies' | 'baseCurrencyCode' | 'chartAccounts' | 'funds' | 'periods'> & { financialAccounts?: FinanceConfiguration['financialAccounts'] };
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';

export const EventBudgetFinanceWorkspace: React.FC<Props> = ({ branchId, profileId, fixedEvent, submissionOnly = false }) => {
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [events, setEvents] = useState<Array<{ id: string; title: string; finance_event_id?: string; branch_id?: string }>>(fixedEvent ? [fixedEvent] : []);
  const [showSubmit, setShowSubmit] = useState(false);
  const [eventId, setEventId] = useState('');
  const [budgetName, setBudgetName] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [budgetFundId, setBudgetFundId] = useState('');
  const [lineAmount, setLineAmount] = useState('');
  const [lineDescription, setLineDescription] = useState('');
  const [configuration, setConfiguration] = useState<WorkspaceConfiguration | null>(null);
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
    const budgetRequest = submissionOnly && fixedEvent
      ? getMyEventBudgets(fixedEvent)
      : getEventBudgets(branchId);
    const configurationRequest = submissionOnly && fixedEvent
      ? getEventBudgetSubmissionOptions(fixedEvent)
      : getFinanceConfiguration();
    const eventRequest = fixedEvent
      ? Promise.resolve({ data: null, error: null })
      : financeSupabase.from('events').select('*').order('title', { ascending: true });
    const [budgetResult, configResult, eventResult] = await Promise.all([
      budgetRequest, configurationRequest, eventRequest
    ]);
    if (budgetResult.error) setError(budgetResult.error.message);
    else setBudgets(budgetResult.data?.budgets || []);
    if (configResult.error) setError(current => current || configResult.error!.message);
    else setConfiguration(configResult.data);
    if (fixedEvent) setEvents([fixedEvent]);
    else if (eventResult.error) setError(current => current || eventResult.error.message);
    else setEvents((eventResult.data || []).filter((event: any) => !branchId || event.branch_id === branchId)
      .map((event: any) => ({ id: event.id, title: event.title || event.name || 'Church event', finance_event_id: event.finance_event_id, branch_id: event.branch_id })));
    setLoading(false);
  };

  useEffect(() => { void reload(); }, [branchId, fixedEvent?.id, fixedEvent?.finance_event_id, submissionOnly]);

  const expenseAccounts = useMemo(() => (configuration?.chartAccounts || []).filter(account =>
    account.is_active && account.account_type === 'expense' && !account.is_control_account), [configuration]);

  const openSubmit = () => {
    setEventId(fixedEvent?.id || events[0]?.id || '');
    setPeriodId(configuration?.periods.find(period => period.status === 'open')?.id || '');
    setCurrencyCode(configuration?.baseCurrencyCode || configuration?.currencies[0] || '');
    setExpenseAccountId(expenseAccounts[0]?.id || '');
    setBudgetFundId(configuration?.funds.find(fund => fund.is_active)?.id || '');
    const selected = fixedEvent || events[0];
    setBudgetName(selected?.title ? `${selected.title} Budget` : 'Event Budget');
    setShowSubmit(true);
  };

  const submitBudget = async (event: React.FormEvent) => {
    event.preventDefault();
    const selectedEvent = events.find(item => item.id === eventId);
    if (!selectedEvent) { setError('Select an event with a saved finance identity.'); return; }
    setSaving(true); setError(null); setNotice(null);
    const result = await submitEventBudgetForApproval({
      event: selectedEvent,
      periodId,
      name: budgetName,
      currencyCode,
      exchangeRateToBase: Number(exchangeRate),
      lines: [{ accountId: expenseAccountId, fundId: budgetFundId || null, description: lineDescription, allocatedAmount: Number(lineAmount) }]
    });
    if (result.error) setError(result.error.message);
    else { setNotice('Event budget submitted into the canonical approval workflow.'); setShowSubmit(false); await reload(); }
    setSaving(false);
  };

  const availableFinancialAccounts = useMemo(() => {
    if (!configuration || !paymentBudget) return [];
    return (configuration.financialAccounts || []).filter(account => account.is_active &&
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
    const account = configuration?.financialAccounts?.find(item => item.is_active &&
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
      item.actor_can_decide === true);
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
          <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-indigo-700" /><h3 className="text-lg font-black text-slate-900">{submissionOnly ? 'Your event budget submissions' : 'Canonical event budget workflow'}</h3></div>
          <p className="mt-1 max-w-3xl text-xs text-slate-600">{submissionOnly ? 'Submit an event budget and track its approval progress. Finance configuration, approval decisions and payments remain restricted to authorized finance roles.' : 'These budgets, approvals and payments are stored in the canonical finance workflow. Legacy localStorage proposals below are retained for reference and are not treated as approved accounting budgets.'}</p>
        </div>
        <div className="flex gap-2"><button type="button" className={buttonClass} onClick={() => void reload()}><RefreshCw size={14} /> Refresh</button><button type="button" className={buttonClass} onClick={openSubmit} disabled={!events.length || !configuration}><Plus size={14} /> Submit budget</button></div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={16} />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={16} />{notice}</div>}

      {showSubmit && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={submitBudget} className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div><h4 className="text-lg font-black text-slate-900">Submit canonical event budget</h4><p className="text-xs text-slate-500">Submission creates a persisted budget and approval request. It does not create an expense or payment.</p></div>
            {!fixedEvent && <label className="block text-xs font-bold text-slate-600">Church event<select required className={fieldClass + ' mt-1'} value={eventId} onChange={e => { setEventId(e.target.value); const item = events.find(event => event.id === e.target.value); if (item) setBudgetName(item.title + ' Budget'); }}><option value="">Select event</option>{events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}
            <label className="block text-xs font-bold text-slate-600">Budget name<input required className={fieldClass + ' mt-1'} value={budgetName} onChange={e => setBudgetName(e.target.value)} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">Financial period<select required className={fieldClass + ' mt-1'} value={periodId} onChange={e => setPeriodId(e.target.value)}><option value="">Select open period</option>{(configuration?.periods || []).filter(period => period.status === 'open').map(period => <option key={period.id} value={period.id}>{period.name} ({period.start_date}–{period.end_date})</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Currency<select required className={fieldClass + ' mt-1'} value={currencyCode} onChange={e => setCurrencyCode(e.target.value)}>{(configuration?.currencies || []).map(code => <option key={code} value={code}>{code}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Exchange rate to base<input required type="number" min="0.000001" step="0.000001" className={fieldClass + ' mt-1'} value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} /></label>
              <label className="text-xs font-bold text-slate-600">Budget amount<input required type="number" min="0.01" step="0.01" className={fieldClass + ' mt-1'} value={lineAmount} onChange={e => setLineAmount(e.target.value)} /></label>
              <label className="text-xs font-bold text-slate-600">Expense account<select required className={fieldClass + ' mt-1'} value={expenseAccountId} onChange={e => setExpenseAccountId(e.target.value)}><option value="">Select expense account</option>{expenseAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Fund<select className={fieldClass + ' mt-1'} value={budgetFundId} onChange={e => setBudgetFundId(e.target.value)}><option value="">No fund</option>{(configuration?.funds || []).filter(fund => fund.is_active).map(fund => <option key={fund.id} value={fund.id}>{fund.code} · {fund.name}</option>)}</select></label>
            </div>
            <label className="block text-xs font-bold text-slate-600">Budget line description<input required className={fieldClass + ' mt-1'} value={lineDescription} onChange={e => setLineDescription(e.target.value)} /></label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold" onClick={() => setShowSubmit(false)}>Cancel</button><button type="submit" className={buttonClass} disabled={saving || !periodId || !expenseAccountId || !lineAmount}>{saving ? 'Submitting…' : 'Submit for approval'}</button></div>
          </form>
        </div>
      )}

      {budgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-indigo-200 bg-white p-5 text-center text-sm text-slate-500">
          {submissionOnly ? 'You have not submitted a canonical budget for this event yet.' : 'No canonical event budgets have been submitted for this branch yet. Legacy proposals are not automatically imported or approved.'}
        </div>
      ) : (
        <div className="grid gap-3">
          {budgets.map(budget => {
            const myStep = (budget.approval_steps || []).find((step: any) =>
              step.actor_can_decide === true);
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
                  {!submissionOnly && <div><span className="text-slate-500">Actual posted</span><p className="font-black text-slate-900">{budget.currency_code} {Number(budget.total_actual || 0).toLocaleString()}</p></div>}
                  {!submissionOnly && <div><span className="text-slate-500">Payment status</span><p className="font-bold text-slate-900">{budget.payment_document ? budget.payment_document.status : 'Not created'}</p></div>}
                  <div><span className="text-slate-500">Approval steps</span><p className="font-bold text-slate-900">{(budget.approval_steps || []).filter((step: any) => step.status === 'approved').length} / {(budget.approval_steps || []).length} approved</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!submissionOnly && myStep && <><button type="button" disabled={saving} className={buttonClass} onClick={() => void decide(budget, 'approved')}>Approve budget</button><button type="button" disabled={saving} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50" onClick={() => void decide(budget, 'rejected')}>Reject budget</button></>}
                  {!submissionOnly && canPay && <button type="button" disabled={saving} className={buttonClass} onClick={() => openPayment(budget)}><Wallet size={14} /> Create canonical payment</button>}
                  {!submissionOnly && budget.payment_document && <span className="self-center text-xs text-slate-500">Payment {budget.payment_document.document_number || budget.payment_document.id} · journal {budget.payment_document.journal_entry_id || 'pending'}</span>}
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

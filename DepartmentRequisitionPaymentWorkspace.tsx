import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, RefreshCw } from 'lucide-react';
import {
  createDatabaseRequisitionPayment,
  getDatabaseRequisitionPaymentSummary,
  type DepartmentRequisitionPaymentSummary
} from './requisitionService';
import { supabase } from './supabaseClient';

type RequisitionRow = {
  id: string;
  requisition_number: string;
  title: string;
  status: string;
  requested_amount: number;
  currency?: string;
  currency_code?: string;
  exchange_rate_to_base?: number;
};

type FinanceConfig = {
  financialAccounts: Array<{
    id: string; name: string; currency_code: string; branch_id?: string | null; is_active: boolean;
  }>;
  chartAccounts: Array<{
    id: string; code: string; name: string; account_type: string; is_active: boolean; is_control_account?: boolean;
  }>;
  funds: Array<{ id: string; name: string; code?: string; is_active: boolean }>;
};

interface DepartmentRequisitionPaymentWorkspaceProps {
  branchId: string | null;
  requisitions: RequisitionRow[];
}

const today = () => new Date().toISOString().slice(0, 10);
const requestKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `reqpay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const DepartmentRequisitionPaymentWorkspace: React.FC<DepartmentRequisitionPaymentWorkspaceProps> = ({
  branchId, requisitions
}) => {
  const [config, setConfig] = useState<FinanceConfig | null>(null);
  const [summaries, setSummaries] = useState<DepartmentRequisitionPaymentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [transactionDate, setTransactionDate] = useState(today());
  const [partyName, setPartyName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'mobile_money' | 'card' | 'cheque' | 'other'>('bank_transfer');
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [categoryAccountId, setCategoryAccountId] = useState('');
  const [fundId, setFundId] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [description, setDescription] = useState('');
  const [retryKey, setRetryKey] = useState('');

  const selected = requisitions.find(item => item.id === selectedId && item.status === 'approved');
  const currency = selected?.currency_code || selected?.currency || '';
  const summary = summaries.find(item => item.requisition_id === selectedId);
  const eligibleRequisitions = requisitions.filter(item => item.status === 'approved');
  const financialAccounts = useMemo(() => (config?.financialAccounts || [])
    .filter(item => item.is_active && item.currency_code === currency &&
      (item.branch_id == null || item.branch_id === branchId)), [config, currency, branchId]);
  const expenseAccounts = useMemo(() => (config?.chartAccounts || [])
    .filter(item => item.is_active && item.account_type === 'expense' && !item.is_control_account),
    [config]);
  const activeFunds = (config?.funds || []).filter(item => item.is_active);

  const reload = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const [configuration, paymentSummary] = await Promise.all([
        supabase.rpc('get_finance_configuration', { p_branch_id: branchId }),
        getDatabaseRequisitionPaymentSummary(branchId)
      ]);
      if (configuration.error) throw new Error(configuration.error.message);
      if (paymentSummary.error) throw new Error(paymentSummary.error.message);
      setConfig(configuration.data as FinanceConfig);
      setSummaries(paymentSummary.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load requisition payment configuration.');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!selectedId && eligibleRequisitions.length) setSelectedId(eligibleRequisitions[0].id);
    if (selectedId && !eligibleRequisitions.some(item => item.id === selectedId)) setSelectedId('');
  }, [selectedId, eligibleRequisitions]);

  useEffect(() => {
    if (!financialAccounts.some(item => item.id === financialAccountId)) setFinancialAccountId(financialAccounts[0]?.id || '');
  }, [financialAccounts, financialAccountId]);
  useEffect(() => {
    if (!expenseAccounts.some(item => item.id === categoryAccountId)) setCategoryAccountId(expenseAccounts[0]?.id || '');
  }, [expenseAccounts, categoryAccountId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !branchId || !financialAccountId || !categoryAccountId) return;
    const value = Number(amount);
    if (!partyName.trim() || !Number.isFinite(value) || value <= 0) {
      setError('Enter a supplier/payee and a positive payment amount.');
      return;
    }
    if (summary && value > summary.remaining_amount) {
      setError(`Payment exceeds the remaining approved amount of ${summary.currency_code} ${summary.remaining_amount.toLocaleString()}.`);
      return;
    }
    setSaving(true);
    setError(null);
    const key = retryKey || requestKey();
    setRetryKey(key);
    try {
      const result = await createDatabaseRequisitionPayment({
        requisitionId: selected.id,
        transactionDate,
        partyName: partyName.trim(),
        amount: value,
        paymentMethod,
        financialAccountId,
        categoryAccountId,
        fundId: fundId || null,
        externalReference: externalReference.trim() || null,
        description: description.trim() || selected.title,
        requestKey: key
      });
      if (result.error) throw new Error(result.error.message);
      setRetryKey('');
      setPartyName('');
      setAmount('');
      setExternalReference('');
      setDescription('');
      await reload();
      window.dispatchEvent(new Event('finance_documents_updated'));
      alert(result.data?.already_exists
        ? 'This payment request was already recorded. The existing payment was returned.'
        : 'Canonical requisition payment created. It must complete its separate payment approval and journal posting workflow.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create requisition payment.');
    } finally {
      setSaving(false);
    }
  };

  if (!branchId) return null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <CreditCard size={18} /> Requisition Payments
          </h3>
          <p className="text-xs text-slate-500 mt-1">Create partial or full payments against approved requisitions. Payments enter the separate finance approval workflow.</p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={loading || saving}
          className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh payment summary">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 flex gap-2"><AlertCircle size={15} />{error}</div>}
      {loading && <p className="text-xs text-slate-500">Loading payment configuration and posted-payment summaries…</p>}

      {eligibleRequisitions.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">There are no approved database requisitions available for payment.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Approved requisition</label>
              <select value={selectedId} onChange={event => setSelectedId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                {eligibleRequisitions.map(item => (
                  <option key={item.id} value={item.id}>{item.requisition_number} — {item.title}</option>
                ))}
              </select>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="text-[10px] uppercase font-bold text-slate-500">Remaining approved amount</span>
              <div className="text-lg font-black text-slate-900">{currency} {(summary?.remaining_amount ?? selected?.requested_amount ?? 0).toLocaleString()}</div>
              <span className="text-[11px] text-slate-500">Paid: {(summary?.paid_amount ?? 0).toLocaleString()} · Reserved: {(summary?.reserved_amount ?? 0).toLocaleString()}</span>
              <div className="mt-1 text-[10px] font-bold uppercase text-indigo-700">{summary?.payment_status?.replace('_', ' ') || 'unpaid'}</div>
            </div>
          </div>

          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Supplier / Payee</label>
              <input value={partyName} onChange={event => setPartyName(event.target.value)} required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Supplier or payee name" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Payment amount ({currency})</label>
              <input type="number" min="0.0001" step="0.0001" value={amount}
                onChange={event => setAmount(event.target.value)} required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Transaction date</label>
              <input type="date" value={transactionDate} onChange={event => setTransactionDate(event.target.value)} required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Payment method</label>
              <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as typeof paymentMethod)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option>
                <option value="mobile_money">Mobile money</option><option value="card">Card</option>
                <option value="cheque">Cheque</option><option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Pay from account</label>
              <select value={financialAccountId} onChange={event => setFinancialAccountId(event.target.value)} required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select financial account</option>
                {financialAccounts.map(item => <option key={item.id} value={item.id}>{item.name} ({item.currency_code})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Expense category</label>
              <select value={categoryAccountId} onChange={event => setCategoryAccountId(event.target.value)} required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select expense account</option>
                {expenseAccounts.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Fund (optional)</label>
              <select value={fundId} onChange={event => setFundId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">No fund</option>
                {activeFunds.map(item => <option key={item.id} value={item.id}>{item.code ? `${item.code} — ${item.name}` : item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">External reference (optional)</label>
              <input value={externalReference} onChange={event => setExternalReference(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Cheque / transfer reference" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
              <input value={description} onChange={event => setDescription(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder={selected?.title || 'Payment description'} />
            </div>
            <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500 flex items-center gap-1"><CheckCircle2 size={14} /> Paid totals update only after the linked journal is posted.</p>
              <button type="submit" disabled={saving || loading || !selected || !financialAccountId || !categoryAccountId || !summary?.remaining_amount && summary?.payment_status !== 'unpaid'}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Creating payment…' : 'Create canonical payment'}
              </button>
            </div>
          </form>
          {summary?.payments?.length ? (
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Amount</th><th className="p-3 text-left">Approval</th><th className="p-3 text-left">Journal</th></tr></thead>
                <tbody>{summary.payments.map(payment => (
                  <tr key={payment.document_id} className="border-t border-slate-100">
                    <td className="p-3">{payment.transaction_date}</td>
                    <td className="p-3 font-bold">{payment.currency_code} {payment.amount.toLocaleString()}</td>
                    <td className="p-3">{payment.status}</td>
                    <td className="p-3">{payment.journal_status || 'Awaiting approval'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, CreditCard, RefreshCw } from 'lucide-react';
import {
  createDatabaseRequisitionPayment,
  getDatabaseRequisitionPaymentSummary,
  type DepartmentRequisitionPaymentSummary
} from './requisitionService';
import { financeSupabase } from './financeSupabaseClient';

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
    id: string;
    name: string;
    currency_code: string;
    branch_id?: string | null;
    is_active: boolean;
  }>;
  chartAccounts: Array<{
    id: string;
    code: string;
    name: string;
    account_type: string;
    is_active: boolean;
    is_control_account?: boolean;
  }>;
  funds: Array<{ id: string; name: string; code?: string; is_active: boolean }>;
};

interface DepartmentRequisitionPaymentWorkspaceProps {
  branchId: string | null;
  requisitions: RequisitionRow[];
  preselectedRequisitionId?: string | null;
  onPaymentCreated?: (requisitionId: string) => void;
  onOpenApprovalsTab?: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const requestKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `reqpay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const DepartmentRequisitionPaymentWorkspace: React.FC<DepartmentRequisitionPaymentWorkspaceProps> = ({
  branchId,
  requisitions,
  preselectedRequisitionId,
  onPaymentCreated,
  onOpenApprovalsTab
}) => {
  const [config, setConfig] = useState<FinanceConfig | null>(null);
  const [summaries, setSummaries] = useState<DepartmentRequisitionPaymentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [transactionDate, setTransactionDate] = useState(today());
  const [partyName, setPartyName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'bank_transfer' | 'mobile_money' | 'card' | 'cheque' | 'other'
  >('bank_transfer');
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [categoryAccountId, setCategoryAccountId] = useState('');
  const [fundId, setFundId] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [description, setDescription] = useState('');
  const [retryKey, setRetryKey] = useState('');

  const eligibleRequisitions = useMemo(
    () => requisitions.filter(item => item.status === 'approved'),
    [requisitions]
  );

  const selected = eligibleRequisitions.find(item => item.id === selectedId);
  const currency = selected?.currency_code || selected?.currency || '';
  const summary = summaries.find(item => item.requisition_id === selectedId);

  const financialAccounts = useMemo(
    () =>
      (config?.financialAccounts || []).filter(
        item =>
          item.is_active &&
          item.currency_code === currency &&
          (item.branch_id == null || item.branch_id === branchId)
      ),
    [config, currency, branchId]
  );
  const expenseAccounts = useMemo(
    () =>
      (config?.chartAccounts || []).filter(
        item => item.is_active && item.account_type === 'expense' && !item.is_control_account
      ),
    [config]
  );
  const activeFunds = (config?.funds || []).filter(item => item.is_active);

  const reload = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const [configuration, paymentSummary] = await Promise.all([
        financeSupabase.rpc('get_finance_configuration', { p_branch_id: branchId }),
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

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (
      preselectedRequisitionId &&
      eligibleRequisitions.some(item => item.id === preselectedRequisitionId)
    ) {
      setSelectedId(preselectedRequisitionId);
      setNotice(null);
      setError(null);
    }
  }, [preselectedRequisitionId, eligibleRequisitions]);

  useEffect(() => {
    if (!selectedId && eligibleRequisitions.length) setSelectedId(eligibleRequisitions[0].id);
    if (selectedId && !eligibleRequisitions.some(item => item.id === selectedId)) setSelectedId('');
  }, [selectedId, eligibleRequisitions]);

  useEffect(() => {
    if (!financialAccounts.some(item => item.id === financialAccountId)) {
      setFinancialAccountId(financialAccounts[0]?.id || '');
    }
  }, [financialAccounts, financialAccountId]);

  useEffect(() => {
    if (!expenseAccounts.some(item => item.id === categoryAccountId)) {
      setCategoryAccountId(expenseAccounts[0]?.id || '');
    }
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
      setError(
        `Payment exceeds the remaining approved amount of ${summary.currency_code} ${summary.remaining_amount.toLocaleString()}.`
      );
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
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
      onPaymentCreated?.(selected.id);
      setNotice(
        result.data?.already_exists
          ? `This payment request for ${selected.requisition_number} was already recorded. The existing canonical payment was returned.`
          : `Canonical payment created for ${selected.requisition_number}. It must complete payment approval and journal posting before paid totals update.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create requisition payment.');
    } finally {
      setSaving(false);
    }
  };

  if (!branchId) return null;

  const remainingAmount = summary?.remaining_amount ?? selected?.requested_amount ?? 0;
  const noRemainingBalance = Boolean(summary && summary.remaining_amount <= 0);

  return (
    <section
      id="requisition-payment-workspace"
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <CreditCard size={18} className="text-slate-700" /> Record payment against approved proposal
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Create partial or full canonical payments linked to an approved proposal. Payments enter the Approvals queue for disbursement sign-off.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading || saving}
          className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          aria-label="Refresh payment summary"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-700" />
            <span>{notice}</span>
          </div>
          {onOpenApprovalsTab && (
            <button
              type="button"
              onClick={onOpenApprovalsTab}
              className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-900 cursor-pointer"
            >
              Open Approvals tab <ArrowRight size={13} />
            </button>
          )}
        </div>
      )}

      {loading && (
        <p className="text-xs text-slate-500">Loading payment configuration and posted-payment summaries…</p>
      )}

      {eligibleRequisitions.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          There are no approved proposals available for payment in this branch yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label htmlFor="req-payment-select" className="block text-xs font-bold text-slate-700 mb-1">
                Approved proposal
              </label>
              <select
                id="req-payment-select"
                value={selectedId}
                onChange={event => {
                  setSelectedId(event.target.value);
                  setError(null);
                }}
                className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                {eligibleRequisitions.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.requisition_number} — {item.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <span className="text-[11px] uppercase font-bold tracking-wide text-slate-500">
                Remaining approved balance
              </span>
              <div className="text-lg font-black tabular-nums text-slate-900 mt-0.5">
                {currency} {Number(remainingAmount).toLocaleString()}
              </div>
              <span className="text-[11px] tabular-nums text-slate-500">
                Paid: {(summary?.paid_amount ?? 0).toLocaleString()} · Reserved: {(summary?.reserved_amount ?? 0).toLocaleString()}
              </span>
              <div className="mt-1 text-[11px] font-bold uppercase text-indigo-700">
                {(summary?.payment_status || 'unpaid').replace('_', ' ')}
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Supplier / Payee</label>
              <input
                value={partyName}
                onChange={event => setPartyName(event.target.value)}
                required
                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
                placeholder="Supplier or payee name"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment amount ({currency})
              </label>
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                required
                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Transaction date</label>
              <input
                type="date"
                value={transactionDate}
                onChange={event => setTransactionDate(event.target.value)}
                required
                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Payment method</label>
              <select
                value={paymentMethod}
                onChange={event => setPaymentMethod(event.target.value as typeof paymentMethod)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="mobile_money">Mobile money</option>
                <option value="card">Card</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pay from account</label>
              <select
                value={financialAccountId}
                onChange={event => setFinancialAccountId(event.target.value)}
                required
                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                <option value="">Select financial account</option>
                {financialAccounts.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.currency_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Expense category</label>
              <select
                value={categoryAccountId}
                onChange={event => setCategoryAccountId(event.target.value)}
                required
                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                <option value="">Select expense account</option>
                {expenseAccounts.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.code} — {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fund (optional)</label>
              <select
                value={fundId}
                onChange={event => setFundId(event.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                <option value="">No fund</option>
                {activeFunds.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.code ? `${item.code} — ${item.name}` : item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                External reference (optional)
              </label>
              <input
                value={externalReference}
                onChange={event => setExternalReference(event.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
                placeholder="Cheque / transfer reference"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
              <input
                value={description}
                onChange={event => setDescription(event.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
                placeholder={selected?.title || 'Payment description'}
              />
            </div>
            <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-slate-600 shrink-0" />
                Paid totals update only after the linked journal is posted.
              </p>
              <button
                type="submit"
                disabled={
                  saving ||
                  loading ||
                  !selected ||
                  !financialAccountId ||
                  !categoryAccountId ||
                  noRemainingBalance
                }
                className="inline-flex min-h-[40px] items-center justify-center whitespace-nowrap rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 cursor-pointer shrink-0"
              >
                {saving ? 'Creating payment…' : 'Create canonical payment'}
              </button>
            </div>
          </form>

          {summary?.payments?.length ? (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3 text-left font-bold">Date</th>
                    <th className="p-3 text-right font-bold">Amount</th>
                    <th className="p-3 text-left font-bold">Approval</th>
                    <th className="p-3 text-left font-bold">Journal</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.payments.map(payment => (
                    <tr key={payment.document_id} className="border-t border-slate-100">
                      <td className="p-3 tabular-nums text-slate-700">{payment.transaction_date}</td>
                      <td className="p-3 text-right font-bold tabular-nums text-slate-900">
                        {payment.currency_code} {payment.amount.toLocaleString()}
                      </td>
                      <td className="p-3 capitalize text-slate-700">
                        {payment.status.replace('_', ' ')}
                      </td>
                      <td className="p-3 capitalize text-slate-600">
                        {payment.journal_status || 'Awaiting approval'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

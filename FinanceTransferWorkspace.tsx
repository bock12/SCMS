import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeftRight, CheckCircle2, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { getFinanceScopeTransactionOptions, type FinanceConfiguration, type FinanceScopeOption } from './financeConfigurationService';
import {
  createFinancialTransfer,
  decideFinancialTransferApproval,
  getFinancialTransfers,
  postFinancialTransfer,
  type FinancialTransferRecord
} from './financeTransferService';

interface FinanceTransferWorkspaceProps {
  branchId: string;
  branchOptions: FinanceScopeOption[];
  canCreate: boolean;
}

const emptyConfiguration = (): FinanceConfiguration => ({
  currencies: [], baseCurrencyCode: null, chartAccounts: [], financialAccounts: [], funds: [],
  financialYears: [], periods: [], approvalPolicies: [], approvalPolicyBands: [], approvalPolicySteps: []
});

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800';
const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500';

const makeKey = () => globalThis.crypto?.randomUUID?.() ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

export const FinanceTransferWorkspace: React.FC<FinanceTransferWorkspaceProps> = ({
  branchId, branchOptions, canCreate
}) => {
  const [sourceConfiguration, setSourceConfiguration] = useState<FinanceConfiguration>(emptyConfiguration);
  const [destinationConfiguration, setDestinationConfiguration] = useState<FinanceConfiguration>(emptyConfiguration);
  const [destinationBranchId, setDestinationBranchId] = useState(branchId);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [description, setDescription] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(makeKey);
  const [transfers, setTransfers] = useState<FinancialTransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actingOnTransfer, setActingOnTransfer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const availableBranches = useMemo(() => branchOptions.filter(item =>
    item.scope_type === 'branch' && Boolean(item.scope_id)), [branchOptions]);

  const sourceAccounts = useMemo(() => sourceConfiguration.financialAccounts.filter(account =>
    account.is_active && account.branch_id === branchId), [sourceConfiguration.financialAccounts, branchId]);

  const destinationAccounts = useMemo(() => destinationConfiguration.financialAccounts.filter(account =>
    account.is_active && account.branch_id === destinationBranchId &&
    (!currencyCode || account.currency_code === currencyCode)), [
      destinationConfiguration.financialAccounts, destinationBranchId, currencyCode
    ]);

  const sourceAccount = sourceAccounts.find(account => account.id === sourceAccountId) || null;
  const destinationAccount = destinationAccounts.find(account => account.id === destinationAccountId) || null;

  const reloadTransfers = useCallback(async () => {
    setLoading(true);
    const result = await getFinancialTransfers(branchId);
    if (result.error) setError(result.error.message);
    else setTransfers(result.data?.transfers || []);
    setLoading(false);
  }, [branchId]);

  const reloadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    const sourceResult = await getFinanceScopeTransactionOptions({ type: 'branch', id: branchId });
    if (sourceResult.error) setError(sourceResult.error.message);
    else {
      const config = { ...emptyConfiguration(), ...(sourceResult.data || {}) };
      setSourceConfiguration(config);
      setSourceAccountId(current => config.financialAccounts.some(account =>
        account.id === current && account.is_active && account.branch_id === branchId)
        ? current
        : config.financialAccounts.find(account => account.is_active && account.branch_id === branchId)?.id || '');
    }
    const destinationResult = await getFinanceScopeTransactionOptions({ type: 'branch', id: destinationBranchId });
    if (destinationResult.error) setError(current => current || destinationResult.error!.message);
    else {
      const config = { ...emptyConfiguration(), ...(destinationResult.data || {}) };
      setDestinationConfiguration(config);
      setDestinationAccountId(current => config.financialAccounts.some(account =>
        account.id === current && account.is_active && account.branch_id === destinationBranchId &&
        (!currencyCode || account.currency_code === currencyCode))
        ? current
        : config.financialAccounts.find(account => account.is_active && account.branch_id === destinationBranchId &&
          (!currencyCode || account.currency_code === currencyCode))?.id || '');
    }
    setLoadingAccounts(false);
  }, [branchId, destinationBranchId]);

  useEffect(() => {
    setDestinationBranchId(branchId);
    setDestinationAccountId('');
    setSourceAccountId('');
    setIdempotencyKey(makeKey());
  }, [branchId]);

  useEffect(() => { void reloadAccounts(); }, [reloadAccounts]);
  useEffect(() => { void reloadTransfers(); }, [reloadTransfers]);

  useEffect(() => {
    const refresh = () => { void reloadTransfers(); };
    window.addEventListener('finance_transfers_updated', refresh);
    window.addEventListener('finance_configuration_updated', refresh);
    return () => {
      window.removeEventListener('finance_transfers_updated', refresh);
      window.removeEventListener('finance_configuration_updated', refresh);
    };
  }, [reloadTransfers]);

  useEffect(() => {
    if (sourceAccount) {
      setCurrencyCode(sourceAccount.currency_code);
      setDestinationAccountId(current => destinationAccounts.some(account =>
        account.id === current && account.currency_code === sourceAccount.currency_code)
        ? current
        : destinationAccounts.find(account => account.currency_code === sourceAccount.currency_code)?.id || '');
    }
  }, [sourceAccountId, sourceConfiguration.financialAccounts]);

  const updateDestinationBranch = (nextBranchId: string) => {
    setDestinationBranchId(nextBranchId);
    setDestinationAccountId('');
    setIdempotencyKey(makeKey());
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      setError('Your account does not have permission to create transfers from this branch.');
      return;
    }
    if (!sourceAccount || !destinationAccount || !amount.trim() || !description.trim()) {
      setError('Select both accounts and enter an amount and description.');
      return;
    }
    if (sourceAccount.currency_code !== destinationAccount.currency_code) {
      setError('Cross-currency transfers are not supported. Both accounts must use the same currency.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const result = await createFinancialTransfer({
      transactionDate,
      sourceBranchId: branchId,
      sourceFinancialAccountId: sourceAccount.id,
      destinationBranchId,
      destinationFinancialAccountId: destinationAccount.id,
      amount: Number(amount),
      currencyCode: sourceAccount.currency_code,
      exchangeRateToBase: Number(exchangeRate),
      description,
      externalReference,
      idempotencyKey
    });
    if (result.error) setError(result.error.message);
    else {
      setNotice(result.data?.status === 'approved'
        ? 'Transfer created and approved. It is ready for authorized posting.'
        : 'Transfer submitted. The affected branch approval workflows must finish before posting.');
      setAmount('');
      setDescription('');
      setExternalReference('');
      setIdempotencyKey(makeKey());
      window.dispatchEvent(new Event('finance_transfers_updated'));
      await reloadTransfers();
    }
    setSubmitting(false);
  };

  const decide = async (transfer: FinancialTransferRecord, stepId: string, decision: 'approved' | 'rejected') => {
    setActingOnTransfer(transfer.id);
    setError(null);
    setNotice(null);
    const result = await decideFinancialTransferApproval({ requestStepId: stepId, decision });
    if (result.error) setError(result.error.message);
    else {
      setNotice(decision === 'approved' ? 'Branch transfer approval recorded.' : 'Transfer rejected. Its draft journals remain unposted.');
      await reloadTransfers();
    }
    setActingOnTransfer(null);
  };

  const post = async (transfer: FinancialTransferRecord) => {
    setActingOnTransfer(transfer.id);
    setError(null);
    setNotice(null);
    const result = await postFinancialTransfer(transfer.id);
    if (result.error) setError(result.error.message);
    else {
      setNotice('Transfer posted. All branch journals were posted together.');
      await reloadTransfers();
    }
    setActingOnTransfer(null);
  };

  const money = (transfer: FinancialTransferRecord) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: transfer.currency_code }).format(Number(transfer.amount));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="text-indigo-600" size={20} />
          <h2 className="text-lg font-black text-slate-900">Internal financial transfers</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Move funds between the church's own branch-owned accounts. Same-branch transfers create one journal; cross-branch transfers require approval in both branches and post both journals atomically.
        </p>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={17} />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={17} />{notice}</div>}

      <form onSubmit={submit} className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-black text-slate-900">Record a transfer</h3>
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-700">No income or expense</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Sending branch</label>
            <input className={inputClass} value={availableBranches.find(item => item.scope_id === branchId)?.scope_name || branchId} disabled />
          </div>
          <div>
            <label className={labelClass}>Receiving branch</label>
            <select className={inputClass} value={destinationBranchId} onChange={event => updateDestinationBranch(event.target.value)}>
              {availableBranches.map(item => <option key={item.scope_id} value={item.scope_id!}>{item.scope_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Source account</label>
            <select className={inputClass} value={sourceAccountId} onChange={event => {
              setSourceAccountId(event.target.value);
              setDestinationAccountId('');
              setIdempotencyKey(makeKey());
            }} disabled={loadingAccounts || sourceAccounts.length === 0}>
              <option value="">Select source account</option>
              {sourceAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency_code}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Destination account</label>
            <select className={inputClass} value={destinationAccountId} onChange={event => {
              setDestinationAccountId(event.target.value);
              setIdempotencyKey(makeKey());
            }} disabled={loadingAccounts || destinationAccounts.length === 0}>
              <option value="">Select destination account</option>
              {destinationAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency_code}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Transfer date</label>
            <input className={inputClass} type="date" value={transactionDate} onChange={event => setTransactionDate(event.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Amount ({sourceAccount?.currency_code || 'account currency'})</label>
            <input className={inputClass} type="number" min="0.0001" step="0.0001" value={amount} onChange={event => setAmount(event.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Exchange rate to church base currency</label>
            <input className={inputClass} type="number" min="0.00000001" step="0.00000001" value={exchangeRate} onChange={event => setExchangeRate(event.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>External reference (optional)</label>
            <input className={inputClass} value={externalReference} onChange={event => setExternalReference(event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Description</label>
            <input className={inputClass} value={description} onChange={event => setDescription(event.target.value)} placeholder="Reason for the internal transfer" required />
          </div>
        </div>
        {sourceAccount && destinationAccount && sourceAccount.currency_code !== destinationAccount.currency_code && (
          <p className="text-xs font-semibold text-rose-700">Cross-currency transfers are not supported in this release.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-xs text-slate-500">Cross-branch transfers also require active due-from asset and due-to liability clearing-account setup in both branches.</p>
          <button type="submit" disabled={!canCreate || submitting || loadingAccounts || !sourceAccount || !destinationAccount}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white hover:bg-slate-700 disabled:opacity-50">
            <Send size={15} /> {submitting ? 'Submitting…' : 'Submit transfer'}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-900">Transfers involving this branch</h3>
            <p className="mt-1 text-xs text-slate-500">Incoming and outgoing transfers are visible to authorized users in either affected branch.</p>
          </div>
          <button type="button" onClick={() => void reloadTransfers()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        {loading ? <p className="text-sm text-slate-500">Loading transfers…</p> : transfers.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No internal transfers have been recorded for this branch.</p>
        ) : (
          <div className="space-y-3">
            {transfers.map(transfer => {
              const sourceName = availableBranches.find(item => item.scope_id === transfer.source_branch_id)?.scope_name || transfer.source_branch_id;
              const destinationName = availableBranches.find(item => item.scope_id === transfer.destination_branch_id)?.scope_name || transfer.destination_branch_id;
              const sourceStep = transfer.source_actor_approval_step_id || null;
              const destinationStep = transfer.destination_actor_approval_step_id || null;
              const busy = actingOnTransfer === transfer.id;
              return (
                <article key={transfer.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-slate-900">Transfer #{transfer.transfer_number}</p>
                      <p className="mt-1 text-xs text-slate-500">{transfer.transaction_date} · {sourceName} → {destinationName}</p>
                      <p className="mt-1 text-sm text-slate-700">{transfer.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900">{money(transfer)}</p>
                      <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">{transfer.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                  {transfer.status === 'pending_approval' && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      {sourceStep && <div className="flex gap-2">
                        <button type="button" disabled={busy} onClick={() => void decide(transfer, sourceStep, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approve sending branch</button>
                        <button type="button" disabled={busy} onClick={() => void decide(transfer, sourceStep, 'rejected')} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Reject</button>
                      </div>}
                      {destinationStep && <div className="flex gap-2">
                        <button type="button" disabled={busy} onClick={() => void decide(transfer, destinationStep, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approve receiving branch</button>
                        <button type="button" disabled={busy} onClick={() => void decide(transfer, destinationStep, 'rejected')} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Reject</button>
                      </div>}
                    </div>
                  )}
                  {transfer.status === 'approved' && (
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck size={14} /> Approval complete</span>
                      <button type="button" disabled={busy} onClick={() => void post(transfer)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                        {busy ? 'Posting…' : 'Post transfer atomically'}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

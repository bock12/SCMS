import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ReceiptText, Wallet } from 'lucide-react';
import { financeSupabase } from './financeSupabaseClient';
import { getFinanceConfiguration, getFinanceScopeTransactionOptions, type FinanceConfiguration, type FinanceOwnershipScope } from './financeConfigurationService';
import { createFinancialDocumentTransaction, createScopedFinancialDocumentTransaction, type FinancialDocumentTransactionResult, type FinancialPaymentMethod } from './financeTransactionService';

interface FinanceTransactionEntryWorkspaceProps {
  branchId: string | null;
  scope?: FinanceOwnershipScope;
  requestedEntryType?: { type: 'receipt' | 'payment'; nonce: number } | null;
}

interface MemberOption {
  id: string;
  label: string;
}

type EntryType = 'receipt' | 'payment';

const emptyConfiguration = (): FinanceConfiguration => ({
  currencies: [], baseCurrencyCode: null, chartAccounts: [], financialAccounts: [], funds: [],
  financialYears: [], periods: [], approvalPolicies: [], approvalPolicyBands: [], approvalPolicySteps: []
});

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800';
const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500';

export const FinanceTransactionEntryWorkspace: React.FC<FinanceTransactionEntryWorkspaceProps> = ({ branchId, scope, requestedEntryType }) => {
  const [configuration, setConfiguration] = useState<FinanceConfiguration>(emptyConfiguration);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const [entryType, setEntryType] = useState<EntryType>(requestedEntryType?.type ?? 'receipt');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [partyName, setPartyName] = useState('');
  const [profileId, setProfileId] = useState('');
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [categoryAccountId, setCategoryAccountId] = useState('');
  const [fundId, setFundId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FinancialPaymentMethod>('cash');
  const [externalReference, setExternalReference] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<FinancialDocumentTransactionResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const changeField = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (value: T) => {
    setIdempotencyKey(crypto.randomUUID());
    setter(value);
  };

  const effectiveBranchId = scope ? (scope.type === 'branch' ? scope.id : null) : branchId;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [configResult, memberResult, districtBranchesResult] = await Promise.all([
      scope ? getFinanceScopeTransactionOptions(scope) : getFinanceConfiguration(branchId),
      financeSupabase.from('profiles').select('id,first_name,last_name,status,branch_id').order('first_name', { ascending: true }),
      scope?.type === 'district'
        ? financeSupabase.from('church_branches').select('id').eq('district_id', scope.id)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (configResult.error) {
      setError(configResult.error.message);
    } else {
      const next = { ...emptyConfiguration(), ...(configResult.data || {}) };
      setConfiguration(next);
      setCurrencyCode(current => (current && next.currencies.includes(current)) ? current : (next.baseCurrencyCode || next.currencies[0] || ''));
    }
    if (!memberResult.error) {
      const districtBranchIds = new Set(
        ((districtBranchesResult?.data || []) as Array<{ id: string }>).map(item => item.id)
      );
      setMembers((memberResult.data || [])
        .filter((person: any) => {
          if (person.status === 'suspended' || person.status === 'archived') return false;
          if (scope?.type === 'church') return true;
          if (scope?.type === 'district') return !person.branch_id || districtBranchIds.has(person.branch_id);
          return !effectiveBranchId || !person.branch_id || person.branch_id === effectiveBranchId;
        })
        .map((person: any) => ({
          id: person.id,
          label: [person.first_name, person.last_name].filter(Boolean).join(' ') || person.id
        })));
    }
    setLoading(false);
  }, [branchId, effectiveBranchId, scope?.type, scope?.id]);

  useEffect(() => {
    setCreated(null);
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
    void reload();
  }, [reload]);

  useEffect(() => {
    const handleConfigUpdated = () => { void reload(); };
    window.addEventListener('finance_configuration_updated', handleConfigUpdated);
    return () => window.removeEventListener('finance_configuration_updated', handleConfigUpdated);
  }, [reload]);

  useEffect(() => {
    if (!requestedEntryType) return;
    setEntryType(requestedEntryType.type);
    setCreated(null);
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
  }, [requestedEntryType?.nonce, requestedEntryType?.type]);

  const isAccountInScope = (account: FinanceConfiguration['financialAccounts'][number]) => {
    if (!account.is_active) return false;
    if (scope?.type === 'church') return account.branch_id === null && !account.district_id;
    if (scope?.type === 'district') return account.branch_id === null && (!account.district_id || account.district_id === scope.id);
    return account.branch_id === null || account.branch_id === effectiveBranchId;
  };

  const accountsForCurrency = useMemo(() => configuration.financialAccounts.filter(account =>
    account.currency_code === currencyCode && isAccountInScope(account)
  ), [configuration.financialAccounts, currencyCode, effectiveBranchId, scope?.type, scope?.id]);

  const categoryAccounts = useMemo(() => configuration.chartAccounts.filter(account =>
    account.is_active && !account.is_control_account &&
    account.account_type === (entryType === 'receipt' ? 'income' : 'expense')
  ), [configuration.chartAccounts, entryType]);

  useEffect(() => {
    if (!accountsForCurrency.some(account => account.id === financialAccountId)) {
      setFinancialAccountId(accountsForCurrency[0]?.id || '');
    }
  }, [accountsForCurrency, financialAccountId]);

  useEffect(() => {
    if (!categoryAccounts.some(account => account.id === categoryAccountId)) {
      setCategoryAccountId(categoryAccounts[0]?.id || '');
    }
  }, [categoryAccounts, categoryAccountId]);

  useEffect(() => {
    if (currencyCode && currencyCode === configuration.baseCurrencyCode) setExchangeRate('1');
  }, [currencyCode, configuration.baseCurrencyCode]);

  const isValidIsoDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitInFlightRef.current) return;
    setError(null);
    setCreated(null);
    if (!scope && !branchId) {
      setError('The active profile is not assigned to a branch. A branch is required for transaction entry.');
      return;
    }
    const parsedAmount = Number(amount);
    const parsedRate = Number(exchangeRate);
    if (!isValidIsoDate(transactionDate)) {
      setError('Enter a valid transaction date in YYYY-MM-DD format.');
      return;
    }
    if (!partyName.trim() || !description.trim() || !currencyCode ||
        !financialAccountId || !categoryAccountId ||
        !Number.isFinite(parsedAmount) || parsedAmount <= 0 ||
        !Number.isFinite(parsedRate) || parsedRate <= 0) {
      setError('Complete all required fields and enter a positive amount and exchange rate.');
      return;
    }
    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      const result = scope
        ? await createScopedFinancialDocumentTransaction({
            scope,
            documentType: entryType,
            transactionDate,
            profileId: profileId || null,
            partyName,
            amount: parsedAmount,
            currencyCode,
            paymentMethod,
            financialAccountId,
            categoryAccountId,
            fundId: fundId || null,
            externalReference,
            description,
            exchangeRateToBase: parsedRate,
            idempotencyKey
          })
        : await createFinancialDocumentTransaction({
            documentType: entryType,
            transactionDate,
            branchId: branchId!,
            profileId: profileId || null,
            partyName,
            amount: parsedAmount,
            currencyCode,
            paymentMethod,
            financialAccountId,
            categoryAccountId,
            fundId: fundId || null,
            externalReference,
            description,
            exchangeRateToBase: parsedRate,
            idempotencyKey
          });
      if (result.error) {
        setError(result.error.message || 'The transaction could not be created.');
      } else if (!result.data) {
        setError('The transaction service returned no document confirmation.');
      } else {
        setCreated(result.data);
        setIdempotencyKey(crypto.randomUUID());
        setAmount('');
        setExternalReference('');
        setDescription('');
        window.dispatchEvent(new Event('finance_documents_updated'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The transaction could not be created.');
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading transaction-entry configuration…</div>;

  const today = new Date().toISOString().slice(0, 10);
  const hasOpenPeriodForDate = configuration.periods.some(period =>
    period.status === 'open' && period.year_status === 'open' &&
    transactionDate >= period.start_date && transactionDate <= period.end_date
  );
  const applicablePolicies = configuration.approvalPolicies
    .filter(policy => {
      if (!policy.is_active || policy.transaction_type !== 'financial_document') return false;
      if (policy.effective_from > today || (policy.effective_to && policy.effective_to < today)) return false;
      if (scope?.type === 'church') return policy.branch_id === null && !policy.district_id;
      if (scope?.type === 'district') return policy.branch_id === null && (!policy.district_id || policy.district_id === scope.id);
      return policy.branch_id === null || policy.branch_id === effectiveBranchId;
    })
    .sort((a, b) => {
      const rank = (item: typeof a) => item.branch_id !== null ? 2 : item.district_id ? 1 : 0;
      return rank(b) - rank(a) || b.version - a.version;
    });
  const selectedPolicy = applicablePolicies[0];
  const enteredBaseAmount = Number(amount) * Number(exchangeRate);
  const hasApprovalBand = Boolean(selectedPolicy && configuration.approvalPolicyBands.some(band =>
    band.policy_id === selectedPolicy.id &&
    (enteredBaseAmount <= 0 || (enteredBaseAmount >= band.min_amount_base &&
      (band.max_amount_base === null || enteredBaseAmount < band.max_amount_base)))
  ));
  const missingSetupReasons: string[] = [];
  if (!configuration.currencies.length) missingSetupReasons.push('supported currencies');
  if (!configuration.financialAccounts.some(isAccountInScope)) missingSetupReasons.push('an active scope-compatible financial account');
  if (!configuration.chartAccounts.some(account => account.is_active && account.account_type === 'income')) missingSetupReasons.push('an active income chart account');
  if (!configuration.chartAccounts.some(account => account.is_active && account.account_type === 'expense')) missingSetupReasons.push('an active expense chart account');
  if (!hasOpenPeriodForDate) missingSetupReasons.push(`an open financial period covering ${transactionDate || 'the transaction date'}`);
  if (!hasApprovalBand) missingSetupReasons.push('an active financial-document approval policy band covering this amount');
  const noSetup = missingSetupReasons.length > 0;

  const scopeBadgeLabel = scope
    ? (scope.type === 'church' ? 'Church-wide scope' : scope.type === 'district' ? 'District scope' : 'Branch scope')
    : 'Branch scope';

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-lg font-black text-slate-900"><ReceiptText size={19} /> Receipt & payment entry</h3>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">{scopeBadgeLabel}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Create a financial document and balanced draft journal through the secure transaction workflow.</p>
        </div>
        <button type="button" onClick={() => void reload()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Refresh setup</button>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={17} />{error}</div>}
      {created && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <div className="flex items-center gap-2 font-bold"><CheckCircle2 size={17} /> Financial document created — {created.status === 'approved' ? 'approved' : created.status.replace('_', ' ')}</div>
        <p className="mt-1 text-xs">Document number: <strong>{entryType === 'receipt' ? 'REC' : 'PAY'}-{String(created.document_number).padStart(6, '0')}</strong> · Approval: <strong>{created.approval_request_id || (created.status === 'approved' ? 'Auto-approved (zero-step policy)' : 'Pending')}</strong> · Status: <strong>{created.status}</strong></p>
        <p className="mt-1 text-xs">{created.status === 'approved' ? 'The draft journal is linked and may be posted explicitly from the Journal Register.' : 'The draft journal is not yet a posted ledger entry. It becomes eligible for posting only after approval.'}</p>
      </div>}

      {noSetup && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Configure {missingSetupReasons.join(', ')} before submitting.
      </div>}

      <div className="flex gap-2">
        <button type="button" onClick={() => { changeField(setEntryType)('receipt'); setCreated(null); setError(null); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${entryType === 'receipt' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}><ReceiptText size={15} className="mr-1 inline" /> Receipt</button>
        <button type="button" onClick={() => { changeField(setEntryType)('payment'); setCreated(null); setError(null); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${entryType === 'payment' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Wallet size={15} className="mr-1 inline" /> Payment</button>
      </div>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div><label className={labelClass}>Transaction date *</label><input className={inputClass} type="date" required value={transactionDate} onChange={e => changeField(setTransactionDate)(e.target.value)} /></div>
        <div><label className={labelClass}>{entryType === 'receipt' ? 'Received from *' : 'Paid to *'}</label><input className={inputClass} required value={partyName} onChange={e => { changeField(setPartyName)(e.target.value); changeField(setProfileId)(''); }} placeholder="Person or organisation" /></div>
        <div><label className={labelClass}>Link member (optional)</label><select className={inputClass} value={profileId} onChange={e => { changeField(setProfileId)(e.target.value); const person = members.find(item => item.id === e.target.value); if (person) setPartyName(person.label); }}><option value="">No member link</option>{members.map(person => <option key={person.id} value={person.id}>{person.label}</option>)}</select></div>
        <div><label className={labelClass}>Amount *</label><input className={inputClass} type="number" min="0.01" step="0.01" required value={amount} onChange={e => changeField(setAmount)(e.target.value)} /></div>
        <div><label className={labelClass}>Currency *</label><select className={inputClass} required value={currencyCode} onChange={e => changeField(setCurrencyCode)(e.target.value)}><option value="">Select currency</option>{configuration.currencies.map(code => <option key={code} value={code}>{code}</option>)}</select></div>
        <div><label className={labelClass}>Exchange rate to {configuration.baseCurrencyCode || 'base'} *</label><input className={inputClass} type="number" min="0.000001" step="0.000001" required value={exchangeRate} onChange={e => changeField(setExchangeRate)(e.target.value)} disabled={currencyCode === configuration.baseCurrencyCode} /></div>
        <div><label className={labelClass}>Financial account *</label><select className={inputClass} required value={financialAccountId} onChange={e => changeField(setFinancialAccountId)(e.target.value)}><option value="">Select account</option>{accountsForCurrency.map(account => <option key={account.id} value={account.id}>{account.name} · {account.account_type}</option>)}</select></div>
        <div><label className={labelClass}>{entryType === 'receipt' ? 'Income account *' : 'Expense account *'}</label><select className={inputClass} required value={categoryAccountId} onChange={e => changeField(setCategoryAccountId)(e.target.value)}><option value="">Select chart account</option>{categoryAccounts.map(account => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></div>
        <div><label className={labelClass}>Fund (optional)</label><select className={inputClass} value={fundId} onChange={e => changeField(setFundId)(e.target.value)}><option value="">No fund</option>{configuration.funds.filter(fund => fund.is_active).map(fund => <option key={fund.id} value={fund.id}>{fund.code} — {fund.name}</option>)}</select></div>
        <div><label className={labelClass}>Payment method *</label><select className={inputClass} required value={paymentMethod} onChange={e => changeField(setPaymentMethod)(e.target.value as FinancialPaymentMethod)}>{(['cash','bank_transfer','mobile_money','card','cheque','other'] as FinancialPaymentMethod[]).map(method => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}</select></div>
        <div><label className={labelClass}>Reference</label><input className={inputClass} value={externalReference} onChange={e => changeField(setExternalReference)(e.target.value)} placeholder="Receipt / transfer reference" /></div>
        <div className="sm:col-span-2 lg:col-span-3"><label className={labelClass}>Description *</label><textarea className={inputClass} required rows={2} value={description} onChange={e => changeField(setDescription)(e.target.value)} placeholder="Purpose or details of this transaction" /></div>
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end"><button type="submit" disabled={submitting || noSetup || (!scope && !branchId)} className={`rounded-xl px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 ${entryType === 'receipt' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>{submitting ? 'Submitting…' : entryType === 'receipt' ? 'Create receipt' : 'Create payment'}</button></div>
      </form>
    </section>
  );
};

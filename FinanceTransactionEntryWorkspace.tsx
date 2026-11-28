import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ReceiptText, RefreshCw, Wallet } from 'lucide-react';
import { financeSupabase } from './financeSupabaseClient';
import {
  evaluateTransactionEntryReadiness,
  getFinanceConfiguration,
  getFinanceScopeTransactionOptions,
  isFinancialAccountInScope,
  type FinanceConfiguration,
  type FinanceOwnershipScope
} from './financeConfigurationService';
import {
  createFinancialDocumentTransaction,
  createScopedFinancialDocumentTransaction,
  type FinancialDocumentTransactionResult,
  type FinancialPaymentMethod
} from './financeTransactionService';

export interface RejectedTransactionPrefillDraft {
  nonce: number;
  sourceReference: string;
  rejectionReason?: string | null;
  documentType: 'receipt' | 'payment';
  transactionDate: string;
  partyName: string;
  profileId?: string | null;
  amount: number;
  currencyCode: string;
  paymentMethod: FinancialPaymentMethod;
  fundId?: string | null;
  externalReference?: string | null;
  description?: string | null;
}

interface FinanceTransactionEntryWorkspaceProps {
  branchId: string | null;
  scope?: FinanceOwnershipScope;
  requestedEntryType?: { type: 'receipt' | 'payment'; nonce: number } | null;
  prefillDraft?: RejectedTransactionPrefillDraft | null;
  onClearPrefill?: () => void;
  onOpenAccountingSetup?: (target?: 'church' | 'current') => void;
  canOpenChurchScopeSetup?: boolean;
  onOpenDocumentsTab?: () => void;
}

interface MemberOption {
  id: string;
  label: string;
}

type EntryType = 'receipt' | 'payment';

const emptyConfiguration = (): FinanceConfiguration => ({
  currencies: [],
  baseCurrencyCode: null,
  chartAccounts: [],
  financialAccounts: [],
  funds: [],
  financialYears: [],
  periods: [],
  approvalPolicies: [],
  approvalPolicyBands: [],
  approvalPolicySteps: []
});

const inputClass =
  'w-full min-h-[44px] sm:min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-500';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600';

export const FinanceTransactionEntryWorkspace: React.FC<FinanceTransactionEntryWorkspaceProps> = ({
  branchId,
  scope,
  requestedEntryType,
  prefillDraft,
  onClearPrefill,
  onOpenAccountingSetup,
  canOpenChurchScopeSetup = false,
  onOpenDocumentsTab
}) => {
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
      financeSupabase
        .from('profiles')
        .select('id,first_name,last_name,status,branch_id')
        .order('first_name', { ascending: true }),
      scope?.type === 'district'
        ? financeSupabase.from('church_branches').select('id').eq('district_id', scope.id)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (configResult.error) {
      setError(configResult.error.message);
    } else {
      const next = { ...emptyConfiguration(), ...(configResult.data || {}) };
      setConfiguration(next);
      setCurrencyCode(current =>
        current && next.currencies.includes(current) ? current : next.baseCurrencyCode || next.currencies[0] || ''
      );
    }
    if (!memberResult.error) {
      const districtBranchIds = new Set(
        ((districtBranchesResult?.data || []) as Array<{ id: string }>).map(item => item.id)
      );
      setMembers(
        (memberResult.data || [])
          .filter((person: any) => {
            if (person.status === 'suspended' || person.status === 'archived') return false;
            if (scope?.type === 'church') return true;
            if (scope?.type === 'district') return !person.branch_id || districtBranchIds.has(person.branch_id);
            return !effectiveBranchId || !person.branch_id || person.branch_id === effectiveBranchId;
          })
          .map((person: any) => ({
            id: person.id,
            label: [person.first_name, person.last_name].filter(Boolean).join(' ') || person.id
          }))
      );
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
    const handleConfigUpdated = () => {
      void reload();
    };
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

  useEffect(() => {
    if (!prefillDraft) return;
    setEntryType(prefillDraft.documentType);
    setTransactionDate(prefillDraft.transactionDate || new Date().toISOString().slice(0, 10));
    setPartyName(prefillDraft.partyName || '');
    setProfileId(prefillDraft.profileId || '');
    setAmount(prefillDraft.amount > 0 ? String(prefillDraft.amount) : '');
    if (prefillDraft.currencyCode) {
      setCurrencyCode(prefillDraft.currencyCode);
    }
    setPaymentMethod(prefillDraft.paymentMethod || 'cash');
    setFundId(prefillDraft.fundId || '');
    setExternalReference(prefillDraft.externalReference || '');
    setDescription(prefillDraft.description || '');
    setCreated(null);
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
  }, [prefillDraft?.nonce]);

  const accountsForCurrency = useMemo(
    () =>
      configuration.financialAccounts.filter(
        account =>
          account.is_active &&
          account.currency_code === currencyCode &&
          isFinancialAccountInScope(account, { scope, effectiveBranchId })
      ),
    [configuration.financialAccounts, currencyCode, effectiveBranchId, scope?.type, scope?.id]
  );

  const categoryAccounts = useMemo(
    () =>
      configuration.chartAccounts.filter(
        account =>
          account.is_active &&
          !account.is_control_account &&
          account.account_type === (entryType === 'receipt' ? 'income' : 'expense')
      ),
    [configuration.chartAccounts, entryType]
  );

  const activeFunds = useMemo(
    () => configuration.funds.filter(fund => fund.is_active),
    [configuration.funds]
  );

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
    if (fundId && !activeFunds.some(fund => fund.id === fundId)) {
      setFundId('');
    }
  }, [activeFunds, fundId]);

  useEffect(() => {
    if (currencyCode && currencyCode === configuration.baseCurrencyCode) setExchangeRate('1');
  }, [currencyCode, configuration.baseCurrencyCode]);

  const isValidIsoDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
  };

  const baseEquivalentPreview = useMemo(() => {
    if (!currencyCode || !configuration.baseCurrencyCode || currencyCode === configuration.baseCurrencyCode) {
      return null;
    }
    const parsedAmount = Number(amount);
    const parsedRate = Number(exchangeRate);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !Number.isFinite(parsedRate) || parsedRate <= 0) {
      return null;
    }
    return parsedAmount * parsedRate;
  }, [amount, exchangeRate, currencyCode, configuration.baseCurrencyCode]);

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
    if (
      !partyName.trim() ||
      !description.trim() ||
      !currencyCode ||
      !financialAccountId ||
      !categoryAccountId ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      !Number.isFinite(parsedRate) ||
      parsedRate <= 0
    ) {
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
        onClearPrefill?.();
        window.dispatchEvent(new Event('finance_documents_updated'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The transaction could not be created.');
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Loading transaction-entry configuration…
      </div>
    );
  }

  const readiness = evaluateTransactionEntryReadiness(configuration, {
    scope,
    effectiveBranchId,
    transactionDate,
    amount,
    exchangeRate
  });
  const noSetup = !readiness.ready;

  const scopeBadgeLabel = scope
    ? scope.type === 'church'
      ? 'Church-wide scope'
      : scope.type === 'district'
        ? 'District scope'
        : 'Branch scope'
    : 'Branch scope';

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900">
              <ReceiptText size={19} className="text-slate-700" />
              Receipt &amp; payment entry
            </h3>
            <span className="text-xs font-semibold text-slate-500">· {scopeBadgeLabel}</span>
            {configuration.baseCurrencyCode && (
              <span className="text-xs font-medium text-slate-500">
                · Base currency <strong className="font-mono text-slate-700">{configuration.baseCurrencyCode}</strong>
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Create a canonical financial document and balanced draft journal through the governed approval workflow.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw size={14} />
          Refresh setup
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800">
          <AlertCircle size={17} className="mt-0.5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {created && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 size={17} className="shrink-0 text-emerald-700" />
              Financial document created — {created.status === 'approved' ? 'approved' : created.status.replace('_', ' ')}
            </div>
            {onOpenDocumentsTab && (
              <button
                type="button"
                onClick={onOpenDocumentsTab}
                className="inline-flex min-h-[32px] items-center whitespace-nowrap rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-bold text-emerald-900 hover:bg-emerald-100 shrink-0 cursor-pointer"
              >
                Open Documents &amp; Approvals &rarr;
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-emerald-800">
            Document number:{' '}
            <strong className="font-mono">
              {entryType === 'receipt' ? 'REC' : 'PAY'}-{String(created.document_number).padStart(6, '0')}
            </strong>{' '}
            · Approval:{' '}
            <strong>
              {created.approval_request_id ||
                (created.status === 'approved' ? 'Auto-approved (zero-step policy)' : 'Pending')}
            </strong>{' '}
            · Status: <strong>{created.status}</strong>
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            {created.status === 'approved'
              ? 'The draft journal is linked and may be posted explicitly from the Journal Register.'
              : 'The draft journal is not yet a posted ledger entry. It becomes eligible for posting only after approval.'}
          </p>
        </div>
      )}

      {noSetup && (
        <div role="status" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">
            Configure {readiness.missingReasons.join(', ')} before submitting.
          </p>
          <div className="grid gap-3 text-xs text-amber-900 sm:grid-cols-2">
            {readiness.churchWideMissing.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-white p-3">
                <div className="font-bold text-slate-900">Church-wide accounting setup required</div>
                <ul className="list-disc space-y-1 pl-4">
                  {readiness.churchWideMissing.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {onOpenAccountingSetup && (scope?.type === 'church' || canOpenChurchScopeSetup) && (
                  <button
                    type="button"
                    onClick={() => onOpenAccountingSetup(scope?.type === 'church' ? 'current' : 'church')}
                    className="mt-1 inline-flex min-h-[36px] items-center whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shrink-0 cursor-pointer"
                  >
                    {scope?.type === 'church' ? 'Open Accounting Setup' : 'Open Church-wide Setup'}
                  </button>
                )}
              </div>
            )}
            {readiness.scopeSpecificMissing.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-white p-3">
                <div className="font-bold text-slate-900">{scopeBadgeLabel} setup required</div>
                <ul className="list-disc space-y-1 pl-4">
                  {readiness.scopeSpecificMissing.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {onOpenAccountingSetup && (
                  <button
                    type="button"
                    onClick={() => onOpenAccountingSetup('current')}
                    className="mt-1 inline-flex min-h-[36px] items-center whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shrink-0 cursor-pointer"
                  >
                    Open Accounting Setup
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {prefillDraft && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="font-bold">
              Resubmitting corrected details from rejected {prefillDraft.sourceReference}
            </p>
            {prefillDraft.rejectionReason && (
              <p className="text-amber-900">
                Rejection reason: <span className="font-semibold">{prefillDraft.rejectionReason}</span>
              </p>
            )}
          </div>
          {onClearPrefill && (
            <button
              type="button"
              onClick={onClearPrefill}
              className="inline-flex min-h-[32px] items-center justify-center rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 shrink-0 cursor-pointer"
            >
              Dismiss note
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-100 p-1 sm:w-auto">
          <button
            type="button"
            onClick={() => {
              changeField(setEntryType)('receipt');
              setCreated(null);
              setError(null);
            }}
            className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition-colors sm:flex-initial shrink-0 cursor-pointer ${
              entryType === 'receipt' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <ReceiptText size={15} />
            Receipt
          </button>
          <button
            type="button"
            onClick={() => {
              changeField(setEntryType)('payment');
              setCreated(null);
              setError(null);
            }}
            className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition-colors sm:flex-initial shrink-0 cursor-pointer ${
              entryType === 'payment' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <Wallet size={15} />
            Payment
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {entryType === 'receipt'
            ? 'Credits selected income account and debits the target cash/bank account.'
            : 'Debits selected expense account and credits the source cash/bank account.'}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="tx-date" className={labelClass}>Transaction date *</label>
            <input
              id="tx-date"
              className={inputClass}
              type="date"
              required
              value={transactionDate}
              onChange={e => changeField(setTransactionDate)(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tx-party" className={labelClass}>
              {entryType === 'receipt' ? 'Received from *' : 'Paid to *'}
            </label>
            <input
              id="tx-party"
              className={inputClass}
              required
              value={partyName}
              onChange={e => {
                changeField(setPartyName)(e.target.value);
                changeField(setProfileId)('');
              }}
              placeholder="Person or organisation"
            />
          </div>
          <div>
            <label htmlFor="tx-member" className={labelClass}>Link member (optional)</label>
            <select
              id="tx-member"
              className={inputClass}
              value={profileId}
              onChange={e => {
                changeField(setProfileId)(e.target.value);
                const person = members.find(item => item.id === e.target.value);
                if (person) setPartyName(person.label);
              }}
            >
              <option value="">No member link</option>
              {members.map(person => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tx-amount" className={labelClass}>Amount *</label>
            <input
              id="tx-amount"
              className={`${inputClass} tabular-nums font-semibold`}
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="0.00"
              value={amount}
              onChange={e => changeField(setAmount)(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tx-currency" className={labelClass}>Currency *</label>
            <select
              id="tx-currency"
              className={inputClass}
              required
              value={currencyCode}
              onChange={e => changeField(setCurrencyCode)(e.target.value)}
            >
              <option value="">Select currency</option>
              {configuration.currencies.map(code => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tx-rate" className={labelClass}>
              Exchange rate to {configuration.baseCurrencyCode || 'base'} *
            </label>
            <input
              id="tx-rate"
              className={`${inputClass} tabular-nums`}
              type="number"
              min="0.000001"
              step="0.000001"
              required
              value={exchangeRate}
              onChange={e => changeField(setExchangeRate)(e.target.value)}
              disabled={currencyCode === configuration.baseCurrencyCode}
            />
            {baseEquivalentPreview !== null && configuration.baseCurrencyCode && (
              <p className="mt-1 text-xs font-medium text-slate-500 tabular-nums">
                Base equivalent:{' '}
                <strong className="text-slate-800">
                  {configuration.baseCurrencyCode}{' '}
                  {baseEquivalentPreview.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </strong>
              </p>
            )}
          </div>

          <div>
            <label htmlFor="tx-fin-account" className={labelClass}>Financial account *</label>
            <select
              id="tx-fin-account"
              className={inputClass}
              required
              value={financialAccountId}
              onChange={e => changeField(setFinancialAccountId)(e.target.value)}
            >
              <option value="">Select account</option>
              {accountsForCurrency.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.account_type}
                </option>
              ))}
            </select>
            {currencyCode && accountsForCurrency.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">
                No active {currencyCode} financial account is configured in this scope.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="tx-category-account" className={labelClass}>
              {entryType === 'receipt' ? 'Income account *' : 'Expense account *'}
            </label>
            <select
              id="tx-category-account"
              className={inputClass}
              required
              value={categoryAccountId}
              onChange={e => changeField(setCategoryAccountId)(e.target.value)}
            >
              <option value="">Select chart account</option>
              {categoryAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.code} — {account.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tx-fund" className={labelClass}>Fund (optional)</label>
            <select
              id="tx-fund"
              className={inputClass}
              value={fundId}
              onChange={e => changeField(setFundId)(e.target.value)}
            >
              <option value="">No fund</option>
              {activeFunds.map(fund => (
                <option key={fund.id} value={fund.id}>
                  {fund.code} — {fund.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tx-method" className={labelClass}>Payment method *</label>
            <select
              id="tx-method"
              className={inputClass}
              required
              value={paymentMethod}
              onChange={e => changeField(setPaymentMethod)(e.target.value as FinancialPaymentMethod)}
            >
              {(['cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other'] as FinancialPaymentMethod[]).map(
                method => (
                  <option key={method} value={method}>
                    {method.replace('_', ' ')}
                  </option>
                )
              )}
            </select>
          </div>
          <div className="sm:col-span-1 lg:col-span-2">
            <label htmlFor="tx-ref" className={labelClass}>External reference</label>
            <input
              id="tx-ref"
              className={inputClass}
              value={externalReference}
              onChange={e => changeField(setExternalReference)(e.target.value)}
              placeholder="Receipt / transfer reference"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label htmlFor="tx-desc" className={labelClass}>Description *</label>
            <textarea
              id="tx-desc"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              required
              rows={2}
              value={description}
              onChange={e => changeField(setDescription)(e.target.value)}
              placeholder="Purpose or details of this transaction"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-500">
            Submits a balanced draft journal and initiates any configured approval policy band.
          </p>
          <button
            type="submit"
            disabled={submitting || noSetup || (!scope && !branchId)}
            className={`inline-flex min-h-[44px] sm:min-h-[40px] items-center justify-center whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-black text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 shrink-0 cursor-pointer ${
              entryType === 'receipt' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {submitting ? 'Submitting…' : entryType === 'receipt' ? 'Create receipt' : 'Create payment'}
          </button>
        </div>
      </form>
    </section>
  );
};

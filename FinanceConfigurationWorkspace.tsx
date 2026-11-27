import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, Save, RefreshCw } from 'lucide-react';
import { getFinanceConfiguration, getFinanceScopeConfiguration, saveFinanceConfiguration, saveFinanceScopeResources, saveFinanceScopeApprovalPolicies, getRequisitionApprovalConfiguration, saveRequisitionApprovalPolicy, type FinanceConfiguration, type FinanceOwnershipScope, type RequisitionApprovalConfiguration } from './financeConfigurationService';
import { getFinanceBranchClearingAccounts, setFinanceBranchClearingAccounts } from './financeTransferService';

interface FinanceConfigurationWorkspaceProps {
  branchId: string | null;
  /** When supplied, use the exact church, district or branch ownership scope APIs. */
  scope?: FinanceOwnershipScope;
}

const emptyConfiguration = (): FinanceConfiguration => ({
  currencies: [], baseCurrencyCode: null, chartAccounts: [], financialAccounts: [], funds: [],
  financialYears: [], periods: [], approvalPolicies: [], approvalPolicyBands: [], approvalPolicySteps: []
});

const makeId = (_prefix: string) => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800';
const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500';
const buttonClass = 'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';

export const FinanceConfigurationWorkspace: React.FC<FinanceConfigurationWorkspaceProps> = ({ branchId, scope }) => {
  const [configuration, setConfiguration] = useState<FinanceConfiguration>(emptyConfiguration);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [currencyCode, setCurrencyCode] = useState('');
  const [chartCode, setChartCode] = useState('');
  const [chartName, setChartName] = useState('');
  const [chartType, setChartType] = useState<'asset' | 'liability' | 'equity' | 'income' | 'expense'>('asset');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'cash' | 'bank' | 'mobile_money' | 'clearing'>('cash');
  const [accountCurrency, setAccountCurrency] = useState('');
  const [accountChartId, setAccountChartId] = useState('');
  const [accountProvider, setAccountProvider] = useState('');
  const [accountReference, setAccountReference] = useState('');
  const [fundName, setFundName] = useState('');
  const [fundCode, setFundCode] = useState('');
  const [fundType, setFundType] = useState<'general' | 'designated' | 'restricted'>('general');
  const [yearNumber, setYearNumber] = useState(String(new Date().getFullYear()));
  const [periodName, setPeriodName] = useState('');
  const [periodYearId, setPeriodYearId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [policyType, setPolicyType] = useState<'financial_document' | 'budget' | 'financial_transfer'>('financial_document');
  const [policyName, setPolicyName] = useState('Financial Document Approval');
  const [policyBands, setPolicyBands] = useState<Array<{ min: string; max: string; steps: string[] }>>([
    { min: '0', max: '', steps: ['1'] }
  ]);
  const [requisitionConfiguration, setRequisitionConfiguration] = useState<RequisitionApprovalConfiguration>({ policies: [], bands: [], steps: [] });
  const [requisitionPolicyName, setRequisitionPolicyName] = useState('Department Requisition Approval');
  const [requisitionPolicyMin, setRequisitionPolicyMin] = useState('0');
  const [requisitionPolicyMax, setRequisitionPolicyMax] = useState('');
  const [requisitionSteps, setRequisitionSteps] = useState(['1', '1']);
  const [savingRequisitionPolicy, setSavingRequisitionPolicy] = useState(false);
  const [dueFromChartAccountId, setDueFromChartAccountId] = useState('');
  const [dueToChartAccountId, setDueToChartAccountId] = useState('');
  const [savingClearingAccounts, setSavingClearingAccounts] = useState(false);

  const assetAccounts = useMemo(
    () => configuration.chartAccounts.filter(account => account.account_type === 'asset' && account.is_active),
    [configuration.chartAccounts]
  );

  const reload = async () => {
    setLoading(true);
    setError(null);
    const effectiveBranchId = scope?.type === 'branch' ? scope.id : branchId;
    const configRequest = scope ? getFinanceScopeConfiguration(scope) : getFinanceConfiguration(branchId);
    const requisitionRequest = scope?.type === 'district'
      ? Promise.resolve({ data: { policies: [], bands: [], steps: [] }, error: null })
      : getRequisitionApprovalConfiguration(effectiveBranchId);
    const clearingRequest = scope?.type === 'branch'
      ? getFinanceBranchClearingAccounts(scope.id)
      : Promise.resolve({ data: null, error: null });
    const [configResult, requisitionResult, clearingResult] = await Promise.all([configRequest, requisitionRequest, clearingRequest]);
    if (configResult.error) setError(configResult.error.message);
    else setConfiguration({ ...emptyConfiguration(), ...(configResult.data || {}) });
    if (requisitionResult.error) setError(current => current || requisitionResult.error!.message);
    else setRequisitionConfiguration(requisitionResult.data || { policies: [], bands: [], steps: [] });
    if (clearingResult.error) setError(current => current || clearingResult.error!.message);
    else {
      setDueFromChartAccountId(clearingResult.data?.due_from_chart_account_id || '');
      setDueToChartAccountId(clearingResult.data?.due_to_chart_account_id || '');
    }
    setLoading(false);
  };

  useEffect(() => { void reload(); }, [branchId, scope?.type, scope?.id]);

  // SLE is the default operational account currency. Preserve an explicit valid
  // selection, but fall back to SLE (then the configured base currency) on load/scope change.
  useEffect(() => {
    setAccountCurrency(current => current && configuration.currencies.includes(current)
      ? current
      : configuration.currencies.includes('SLE')
        ? 'SLE'
        : configuration.baseCurrencyCode || configuration.currencies[0] || '');
  }, [configuration.currencies, configuration.baseCurrencyCode]);

  const update = (patch: Partial<FinanceConfiguration>) =>
    setConfiguration(current => ({ ...current, ...patch }));

  const addCurrency = () => {
    const code = currencyCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || configuration.currencies.includes(code)) return;
    update({ currencies: [...configuration.currencies, code], baseCurrencyCode: configuration.baseCurrencyCode || code });
    setCurrencyCode('');
  };

  const addChartAccount = () => {
    if (!chartCode.trim() || !chartName.trim()) return;
    const normalBalance = ['asset', 'expense'].includes(chartType) ? 'debit' : 'credit';
    update({ chartAccounts: [...configuration.chartAccounts, {
      id: makeId('chart'), code: chartCode.trim(), name: chartName.trim(), account_type: chartType,
      normal_balance: normalBalance, is_control_account: false, is_system: false, is_active: true
    }] });
    setChartCode(''); setChartName('');
  };

  const queueStandardOperationalAccounts = () => {
    setError(null);
    setNotice(null);
    if (!configuration.currencies.includes('SLE')) {
      setError('SLE is not available in the active currency list. Add or activate SLE before creating operational accounts.');
      return;
    }

    const standardAccounts = [
      { account_type: 'cash' as const, name: 'Cash on Hand', chartCode: '1010' },
      { account_type: 'bank' as const, name: 'Bank Account', chartCode: '1020' },
      { account_type: 'mobile_money' as const, name: 'Mobile-Money Account', chartCode: '1030' }
    ];
    const queuedTypes = new Set(configuration.financialAccounts
      .filter(account => account.is_active && account.currency_code === 'SLE' &&
        (scope?.type === 'branch'
          ? account.branch_id === scope.id && !account.district_id
          : scope?.type === 'district'
            ? account.branch_id === null && account.district_id === scope.id
            : scope?.type === 'church'
              ? account.branch_id === null && !account.district_id
              : account.branch_id === branchId && !account.district_id))
      .map(account => account.account_type));
    const missing = standardAccounts.filter(account => !queuedTypes.has(account.account_type));
    if (missing.length === 0) {
      setNotice('All three standard SLE operational account types are already configured in this scope.');
      return;
    }

    const unresolved = missing.filter(account => !configuration.chartAccounts.some(chart =>
      chart.code === account.chartCode && chart.account_type === 'asset' &&
      chart.is_active && !chart.is_control_account
    ));
    if (unresolved.length) {
      setError(`Cannot add standard accounts until these active non-control asset chart accounts are available: ${unresolved.map(item => item.chartCode).join(', ')}.`);
      return;
    }

    const queued = missing.map(account => {
      const chart = configuration.chartAccounts.find(item =>
        item.code === account.chartCode && item.account_type === 'asset' &&
        item.is_active && !item.is_control_account
      )!;
      return {
        id: makeId('fin-account'),
        chart_account_id: chart.id,
        branch_id: scope ? (scope.type === 'branch' ? scope.id : null) : branchId,
        district_id: scope?.type === 'district' ? scope.id : null,
        name: account.name,
        account_type: account.account_type,
        currency_code: 'SLE',
        provider_name: null,
        account_reference: null,
        is_active: true
      };
    });

    update({ financialAccounts: [...configuration.financialAccounts, ...queued] });
    setAccountCurrency('SLE');
    setNotice(`Queued ${queued.length} standard SLE operational account(s). Click Save configuration to persist them to this scope.`);
  };

  const addFinancialAccount = () => {
    if (!accountName.trim() || !accountCurrency || !accountChartId) return;
    update({ financialAccounts: [...configuration.financialAccounts, {
      id: makeId('fin-account'), chart_account_id: accountChartId,
      branch_id: scope ? (scope.type === 'branch' ? scope.id : null) : branchId,
      district_id: scope?.type === 'district' ? scope.id : null,
      name: accountName.trim(), account_type: accountType, currency_code: accountCurrency,
      provider_name: accountProvider.trim() || null,
      account_reference: accountReference.trim() || null,
      is_active: true
    }] });
    setAccountName(''); setAccountChartId(''); setAccountProvider(''); setAccountReference('');
  };

  const addFund = () => {
    if (!fundName.trim() || !fundCode.trim()) return;
    const isDefault = configuration.funds.length === 0;
    update({ funds: [...configuration.funds, {
      id: makeId('fund'), name: fundName.trim(), code: fundCode.trim().toUpperCase(),
      branch_id: scope ? (scope.type === 'branch' ? scope.id : null) : null,
      district_id: scope?.type === 'district' ? scope.id : null,
      fund_type: fundType, description: null, is_default: isDefault, is_active: true
    }] });
    setFundName(''); setFundCode('');
  };

  const addYear = () => {
    const year = Number(yearNumber);
    if (!Number.isInteger(year) || year < 1900 || year > 9998 ||
      configuration.financialYears.some(item => item.year_number === year)) return;
    const id = makeId('year');
    update({ financialYears: [...configuration.financialYears, {
      id, year_number: year, start_date: `${year}-01-01`, end_date: `${year}-12-31`, status: 'open'
    }] });
    setPeriodYearId(id);
    setPeriodName('Annual');
    setPeriodStart(`${year}-01-01`);
    setPeriodEnd(`${year}-12-31`);
  };

  const addPeriod = () => {
    if (!periodYearId || !periodName.trim() || !periodStart || !periodEnd || periodStart > periodEnd) return;
    update({ periods: [...configuration.periods, {
      id: makeId('period'), financial_year_id: periodYearId, name: periodName.trim(),
      start_date: periodStart, end_date: periodEnd, status: 'open'
    }] });
    setPeriodName('');
  };

  const addPolicyBand = () => {
    setPolicyBands(current => {
      const lastMax = current[current.length - 1]?.max.trim() || '0';
      return [...current, { min: lastMax, max: '', steps: ['1'] }];
    });
  };

  const removePolicyBand = (bandIndex: number) => {
    setPolicyBands(current => current.length > 1 ? current.filter((_, index) => index !== bandIndex) : current);
  };

  const updatePolicyBandField = (bandIndex: number, field: 'min' | 'max', value: string) => {
    setPolicyBands(current => current.map((band, index) => index === bandIndex ? { ...band, [field]: value } : band));
  };

  const addPolicyBandStep = (bandIndex: number) => {
    setPolicyBands(current => current.map((band, index) =>
      index === bandIndex ? { ...band, steps: [...band.steps, '1'] } : band));
  };

  const removePolicyBandStep = (bandIndex: number, stepIndex: number) => {
    setPolicyBands(current => current.map((band, index) =>
      index === bandIndex && band.steps.length > 1
        ? { ...band, steps: band.steps.filter((_, idx) => idx !== stepIndex) }
        : band));
  };

  const updatePolicyBandStep = (bandIndex: number, stepIndex: number, value: string) => {
    setPolicyBands(current => current.map((band, index) =>
      index === bandIndex
        ? { ...band, steps: band.steps.map((step, idx) => idx === stepIndex ? value : step) }
        : band));
  };

  const addApprovalPolicy = () => {
    setError(null);
    if (policyType === 'financial_transfer' && scope?.type !== 'branch') {
      setError('Internal financial-transfer approval policies must be configured for an individual branch.');
      return;
    }
    if (!policyName.trim() || policyBands.length === 0) {
      setError('Enter a policy name and at least one amount band.');
      return;
    }

    const parsedBands = policyBands.map(band => ({
      min: Number(band.min),
      max: band.max.trim() ? Number(band.max) : null,
      steps: band.steps.map(value => Number(value))
    }));

    for (const band of parsedBands) {
      if (!Number.isFinite(band.min) || band.min < 0 ||
          (band.max !== null && (!Number.isFinite(band.max) || band.max <= band.min))) {
        setError('Each approval band requires a non-negative minimum and a maximum greater than its minimum.');
        return;
      }
      if (band.steps.length === 0 || band.steps.some(count => !Number.isInteger(count) || count < 1)) {
        setError('Each approval band requires at least one step with a positive integer approval count.');
        return;
      }
    }

    const sortedBands = [...parsedBands].sort((a, b) => a.min - b.min);
    for (let index = 1; index < sortedBands.length; index++) {
      const prev = sortedBands[index - 1];
      const next = sortedBands[index];
      if (prev.max === null || next.min < prev.max) {
        setError('Approval policy amount bands cannot overlap.');
        return;
      }
    }

    const targetBranchId = scope ? (scope.type === 'branch' ? scope.id : null) : branchId;
    const targetDistrictId = scope?.type === 'district' ? scope.id : null;
    const nextVersion = Math.max(
      0,
      ...configuration.approvalPolicies
        .filter(item =>
          item.transaction_type === policyType &&
          (item.branch_id ?? null) === targetBranchId &&
          (item.district_id ?? null) === targetDistrictId
        )
        .map(item => Number(item.version) || 0)
    ) + 1;

    const policyId = makeId('policy');
    const createdBands = sortedBands.map(band => ({
      id: makeId('band'),
      policy_id: policyId,
      min_amount_base: band.min,
      max_amount_base: band.max,
      steps: band.steps
    }));

    update({
      approvalPolicies: [...configuration.approvalPolicies, {
        id: policyId,
        name: policyName.trim(),
        transaction_type: policyType,
        branch_id: targetBranchId,
        district_id: targetDistrictId,
        version: nextVersion,
        effective_from: new Date().toISOString().slice(0, 10),
        is_active: true
      }],
      approvalPolicyBands: [
        ...configuration.approvalPolicyBands,
        ...createdBands.map(({ id, policy_id, min_amount_base, max_amount_base }) => ({
          id, policy_id, min_amount_base, max_amount_base
        }))
      ],
      approvalPolicySteps: [
        ...configuration.approvalPolicySteps,
        ...createdBands.flatMap(band => band.steps.map((approvalCount, stepIndex) => ({
          id: makeId('approval-step'),
          band_id: band.id,
          step_number: stepIndex + 1,
          required_permission_key: 'approve_finances' as const,
          required_approvals: approvalCount,
          prohibit_submitter_approval: true
        })))
      ]
    });

    setPolicyName(policyType === 'budget' ? 'Event Budget Approval' : policyType === 'financial_transfer' ? 'Internal Transfer Approval' : 'Financial Document Approval');
    setPolicyBands([{ min: '0', max: '', steps: ['1'] }]);
  };

  const addRequisitionApprovalStep = () =>
    setRequisitionSteps(current => [...current, '1']);

  const saveRequisitionPolicy = async () => {
    const min = Number(requisitionPolicyMin);
    const max = requisitionPolicyMax.trim() ? Number(requisitionPolicyMax) : null;
    const steps = requisitionSteps.map((value, index) => ({
      step_number: index + 1,
      required_approvals: Number(value)
    }));
    if (!requisitionPolicyName.trim() || !Number.isFinite(min) || min < 0 ||
        (max !== null && (!Number.isFinite(max) || max <= min)) ||
        steps.some(step => !Number.isInteger(step.required_approvals) || step.required_approvals < 1)) {
      setError('Enter a valid requisition policy name, amount band and positive approval count for every step.');
      return;
    }

    setSavingRequisitionPolicy(true);
    setError(null);
    setNotice(null);
    const result = await saveRequisitionApprovalPolicy(branchId, requisitionPolicyName, min, max, steps);
    if (result.error) {
      setError(result.error.message);
    } else {
      const refreshed = await getRequisitionApprovalConfiguration(branchId);
      if (refreshed.error) setError(refreshed.error.message);
      else setRequisitionConfiguration(refreshed.data || { policies: [], bands: [], steps: [] });
      setNotice('Requisition approval policy saved. New requisitions will follow these ordered approval steps.');
      setRequisitionPolicyName('Department Requisition Approval');
      setRequisitionPolicyMin('0');
      setRequisitionPolicyMax('');
      setRequisitionSteps(['1', '1']);
    }
    setSavingRequisitionPolicy(false);
  };

  const saveClearingAccounts = async () => {
    if (scope?.type !== 'branch') return;
    if (!dueFromChartAccountId || !dueToChartAccountId || dueFromChartAccountId === dueToChartAccountId) {
      setError('Select distinct due-from asset and due-to liability chart accounts.');
      return;
    }
    setSavingClearingAccounts(true);
    setError(null);
    setNotice(null);
    const result = await setFinanceBranchClearingAccounts({
      branchId: scope.id,
      dueFromChartAccountId,
      dueToChartAccountId
    });
    if (result.error) setError(result.error.message);
    else {
      setNotice('Branch clearing accounts saved. Cross-branch transfers can now use these reciprocal accounts.');
      window.dispatchEvent(new Event('finance_configuration_updated'));
    }
    setSavingClearingAccounts(false);
  };

  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    if (scope && scope.type !== 'church') {
      const resources = await saveFinanceScopeResources(scope, configuration.financialAccounts, configuration.funds);
      if (resources.error) {
        setError(resources.error.message);
        setSaving(false);
        return;
      }
      const policies = await saveFinanceScopeApprovalPolicies(
        scope, configuration.approvalPolicies, configuration.approvalPolicyBands, configuration.approvalPolicySteps
      );
      if (policies.error) {
        setError(`Financial accounts and funds were saved, but approval policies were not saved: ${policies.error.message}`);
      } else {
        setNotice('Financial accounts, funds and approval policies saved to the selected organizational scope.');
        await reload();
        window.dispatchEvent(new Event('finance_configuration_updated'));
      }
    } else {
      const result = await saveFinanceConfiguration(configuration, scope?.type === 'church' ? null : branchId);
      if (result.error) setError(result.error.message);
      else {
        setNotice('Canonical finance configuration saved. Receipt and payment entry can now validate against this setup.');
        await reload();
        window.dispatchEvent(new Event('finance_configuration_updated'));
      }
    }
    setSaving(false);
  };

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading canonical finance configuration…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-black text-slate-900">Accounting configuration</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Configure the canonical accounting records used by secure receipt and payment creation. These settings are separate from legacy giving display preferences.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={buttonClass} onClick={() => void reload()}><RefreshCw size={14} /> Reload</button>
          <button type="button" className={buttonClass} onClick={() => void save()} disabled={saving}><Save size={14} /> {saving ? 'Saving…' : 'Save configuration'}</button>
        </div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={17} />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={17} />{notice}</div>}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
{scope && scope.type !== 'church' ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Currencies and the chart of accounts are church-wide settings. Manage them from the church finance scope.</div>
          ) : (
            <>
                    <h3 className="font-black text-slate-900">Currencies & base currency</h3>
          <div className="mt-3 flex gap-2">
            <input className={fieldClass} aria-label="Currency code" placeholder="e.g. SLE" value={currencyCode} onChange={e => setCurrencyCode(e.target.value)} />
            <button type="button" className={buttonClass} onClick={addCurrency}><Plus size={14} /> Add</button>
          </div>
          <label className={labelClass + ' mt-3'}>Church base currency</label>
          <select className={fieldClass} value={configuration.baseCurrencyCode || ''} onChange={e => update({ baseCurrencyCode: e.target.value || null })}>
            <option value="">Select base currency</option>
            {configuration.currencies.map(code => <option key={code} value={code}>{code}</option>)}
          </select>
          <div className="mt-3 flex flex-wrap gap-2">{configuration.currencies.map(code => <span key={code} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{code}</span>)}</div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-black text-slate-900">Funds</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input className={fieldClass} placeholder="Fund name" value={fundName} onChange={e => setFundName(e.target.value)} />
            <input className={fieldClass} placeholder="Fund code" value={fundCode} onChange={e => setFundCode(e.target.value)} />
            <select className={fieldClass} value={fundType} onChange={e => setFundType(e.target.value as typeof fundType)}>
              <option value="general">General</option><option value="designated">Designated</option><option value="restricted">Restricted</option>
            </select>
            <button type="button" className={buttonClass} onClick={addFund}><Plus size={14} /> Add fund</button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">{configuration.funds.map(fund => <li key={fund.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>{fund.code} — {fund.name}</span><span className="text-xs text-slate-500">{fund.is_active ? 'Active' : 'Inactive'}</span></li>)}</ul>
        </div>
      </section>

{(!scope || scope.type === 'church') && (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-black text-slate-900">Chart of accounts</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <input className={fieldClass} placeholder="Code (e.g. 1000)" value={chartCode} onChange={e => setChartCode(e.target.value)} />
          <input className={fieldClass} placeholder="Account name" value={chartName} onChange={e => setChartName(e.target.value)} />
          <select className={fieldClass} value={chartType} onChange={e => setChartType(e.target.value as typeof chartType)}>
            {['asset','liability','equity','income','expense'].map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          <button type="button" className={buttonClass} onClick={addChartAccount}><Plus size={14} /> Add account</button>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="py-2">Code</th><th>Name</th><th>Type</th><th>Status</th></tr></thead><tbody>
          {configuration.chartAccounts.map(account => <tr key={account.id} className="border-b border-slate-100"><td className="py-2 font-mono">{account.code}</td><td>{account.name}</td><td className="capitalize">{account.account_type}</td><td>{account.is_active ? 'Active' : 'Inactive'}</td></tr>)}
        </tbody></table></div>
      </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black text-slate-900">Financial accounts</h3>
          <button type="button" className={buttonClass} onClick={queueStandardOperationalAccounts}>
            <Plus size={14} /> Add standard SLE accounts
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Adds missing Cash on Hand, Bank Account and Mobile-Money Account records for this exact scope, mapped to chart accounts 1010, 1020 and 1030. Provider details are optional and can be added separately.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <input className={fieldClass} placeholder="Account name (e.g. Main Branch Cash)" value={accountName} onChange={e => setAccountName(e.target.value)} />
          <select className={fieldClass} value={accountType} onChange={e => setAccountType(e.target.value as typeof accountType)}>{['cash','bank','mobile_money','clearing'].map(type => <option key={type} value={type}>{type === 'mobile_money' ? 'Mobile money' : type === 'cash' ? 'Cash on hand' : type === 'bank' ? 'Bank account' : 'Clearing'}</option>)}</select>
          <select className={fieldClass} value={accountCurrency} onChange={e => setAccountCurrency(e.target.value)}><option value="">Currency</option>{configuration.currencies.map(code => <option key={code}>{code}</option>)}</select>
          <select className={fieldClass} value={accountChartId} onChange={e => setAccountChartId(e.target.value)}><option value="">Asset chart account</option>{assetAccounts.map(account => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select>
          <input className={fieldClass} placeholder="Bank / mobile-money provider (optional)" value={accountProvider} onChange={e => setAccountProvider(e.target.value)} />
          <input className={fieldClass} placeholder="Masked account reference (optional)" value={accountReference} onChange={e => setAccountReference(e.target.value)} />
          <button type="button" className={buttonClass} onClick={addFinancialAccount}><Plus size={14} /> Add account</button>
        </div>
        <ul className="mt-3 space-y-2 text-sm">{configuration.financialAccounts.map(account => <li key={account.id} className="rounded-lg bg-slate-50 px-3 py-2">{account.name} · {account.account_type} · {account.currency_code}{account.provider_name ? ' · ' + account.provider_name : ''}{account.account_reference ? ' · ' + account.account_reference : ''}</li>)}</ul>
      </section>

{scope?.type === 'branch' && (
        <section className="rounded-2xl border border-amber-200 bg-white p-5 space-y-3">
          <div>
            <h3 className="font-black text-slate-900">Inter-branch clearing accounts</h3>
            <p className="mt-1 text-xs text-slate-500">Required before this branch can send or receive cross-branch transfers. Due-from must be an asset; due-to must be a liability. Configure reciprocal accounts in every participating branch.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Due-from branch (asset)</label>
              <select className={fieldClass} value={dueFromChartAccountId} onChange={event => setDueFromChartAccountId(event.target.value)}>
                <option value="">Select due-from asset account</option>
                {configuration.chartAccounts.filter(account => account.account_type === 'asset' && account.is_active).map(account =>
                  <option key={account.id} value={account.id}>{account.code} — {account.name}</option>
                )}
              </select>
            </div>
            <div>
              <label className={labelClass}>Due-to branch (liability)</label>
              <select className={fieldClass} value={dueToChartAccountId} onChange={event => setDueToChartAccountId(event.target.value)}>
                <option value="">Select due-to liability account</option>
                {configuration.chartAccounts.filter(account => account.account_type === 'liability' && account.is_active).map(account =>
                  <option key={account.id} value={account.id}>{account.code} — {account.name}</option>
                )}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">Same-branch transfers do not use clearing accounts.</p>
            <button type="button" className={buttonClass} onClick={() => void saveClearingAccounts()} disabled={savingClearingAccounts}>
              <Save size={14} /> {savingClearingAccounts ? 'Saving clearing accounts…' : 'Save clearing accounts'}
            </button>
          </div>
        </section>
      )}

            <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h3 className="font-black text-slate-900">Approval policies</h3>
          <p className="mt-1 text-xs text-slate-500">Configure scope-owned approval rules with one or more non-overlapping base-currency amount bands and ordered approval steps. Policies are persisted when you click Save configuration. Internal-transfer policies are branch-specific because both branches must approve a cross-branch movement.</p>
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Workflow type</label>
                <select className={fieldClass} value={policyType} onChange={e => {
                  const next = e.target.value as typeof policyType;
                  setPolicyType(next);
                  setPolicyName(next === 'budget' ? 'Event Budget Approval' : next === 'financial_transfer' ? 'Internal Transfer Approval' : 'Financial Document Approval');
                }}>
                  <option value="financial_document">Receipts and payments</option>
                  <option value="budget">Event budget approval</option>
                  {scope?.type === 'branch' && <option value="financial_transfer">Internal transfer approval</option>}
                </select>
              </div>
              <div>
                <label className={labelClass}>Policy name</label>
                <input className={fieldClass} placeholder="Policy name" value={policyName} onChange={e => setPolicyName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              {policyBands.map((band, bandIndex) => (
                <div key={bandIndex} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-700">Amount band {bandIndex + 1}</span>
                    {policyBands.length > 1 && (
                      <button type="button" onClick={() => removePolicyBand(bandIndex)} className="text-xs font-bold text-rose-600 hover:text-rose-800">Remove band</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Minimum base amount</label>
                      <input className={fieldClass} type="number" min="0" placeholder="Minimum base amount" value={band.min} onChange={e => updatePolicyBandField(bandIndex, 'min', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>Maximum (blank = no limit)</label>
                      <input className={fieldClass} type="number" min="0" placeholder="Maximum (blank = no limit)" value={band.max} onChange={e => updatePolicyBandField(bandIndex, 'max', e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Ordered approval steps</label>
                    {band.steps.map((count, stepIndex) => (
                      <div key={stepIndex} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs font-semibold text-slate-600">Step {stepIndex + 1}</span>
                        <input
                          className={fieldClass}
                          type="number"
                          min="1"
                          step="1"
                          value={count}
                          onChange={e => updatePolicyBandStep(bandIndex, stepIndex, e.target.value)}
                          aria-label={`Band ${bandIndex + 1} step ${stepIndex + 1} required approvals`}
                        />
                        {band.steps.length > 1 && (
                          <button type="button" onClick={() => removePolicyBandStep(bandIndex, stepIndex)} className="shrink-0 text-xs font-bold text-rose-600 hover:text-rose-800">Remove</button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="text-xs font-bold text-indigo-700 hover:text-indigo-900" onClick={() => addPolicyBandStep(bandIndex)}>
                      + Add step to band {bandIndex + 1}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500">Any active profile with the applicable scope-compatible approve_finances permission may approve. The submitter cannot approve their own transaction.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={addPolicyBand}><Plus size={14} /> Add amount band</button>
              <button type="button" className={buttonClass} onClick={addApprovalPolicy}><Plus size={14} /> Queue {policyType === 'budget' ? 'budget' : 'finance'} policy</button>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-xs text-slate-700">
            {configuration.approvalPolicies.map(policy => {
              const bandsForPolicy = configuration.approvalPolicyBands
                .filter(band => band.policy_id === policy.id)
                .sort((a, b) => Number(a.min_amount_base) - Number(b.min_amount_base));
              return (
                <li key={policy.id} className="rounded-xl bg-slate-50 p-3 space-y-1">
                  <div className="font-bold text-slate-900">
                    {policy.name} · {policy.transaction_type === 'budget' ? 'Event budgets' : 'Receipts/payments'} · {policy.district_id ? 'District' : policy.branch_id ? 'Branch' : 'Church-wide'} · v{policy.version} · {policy.is_active ? 'Active' : 'Inactive'}
                  </div>
                  {bandsForPolicy.map(band => {
                    const stepsForBand = configuration.approvalPolicySteps
                      .filter(step => step.band_id === band.id)
                      .sort((a, b) => Number(a.step_number) - Number(b.step_number));
                    return (
                      <div key={band.id} className="text-[11px] text-slate-600">
                        Band {band.min_amount_base} to {band.max_amount_base ?? '∞'}: {stepsForBand.length ? stepsForBand.map(step => `Step ${step.step_number} (${step.required_approvals})`).join(' → ') : 'No approval steps'}
                      </div>
                    );
                  })}
                </li>
              );
            })}
            {configuration.approvalPolicies.length === 0 && (
              <li className="text-slate-500">No approval policies are configured in this scope yet.</li>
            )}
          </ul>
        </div>

        {(!scope || scope.type === 'church') ? (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-black text-slate-900">Financial years & periods</h3>
              <div className="mt-3 flex gap-2"><input className={fieldClass} aria-label="Financial year" type="number" value={yearNumber} onChange={e => setYearNumber(e.target.value)} /><button type="button" className={buttonClass} onClick={addYear}><Plus size={14} /> Add year</button></div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <select className={fieldClass} value={periodYearId} onChange={e => setPeriodYearId(e.target.value)}><option value="">Year</option>{configuration.financialYears.map(year => <option key={year.id} value={year.id}>{year.year_number}</option>)}</select>
                <input className={fieldClass} placeholder="Period name" value={periodName} onChange={e => setPeriodName(e.target.value)} />
                <input className={fieldClass} type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
                <input className={fieldClass} type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
              </div>
              <button type="button" className={buttonClass + ' mt-2'} onClick={addPeriod}><Plus size={14} /> Add period</button>
              <ul className="mt-3 space-y-1 text-xs text-slate-600">{configuration.periods.map(period => <li key={period.id}>{period.name}: {period.start_date} to {period.end_date} ({period.status})</li>)}</ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-black text-slate-900">Department requisition approval</h3>
              <p className="mt-1 text-xs text-slate-500">Configure a separate, ordered approval policy for ministry and department funding requests. Every step requires the branch-scoped approve_requisitions permission and prohibits submitter approval.</p>
              <div className="mt-3 space-y-2">
                <label className={labelClass}>Policy name</label>
                <input className={fieldClass} value={requisitionPolicyName} onChange={e => setRequisitionPolicyName(e.target.value)} placeholder="Department Requisition Approval" />
                <div className="grid grid-cols-2 gap-2">
                  <input className={fieldClass} type="number" min="0" value={requisitionPolicyMin} onChange={e => setRequisitionPolicyMin(e.target.value)} placeholder="Minimum base amount" />
                  <input className={fieldClass} type="number" min="0" value={requisitionPolicyMax} onChange={e => setRequisitionPolicyMax(e.target.value)} placeholder="Maximum (blank = no limit)" />
                </div>
                <label className={labelClass}>Ordered approval steps</label>
                {requisitionSteps.map((value, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs font-semibold text-slate-600">Step {index + 1}</span>
                    <input className={fieldClass} type="number" min="1" step="1" value={value}
                      onChange={e => setRequisitionSteps(current => current.map((item, itemIndex) => itemIndex === index ? e.target.value : item))}
                      aria-label={`Required approvals for step ${index + 1}`} />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} onClick={addRequisitionApprovalStep}><Plus size={14} /> Add approval step</button>
                  <button type="button" className={buttonClass} disabled={savingRequisitionPolicy} onClick={() => void saveRequisitionPolicy()}>
                    <Save size={14} /> {savingRequisitionPolicy ? 'Saving…' : 'Save requisition policy'}
                  </button>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                {requisitionConfiguration.policies.map(policy => {
                  const policyBands = requisitionConfiguration.bands.filter(band => band.policy_id === policy.id);
                  const stepCount = policyBands.reduce((count, band) =>
                    count + requisitionConfiguration.steps.filter(step => step.band_id === band.id).length, 0);
                  return <li key={policy.id}>{policy.name} · {policy.branch_id ? 'Branch' : 'Church-wide'} · v{policy.version} · {stepCount} approval step(s) · {policy.is_active ? 'Active' : 'Inactive'}</li>;
                })}
                {requisitionConfiguration.policies.length === 0 && <li className="text-slate-500">No requisition approval policy is configured yet. Requisition submission will remain unavailable until one is saved.</li>}
              </ul>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 lg:col-span-2">Financial years and open periods are managed at church level. Department requisition approval policies remain branch-level workflows.</div>
        )}
      </section>

      <p className="text-xs text-slate-500">Finance configuration is loaded and saved through authenticated PostgreSQL RPCs. Changes are subject to database permissions, organizational scope, validation and audit controls.</p>
    </div>
  );
};

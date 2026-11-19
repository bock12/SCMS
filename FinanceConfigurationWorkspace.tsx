import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, Save, RefreshCw } from 'lucide-react';
import { supabase } from './supabaseClient';
import { getFinanceConfiguration, saveFinanceConfiguration, type FinanceConfiguration } from './financeConfigurationService';
import { FinanceTransactionEntryWorkspace } from './FinanceTransactionEntryWorkspace';

interface FinanceConfigurationWorkspaceProps {
  branchId: string | null;
}

interface ApproverOption { id: string; label: string; }

const emptyConfiguration = (): FinanceConfiguration => ({
  currencies: [], baseCurrencyCode: null, chartAccounts: [], financialAccounts: [], funds: [],
  financialYears: [], periods: [], approvalPolicies: [], approvalPolicyBands: [], approvalPolicySteps: []
});

const makeId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)}`;

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800';
const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500';
const buttonClass = 'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50';

export const FinanceConfigurationWorkspace: React.FC<FinanceConfigurationWorkspaceProps> = ({ branchId }) => {
  const [configuration, setConfiguration] = useState<FinanceConfiguration>(emptyConfiguration);
  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
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
  const [fundName, setFundName] = useState('');
  const [fundCode, setFundCode] = useState('');
  const [fundType, setFundType] = useState<'general' | 'designated' | 'restricted'>('general');
  const [yearNumber, setYearNumber] = useState(String(new Date().getFullYear()));
  const [periodName, setPeriodName] = useState('');
  const [periodYearId, setPeriodYearId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [policyType, setPolicyType] = useState<'financial_document' | 'budget'>('financial_document');
  const [policyName, setPolicyName] = useState('Financial Document Approval');
  const [policyMin, setPolicyMin] = useState('0');
  const [policyMax, setPolicyMax] = useState('');
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);

  const assetAccounts = useMemo(
    () => configuration.chartAccounts.filter(account => account.account_type === 'asset' && account.is_active),
    [configuration.chartAccounts]
  );

  const reload = async () => {
    setLoading(true);
    setError(null);
    const [configResult, profileResult] = await Promise.all([
      getFinanceConfiguration(),
      supabase.from('profiles').select('id,first_name,last_name,status').order('first_name', { ascending: true })
    ]);
    if (configResult.error) setError(configResult.error.message);
    else setConfiguration({ ...emptyConfiguration(), ...(configResult.data || {}) });
    if (profileResult.error) {
      setApprovers([]);
    } else {
      setApprovers((profileResult.data || [])
        .filter((p: any) => p.status !== 'suspended' && p.status !== 'archived')
        .map((p: any) => ({ id: p.id, label: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.id })));
    }
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []);

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

  const addFinancialAccount = () => {
    if (!accountName.trim() || !accountCurrency || !accountChartId) return;
    update({ financialAccounts: [...configuration.financialAccounts, {
      id: makeId('fin-account'), chart_account_id: accountChartId, branch_id: branchId,
      name: accountName.trim(), account_type: accountType, currency_code: accountCurrency,
      is_active: true
    }] });
    setAccountName(''); setAccountChartId('');
  };

  const addFund = () => {
    if (!fundName.trim() || !fundCode.trim()) return;
    const isDefault = configuration.funds.length === 0;
    update({ funds: [...configuration.funds, {
      id: makeId('fund'), name: fundName.trim(), code: fundCode.trim().toUpperCase(),
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

  const addApprovalPolicy = () => {
    const min = Number(policyMin);
    const max = policyMax.trim() ? Number(policyMax) : null;
    if (!policyName.trim() || !Number.isFinite(min) || min < 0 ||
      (max !== null && (!Number.isFinite(max) || max <= min)) || selectedApprovers.length === 0) return;
    const policyId = makeId('policy');
    const bandId = makeId('band');
    update({
      approvalPolicies: [...configuration.approvalPolicies, {
        id: policyId, name: policyName.trim(), transaction_type: policyType,
        branch_id: branchId, version: Math.max(0, ...configuration.approvalPolicies.filter(item => item.branch_id === branchId).map(item => item.version)) + 1, effective_from: new Date().toISOString().slice(0, 10), is_active: true
      }],
      approvalPolicyBands: [...configuration.approvalPolicyBands, {
        id: bandId, policy_id: policyId, min_amount_base: min, max_amount_base: max
      }],
      approvalPolicySteps: [...configuration.approvalPolicySteps, {
        id: makeId('approval-step'), band_id: bandId, step_number: 1,
        required_permission_key: 'approve_finances', required_approvals: 1,
        prohibit_submitter_approval: true, approver_profile_ids: selectedApprovers
      }]
    });
    setPolicyName(policyType === 'budget' ? 'Event Budget Approval' : 'Financial Document Approval'); setPolicyMin('0'); setPolicyMax('');
    setSelectedApprovers([]);
  };

  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    const result = await saveFinanceConfiguration(configuration, branchId);
    if (result.error) setError(result.error.message);
    else setNotice('Canonical finance configuration saved. Receipt and payment entry can now validate against this setup.');
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-black text-slate-900">Financial accounts</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          <input className={fieldClass} placeholder="Account name" value={accountName} onChange={e => setAccountName(e.target.value)} />
          <select className={fieldClass} value={accountType} onChange={e => setAccountType(e.target.value as typeof accountType)}>{['cash','bank','mobile_money','clearing'].map(type => <option key={type} value={type}>{type}</option>)}</select>
          <select className={fieldClass} value={accountCurrency} onChange={e => setAccountCurrency(e.target.value)}><option value="">Currency</option>{configuration.currencies.map(code => <option key={code}>{code}</option>)}</select>
          <select className={fieldClass} value={accountChartId} onChange={e => setAccountChartId(e.target.value)}><option value="">Asset chart account</option>{assetAccounts.map(account => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select>
          <button type="button" className={buttonClass} onClick={addFinancialAccount}><Plus size={14} /> Add account</button>
        </div>
        <ul className="mt-3 space-y-2 text-sm">{configuration.financialAccounts.map(account => <li key={account.id} className="rounded-lg bg-slate-50 px-3 py-2">{account.name} · {account.account_type} · {account.currency_code}</li>)}</ul>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
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
          <h3 className="font-black text-slate-900">Approval policies</h3>
          <p className="mt-1 text-xs text-slate-500">Configure separate approval rules for canonical receipts/payments and event budgets.</p>
          <div className="mt-3 space-y-2">
            <label className={labelClass}>Workflow type</label>
            <select className={fieldClass} value={policyType} onChange={e => {
              const next = e.target.value as typeof policyType;
              setPolicyType(next);
              setPolicyName(next === 'budget' ? 'Event Budget Approval' : 'Financial Document Approval');
            }}>
              <option value="financial_document">Receipts and payments</option>
              <option value="budget">Event budget approval</option>
            </select>
            <input className={fieldClass} placeholder="Policy name" value={policyName} onChange={e => setPolicyName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2"><input className={fieldClass} type="number" min="0" placeholder="Minimum base amount" value={policyMin} onChange={e => setPolicyMin(e.target.value)} /><input className={fieldClass} type="number" min="0" placeholder="Maximum (blank = no limit)" value={policyMax} onChange={e => setPolicyMax(e.target.value)} /></div>
            <label className={labelClass}>Approver for this step</label>
            <select className={fieldClass} value={selectedApprovers[0] || ''} onChange={e => setSelectedApprovers(e.target.value ? [e.target.value] : [])}>
              {approvers.map(person => <option key={person.id} value={person.id}>{person.label}</option>)}
            </select>
            <button type="button" className={buttonClass} onClick={addApprovalPolicy}><Plus size={14} /> Add {policyType === 'budget' ? 'budget' : 'finance'} policy and amount band</button>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-slate-600">{configuration.approvalPolicies.map(policy => <li key={policy.id}>{policy.name} · {policy.transaction_type === 'budget' ? 'Event budgets' : 'Receipts/payments'} · {policy.branch_id ? 'Branch' : 'Church-wide'} · v{policy.version} · {policy.is_active ? 'Active' : 'Inactive'}</li>)}</ul>
        </div>
      </section>

      <p className="text-xs text-slate-500">Configuration is stored in the development mock finance store. It is not a live Supabase write. Live database configuration still requires separately reviewed database routines and deployment approval.</p>

      <FinanceTransactionEntryWorkspace branchId={branchId} />
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  Copy,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Users
} from 'lucide-react';
import {
  evaluateTransactionEntryReadiness,
  getFinanceConfiguration,
  getFinanceScopeConfiguration,
  getRequisitionApprovalConfiguration,
  saveFinanceConfiguration,
  saveFinanceScopeApprovalPolicies,
  saveFinanceScopeResources,
  saveRequisitionApprovalPolicy,
  type FinanceConfiguration,
  type FinanceOwnershipScope,
  type RequisitionApprovalConfiguration
} from './financeConfigurationService';
import {
  getFinanceBranchClearingAccounts,
  setFinanceBranchClearingAccounts
} from './financeTransferService';
import {
  loadScopedApproverDirectory,
  type ScopedApproverDirectory
} from './permissionResolutionService';

interface FinanceConfigurationWorkspaceProps {
  branchId: string | null;
  /** When supplied, use the exact church, district or branch ownership scope APIs. */
  scope?: FinanceOwnershipScope;
  /** True if the signed-in user can switch to church-wide scope from branch/district scope. */
  hasChurchScope?: boolean;
  /** Callback to jump directly to church-wide scope when configuring global rules. */
  onSwitchToChurchScope?: () => void;
  /** Reports whether local configuration draft has unsaved changes. */
  onUnsavedChangesChange?: (dirty: boolean) => void;
}

type SetupSectionFilter = 'all' | 'currencies_funds' | 'accounts' | 'periods' | 'approvals';

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

const makeId = (_prefix: string) =>
  globalThis.crypto?.randomUUID?.() ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const fieldClass =
  'min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-900';
const labelClass =
  'mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500';
const buttonClass =
  'inline-flex min-h-[42px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
const secondaryButtonClass =
  'inline-flex min-h-[42px] items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
const smallActionClass =
  'inline-flex min-h-[34px] items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

export const FinanceConfigurationWorkspace: React.FC<FinanceConfigurationWorkspaceProps> = ({
  branchId,
  scope,
  hasChurchScope = false,
  onSwitchToChurchScope,
  onUnsavedChangesChange
}) => {
  const [configuration, setConfiguration] = useState<FinanceConfiguration>(emptyConfiguration);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(emptyConfiguration())
  );
  const [persistedAccountIds, setPersistedAccountIds] = useState<Set<string>>(() => new Set());
  const [persistedFundIds, setPersistedFundIds] = useState<Set<string>>(() => new Set());
  const [persistedPolicyIds, setPersistedPolicyIds] = useState<Set<string>>(() => new Set());

  const [sectionFilter, setSectionFilter] = useState<SetupSectionFilter>('all');
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

  const [requisitionConfiguration, setRequisitionConfiguration] =
    useState<RequisitionApprovalConfiguration>({ policies: [], bands: [], steps: [] });
  const [requisitionPolicyName, setRequisitionPolicyName] = useState('Department Requisition Approval');
  const [requisitionPolicyMin, setRequisitionPolicyMin] = useState('0');
  const [requisitionPolicyMax, setRequisitionPolicyMax] = useState('');
  const [requisitionSteps, setRequisitionSteps] = useState(['1', '1']);
  const [savingRequisitionPolicy, setSavingRequisitionPolicy] = useState(false);

  const [dueFromChartAccountId, setDueFromChartAccountId] = useState('');
  const [dueToChartAccountId, setDueToChartAccountId] = useState('');
  const [savingClearingAccounts, setSavingClearingAccounts] = useState(false);
  const [approverDirectory, setApproverDirectory] = useState<ScopedApproverDirectory>({
    available: false,
    approve_finances: [],
    approve_requisitions: []
  });

  const isChurchManaged = !scope || scope.type === 'church';
  const effectiveBranchId = scope ? (scope.type === 'branch' ? scope.id : null) : branchId;

  const assetAccounts = useMemo(
    () => configuration.chartAccounts.filter(account => account.account_type === 'asset' && account.is_active),
    [configuration.chartAccounts]
  );

  const standardPresetCurrency = useMemo(() => {
    if (configuration.baseCurrencyCode && configuration.currencies.includes(configuration.baseCurrencyCode)) {
      return configuration.baseCurrencyCode;
    }
    if (configuration.currencies.includes('SLE')) return 'SLE';
    return configuration.currencies[0] || 'SLE';
  }, [configuration.baseCurrencyCode, configuration.currencies]);

  const baseCurrencyLabel = configuration.baseCurrencyCode || standardPresetCurrency;

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(configuration) !== savedSnapshot,
    [configuration, savedSnapshot]
  );

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const readiness = useMemo(
    () =>
      evaluateTransactionEntryReadiness(configuration, {
        scope,
        effectiveBranchId,
        transactionDate: todayIso,
        amount: '',
        exchangeRate: '1',
        today: todayIso
      }),
    [configuration, scope, effectiveBranchId, todayIso]
  );

  const readinessChecks = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      ok: boolean;
      targetSection: SetupSectionFilter;
      detail: string;
    }> = [
      {
        id: 'currency',
        label: 'Base currency',
        ok: readiness.hasSupportedCurrency && Boolean(configuration.baseCurrencyCode),
        targetSection: 'currencies_funds',
        detail: configuration.baseCurrencyCode
          ? `${configuration.baseCurrencyCode} (${configuration.currencies.length} supported)`
          : 'Add currency and select base currency'
      },
      {
        id: 'funds',
        label: 'Active funds',
        ok: configuration.funds.some(fund => fund.is_active),
        targetSection: 'currencies_funds',
        detail: `${configuration.funds.filter(fund => fund.is_active).length} active fund(s)`
      },
      {
        id: 'chart',
        label: 'Chart of accounts',
        ok: readiness.hasIncomeChartAccount && readiness.hasExpenseChartAccount,
        targetSection: 'accounts',
        detail:
          readiness.hasIncomeChartAccount && readiness.hasExpenseChartAccount
            ? 'Income & expense ledgers active'
            : 'Requires active non-control income & expense chart accounts'
      },
      {
        id: 'accounts',
        label: 'Operational accounts',
        ok: readiness.hasScopeFinancialAccount,
        targetSection: 'accounts',
        detail: `${configuration.financialAccounts.filter(account => account.is_active).length} active account(s)`
      },
      {
        id: 'periods',
        label: 'Open period (today)',
        ok: readiness.hasOpenPeriodForDate,
        targetSection: 'periods',
        detail: readiness.hasOpenPeriodForDate
          ? `Open period covers ${todayIso}`
          : `No open period covering ${todayIso}`
      },
      {
        id: 'approval',
        label: 'Document approval policy',
        ok: readiness.hasApprovalBand,
        targetSection: 'approvals',
        detail: readiness.applicablePolicy
          ? `${readiness.applicablePolicy.name} (v${readiness.applicablePolicy.version})`
          : 'No active financial-document approval policy'
      }
    ];

    if (scope?.type === 'branch') {
      const clearingReady =
        Boolean(dueFromChartAccountId) &&
        Boolean(dueToChartAccountId) &&
        dueFromChartAccountId !== dueToChartAccountId;
      const reqReady = requisitionConfiguration.policies.some(policy => policy.is_active);
      items.push(
        {
          id: 'clearing',
          label: 'Inter-branch clearing',
          ok: clearingReady,
          targetSection: 'approvals',
          detail: clearingReady
            ? 'Due-from & due-to mapped'
            : 'Configure due-from asset & due-to liability'
        },
        {
          id: 'requisition',
          label: 'Requisition policy',
          ok: reqReady,
          targetSection: 'approvals',
          detail: reqReady ? 'Active branch workflow' : 'Save a branch requisition policy'
        }
      );
    }

    return items;
  }, [
    readiness,
    configuration.baseCurrencyCode,
    configuration.currencies.length,
    configuration.funds,
    configuration.financialAccounts,
    todayIso,
    scope?.type,
    dueFromChartAccountId,
    dueToChartAccountId,
    requisitionConfiguration.policies
  ]);

  const reload = async () => {
    setLoading(true);
    setError(null);
    const configRequest = scope
      ? getFinanceScopeConfiguration(scope)
      : getFinanceConfiguration(branchId);
    const requisitionRequest =
      scope?.type === 'district'
        ? Promise.resolve({ data: { policies: [], bands: [], steps: [] }, error: null })
        : getRequisitionApprovalConfiguration(effectiveBranchId);
    const clearingRequest =
      scope?.type === 'branch'
        ? getFinanceBranchClearingAccounts(scope.id)
        : Promise.resolve({ data: null, error: null });

    const [configResult, requisitionResult, clearingResult] = await Promise.all([
      configRequest,
      requisitionRequest,
      clearingRequest
    ]);

    if (configResult.error) {
      setError(configResult.error.message);
    } else {
      const nextConfig: FinanceConfiguration = {
        ...emptyConfiguration(),
        ...(configResult.data || {})
      };
      setConfiguration(nextConfig);
      setSavedSnapshot(JSON.stringify(nextConfig));
      setPersistedAccountIds(new Set(nextConfig.financialAccounts.map(account => account.id)));
      setPersistedFundIds(new Set(nextConfig.funds.map(fund => fund.id)));
      setPersistedPolicyIds(new Set(nextConfig.approvalPolicies.map(policy => policy.id)));
    }

    if (requisitionResult.error) {
      setError(current => current || requisitionResult.error!.message);
    } else {
      setRequisitionConfiguration(
        requisitionResult.data || { policies: [], bands: [], steps: [] }
      );
    }

    if (clearingResult.error) {
      setError(current => current || clearingResult.error!.message);
    } else {
      setDueFromChartAccountId(clearingResult.data?.due_from_chart_account_id || '');
      setDueToChartAccountId(clearingResult.data?.due_to_chart_account_id || '');
    }

    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, [branchId, scope?.type, scope?.id]);

  useEffect(() => {
    let cancelled = false;
    const directoryScopeType = scope?.type || (effectiveBranchId ? 'branch' : 'church');
    const directoryScopeId =
      directoryScopeType === 'church' ? null : scope?.id ?? effectiveBranchId ?? null;
    loadScopedApproverDirectory(directoryScopeType, directoryScopeId).then(directory => {
      if (!cancelled) setApproverDirectory(directory);
    });
    return () => {
      cancelled = true;
    };
  }, [scope?.type, scope?.id, effectiveBranchId]);

  // Preserve an explicit valid selection, falling back to SLE or the configured base currency.
  useEffect(() => {
    setAccountCurrency(current =>
      current && configuration.currencies.includes(current)
        ? current
        : configuration.currencies.includes('SLE')
          ? 'SLE'
          : configuration.baseCurrencyCode || configuration.currencies[0] || ''
    );
  }, [configuration.currencies, configuration.baseCurrencyCode]);

  // Keep policyType valid when leaving branch scope.
  useEffect(() => {
    if (scope?.type !== 'branch' && policyType === 'financial_transfer') {
      setPolicyType('financial_document');
      setPolicyName('Financial Document Approval');
    }
  }, [scope?.type, policyType]);

  const update = (patch: Partial<FinanceConfiguration>) =>
    setConfiguration(current => ({ ...current, ...patch }));

  const addCurrency = () => {
    const code = currencyCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || configuration.currencies.includes(code)) return;
    update({
      currencies: [...configuration.currencies, code],
      baseCurrencyCode: configuration.baseCurrencyCode || code
    });
    setCurrencyCode('');
  };

  const removeCurrency = (code: string) => {
    if (configuration.baseCurrencyCode === code) {
      setError('Change the church base currency before removing this currency.');
      return;
    }
    if (configuration.financialAccounts.some(account => account.currency_code === code)) {
      setError(`Cannot remove ${code} while financial accounts reference it.`);
      return;
    }
    setError(null);
    update({ currencies: configuration.currencies.filter(item => item !== code) });
  };

  const addChartAccount = () => {
    if (!chartCode.trim() || !chartName.trim()) return;
    const normalBalance = ['asset', 'expense'].includes(chartType) ? 'debit' : 'credit';
    update({
      chartAccounts: [
        ...configuration.chartAccounts,
        {
          id: makeId('chart'),
          code: chartCode.trim(),
          name: chartName.trim(),
          account_type: chartType,
          normal_balance: normalBalance,
          is_control_account: false,
          is_system: false,
          is_active: true
        }
      ]
    });
    setChartCode('');
    setChartName('');
  };

  const toggleChartAccountActive = (accountId: string) => {
    update({
      chartAccounts: configuration.chartAccounts.map(account =>
        account.id === accountId ? { ...account, is_active: !account.is_active } : account
      )
    });
  };

  const seedStarterChartAccounts = () => {
    setError(null);
    setNotice(null);
    const starterAccounts: Array<{
      code: string;
      name: string;
      account_type: 'asset' | 'liability' | 'income' | 'expense';
    }> = [
      { code: '1010', name: 'Cash on Hand', account_type: 'asset' },
      { code: '1020', name: 'Bank Account', account_type: 'asset' },
      { code: '1030', name: 'Mobile-Money Account', account_type: 'asset' },
      { code: '1200', name: 'Due from Branches', account_type: 'asset' },
      { code: '2200', name: 'Due to Branches', account_type: 'liability' },
      { code: '4000', name: 'Tithes & Offerings Income', account_type: 'income' },
      { code: '5000', name: 'Operating Expenses', account_type: 'expense' }
    ];

    const existingCodes = new Set(
      configuration.chartAccounts.map(account => String(account.code).trim().toLowerCase())
    );
    const toAdd = starterAccounts.filter(
      item => !existingCodes.has(item.code.toLowerCase())
    );

    if (toAdd.length === 0) {
      setNotice('All standard starter chart accounts (1010–5000) are already present.');
      return;
    }

    const created = toAdd.map(item => ({
      id: makeId('chart'),
      code: item.code,
      name: item.name,
      account_type: item.account_type,
      normal_balance: (['asset', 'expense'].includes(item.account_type)
        ? 'debit'
        : 'credit') as 'debit' | 'credit',
      is_control_account: false,
      is_system: false,
      is_active: true
    }));

    update({ chartAccounts: [...configuration.chartAccounts, ...created] });
    setNotice(
      `Queued ${created.length} starter chart account(s) (${created
        .map(item => item.code)
        .join(', ')}). Click Save configuration to persist them.`
    );
  };

  const queueStandardOperationalAccounts = () => {
    setError(null);
    setNotice(null);
    const targetCurrency = standardPresetCurrency;
    if (!configuration.currencies.includes(targetCurrency)) {
      setError(
        `${targetCurrency} is not available in the active currency list. Add or activate ${targetCurrency} before creating operational accounts.`
      );
      return;
    }

    const standardAccounts = [
      { account_type: 'cash' as const, name: 'Cash on Hand', chartCode: '1010' },
      { account_type: 'bank' as const, name: 'Bank Account', chartCode: '1020' },
      { account_type: 'mobile_money' as const, name: 'Mobile-Money Account', chartCode: '1030' }
    ];
    const queuedTypes = new Set(
      configuration.financialAccounts
        .filter(
          account =>
            account.is_active &&
            account.currency_code === targetCurrency &&
            (scope?.type === 'branch'
              ? account.branch_id === scope.id && !account.district_id
              : scope?.type === 'district'
                ? account.branch_id === null && account.district_id === scope.id
                : scope?.type === 'church'
                  ? account.branch_id === null && !account.district_id
                  : account.branch_id === branchId && !account.district_id)
        )
        .map(account => account.account_type)
    );
    const missing = standardAccounts.filter(account => !queuedTypes.has(account.account_type));
    if (missing.length === 0) {
      setNotice(
        `All three standard ${targetCurrency} operational account types are already configured in this scope.`
      );
      return;
    }

    const unresolved = missing.filter(
      account =>
        !configuration.chartAccounts.some(
          chart =>
            chart.code === account.chartCode &&
            chart.account_type === 'asset' &&
            chart.is_active &&
            !chart.is_control_account
        )
    );
    if (unresolved.length) {
      setError(
        `Cannot add standard accounts until these active non-control asset chart accounts are available: ${unresolved
          .map(item => item.chartCode)
          .join(', ')}.`
      );
      return;
    }

    const queued = missing.map(account => {
      const chart = configuration.chartAccounts.find(
        item =>
          item.code === account.chartCode &&
          item.account_type === 'asset' &&
          item.is_active &&
          !item.is_control_account
      )!;
      return {
        id: makeId('fin-account'),
        chart_account_id: chart.id,
        branch_id: scope ? (scope.type === 'branch' ? scope.id : null) : branchId,
        district_id: scope?.type === 'district' ? scope.id : null,
        name: account.name,
        account_type: account.account_type,
        currency_code: targetCurrency,
        provider_name: null,
        account_reference: null,
        is_active: true
      };
    });

    update({ financialAccounts: [...configuration.financialAccounts, ...queued] });
    setAccountCurrency(targetCurrency);
    setNotice(
      `Queued ${queued.length} standard ${targetCurrency} operational account(s). Click Save configuration to persist them to this scope.`
    );
  };

  const addFinancialAccount = () => {
    if (!accountName.trim() || !accountCurrency || !accountChartId) return;
    update({
      financialAccounts: [
        ...configuration.financialAccounts,
        {
          id: makeId('fin-account'),
          chart_account_id: accountChartId,
          branch_id: scope ? (scope.type === 'branch' ? scope.id : null) : branchId,
          district_id: scope?.type === 'district' ? scope.id : null,
          name: accountName.trim(),
          account_type: accountType,
          currency_code: accountCurrency,
          provider_name: accountProvider.trim() || null,
          account_reference: accountReference.trim() || null,
          is_active: true
        }
      ]
    });
    setAccountName('');
    setAccountChartId('');
    setAccountProvider('');
    setAccountReference('');
  };

  const toggleFinancialAccountActive = (accountId: string) => {
    update({
      financialAccounts: configuration.financialAccounts.map(account =>
        account.id === accountId ? { ...account, is_active: !account.is_active } : account
      )
    });
  };

  const removeDraftFinancialAccount = (accountId: string) => {
    if (persistedAccountIds.has(accountId)) return;
    update({
      financialAccounts: configuration.financialAccounts.filter(account => account.id !== accountId)
    });
  };

  const addFund = () => {
    if (!fundName.trim() || !fundCode.trim()) return;
    const isDefault = configuration.funds.length === 0;
    update({
      funds: [
        ...configuration.funds,
        {
          id: makeId('fund'),
          name: fundName.trim(),
          code: fundCode.trim().toUpperCase(),
          branch_id: scope ? (scope.type === 'branch' ? scope.id : null) : null,
          district_id: scope?.type === 'district' ? scope.id : null,
          fund_type: fundType,
          description: null,
          is_default: isDefault,
          is_active: true
        }
      ]
    });
    setFundName('');
    setFundCode('');
  };

  const setDefaultFund = (fundId: string) => {
    update({
      funds: configuration.funds.map(fund => ({
        ...fund,
        is_default: fund.id === fundId
      }))
    });
  };

  const toggleFundActive = (fundId: string) => {
    update({
      funds: configuration.funds.map(fund =>
        fund.id === fundId ? { ...fund, is_active: !fund.is_active } : fund
      )
    });
  };

  const removeDraftFund = (fundId: string) => {
    if (persistedFundIds.has(fundId)) return;
    update({
      funds: configuration.funds.filter(fund => fund.id !== fundId)
    });
  };

  const addYear = () => {
    const year = Number(yearNumber);
    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 9998 ||
      configuration.financialYears.some(item => item.year_number === year)
    ) {
      return;
    }
    const id = makeId('year');
    update({
      financialYears: [
        ...configuration.financialYears,
        {
          id,
          year_number: year,
          start_date: `${year}-01-01`,
          end_date: `${year}-12-31`,
          status: 'open'
        }
      ]
    });
    setPeriodYearId(id);
    setPeriodName('Annual');
    setPeriodStart(`${year}-01-01`);
    setPeriodEnd(`${year}-12-31`);
  };

  const toggleYearStatus = (yearId: string) => {
    update({
      financialYears: configuration.financialYears.map(year =>
        year.id === yearId
          ? { ...year, status: year.status === 'open' ? 'closed' : 'open' }
          : year
      )
    });
  };

  const addPeriod = () => {
    if (!periodYearId || !periodName.trim() || !periodStart || !periodEnd || periodStart > periodEnd) {
      return;
    }
    update({
      periods: [
        ...configuration.periods,
        {
          id: makeId('period'),
          financial_year_id: periodYearId,
          name: periodName.trim(),
          start_date: periodStart,
          end_date: periodEnd,
          status: 'open'
        }
      ]
    });
    setPeriodName('');
  };

  const togglePeriodStatus = (periodId: string) => {
    update({
      periods: configuration.periods.map(period =>
        period.id === periodId
          ? { ...period, status: period.status === 'open' ? 'closed' : 'open' }
          : period
      )
    });
  };

  const addPolicyBand = () => {
    setPolicyBands(current => {
      const lastMax = current[current.length - 1]?.max.trim() || '0';
      return [...current, { min: lastMax, max: '', steps: ['1'] }];
    });
  };

  const removePolicyBand = (bandIndex: number) => {
    setPolicyBands(current =>
      current.length > 1 ? current.filter((_, index) => index !== bandIndex) : current
    );
  };

  const updatePolicyBandField = (bandIndex: number, field: 'min' | 'max', value: string) => {
    setPolicyBands(current =>
      current.map((band, index) => (index === bandIndex ? { ...band, [field]: value } : band))
    );
  };

  const addPolicyBandStep = (bandIndex: number) => {
    setPolicyBands(current =>
      current.map((band, index) =>
        index === bandIndex ? { ...band, steps: [...band.steps, '1'] } : band
      )
    );
  };

  const removePolicyBandStep = (bandIndex: number, stepIndex: number) => {
    setPolicyBands(current =>
      current.map((band, index) =>
        index === bandIndex && band.steps.length > 1
          ? { ...band, steps: band.steps.filter((_, idx) => idx !== stepIndex) }
          : band
      )
    );
  };

  const updatePolicyBandStep = (bandIndex: number, stepIndex: number, value: string) => {
    setPolicyBands(current =>
      current.map((band, index) =>
        index === bandIndex
          ? {
              ...band,
              steps: band.steps.map((step, idx) => (idx === stepIndex ? value : step))
            }
          : band
      )
    );
  };

  const clonePolicyAsNewVersion = (policy: FinanceConfiguration['approvalPolicies'][number]) => {
    const bandsForPolicy = configuration.approvalPolicyBands
      .filter(band => band.policy_id === policy.id)
      .sort((a, b) => Number(a.min_amount_base) - Number(b.min_amount_base));

    const nextType =
      policy.transaction_type === 'financial_transfer' && scope?.type !== 'branch'
        ? 'financial_document'
        : policy.transaction_type;

    setPolicyType(nextType);
    setPolicyName(policy.name);
    setPolicyBands(
      bandsForPolicy.length > 0
        ? bandsForPolicy.map(band => {
            const stepsForBand = configuration.approvalPolicySteps
              .filter(step => step.band_id === band.id)
              .sort((a, b) => Number(a.step_number) - Number(b.step_number));
            return {
              min: String(band.min_amount_base),
              max: band.max_amount_base == null ? '' : String(band.max_amount_base),
              steps:
                stepsForBand.length > 0
                  ? stepsForBand.map(step => String(step.required_approvals))
                  : ['1']
            };
          })
        : [{ min: '0', max: '', steps: ['1'] }]
    );
    setSectionFilter('approvals');
    setNotice(
      `Loaded "${policy.name}" into the approval builder. Adjust bands or steps and queue it as a new version.`
    );
  };

  const removeDraftApprovalPolicy = (policyId: string) => {
    if (persistedPolicyIds.has(policyId)) return;
    const removedBandIds = new Set(
      configuration.approvalPolicyBands
        .filter(band => band.policy_id === policyId)
        .map(band => band.id)
    );
    update({
      approvalPolicies: configuration.approvalPolicies.filter(policy => policy.id !== policyId),
      approvalPolicyBands: configuration.approvalPolicyBands.filter(
        band => band.policy_id !== policyId
      ),
      approvalPolicySteps: configuration.approvalPolicySteps.filter(
        step => !removedBandIds.has(step.band_id)
      )
    });
  };

  const addApprovalPolicy = () => {
    setError(null);
    if (policyType === 'financial_transfer' && scope?.type !== 'branch') {
      setError(
        'Internal financial-transfer approval policies must be configured for an individual branch.'
      );
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
      if (
        !Number.isFinite(band.min) ||
        band.min < 0 ||
        (band.max !== null && (!Number.isFinite(band.max) || band.max <= band.min))
      ) {
        setError(
          'Each approval band requires a non-negative minimum and a maximum greater than its minimum.'
        );
        return;
      }
      if (band.steps.length === 0 || band.steps.some(count => !Number.isInteger(count) || count < 1)) {
        setError(
          'Each approval band requires at least one step with a positive integer approval count.'
        );
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
    const nextVersion =
      Math.max(
        0,
        ...configuration.approvalPolicies
          .filter(
            item =>
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
      approvalPolicies: [
        ...configuration.approvalPolicies,
        {
          id: policyId,
          name: policyName.trim(),
          transaction_type: policyType,
          branch_id: targetBranchId,
          district_id: targetDistrictId,
          version: nextVersion,
          effective_from: new Date().toISOString().slice(0, 10),
          is_active: true
        }
      ],
      approvalPolicyBands: [
        ...configuration.approvalPolicyBands,
        ...createdBands.map(({ id, policy_id, min_amount_base, max_amount_base }) => ({
          id,
          policy_id,
          min_amount_base,
          max_amount_base
        }))
      ],
      approvalPolicySteps: [
        ...configuration.approvalPolicySteps,
        ...createdBands.flatMap(band =>
          band.steps.map((approvalCount, stepIndex) => ({
            id: makeId('approval-step'),
            band_id: band.id,
            step_number: stepIndex + 1,
            required_permission_key: 'approve_finances' as const,
            required_approvals: approvalCount,
            prohibit_submitter_approval: true
          }))
        )
      ]
    });

    setPolicyName(
      policyType === 'budget'
        ? 'Event Budget Approval'
        : policyType === 'financial_transfer'
          ? 'Internal Transfer Approval'
          : 'Financial Document Approval'
    );
    setPolicyBands([{ min: '0', max: '', steps: ['1'] }]);
    setNotice('Policy queued in draft. Click Save configuration to persist it.');
  };

  const addRequisitionApprovalStep = () =>
    setRequisitionSteps(current => [...current, '1']);

  const removeRequisitionApprovalStep = (stepIndex: number) => {
    setRequisitionSteps(current =>
      current.length > 1 ? current.filter((_, idx) => idx !== stepIndex) : current
    );
  };

  const saveRequisitionPolicy = async () => {
    const min = Number(requisitionPolicyMin);
    const max = requisitionPolicyMax.trim() ? Number(requisitionPolicyMax) : null;
    const steps = requisitionSteps.map((value, index) => ({
      step_number: index + 1,
      required_approvals: Number(value)
    }));
    if (
      !requisitionPolicyName.trim() ||
      !Number.isFinite(min) ||
      min < 0 ||
      (max !== null && (!Number.isFinite(max) || max <= min)) ||
      steps.some(step => !Number.isInteger(step.required_approvals) || step.required_approvals < 1)
    ) {
      setError(
        'Enter a valid requisition policy name, amount band and positive approval count for every step.'
      );
      return;
    }

    setSavingRequisitionPolicy(true);
    setError(null);
    setNotice(null);
    const result = await saveRequisitionApprovalPolicy(
      effectiveBranchId,
      requisitionPolicyName,
      min,
      max,
      steps
    );
    if (result.error) {
      setError(result.error.message);
    } else {
      const refreshed = await getRequisitionApprovalConfiguration(effectiveBranchId);
      if (refreshed.error) setError(refreshed.error.message);
      else setRequisitionConfiguration(refreshed.data || { policies: [], bands: [], steps: [] });
      setNotice(
        'Requisition approval policy saved. New requisitions will follow these ordered approval steps.'
      );
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
      setNotice(
        'Branch clearing accounts saved. Cross-branch transfers can now use these reciprocal accounts.'
      );
      window.dispatchEvent(new Event('finance_configuration_updated'));
    }
    setSavingClearingAccounts(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    if (scope && scope.type !== 'church') {
      const resources = await saveFinanceScopeResources(
        scope,
        configuration.financialAccounts,
        configuration.funds
      );
      if (resources.error) {
        setError(resources.error.message);
        setSaving(false);
        return;
      }
      const policies = await saveFinanceScopeApprovalPolicies(
        scope,
        configuration.approvalPolicies,
        configuration.approvalPolicyBands,
        configuration.approvalPolicySteps
      );
      if (policies.error) {
        setError(
          `Financial accounts and funds were saved, but approval policies were not saved: ${policies.error.message}`
        );
      } else {
        setNotice(
          'Financial accounts, funds and approval policies saved to the selected organizational scope.'
        );
        await reload();
        window.dispatchEvent(new Event('finance_configuration_updated'));
      }
    } else {
      const result = await saveFinanceConfiguration(
        configuration,
        scope?.type === 'church' ? null : branchId
      );
      if (result.error) setError(result.error.message);
      else {
        setNotice(
          'Canonical finance configuration saved. Receipt and payment entry can now validate against this setup.'
        );
        await reload();
        window.dispatchEvent(new Event('finance_configuration_updated'));
      }
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Loading canonical finance configuration…
      </div>
    );
  }

  const showCurrenciesAndFunds =
    sectionFilter === 'all' || sectionFilter === 'currencies_funds';
  const showAccounts = sectionFilter === 'all' || sectionFilter === 'accounts';
  const showPeriods = sectionFilter === 'all' || sectionFilter === 'periods';
  const showApprovals = sectionFilter === 'all' || sectionFilter === 'approvals';

  const readyCount = readinessChecks.filter(item => item.ok).length;
  const allReady = readyCount === readinessChecks.length;

  const sectionTabs: Array<{ id: SetupSectionFilter; label: string }> = [
    { id: 'all', label: 'All sections' },
    { id: 'currencies_funds', label: 'Currencies & Funds' },
    { id: 'accounts', label: 'Chart & Accounts' },
    { id: 'periods', label: 'Years & Periods' },
    { id: 'approvals', label: 'Approvals & Clearing' }
  ];

  const policyTypeLabel = (type: string) =>
    type === 'budget'
      ? 'Event budgets'
      : type === 'financial_transfer'
        ? 'Internal transfers'
        : 'Receipts & payments';

  return (
    <div className="space-y-5 pb-4">
      {/* Header card */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">Accounting configuration</h2>
            {hasUnsavedChanges && (
              <span className="inline-flex items-center rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                Unsaved draft changes
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Configure the canonical accounting records used by secure receipt, payment, transfer, and
            requisition workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => void reload()}
            disabled={saving}
          >
            <RefreshCw size={14} /> {hasUnsavedChanges ? 'Discard & reload' : 'Reload'}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => void save()}
            disabled={saving}
          >
            <Save size={14} /> {saving ? 'Saving…' : 'Save configuration'}
          </button>
        </div>
      </div>

      {/* Scope Readiness Summary */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck
              size={18}
              className={allReady ? 'text-emerald-600' : 'text-amber-600'}
            />
            <h3 className="text-sm font-black text-slate-900">Scope setup readiness</h3>
          </div>
          <span
            className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ${
              allReady
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-amber-50 text-amber-900 border border-amber-200'
            }`}
          >
            {readyCount}/{readinessChecks.length} checks ready
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {readinessChecks.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSectionFilter(item.targetSection)}
              className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                item.ok
                  ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
                  : 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900">{item.label}</div>
                <div className="mt-0.5 text-[11px] text-slate-600 truncate">{item.detail}</div>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                  item.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-200 text-amber-950'
                }`}
              >
                {item.ok ? 'Ready' : 'Action'}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Responsive Section Filter Pills */}
      <div
        role="tablist"
        aria-label="Accounting setup sections"
        className="flex items-center gap-2 overflow-x-auto pb-1"
      >
        {sectionTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={sectionFilter === tab.id}
            onClick={() => setSectionFilter(tab.id)}
            className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer ${
              sectionFilter === tab.id
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Currencies & Funds */}
      {showCurrenciesAndFunds && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            {scope && scope.type !== 'church' ? (
              <div className="space-y-3">
                <h3 className="font-black text-slate-900">Currencies &amp; base currency</h3>
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 space-y-3">
                  <p>
                    Currencies and the chart of accounts are church-wide settings so every branch
                    posts into one shared ledger. Manage them from the church finance scope.
                  </p>
                  {hasChurchScope && onSwitchToChurchScope && (
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={onSwitchToChurchScope}
                    >
                      <ArrowLeftRight size={14} /> Switch to Church-wide scope
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-black text-slate-900">Currencies &amp; base currency</h3>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    Saves with Save configuration
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    className={fieldClass}
                    aria-label="Currency code"
                    placeholder="e.g. SLE"
                    value={currencyCode}
                    onChange={e => setCurrencyCode(e.target.value)}
                  />
                  <button type="button" className={buttonClass} onClick={addCurrency}>
                    <Plus size={14} /> Add
                  </button>
                </div>
                <label className={`${labelClass} mt-3`} htmlFor="base-currency-select">
                  Church base currency
                </label>
                <select
                  id="base-currency-select"
                  className={fieldClass}
                  value={configuration.baseCurrencyCode || ''}
                  onChange={e => update({ baseCurrencyCode: e.target.value || null })}
                >
                  <option value="">Select base currency</option>
                  {configuration.currencies.map(code => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex flex-wrap gap-2">
                  {configuration.currencies.map(code => {
                    const isBase = configuration.baseCurrencyCode === code;
                    return (
                      <div
                        key={code}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${
                          isBase
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-slate-100 text-slate-800'
                        }`}
                      >
                        <span>{code}</span>
                        {isBase && <span className="text-[10px] opacity-80">(Base)</span>}
                        {!isBase && (
                          <button
                            type="button"
                            onClick={() => removeCurrency(code)}
                            aria-label={`Remove currency ${code}`}
                            className="ml-0.5 rounded px-1 text-slate-500 hover:bg-slate-200 hover:text-rose-700 cursor-pointer"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-slate-900">Funds</h3>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                Saves with Save configuration
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Categorize money by purpose (e.g., General, Building, Missions) separately from your
              cash or bank accounts so giving and expenses can be tracked by fund.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                className={fieldClass}
                placeholder="Fund name"
                value={fundName}
                onChange={e => setFundName(e.target.value)}
              />
              <input
                className={fieldClass}
                placeholder="Fund code"
                value={fundCode}
                onChange={e => setFundCode(e.target.value)}
              />
              <select
                className={fieldClass}
                aria-label="Fund type"
                value={fundType}
                onChange={e => setFundType(e.target.value as typeof fundType)}
              >
                <option value="general">General</option>
                <option value="designated">Designated</option>
                <option value="restricted">Restricted</option>
              </select>
              <button type="button" className={buttonClass} onClick={addFund}>
                <Plus size={14} /> Add fund
              </button>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {configuration.funds.map(fund => {
                const isPersisted = persistedFundIds.has(fund.id);
                const canToggle = isChurchManaged || !isPersisted;
                return (
                  <li
                    key={fund.id}
                    className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                        <span>
                          {fund.code} — {fund.name}
                        </span>
                        {fund.is_default && (
                          <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 capitalize">
                        {fund.fund_type} · {fund.is_active ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {isChurchManaged && !fund.is_default && fund.is_active && (
                        <button
                          type="button"
                          className={smallActionClass}
                          onClick={() => setDefaultFund(fund.id)}
                        >
                          Set default
                        </button>
                      )}
                      {canToggle && (
                        <button
                          type="button"
                          className={smallActionClass}
                          onClick={() => toggleFundActive(fund.id)}
                        >
                          {fund.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      {!isPersisted && (
                        <button
                          type="button"
                          className={`${smallActionClass} text-rose-700 border-rose-200 hover:bg-rose-50`}
                          onClick={() => removeDraftFund(fund.id)}
                        >
                          <Trash2 size={12} /> Remove draft
                        </button>
                      )}
                      {!isChurchManaged && isPersisted && (
                        <span className="text-[11px] font-semibold text-slate-400">Saved</span>
                      )}
                    </div>
                  </li>
                );
              })}
              {configuration.funds.length === 0 && (
                <li className="text-xs text-slate-500">No funds configured in this scope yet.</li>
              )}
            </ul>
          </div>
        </section>
      )}

      {/* Chart of accounts & Financial accounts */}
      {showAccounts && (
        <div className="space-y-4">
          {(!scope || scope.type === 'church') && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-black text-slate-900">Chart of accounts</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Church-wide general ledger categories used by receipts, payments, clearing
                    transfers, and financial reports.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={seedStarterChartAccounts}
                  >
                    <Sparkles size={14} /> Seed starter accounts
                  </button>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    Saves with Save configuration
                  </span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  className={fieldClass}
                  placeholder="Code (e.g. 1000)"
                  value={chartCode}
                  onChange={e => setChartCode(e.target.value)}
                />
                <input
                  className={fieldClass}
                  placeholder="Account name"
                  value={chartName}
                  onChange={e => setChartName(e.target.value)}
                />
                <select
                  className={fieldClass}
                  aria-label="Chart account type"
                  value={chartType}
                  onChange={e => setChartType(e.target.value as typeof chartType)}
                >
                  {['asset', 'liability', 'equity', 'income', 'expense'].map(type => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <button type="button" className={buttonClass} onClick={addChartAccount}>
                  <Plus size={14} /> Add account
                </button>
              </div>

              {/* Mobile card layout */}
              <div className="mt-4 space-y-2 sm:hidden">
                {configuration.chartAccounts.map(account => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900">
                        <span className="font-mono text-slate-600">{account.code}</span> ·{' '}
                        {account.name}
                      </div>
                      <div className="mt-0.5 text-[11px] capitalize text-slate-500">
                        {account.account_type} · {account.is_active ? 'Active' : 'Inactive'}
                        {account.is_control_account ? ' · Control' : ''}
                      </div>
                    </div>
                    {!account.is_system && (
                      <button
                        type="button"
                        className={smallActionClass}
                        onClick={() => toggleChartAccountActive(account.id)}
                      >
                        {account.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Tablet/Desktop table */}
              <div className="mt-4 hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2 pr-3">Code</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configuration.chartAccounts.map(account => (
                      <tr key={account.id} className="border-b border-slate-100">
                        <td className="py-2.5 pr-3 font-mono font-semibold text-slate-800">
                          {account.code}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-900">
                          {account.name}
                          {account.is_control_account && (
                            <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                              Control
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 capitalize text-slate-700">
                          {account.account_type}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              account.is_active
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {account.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          {!account.is_system ? (
                            <button
                              type="button"
                              className={smallActionClass}
                              onClick={() => toggleChartAccountActive(account.id)}
                            >
                              {account.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">System</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-black text-slate-900">Financial accounts</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Adds Cash on Hand, Bank Account, and Mobile-Money Account records for this exact
                  scope, mapped to chart accounts 1010, 1020 and 1030. Provider details are optional.
                </p>
              </div>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={queueStandardOperationalAccounts}
              >
                <Plus size={14} /> Add standard {standardPresetCurrency} accounts
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <input
                className={fieldClass}
                placeholder="Account name (e.g. Main Branch Cash)"
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
              />
              <select
                className={fieldClass}
                aria-label="Financial account type"
                value={accountType}
                onChange={e => setAccountType(e.target.value as typeof accountType)}
              >
                {['cash', 'bank', 'mobile_money', 'clearing'].map(type => (
                  <option key={type} value={type}>
                    {type === 'mobile_money'
                      ? 'Mobile money'
                      : type === 'cash'
                        ? 'Cash on hand'
                        : type === 'bank'
                          ? 'Bank account'
                          : 'Clearing'}
                  </option>
                ))}
              </select>
              <select
                className={fieldClass}
                aria-label="Financial account currency"
                value={accountCurrency}
                onChange={e => setAccountCurrency(e.target.value)}
              >
                <option value="">Currency</option>
                {configuration.currencies.map(code => (
                  <option key={code}>{code}</option>
                ))}
              </select>
              <select
                className={fieldClass}
                aria-label="Linked asset chart account"
                value={accountChartId}
                onChange={e => setAccountChartId(e.target.value)}
              >
                <option value="">Asset chart account</option>
                {assetAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </option>
                ))}
              </select>
              <input
                className={fieldClass}
                placeholder="Bank / mobile-money provider (optional)"
                value={accountProvider}
                onChange={e => setAccountProvider(e.target.value)}
              />
              <input
                className={fieldClass}
                placeholder="Masked account reference (optional)"
                value={accountReference}
                onChange={e => setAccountReference(e.target.value)}
              />
              <button type="button" className={buttonClass} onClick={addFinancialAccount}>
                <Plus size={14} /> Add account
              </button>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {configuration.financialAccounts.map(account => {
                const isPersisted = persistedAccountIds.has(account.id);
                const canToggle = isChurchManaged || !isPersisted;
                return (
                  <li
                    key={account.id}
                    className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">
                        {account.name}{' '}
                        <span className="ml-1 rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                          {account.currency_code}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {account.account_type.replace('_', ' ')}
                        {account.provider_name ? ` · ${account.provider_name}` : ''}
                        {account.account_reference ? ` · ${account.account_reference}` : ''} ·{' '}
                        {account.is_active ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {canToggle && (
                        <button
                          type="button"
                          className={smallActionClass}
                          onClick={() => toggleFinancialAccountActive(account.id)}
                        >
                          {account.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      {!isPersisted && (
                        <button
                          type="button"
                          className={`${smallActionClass} text-rose-700 border-rose-200 hover:bg-rose-50`}
                          onClick={() => removeDraftFinancialAccount(account.id)}
                        >
                          <Trash2 size={12} /> Remove draft
                        </button>
                      )}
                      {!isChurchManaged && isPersisted && (
                        <span className="text-[11px] font-semibold text-slate-400">Saved</span>
                      )}
                    </div>
                  </li>
                );
              })}
              {configuration.financialAccounts.length === 0 && (
                <li className="text-xs text-slate-500">
                  No financial accounts configured in this scope yet.
                </li>
              )}
            </ul>
          </section>
        </div>
      )}

      {/* Financial Years & Periods */}
      {showPeriods && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          {!scope || scope.type === 'church' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-black text-slate-900">Financial years &amp; periods</h3>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  Saves with Save configuration
                </span>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <label className={labelClass} htmlFor="financial-year-input">
                    Add financial year
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="financial-year-input"
                      className={fieldClass}
                      aria-label="Financial year"
                      type="number"
                      value={yearNumber}
                      onChange={e => setYearNumber(e.target.value)}
                    />
                    <button type="button" className={buttonClass} onClick={addYear}>
                      <Plus size={14} /> Add year
                    </button>
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {configuration.financialYears.map(year => (
                      <li
                        key={year.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 border border-slate-200"
                      >
                        <div>
                          <span className="font-bold text-slate-900">FY {year.year_number}</span>
                          <span className="ml-2 text-slate-500">
                            {year.start_date} – {year.end_date}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={smallActionClass}
                          onClick={() => toggleYearStatus(year.id)}
                        >
                          {year.status === 'open' ? (
                            <>
                              <Lock size={12} /> Close year
                            </>
                          ) : (
                            <>
                              <Unlock size={12} /> Reopen
                            </>
                          )}
                        </button>
                      </li>
                    ))}
                    {configuration.financialYears.length === 0 && (
                      <li className="text-slate-500">No financial years configured yet.</li>
                    )}
                  </ul>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <div className={labelClass}>Add financial period</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className={labelClass} htmlFor="period-year-select">
                        Financial year
                      </label>
                      <select
                        id="period-year-select"
                        className={fieldClass}
                        value={periodYearId}
                        onChange={e => setPeriodYearId(e.target.value)}
                      >
                        <option value="">Year</option>
                        {configuration.financialYears.map(year => (
                          <option key={year.id} value={year.id}>
                            {year.year_number}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="period-name-input">
                        Period name
                      </label>
                      <input
                        id="period-name-input"
                        className={fieldClass}
                        placeholder="e.g. Q1 or Annual"
                        value={periodName}
                        onChange={e => setPeriodName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="period-start-input">
                        Start date
                      </label>
                      <input
                        id="period-start-input"
                        className={fieldClass}
                        type="date"
                        value={periodStart}
                        onChange={e => setPeriodStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="period-end-input">
                        End date
                      </label>
                      <input
                        id="period-end-input"
                        className={fieldClass}
                        type="date"
                        value={periodEnd}
                        onChange={e => setPeriodEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <button type="button" className={buttonClass} onClick={addPeriod}>
                    <Plus size={14} /> Add period
                  </button>
                  <ul className="space-y-1.5 text-xs">
                    {configuration.periods.map(period => (
                      <li
                        key={period.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 border border-slate-200"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{period.name}</span>
                          <span className="ml-2 text-slate-500">
                            {period.start_date} to {period.end_date}
                          </span>
                          <span
                            className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              period.status === 'open'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {period.status}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={smallActionClass}
                          onClick={() => togglePeriodStatus(period.id)}
                        >
                          {period.status === 'open' ? (
                            <>
                              <Lock size={12} /> Close period
                            </>
                          ) : (
                            <>
                              <Unlock size={12} /> Reopen
                            </>
                          )}
                        </button>
                      </li>
                    ))}
                    {configuration.periods.length === 0 && (
                      <li className="text-slate-500">No financial periods configured yet.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                Financial years and open periods are managed at church level. Switch the scope
                selector to <strong>Church-wide</strong> to open or close accounting periods.
              </p>
              {hasChurchScope && onSwitchToChurchScope && (
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={onSwitchToChurchScope}
                >
                  <ArrowLeftRight size={14} /> Switch to Church-wide scope
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Approvals & Branch Clearing */}
      {showApprovals && (
        <div className="space-y-4">
          {scope?.type === 'branch' && (
            <section className="rounded-2xl border border-amber-200 bg-white p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-black text-slate-900">Inter-branch clearing accounts</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Required before this branch can send or receive cross-branch transfers. Due-from
                    must be an asset; due-to must be a liability.
                  </p>
                </div>
                <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Saves immediately
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="due-from-select">
                    Due-from branch (asset)
                  </label>
                  <select
                    id="due-from-select"
                    className={fieldClass}
                    value={dueFromChartAccountId}
                    onChange={event => setDueFromChartAccountId(event.target.value)}
                  >
                    <option value="">Select due-from asset account</option>
                    {configuration.chartAccounts
                      .filter(account => account.account_type === 'asset' && account.is_active)
                      .map(account => (
                        <option key={account.id} value={account.id}>
                          {account.code} — {account.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="due-to-select">
                    Due-to branch (liability)
                  </label>
                  <select
                    id="due-to-select"
                    className={fieldClass}
                    value={dueToChartAccountId}
                    onChange={event => setDueToChartAccountId(event.target.value)}
                  >
                    <option value="">Select due-to liability account</option>
                    {configuration.chartAccounts
                      .filter(account => account.account_type === 'liability' && account.is_active)
                      .map(account => (
                        <option key={account.id} value={account.id}>
                          {account.code} — {account.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Same-branch transfers do not use clearing accounts.
                </p>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => void saveClearingAccounts()}
                  disabled={savingClearingAccounts}
                >
                  <Save size={14} />{' '}
                  {savingClearingAccounts ? 'Saving clearing accounts…' : 'Save clearing accounts'}
                </button>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-black text-slate-900">Approval policies</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Configure scope-owned approval rules with non-overlapping base-currency amount
                  bands and ordered approval steps. Existing versions are immutable; clone a policy
                  to issue a new version.
                </p>
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                Saves with Save configuration
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="policy-workflow-type">
                    Workflow type
                  </label>
                  <select
                    id="policy-workflow-type"
                    className={fieldClass}
                    value={policyType}
                    onChange={e => {
                      const next = e.target.value as typeof policyType;
                      setPolicyType(next);
                      setPolicyName(
                        next === 'budget'
                          ? 'Event Budget Approval'
                          : next === 'financial_transfer'
                            ? 'Internal Transfer Approval'
                            : 'Financial Document Approval'
                      );
                    }}
                  >
                    <option value="financial_document">Receipts and payments</option>
                    <option value="budget">Event budget approval</option>
                    {scope?.type === 'branch' && (
                      <option value="financial_transfer">Internal transfer approval</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="policy-name-input">
                    Policy name
                  </label>
                  <input
                    id="policy-name-input"
                    className={fieldClass}
                    placeholder="Policy name"
                    value={policyName}
                    onChange={e => setPolicyName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {policyBands.map((band, bandIndex) => (
                  <div
                    key={bandIndex}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase tracking-wide text-slate-700">
                        Amount band {bandIndex + 1}
                      </span>
                      {policyBands.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePolicyBand(bandIndex)}
                          className={`${smallActionClass} text-rose-700 border-rose-200 hover:bg-rose-50`}
                        >
                          <Trash2 size={12} /> Remove band
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Minimum ({baseCurrencyLabel})</label>
                        <input
                          className={fieldClass}
                          type="number"
                          min="0"
                          placeholder={`Minimum (${baseCurrencyLabel})`}
                          value={band.min}
                          onChange={e => updatePolicyBandField(bandIndex, 'min', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Maximum ({baseCurrencyLabel}, blank = no limit)
                        </label>
                        <input
                          className={fieldClass}
                          type="number"
                          min="0"
                          placeholder="No upper limit"
                          value={band.max}
                          onChange={e => updatePolicyBandField(bandIndex, 'max', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className={labelClass}>Ordered approval steps</label>
                      {band.steps.map((count, stepIndex) => (
                        <div key={stepIndex} className="flex flex-wrap items-center gap-2">
                          <span className="w-16 shrink-0 text-xs font-semibold text-slate-600">
                            Step {stepIndex + 1}
                          </span>
                          <input
                            className={`${fieldClass} flex-1 min-w-[110px]`}
                            type="number"
                            min="1"
                            step="1"
                            value={count}
                            onChange={e =>
                              updatePolicyBandStep(bandIndex, stepIndex, e.target.value)
                            }
                            aria-label={`Band ${bandIndex + 1} step ${stepIndex + 1} required approvals`}
                          />
                          {band.steps.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePolicyBandStep(bandIndex, stepIndex)}
                              className={`${smallActionClass} min-h-[40px] text-rose-700 border-rose-200 hover:bg-rose-50`}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className={`${smallActionClass} text-indigo-700 border-indigo-200 hover:bg-indigo-50`}
                        onClick={() => addPolicyBandStep(bandIndex)}
                      >
                        <Plus size={12} /> Add step to band {bandIndex + 1}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {approverDirectory.available && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <Users size={14} className="text-slate-600" />
                    <span>
                      Eligible finance approvers in this scope:{' '}
                      {approverDirectory.approve_finances.length}
                    </span>
                  </div>
                  {approverDirectory.approve_finances.length > 0 ? (
                    <p className="text-[11px] text-slate-600">
                      Holders of <code>approve_finances</code>:{' '}
                      {approverDirectory.approve_finances
                        .slice(0, 5)
                        .map(person => person.name)
                        .join(', ')}
                      {approverDirectory.approve_finances.length > 5
                        ? ` +${approverDirectory.approve_finances.length - 5} more`
                        : ''}
                      .
                    </p>
                  ) : (
                    <p className="text-[11px] font-semibold text-amber-800">
                      No active profile currently holds <code>approve_finances</code> in this scope.
                      Assign an approver role before submitting transactions.
                    </p>
                  )}
                  {policyBands.some(band =>
                    band.steps.some(
                      count =>
                        Number.isInteger(Number(count)) &&
                        Number(count) > approverDirectory.approve_finances.length
                    )
                  ) && (
                    <p className="text-[11px] font-semibold text-amber-800">
                      Warning: One or more steps ask for more approvals than the{' '}
                      {approverDirectory.approve_finances.length} eligible approver(s) available
                      here (remember submitters cannot self-approve).
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-500">
                Any active profile with scope-compatible <code>approve_finances</code> permission may
                approve. The submitter cannot approve their own transaction.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondaryButtonClass} onClick={addPolicyBand}>
                  <Plus size={14} /> Add amount band
                </button>
                <button type="button" className={buttonClass} onClick={addApprovalPolicy}>
                  <Plus size={14} /> Queue{' '}
                  {policyType === 'budget'
                    ? 'budget'
                    : policyType === 'financial_transfer'
                      ? 'transfer'
                      : 'finance'}{' '}
                  policy
                </button>
              </div>
            </div>

            <ul className="mt-4 space-y-2 text-xs text-slate-700">
              {configuration.approvalPolicies.map(policy => {
                const bandsForPolicy = configuration.approvalPolicyBands
                  .filter(band => band.policy_id === policy.id)
                  .sort((a, b) => Number(a.min_amount_base) - Number(b.min_amount_base));
                const isPersisted = persistedPolicyIds.has(policy.id);
                return (
                  <li
                    key={policy.id}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-bold text-slate-900">
                          {policy.name} · v{policy.version}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-600">
                          {policyTypeLabel(policy.transaction_type)} ·{' '}
                          {policy.district_id
                            ? 'District'
                            : policy.branch_id
                              ? 'Branch'
                              : 'Church-wide'}{' '}
                          · {policy.is_active ? 'Active' : 'Inactive'}
                          {!isPersisted && (
                            <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">
                              Draft
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className={smallActionClass}
                          onClick={() => clonePolicyAsNewVersion(policy)}
                        >
                          <Copy size={12} /> New version
                        </button>
                        {!isPersisted && (
                          <button
                            type="button"
                            className={`${smallActionClass} text-rose-700 border-rose-200 hover:bg-rose-50`}
                            onClick={() => removeDraftApprovalPolicy(policy.id)}
                          >
                            <Trash2 size={12} /> Remove draft
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {bandsForPolicy.map(band => {
                        const stepsForBand = configuration.approvalPolicySteps
                          .filter(step => step.band_id === band.id)
                          .sort((a, b) => Number(a.step_number) - Number(b.step_number));
                        return (
                          <div key={band.id} className="text-[11px] text-slate-600">
                            Band {band.min_amount_base} to {band.max_amount_base ?? '∞'}:{' '}
                            {stepsForBand.length
                              ? stepsForBand
                                  .map(step => `Step ${step.step_number} (${step.required_approvals})`)
                                  .join(' → ')
                              : 'No approval steps'}
                          </div>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
              {configuration.approvalPolicies.length === 0 && (
                <li className="text-slate-500">
                  No approval policies are configured in this scope yet.
                </li>
              )}
            </ul>
          </section>

          {/* Department requisition approval — enabled in Church & Branch scopes */}
          {scope?.type !== 'district' ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-black text-slate-900">Department requisition approval</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Configure an ordered approval policy for ministry and department funding
                    proposals in the selected {effectiveBranchId ? 'branch' : 'church-wide'} scope.
                    Every step requires <code>approve_requisitions</code> and prohibits submitter
                    approval.
                  </p>
                </div>
                <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Saves immediately
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className={labelClass} htmlFor="req-policy-name">
                    Policy name
                  </label>
                  <input
                    id="req-policy-name"
                    className={fieldClass}
                    value={requisitionPolicyName}
                    onChange={e => setRequisitionPolicyName(e.target.value)}
                    placeholder="Department Requisition Approval"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="req-policy-min">
                      Minimum ({baseCurrencyLabel})
                    </label>
                    <input
                      id="req-policy-min"
                      className={fieldClass}
                      type="number"
                      min="0"
                      value={requisitionPolicyMin}
                      onChange={e => setRequisitionPolicyMin(e.target.value)}
                      placeholder={`Minimum (${baseCurrencyLabel})`}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="req-policy-max">
                      Maximum ({baseCurrencyLabel}, blank = no limit)
                    </label>
                    <input
                      id="req-policy-max"
                      className={fieldClass}
                      type="number"
                      min="0"
                      value={requisitionPolicyMax}
                      onChange={e => setRequisitionPolicyMax(e.target.value)}
                      placeholder="No upper limit"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Ordered approval steps</label>
                  {requisitionSteps.map((value, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <span className="w-20 shrink-0 text-xs font-semibold text-slate-600">
                        Step {index + 1}
                      </span>
                      <input
                        className={`${fieldClass} flex-1 min-w-[110px]`}
                        type="number"
                        min="1"
                        step="1"
                        value={value}
                        onChange={e =>
                          setRequisitionSteps(current =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? e.target.value : item
                            )
                          )
                        }
                        aria-label={`Required approvals for step ${index + 1}`}
                      />
                      {requisitionSteps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRequisitionApprovalStep(index)}
                          className={`${smallActionClass} min-h-[40px] text-rose-700 border-rose-200 hover:bg-rose-50`}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {approverDirectory.available && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Users size={14} className="text-slate-600" />
                      <span>
                        Eligible proposal approvers in this scope:{' '}
                        {approverDirectory.approve_requisitions.length}
                      </span>
                    </div>
                    {approverDirectory.approve_requisitions.length > 0 ? (
                      <p className="text-[11px] text-slate-600">
                        Holders of <code>approve_requisitions</code>:{' '}
                        {approverDirectory.approve_requisitions
                          .slice(0, 5)
                          .map(person => person.name)
                          .join(', ')}
                        {approverDirectory.approve_requisitions.length > 5
                          ? ` +${approverDirectory.approve_requisitions.length - 5} more`
                          : ''}
                        .
                      </p>
                    ) : (
                      <p className="text-[11px] font-semibold text-amber-800">
                        No active profile currently holds <code>approve_requisitions</code> in this
                        scope. Assign this permission in Roles &amp; Governance so proposals can be
                        approved.
                      </p>
                    )}
                    {requisitionSteps.some(
                      count =>
                        Number.isInteger(Number(count)) &&
                        Number(count) > approverDirectory.approve_requisitions.length
                    ) && (
                      <p className="text-[11px] font-semibold text-amber-800">
                        Warning: A step requires more approvals than the{' '}
                        {approverDirectory.approve_requisitions.length} eligible approver(s)
                        currently assigned here.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={addRequisitionApprovalStep}
                  >
                    <Plus size={14} /> Add approval step
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={savingRequisitionPolicy}
                    onClick={() => void saveRequisitionPolicy()}
                  >
                    <Save size={14} />{' '}
                    {savingRequisitionPolicy ? 'Saving…' : 'Save requisition policy'}
                  </button>
                </div>
              </div>

              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                {requisitionConfiguration.policies.map(policy => {
                  const policyBandsList = requisitionConfiguration.bands.filter(
                    band => band.policy_id === policy.id
                  );
                  const stepCount = policyBandsList.reduce(
                    (count, band) =>
                      count +
                      requisitionConfiguration.steps.filter(step => step.band_id === band.id)
                        .length,
                    0
                  );
                  return (
                    <li
                      key={policy.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
                    >
                      <div className="font-bold text-slate-900">
                        {policy.name} · v{policy.version}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        {policy.branch_id ? 'Branch' : 'Church-wide'} · {stepCount} approval step(s) ·{' '}
                        {policy.is_active ? 'Active' : 'Inactive'}
                      </div>
                    </li>
                  );
                })}
                {requisitionConfiguration.policies.length === 0 && (
                  <li className="text-slate-500">
                    No requisition approval policy is configured yet. Requisition submission will
                    remain unavailable until one is saved.
                  </li>
                )}
              </ul>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Department requisition approval policies are branch-level workflows. Switch to a
              Branch or Church-wide scope to configure them.
            </section>
          )}
        </div>
      )}

      {/* Sticky Unsaved Draft Action Bar (stays clear of mobile bottom nav) */}
      {hasUnsavedChanges && (
        <div
          role="region"
          aria-label="Unsaved accounting configuration changes"
          className="sticky bottom-[76px] lg:bottom-4 z-30 flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50/95 p-3.5 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="text-xs font-bold text-amber-950">
            You have queued changes in this scope. Save configuration to persist them.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void reload()}
              disabled={saving}
            >
              Discard
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => void save()}
              disabled={saving}
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save configuration'}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Finance configuration is loaded and saved through authenticated PostgreSQL RPCs. Changes are
        subject to database permissions, organizational scope, validation and audit controls.
      </p>
    </div>
  );
};

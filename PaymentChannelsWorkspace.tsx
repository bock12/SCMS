import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Trash2
} from 'lucide-react';
import type { FinanceOwnershipScope } from './financeConfigurationService';
import {
  deletePaymentChannel,
  getPaymentChannelConfiguration,
  savePaymentChannel,
  setPaymentChannelStatus,
  type PaymentChannelConfiguration,
  type PaymentChannelRecord,
  type PaymentChannelType,
  type PaymentChannelVerificationMode
} from './paymentChannelService';

interface PaymentChannelsWorkspaceProps {
  scope: FinanceOwnershipScope;
  scopeLabel?: string;
  canManageFinances?: boolean;
  onOpenAccountingSetup?: () => void;
}

const emptyConfiguration = (scope: FinanceOwnershipScope): PaymentChannelConfiguration => ({
  scope,
  currencies: [],
  baseCurrencyCode: null,
  channels: [],
  eligibleFinancialAccounts: [],
  activeFunds: []
});

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none';
const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-700';

export const PaymentChannelsWorkspace: React.FC<PaymentChannelsWorkspaceProps> = ({
  scope,
  scopeLabel,
  canManageFinances = true,
  onOpenAccountingSetup
}) => {
  const [config, setConfig] = useState<PaymentChannelConfiguration>(() => emptyConfiguration(scope));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<'all' | PaymentChannelType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [channelType, setChannelType] = useState<PaymentChannelType>('mobile_money');
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [defaultFundId, setDefaultFundId] = useState('');
  const [providerName, setProviderName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumberOrCode, setAccountNumberOrCode] = useState('');
  const [branchOrSwiftCode, setBranchOrSwiftCode] = useState('');
  const [instructions, setInstructions] = useState('');
  const [verificationMode, setVerificationMode] = useState<PaymentChannelVerificationMode>('manual_proof');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);

  const reload = async () => {
    setLoading(true);
    setError(null);
    const result = await getPaymentChannelConfiguration(scope);
    if (result.error) {
      setError(result.error.message);
      setConfig(emptyConfiguration(scope));
    } else {
      setConfig(result.data || emptyConfiguration(scope));
    }
    setLoading(false);
  };

  useEffect(() => {
    resetForm();
    void reload();
  }, [scope.type, scope.id]);

  useEffect(() => {
    const handleConfigUpdated = () => { void reload(); };
    window.addEventListener('finance_configuration_updated', handleConfigUpdated);
    return () => window.removeEventListener('finance_configuration_updated', handleConfigUpdated);
  }, [scope.type, scope.id]);

  const matchingAccounts = useMemo(() => {
    const expectedAccountType = channelType === 'mobile_money' ? 'mobile_money' : 'bank';
    return config.eligibleFinancialAccounts.filter(account => account.account_type === expectedAccountType);
  }, [config.eligibleFinancialAccounts, channelType]);

  useEffect(() => {
    if (matchingAccounts.length === 0) {
      setFinancialAccountId('');
      return;
    }
    if (!matchingAccounts.some(account => account.id === financialAccountId)) {
      setFinancialAccountId(matchingAccounts[0].id);
    }
  }, [matchingAccounts, financialAccountId]);

  const resetForm = () => {
    setEditingId(null);
    setChannelType('mobile_money');
    setFinancialAccountId('');
    setDefaultFundId('');
    setProviderName('');
    setAccountName('');
    setAccountNumberOrCode('');
    setBranchOrSwiftCode('');
    setInstructions('');
    setVerificationMode('manual_proof');
    setDisplayOrder('0');
    setIsActive(true);
  };

  const handleEdit = (channel: PaymentChannelRecord) => {
    setError(null);
    setNotice(null);
    setEditingId(channel.id);
    setChannelType(channel.channel_type);
    setFinancialAccountId(channel.financial_account_id);
    setDefaultFundId(channel.default_fund_id || '');
    setProviderName(channel.provider_name);
    setAccountName(channel.account_name);
    setAccountNumberOrCode(channel.account_number_or_code);
    setBranchOrSwiftCode(channel.branch_or_swift_code || '');
    setInstructions(channel.instructions || '');
    setVerificationMode(channel.verification_mode || 'manual_proof');
    setDisplayOrder(String(channel.display_order ?? 0));
    setIsActive(Boolean(channel.is_active));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!financialAccountId) {
      setError(
        channelType === 'mobile_money'
          ? 'Link an active mobile-money financial account from Accounting Setup first.'
          : 'Link an active bank financial account from Accounting Setup first.'
      );
      return;
    }
    const parsedOrder = Number(displayOrder);
    if (!Number.isInteger(parsedOrder) || parsedOrder < 0) {
      setError('Display order must be zero or a positive whole number.');
      return;
    }

    setSaving(true);
    const result = await savePaymentChannel(scope, {
      id: editingId,
      financial_account_id: financialAccountId,
      default_fund_id: defaultFundId || null,
      channel_type: channelType,
      provider_name: providerName.trim(),
      account_name: accountName.trim(),
      account_number_or_code: accountNumberOrCode.trim(),
      branch_or_swift_code: branchOrSwiftCode.trim() || null,
      instructions: instructions.trim() || null,
      verification_mode: verificationMode,
      display_order: parsedOrder,
      is_active: isActive
    });
    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setNotice(editingId ? 'Payment channel updated.' : 'Payment channel saved.');
    resetForm();
    await reload();
    window.dispatchEvent(new Event('finance_payment_channels_updated'));
  };

  const handleToggleStatus = async (channel: PaymentChannelRecord) => {
    setError(null);
    setNotice(null);
    const result = await setPaymentChannelStatus(channel.id, !channel.is_active);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setNotice(`${channel.provider_name} is now ${!channel.is_active ? 'active' : 'disabled'}.`);
    await reload();
    window.dispatchEvent(new Event('finance_payment_channels_updated'));
  };

  const handleDelete = async (channel: PaymentChannelRecord) => {
    setError(null);
    setNotice(null);
    const result = await deletePaymentChannel(channel.id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setConfirmDeleteId(null);
    if (editingId === channel.id) resetForm();
    setNotice(`Removed payment channel "${channel.provider_name}".`);
    await reload();
    window.dispatchEvent(new Event('finance_payment_channels_updated'));
  };

  const filteredChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return config.channels.filter(channel => {
      if (filterType !== 'all' && channel.channel_type !== filterType) return false;
      if (!q) return true;
      return (
        channel.provider_name.toLowerCase().includes(q) ||
        channel.account_name.toLowerCase().includes(q) ||
        channel.account_number_or_code.toLowerCase().includes(q) ||
        channel.financial_account_name.toLowerCase().includes(q)
      );
    });
  }, [config.channels, filterType, searchQuery]);

  const activeCount = config.channels.filter(item => item.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Payment Channels{scopeLabel ? ` · ${scopeLabel}` : ''} · Persisted Database Configuration
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
            Payment Channels &amp; Giving Destinations
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Configure verified mobile-money providers and bank-transfer instructions linked to active financial accounts from Accounting Setup.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenAccountingSetup && (
            <button
              type="button"
              onClick={onOpenAccountingSetup}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Landmark size={14} />
              <span>Accounting Setup</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left: Configured Channels Directory */}
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-base font-bold text-slate-900">Configured Channels</h4>
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                {activeCount} active / {config.channels.length} total in this scope
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`rounded-md px-3 py-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  filterType === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterType('mobile_money')}
                className={`rounded-md px-3 py-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  filterType === 'mobile_money' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mobile Money
              </button>
              <button
                type="button"
                onClick={() => setFilterType('bank_transfer')}
                className={`rounded-md px-3 py-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  filterType === 'bank_transfer' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bank Transfer
              </button>
            </div>
          </div>

          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search provider, account name, code or linked ledger account..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
              <p className="text-sm font-semibold text-slate-800">
                {config.channels.length === 0
                  ? 'No payment channels configured for this scope'
                  : 'No payment channels match the current filter'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {config.channels.length === 0
                  ? 'Add a mobile-money merchant or bank-transfer channel linked to an operational account in Accounting Setup.'
                  : 'Clear your search or switch the channel type filter to see configured destinations.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border-t border-slate-200">
              {filteredChannels.map(channel => (
                <article key={channel.id} className="py-4 first:pt-3 last:pb-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        {channel.channel_type === 'mobile_money'
                          ? <Smartphone size={15} className="shrink-0 text-slate-600" />
                          : <Landmark size={15} className="shrink-0 text-slate-600" />}
                        <h5 className="truncate text-sm font-bold text-slate-900">
                          {channel.provider_name}
                        </h5>
                        <span className="text-xs text-slate-400" aria-hidden="true">·</span>
                        <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                          {channel.account_number_or_code}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                        <span>Beneficiary: <strong className="font-semibold text-slate-800">{channel.account_name}</strong></span>
                        <span aria-hidden="true">·</span>
                        <span>Ledger account: {channel.financial_account_name} ({channel.currency_code})</span>
                        {channel.default_fund_name && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Default fund: {channel.default_fund_name}</span>
                          </>
                        )}
                        {channel.branch_or_swift_code && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">Code: {channel.branch_or_swift_code}</span>
                          </>
                        )}
                      </div>

                      {channel.instructions && (
                        <p className="pt-1 text-xs leading-5 text-slate-600">{channel.instructions}</p>
                      )}

                      <p className="text-xs text-slate-500">
                        Status:{' '}
                        <span className={channel.is_active ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}>
                          {channel.is_active ? 'Active' : 'Disabled'}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>{channel.verification_mode === 'provider_reference' ? 'Provider reference matching' : 'Manual proof verification'}</span>
                      </p>
                    </div>

                    {canManageFinances && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(channel)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {channel.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(channel)}
                          aria-label={`Edit ${channel.provider_name}`}
                          className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          <Pencil size={14} />
                        </button>
                        {confirmDeleteId === channel.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleDelete(channel)}
                              className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(channel.id)}
                            aria-label={`Delete ${channel.provider_name}`}
                            className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:border-rose-300 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Right: Create / Edit Channel Form */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h4 className="text-base font-bold text-slate-900">
                {editingId ? 'Edit Payment Channel' : 'Add Payment Channel'}
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Every channel settles into a persisted operational asset account.
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0"
              >
                Cancel edit
              </button>
            )}
          </div>

          {!canManageFinances ? (
            <p className="mt-4 text-sm text-slate-600">
              You have read-only access to payment channels in this scope. Finance management permission is required to create or update channels.
            </p>
          ) : (
            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <span className={labelClass}>Channel Type</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannelType('mobile_money')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      channelType === 'mobile_money'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Smartphone size={14} />
                    <span>Mobile Money</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelType('bank_transfer')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      channelType === 'bank_transfer'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Landmark size={14} />
                    <span>Bank Transfer</span>
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="pc-financial-account" className={labelClass}>
                  Linked Operational Account *
                </label>
                {matchingAccounts.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                    <p className="font-semibold">
                      No active {channelType === 'mobile_money' ? 'mobile-money' : 'bank'} financial account found in this scope.
                    </p>
                    <p className="mt-1 text-amber-900">
                      Create an active {channelType === 'mobile_money' ? 'Mobile-Money Account' : 'Bank Account'} in Accounting Setup before registering this channel.
                    </p>
                    {onOpenAccountingSetup && (
                      <button
                        type="button"
                        onClick={onOpenAccountingSetup}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 cursor-pointer whitespace-nowrap"
                      >
                        <Landmark size={13} />
                        <span>Open Accounting Setup</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <select
                    id="pc-financial-account"
                    value={financialAccountId}
                    onChange={e => setFinancialAccountId(e.target.value)}
                    required
                    className={fieldClass}
                  >
                    {matchingAccounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.currency_code}){account.account_reference ? ` · ${account.account_reference}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label htmlFor="pc-provider-name" className={labelClass}>
                  {channelType === 'mobile_money' ? 'Mobile Money Provider *' : 'Bank Institution Name *'}
                </label>
                <input
                  id="pc-provider-name"
                  type="text"
                  required
                  value={providerName}
                  onChange={e => setProviderName(e.target.value)}
                  placeholder={channelType === 'mobile_money' ? 'e.g. Afrimoney, Orange Money, MTN MoMo' : 'e.g. Sierra Leone Commercial Bank'}
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="pc-account-name" className={labelClass}>
                  Beneficiary / Merchant Name *
                </label>
                <input
                  id="pc-account-name"
                  type="text"
                  required
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  placeholder="Registered church merchant or bank account title"
                  className={fieldClass}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pc-account-code" className={labelClass}>
                    {channelType === 'mobile_money' ? 'Merchant Code / Phone *' : 'Account Number *'}
                  </label>
                  <input
                    id="pc-account-code"
                    type="text"
                    required
                    value={accountNumberOrCode}
                    onChange={e => setAccountNumberOrCode(e.target.value)}
                    placeholder={channelType === 'mobile_money' ? 'Merchant code or wallet number' : 'Official church account number'}
                    className={`${fieldClass} font-mono tabular-nums`}
                  />
                </div>

                <div>
                  <label htmlFor="pc-branch-swift" className={labelClass}>
                    {channelType === 'mobile_money' ? 'USSD / Shortcode' : 'SWIFT / Branch Code'}
                  </label>
                  <input
                    id="pc-branch-swift"
                    type="text"
                    value={branchOrSwiftCode}
                    onChange={e => setBranchOrSwiftCode(e.target.value)}
                    placeholder={channelType === 'mobile_money' ? 'Optional USSD code' : 'Optional SWIFT / branch code'}
                    className={`${fieldClass} font-mono`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pc-default-fund" className={labelClass}>Default Fund</label>
                  <select
                    id="pc-default-fund"
                    value={defaultFundId}
                    onChange={e => setDefaultFundId(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Any active fund</option>
                    {config.activeFunds.map(fund => (
                      <option key={fund.id} value={fund.id}>
                        {fund.code} · {fund.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pc-verification-mode" className={labelClass}>Verification Mode</label>
                  <select
                    id="pc-verification-mode"
                    value={verificationMode}
                    onChange={e => setVerificationMode(e.target.value as PaymentChannelVerificationMode)}
                    className={fieldClass}
                  >
                    <option value="manual_proof">Manual proof verification</option>
                    <option value="provider_reference">Provider reference matching</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="pc-instructions" className={labelClass}>
                  Congregant Payment Instructions
                </label>
                <textarea
                  id="pc-instructions"
                  rows={3}
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  placeholder="Step-by-step USSD dial sequence or bank transfer reference guidance"
                  className={fieldClass}
                />
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  />
                  <span>Channel active in Giving Portal</span>
                </label>

                <div className="flex items-center gap-2">
                  <label htmlFor="pc-order" className="text-xs font-semibold text-slate-600">Order</label>
                  <input
                    id="pc-order"
                    type="number"
                    min={0}
                    value={displayOrder}
                    onChange={e => setDisplayOrder(e.target.value)}
                    className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center font-mono text-xs text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || matchingAccounts.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                <Plus size={14} />
                <span>{saving ? 'Saving...' : editingId ? 'Update Payment Channel' : 'Save Payment Channel'}</span>
              </button>
            </form>
          )}
        </section>
      </div>

      {/* Persisted Active Funds & Currencies Summary */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Active Funds &amp; Currencies</h4>
            <p className="text-xs text-slate-500">
              Base currency: <span className="font-mono font-semibold text-slate-800">{config.baseCurrencyCode || 'Not set'}</span>
              {' · '}
              Active currencies: <span className="font-mono font-semibold text-slate-800">{config.currencies.length ? config.currencies.join(', ') : 'None'}</span>
            </p>
          </div>
          {onOpenAccountingSetup && (
            <button
              type="button"
              onClick={onOpenAccountingSetup}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              Manage funds &amp; currencies in Accounting Setup
            </button>
          )}
        </div>
        {config.activeFunds.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No active funds are configured in this scope yet.</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
            {config.activeFunds.map((fund, index) => (
              <React.Fragment key={fund.id}>
                {index > 0 && <span className="text-slate-300" aria-hidden="true">·</span>}
                <span>
                  <span className="font-mono font-semibold text-slate-900">{fund.code}</span> {fund.name}
                  {fund.is_default ? ' (Default)' : ''}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

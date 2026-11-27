import { describe, expect, test } from 'bun:test';
import { DEFAULT_GIVING_CONFIG } from './givingConfig';
import { createEmptyMockFinanceState, createMockFinanceRpc, type MockFinanceState } from './mockFinanceRpc';
import {
  deletePaymentChannel,
  getMemberGivingChannels,
  getPaymentChannelConfiguration,
  savePaymentChannel,
  setPaymentChannelStatus
} from './paymentChannelService';

function createPaymentChannelFixture() {
  const state: MockFinanceState = {
    ...createEmptyMockFinanceState(),
    profiles: [
      {
        id: 'finance-manager',
        auth_user_id: 'user-manager',
        branch_id: 'branch-a',
        membership_status: 'active',
        record_status: 'active'
      },
      {
        id: 'finance-viewer',
        auth_user_id: 'user-viewer',
        branch_id: 'branch-a',
        membership_status: 'active',
        record_status: 'active'
      },
      {
        id: 'member-a',
        auth_user_id: 'user-member-a',
        branch_id: 'branch-a',
        membership_status: 'active',
        record_status: 'active'
      },
      {
        id: 'member-b',
        auth_user_id: 'user-member-b',
        branch_id: 'branch-b',
        membership_status: 'active',
        record_status: 'active'
      }
    ],
    permissions: [
      { profile_id: 'finance-manager', permission: 'manage_finances', branch_id: 'branch-a' },
      { profile_id: 'finance-manager', permission: 'manage_finances', branch_id: null, district_id: 'district-a' },
      { profile_id: 'finance-manager', permission: 'manage_finances', branch_id: null, district_id: null },
      { profile_id: 'finance-viewer', permission: 'view_finances', branch_id: 'branch-a' }
    ],
    districts: [
      { id: 'district-a', name: 'Freetown District', status: 'active' },
      { id: 'district-b', name: 'Bo District', status: 'active' }
    ],
    branches: [
      { id: 'branch-a', district_id: 'district-a', name: 'Central Sanctuary', status: 'active' },
      { id: 'branch-b', district_id: 'district-b', name: 'Bo Sanctuary', status: 'active' }
    ],
    currencies: ['SLE', 'USD'],
    baseCurrencyCode: 'SLE',
    chartAccounts: [
      { id: 'coa-bank', code: '1020', name: 'Bank Accounts', account_type: 'asset', normal_balance: 'debit', is_active: true, is_control_account: false },
      { id: 'coa-momo', code: '1030', name: 'Mobile Money', account_type: 'asset', normal_balance: 'debit', is_active: true, is_control_account: false }
    ],
    financialAccounts: [
      {
        id: 'fa-momo-branch-a',
        chart_account_id: 'coa-momo',
        branch_id: 'branch-a',
        district_id: 'district-a',
        name: 'Central Orange Money Collection',
        account_type: 'mobile_money',
        currency_code: 'SLE',
        is_active: true
      },
      {
        id: 'fa-bank-church',
        chart_account_id: 'coa-bank',
        branch_id: null,
        district_id: null,
        name: 'National Treasury Bank Account',
        account_type: 'bank',
        currency_code: 'SLE',
        is_active: true
      },
      {
        id: 'fa-bank-branch-b',
        chart_account_id: 'coa-bank',
        branch_id: 'branch-b',
        district_id: 'district-b',
        name: 'Bo Branch Bank Account',
        account_type: 'bank',
        currency_code: 'SLE',
        is_active: true
      },
      {
        id: 'fa-momo-inactive',
        chart_account_id: 'coa-momo',
        branch_id: 'branch-a',
        district_id: 'district-a',
        name: 'Archived Wallet',
        account_type: 'mobile_money',
        currency_code: 'SLE',
        is_active: false
      }
    ],
    funds: [
      { id: 'fund-tithe', branch_id: null, district_id: null, code: 'TITHE', name: 'General Tithe & Offering', fund_type: 'general', is_default: true, is_active: true },
      { id: 'fund-branch-b', branch_id: 'branch-b', district_id: 'district-b', code: 'BO', name: 'Bo Expansion', fund_type: 'designated', is_default: false, is_active: true }
    ]
  };

  let current = structuredClone(state);
  let authUserId: string | null = 'user-manager';
  const rpc = createMockFinanceRpc(
    {
      load: () => structuredClone(current),
      save: (next: MockFinanceState) => { current = structuredClone(next); }
    },
    () => ({ userId: authUserId })
  );

  return {
    rpc,
    setUser: (userId: string | null) => { authUserId = userId; },
    read: () => structuredClone(current)
  };
}

describe('paymentChannelService & givingConfig safety', () => {
  test('never exposes sample merchant codes or fake church bank details by default', () => {
    expect(DEFAULT_GIVING_CONFIG.mobile_gateways).toEqual([]);
    expect(DEFAULT_GIVING_CONFIG.bank_details.bank_name).toBe('');
    expect(DEFAULT_GIVING_CONFIG.bank_details.account_name).toBe('');
    expect(DEFAULT_GIVING_CONFIG.bank_details.account_number).toBe('');
  });

  test('starts empty and supports full create, update, toggle, and delete lifecycle in scope', async () => {
    const ctx = createPaymentChannelFixture();
    const branchScope = { type: 'branch' as const, id: 'branch-a' };

    const initial = await getPaymentChannelConfiguration(branchScope, ctx.rpc);
    expect(initial.error).toBeNull();
    expect(initial.data?.channels).toEqual([]);
    expect(initial.data?.eligibleFinancialAccounts.map(a => a.id)).toEqual([
      'fa-momo-branch-a',
      'fa-bank-church'
    ]);

    // Save mobile-money channel
    const createdMobile = await savePaymentChannel(
      branchScope,
      {
        financial_account_id: 'fa-momo-branch-a',
        default_fund_id: 'fund-tithe',
        channel_type: 'mobile_money',
        provider_name: 'Orange Money',
        account_name: 'Central Sanctuary Treasury',
        account_number_or_code: '449012',
        branch_or_swift_code: '*144*4*449012#',
        instructions: 'Dial USSD code and confirm treasury receipt.',
        verification_mode: 'provider_reference',
        display_order: 1,
        is_active: true
      },
      ctx.rpc
    );
    expect(createdMobile.error).toBeNull();
    const channelId = createdMobile.data?.channel.id as string;
    expect(channelId).toBeTruthy();

    // Update existing channel
    const updatedMobile = await savePaymentChannel(
      branchScope,
      {
        id: channelId,
        financial_account_id: 'fa-momo-branch-a',
        default_fund_id: 'fund-tithe',
        channel_type: 'mobile_money',
        provider_name: 'Orange Money SL',
        account_name: 'Central Sanctuary Treasury',
        account_number_or_code: '449099',
        verification_mode: 'manual_proof',
        display_order: 2,
        is_active: true
      },
      ctx.rpc
    );
    expect(updatedMobile.error).toBeNull();
    expect(updatedMobile.data?.channel.provider_name).toBe('Orange Money SL');

    // Toggle status off
    const disabled = await setPaymentChannelStatus(channelId, false, ctx.rpc);
    expect(disabled.error).toBeNull();
    expect(disabled.data?.is_active).toBe(false);

    const reloaded = await getPaymentChannelConfiguration(branchScope, ctx.rpc);
    expect(reloaded.data?.channels).toHaveLength(1);
    expect(reloaded.data?.channels[0].is_active).toBe(false);

    // Delete channel
    const removed = await deletePaymentChannel(channelId, ctx.rpc);
    expect(removed.error).toBeNull();
    expect(removed.data?.deleted).toBe(true);

    const afterDelete = await getPaymentChannelConfiguration(branchScope, ctx.rpc);
    expect(afterDelete.data?.channels).toEqual([]);
  });

  test('enforces account-type matching and blocks cross-scope IDOR or account linkage', async () => {
    const ctx = createPaymentChannelFixture();
    const branchScope = { type: 'branch' as const, id: 'branch-a' };
    const churchScope = { type: 'church' as const, id: null };

    // Cannot link mobile_money channel to bank account
    const wrongTypeMobile = await savePaymentChannel(
      branchScope,
      {
        financial_account_id: 'fa-bank-church',
        channel_type: 'mobile_money',
        provider_name: 'Afrimoney',
        account_name: 'Central Treasury',
        account_number_or_code: '112233'
      },
      ctx.rpc
    );
    expect(wrongTypeMobile.error?.message).toContain('mobile_money financial account');

    // Cannot link bank_transfer channel to mobile_money account
    const wrongTypeBank = await savePaymentChannel(
      branchScope,
      {
        financial_account_id: 'fa-momo-branch-a',
        channel_type: 'bank_transfer',
        provider_name: 'SLCB',
        account_name: 'Central Treasury',
        account_number_or_code: '99887766'
      },
      ctx.rpc
    );
    expect(wrongTypeBank.error?.message).toContain('bank financial account');

    // Cannot link branch-b bank account inside branch-a scope
    const crossScopeAccount = await savePaymentChannel(
      branchScope,
      {
        financial_account_id: 'fa-bank-branch-b',
        channel_type: 'bank_transfer',
        provider_name: 'Bo Bank',
        account_name: 'Bo Account',
        account_number_or_code: '123456'
      },
      ctx.rpc
    );
    expect(crossScopeAccount.error?.message).toContain('outside the requested scope');

    // Save a church-wide bank channel, then attempt cross-scope update via branch-a (IDOR check)
    const churchChannel = await savePaymentChannel(
      churchScope,
      {
        financial_account_id: 'fa-bank-church',
        channel_type: 'bank_transfer',
        provider_name: 'Rokel Commercial Bank',
        account_name: 'National Church Treasury',
        account_number_or_code: '100200300'
      },
      ctx.rpc
    );
    expect(churchChannel.error).toBeNull();

    const idorAttempt = await savePaymentChannel(
      branchScope,
      {
        id: churchChannel.data?.channel.id,
        financial_account_id: 'fa-bank-church',
        channel_type: 'bank_transfer',
        provider_name: 'Tampered Bank',
        account_name: 'Tampered',
        account_number_or_code: '000000'
      },
      ctx.rpc
    );
    expect(idorAttempt.error?.code).toBe('42501');
  });

  test('enforces view_finances vs manage_finances permissions and member giving channel scope rules', async () => {
    const ctx = createPaymentChannelFixture();
    const branchScope = { type: 'branch' as const, id: 'branch-a' };

    const churchBank = await savePaymentChannel(
      { type: 'church', id: null },
      {
        financial_account_id: 'fa-bank-church',
        default_fund_id: 'fund-tithe',
        channel_type: 'bank_transfer',
        provider_name: 'National Bank',
        account_name: 'Church HQ Account',
        account_number_or_code: '22001100',
        is_active: true
      },
      ctx.rpc
    );
    expect(churchBank.error).toBeNull();

    const activeBranchMomo = await savePaymentChannel(
      branchScope,
      {
        financial_account_id: 'fa-momo-branch-a',
        default_fund_id: 'fund-tithe',
        channel_type: 'mobile_money',
        provider_name: 'Orange Money',
        account_name: 'Central Branch Wallet',
        account_number_or_code: '771001',
        is_active: true
      },
      ctx.rpc
    );
    expect(activeBranchMomo.error).toBeNull();

    const disabledBranchMomo = await savePaymentChannel(
      branchScope,
      {
        financial_account_id: 'fa-momo-branch-a',
        channel_type: 'mobile_money',
        provider_name: 'Disabled Provider',
        account_name: 'Disabled Wallet',
        account_number_or_code: '000000',
        is_active: false
      },
      ctx.rpc
    );
    expect(disabledBranchMomo.error).toBeNull();

    // Viewer can read configuration, but cannot mutate payment channels
    ctx.setUser('user-viewer');
    const viewerRead = await getPaymentChannelConfiguration(branchScope, ctx.rpc);
    expect(viewerRead.error).toBeNull();
    expect(viewerRead.data?.channels).toHaveLength(2);

    const viewerSave = await savePaymentChannel(
      branchScope,
      {
        financial_account_id: 'fa-momo-branch-a',
        channel_type: 'mobile_money',
        provider_name: 'Blocked',
        account_name: 'Blocked',
        account_number_or_code: '999'
      },
      ctx.rpc
    );
    expect(viewerSave.error?.code).toBe('42501');

    const viewerToggle = await setPaymentChannelStatus(activeBranchMomo.data!.channel.id, false, ctx.rpc);
    expect(viewerToggle.error?.code).toBe('42501');

    const viewerDelete = await deletePaymentChannel(activeBranchMomo.data!.channel.id, ctx.rpc);
    expect(viewerDelete.error?.code).toBe('42501');

    // Branch A member receives active branch-a + church channels & funds, never disabled channels
    ctx.setUser('user-member-a');
    const memberChannels = await getMemberGivingChannels('branch-a', ctx.rpc);
    expect(memberChannels.error).toBeNull();
    expect(memberChannels.data?.baseCurrencyCode).toBe('SLE');
    expect(memberChannels.data?.channels.map(c => c.provider_name)).toEqual([
      'Orange Money',
      'National Bank'
    ]);
    expect(memberChannels.data?.funds.map(f => f.code)).toEqual(['TITHE']);

    // Member B cannot query Branch A giving channels without permission
    ctx.setUser('user-member-b');
    const unauthorizedBranch = await getMemberGivingChannels('branch-a', ctx.rpc);
    expect(unauthorizedBranch.error?.code).toBe('42501');

    // Unauthenticated access fails
    ctx.setUser(null);
    const unauth = await getMemberGivingChannels(null, ctx.rpc);
    expect(unauth.error?.code).toBe('42501');
  });
});

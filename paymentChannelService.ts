import { financeSupabase } from './financeSupabaseClient';
import type { FinanceOwnershipScope } from './financeConfigurationService';

export type PaymentChannelType = 'mobile_money' | 'bank_transfer';
export type PaymentChannelVerificationMode = 'manual_proof' | 'provider_reference';

export interface PaymentChannelRecord {
  id: string;
  branch_id: string | null;
  district_id: string | null;
  financial_account_id: string;
  financial_account_name: string;
  financial_account_type: 'cash' | 'bank' | 'mobile_money' | 'clearing' | null;
  currency_code: string;
  default_fund_id: string | null;
  default_fund_name: string | null;
  channel_type: PaymentChannelType;
  provider_name: string;
  account_name: string;
  account_number_or_code: string;
  branch_or_swift_code: string | null;
  instructions: string | null;
  verification_mode: PaymentChannelVerificationMode;
  display_order: number;
  is_active: boolean;
  updated_at?: string;
}

export interface EligiblePaymentFinancialAccount {
  id: string;
  chart_account_id: string;
  branch_id: string | null;
  district_id?: string | null;
  name: string;
  account_type: 'bank' | 'mobile_money';
  currency_code: string;
  provider_name?: string | null;
  account_reference?: string | null;
  is_active: boolean;
}

export interface PaymentChannelFundOption {
  id: string;
  branch_id?: string | null;
  district_id?: string | null;
  name: string;
  code: string;
  description?: string | null;
  fund_type: 'general' | 'designated' | 'restricted';
  is_default: boolean;
  is_active?: boolean;
}

export interface PaymentChannelConfiguration {
  scope: FinanceOwnershipScope;
  currencies: string[];
  baseCurrencyCode: string | null;
  channels: PaymentChannelRecord[];
  eligibleFinancialAccounts: EligiblePaymentFinancialAccount[];
  activeFunds: PaymentChannelFundOption[];
}

export interface SavePaymentChannelInput {
  id?: string | null;
  financial_account_id: string;
  default_fund_id?: string | null;
  channel_type: PaymentChannelType;
  provider_name: string;
  account_name: string;
  account_number_or_code: string;
  branch_or_swift_code?: string | null;
  instructions?: string | null;
  verification_mode?: PaymentChannelVerificationMode;
  display_order?: number;
  is_active?: boolean;
}

export interface MemberGivingChannel {
  id: string;
  scope_type: 'church' | 'district' | 'branch';
  branch_id: string | null;
  district_id: string | null;
  channel_type: PaymentChannelType;
  provider_name: string;
  account_name: string;
  account_number_or_code: string;
  branch_or_swift_code: string | null;
  instructions: string | null;
  currency_code: string;
  default_fund_id: string | null;
  default_fund_name: string | null;
  verification_mode: PaymentChannelVerificationMode;
  display_order: number;
}

export interface MemberGivingChannelsPayload {
  branch_id: string | null;
  currencies: string[];
  baseCurrencyCode: string | null;
  channels: MemberGivingChannel[];
  funds: PaymentChannelFundOption[];
}

type RpcResponse<T> = { data: T | null; error: { message: string; code?: string } | null };
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResponse<any>> };
const defaultRpcClient = financeSupabase as unknown as RpcClient;

export async function getPaymentChannelConfiguration(
  scope: FinanceOwnershipScope,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<PaymentChannelConfiguration>> {
  return client.rpc('get_payment_channel_configuration', {
    p_scope_type: scope.type,
    p_scope_id: scope.id
  });
}

export async function savePaymentChannel(
  scope: FinanceOwnershipScope,
  channel: SavePaymentChannelInput,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<{ saved: boolean; channel: PaymentChannelRecord }>> {
  return client.rpc('save_payment_channel', {
    p_scope_type: scope.type,
    p_scope_id: scope.id,
    p_channel: channel
  });
}

export async function setPaymentChannelStatus(
  channelId: string,
  isActive: boolean,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<{ id: string; is_active: boolean }>> {
  return client.rpc('set_payment_channel_status', {
    p_channel_id: channelId,
    p_is_active: isActive
  });
}

export async function deletePaymentChannel(
  channelId: string,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<{ deleted: boolean; id: string }>> {
  return client.rpc('delete_payment_channel', {
    p_channel_id: channelId
  });
}

export async function getMemberGivingChannels(
  branchId: string | null = null,
  client: RpcClient = defaultRpcClient
): Promise<RpcResponse<MemberGivingChannelsPayload>> {
  return client.rpc('get_member_giving_channels', {
    p_branch_id: branchId
  });
}

import type { MemberTransfer } from './types';
import { supabase } from './supabaseClient';

export interface RequestMemberTransferInput {
  /** Omit to request a transfer for the currently signed-in member. */
  memberId?: string;
  toBranchId: string;
  notes?: string;
}

export async function getMemberTransfers(): Promise<MemberTransfer[]> {
  const { data, error } = await supabase
    .from('member_transfers')
    .select('*')
    .order('requested_at', { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data as MemberTransfer[] : [];
}

export async function requestMemberTransfer(
  input: RequestMemberTransferInput
): Promise<MemberTransfer> {
  if (!input.toBranchId) throw new Error('Select the destination branch.');

  const { data, error } = await supabase.rpc('manage_member_transfer', {
    p_action: 'request',
    p_member_id: input.memberId || null,
    p_to_branch_id: input.toBranchId,
    p_notes: input.notes?.trim() || null
  });

  if (error) throw error;
  if (!data) throw new Error('The member transfer request was not saved.');
  return data as MemberTransfer;
}

export async function reviewMemberTransfer(
  transferId: string,
  decision: 'approve' | 'reject'
): Promise<MemberTransfer> {
  if (!transferId) throw new Error('A transfer request is required.');

  const { data, error } = await supabase.rpc('manage_member_transfer', {
    p_action: decision,
    p_transfer_id: transferId
  });

  if (error) throw error;
  if (!data) throw new Error('The member transfer review was not saved.');
  return data as MemberTransfer;
}

export async function cancelMemberTransfer(transferId: string): Promise<MemberTransfer> {
  if (!transferId) throw new Error('A transfer request is required.');

  const { data, error } = await supabase.rpc('manage_member_transfer', {
    p_action: 'cancel',
    p_transfer_id: transferId
  });

  if (error) throw error;
  if (!data) throw new Error('The member transfer cancellation was not saved.');
  return data as MemberTransfer;
}

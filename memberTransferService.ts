import type { MemberTransfer } from './types';
import { supabase } from './supabaseClient';
import { resolveMemberDataClient } from './supabaseIntegration';

export interface RequestMemberTransferInput {
  /** Omit to request a transfer for the currently signed-in member. */
  memberId?: string;
  toBranchId: string;
  notes?: string;
}

export interface MemberTransferDirectoryBranch {
  id: string;
  name: string;
  district_id: string | null;
  district_name?: string | null;
  status?: string;
}

export interface MemberTransferDirectoryMember {
  id: string;
  first_name: string;
  last_name: string;
  branch_id: string | null;
  membership_status: string;
}

export async function getMemberTransferDirectory(): Promise<{
  members: MemberTransferDirectoryMember[];
  branches: MemberTransferDirectoryBranch[];
}> {
  const client = resolveMemberDataClient(supabase);
  const { data, error } = await client.rpc('get_member_transfer_directory');
  if (error) throw error;
  const payload = (data || {}) as {
    members?: MemberTransferDirectoryMember[];
    branches?: MemberTransferDirectoryBranch[];
  };
  return {
    members: payload.members || [],
    branches: payload.branches || []
  };
}

export async function getMemberTransfers(): Promise<MemberTransfer[]> {
  const client = resolveDataClient(supabase);
  const { data, error } = await client
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

  const client = resolveDataClient(supabase);
  const { data, error } = await client.rpc('manage_member_transfer', {
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

  const client = resolveDataClient(supabase);
  const { data, error } = await client.rpc('manage_member_transfer', {
    p_action: decision,
    p_transfer_id: transferId
  });

  if (error) throw error;
  if (!data) throw new Error('The member transfer review was not saved.');
  return data as MemberTransfer;
}

export async function cancelMemberTransfer(transferId: string): Promise<MemberTransfer> {
  if (!transferId) throw new Error('A transfer request is required.');

  const client = resolveDataClient(supabase);
  const { data, error } = await client.rpc('manage_member_transfer', {
    p_action: 'cancel',
    p_transfer_id: transferId
  });

  if (error) throw error;
  if (!data) throw new Error('The member transfer cancellation was not saved.');
  return data as MemberTransfer;
}

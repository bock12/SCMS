import type { Ministry, MinistryJoinRequest, MinistryMember, Profile } from './types';
import { supabase } from './supabaseClient';
import { supabaseDataClient, supabaseMemberIntegrationEnabled, supabaseAuthEnabled } from './supabaseIntegration';
import { removeMinistryMember } from './ministryMemberService';
import { sendInAppNotification } from './inAppNotificationService';
import { SYSTEM_NOTIFICATIONS_UPDATED_EVENT } from './systemNotificationService';

const getReadClient = (): any =>
  supabaseMemberIntegrationEnabled && supabaseAuthEnabled && supabaseDataClient ? supabaseDataClient : supabase;

const getWriteClient = (): any => {
  if (!supabaseMemberIntegrationEnabled) return supabase;
  if (!supabaseAuthEnabled) throw new Error('Ministry requests require an active Supabase Auth session.');
  if (!supabaseDataClient) throw new Error('Supabase is enabled but its URL or publishable key is missing.');
  return supabaseDataClient;
};

export const MINISTRY_JOIN_REQUESTS_UPDATED_EVENT = 'ministry_join_requests_updated';

function dispatchRequestsUpdated(ministryId?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MINISTRY_JOIN_REQUESTS_UPDATED_EVENT, { detail: { ministryId } }));
  window.dispatchEvent(new CustomEvent(SYSTEM_NOTIFICATIONS_UPDATED_EVENT));
}

export async function fetchAllJoinRequests(): Promise<MinistryJoinRequest[]> {
  const { data, error } = await getReadClient()
    .from('ministry_join_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data as MinistryJoinRequest[] : [];
}

export async function getJoinRequestsForMinistry(params: {
  ministryId?: string;
  ministryName?: string;
  status?: MinistryJoinRequest['status'] | 'all';
}): Promise<MinistryJoinRequest[]> {
  const { ministryId, ministryName, status = 'all' } = params;
  let query = getReadClient().from('ministry_join_requests').select('*');
  if (ministryId) query = query.eq('ministry_id', ministryId);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  const rows = Array.isArray(data) ? data as MinistryJoinRequest[] : [];
  if (ministryId || !ministryName?.trim()) return rows;
  const targetName = ministryName.trim().toLowerCase();
  return rows.filter(request => request.ministry_name.trim().toLowerCase() === targetName);
}

export async function getJoinRequestsForMember(memberId: string): Promise<MinistryJoinRequest[]> {
  if (!memberId) return [];
  const { data, error } = await getReadClient()
    .from('ministry_join_requests')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data as MinistryJoinRequest[] : [];
}

function resolveDepartmentLeaderId(ministry: Ministry): string | undefined {
  // leader_id is the canonical profiles.id; leader_name is display-only text.
  return ministry.leader_id || undefined;
}

export interface SubmitMinistryJoinRequestInput {
  ministry: Ministry;
  profile: Profile;
  preferredRoles: string[];
  availability: string;
  note: string;
  phoneOverride?: string;
}

export async function submitMinistryJoinRequest(
  input: SubmitMinistryJoinRequestInput
): Promise<MinistryJoinRequest> {
  const { ministry, profile, preferredRoles, availability, note, phoneOverride } = input;
  const cleanAvailability = availability.trim();
  const cleanPhone = (phoneOverride ?? profile.phone ?? '').trim();

  if (!profile?.id) throw new Error('Please sign in to submit a ministry interest request.');
  if (!cleanAvailability) throw new Error('Please specify your service or rehearsal availability.');
  if (!cleanPhone) throw new Error('Please provide a contact phone number so the ministry leader can reach you.');

  const { data, error } = await getWriteClient().rpc('submit_ministry_join_request', {
    p_ministry_id: ministry.id,
    p_preferred_roles: preferredRoles.length > 0 ? preferredRoles : ['Open to serving where needed'],
    p_availability: cleanAvailability,
    p_note: note.trim(),
    p_applicant_phone: cleanPhone
  });
  if (error) throw error;
  if (!data) throw new Error('Your ministry request could not be submitted.');

  const savedRequest = data as MinistryJoinRequest;
  const applicantName = savedRequest.applicant_name || `${profile.first_name} ${profile.last_name}`.trim();
  const leaderId = resolveDepartmentLeaderId(ministry);
  sendInAppNotification({
    department_name: ministry.name,
    recipient_member_id: leaderId,
    recipient_member_name: ministry.leader_name || 'Department Leader',
    type: 'ministry_join_request',
    title: `New Team Interest: ${applicantName} (${ministry.name})`,
    message: `${applicantName} expressed interest in ${(savedRequest.preferred_roles || []).join(', ')}. Availability: ${savedRequest.availability}.`,
    sent_by: applicantName
  });

  dispatchRequestsUpdated(ministry.id);
  return savedRequest;
}

export async function withdrawMinistryJoinRequest(
  requestId: string,
  _memberId?: string
): Promise<MinistryJoinRequest> {
  const { data, error } = await getWriteClient().rpc('withdraw_ministry_join_request', {
    p_request_id: requestId
  });
  if (error) throw error;
  if (!data) throw new Error('Your ministry request could not be withdrawn.');
  const updated = data as MinistryJoinRequest;
  dispatchRequestsUpdated(updated.ministry_id);
  return updated;
}

export interface ApproveMinistryJoinRequestInput {
  requestId: string;
  reviewerProfile: Profile | null;
  roleTitle?: string;
  duty?: string;
  memberStatus?: 'active' | 'in_training' | 'on_leave';
  reviewNote?: string;
}

export async function approveMinistryJoinRequest(
  input: ApproveMinistryJoinRequestInput
): Promise<{ request: MinistryJoinRequest; rosterEntry: MinistryMember }> {
  const { requestId, reviewerProfile, roleTitle, duty, memberStatus = 'active', reviewNote } = input;
  const { data, error } = await getWriteClient().rpc('review_ministry_join_request', {
    p_request_id: requestId,
    p_action: 'approve',
    p_role_title: roleTitle || null,
    p_duty: duty || null,
    p_member_status: memberStatus,
    p_review_note: reviewNote || null
  });
  if (error) throw error;
  const result = data as { request?: MinistryJoinRequest; roster_entry?: MinistryMember | null } | null;
  if (!result?.request || !result.roster_entry) throw new Error('The request was not approved with a roster assignment.');

  const reviewerName = reviewerProfile
    ? `${reviewerProfile.first_name} ${reviewerProfile.last_name}`.trim()
    : 'Ministry Leader';
  const request = result.request;
  dispatchRequestsUpdated(request.ministry_id);
  sendInAppNotification({
    department_name: request.ministry_name,
    recipient_member_id: request.member_id,
    recipient_member_name: request.applicant_name,
    type: 'ministry_join_update',
    title: `Welcome to ${request.ministry_name}!`,
    message: `Your request to join ${request.ministry_name} was approved by ${reviewerName}. Assigned Role: ${request.assigned_role_title} (${request.assigned_duty}).`,
    sent_by: reviewerName
  });

  return { request, rosterEntry: result.roster_entry };
}

export async function declineMinistryJoinRequest(input: {
  requestId: string;
  reviewerProfile: Profile | null;
  reviewNote?: string;
}): Promise<MinistryJoinRequest> {
  const { requestId, reviewerProfile, reviewNote } = input;
  const { data, error } = await getWriteClient().rpc('review_ministry_join_request', {
    p_request_id: requestId,
    p_action: 'decline',
    p_review_note: reviewNote || null
  });
  if (error) throw error;
  const result = data as { request?: MinistryJoinRequest } | null;
  if (!result?.request) throw new Error('The ministry request could not be declined.');

  const request = result.request;
  const reviewerName = reviewerProfile
    ? `${reviewerProfile.first_name} ${reviewerProfile.last_name}`.trim()
    : 'Ministry Leader';
  const noteText = (reviewNote || '').trim();
  dispatchRequestsUpdated(request.ministry_id);
  sendInAppNotification({
    department_name: request.ministry_name,
    recipient_member_id: request.member_id,
    recipient_member_name: request.applicant_name,
    type: 'ministry_join_update',
    title: `Update on Your ${request.ministry_name} Request`,
    message: noteText
      ? `${reviewerName} reviewed your request: "${noteText}"`
      : `Thank you for your willingness to serve in ${request.ministry_name}. Please reach out to ${reviewerName} for next steps.`,
    sent_by: reviewerName
  });
  return request;
}

export async function reopenMinistryJoinRequest(
  requestId: string,
  reviewerProfile: Profile | null
): Promise<MinistryJoinRequest> {
  const { data, error } = await getWriteClient().rpc('review_ministry_join_request', {
    p_request_id: requestId,
    p_action: 'reopen'
  });
  if (error) throw error;
  const result = data as { request?: MinistryJoinRequest } | null;
  if (!result?.request) throw new Error('The ministry request could not be reopened.');
  dispatchRequestsUpdated(result.request.ministry_id);
  return result.request;
}

export async function leaveMinistryTeam(input: {
  ministry: Ministry;
  profile: Profile;
  membershipId: string;
  reason?: string;
}): Promise<void> {
  const { ministry, profile, membershipId, reason } = input;
  if (!profile?.id) throw new Error('A member profile is required to leave a ministry.');
  if (ministry.leader_id === profile.id) {
    throw new Error('Please arrange a new ministry leader before leaving this ministry.');
  }

  if (membershipId && !membershipId.startsWith('leader-') && !membershipId.startsWith('dept-') && !membershipId.startsWith('local-')) {
    await removeMinistryMember(membershipId);
  } else {
    const { data, error } = await getReadClient()
      .from('ministry_members')
      .select('id')
      .eq('ministry_id', ministry.id)
      .eq('member_id', profile.id);
    if (error) throw error;
    for (const row of data || []) await removeMinistryMember(row.id);
  }

  const memberName = `${profile.first_name} ${profile.last_name}`.trim();
  const leaderId = resolveDepartmentLeaderId(ministry);
  sendInAppNotification({
    department_name: ministry.name,
    recipient_member_id: leaderId,
    recipient_member_name: ministry.leader_name || 'Department Leader',
    type: 'ministry_join_update',
    title: `Team Roster Update: ${memberName} (${ministry.name})`,
    message: reason?.trim()
      ? `${memberName} stepped down from ${ministry.name}. Note: "${reason.trim()}".`
      : `${memberName} stepped down from active service in ${ministry.name}.`,
    sent_by: memberName
  });
  dispatchRequestsUpdated(ministry.id);
}

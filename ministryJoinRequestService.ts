import type { Ministry, MinistryJoinRequest, MinistryMember, Profile } from './types';
import { supabase } from './supabaseClient';
import { addMinistryMember, getMinistryRoster, removeMinistryMember, updateMinistryMember } from './ministryMemberService';
import { sendInAppNotification } from './inAppNotificationService';
import { SYSTEM_NOTIFICATIONS_UPDATED_EVENT } from './systemNotificationService';

const DB_STORAGE_KEY = 'faithconnect_db_v2';
export const MINISTRY_JOIN_REQUESTS_UPDATED_EVENT = 'ministry_join_requests_updated';

function dispatchRequestsUpdated(ministryId?: string): void {
  window.dispatchEvent(
    new CustomEvent(MINISTRY_JOIN_REQUESTS_UPDATED_EVENT, {
      detail: { ministryId }
    })
  );
  window.dispatchEvent(new CustomEvent(SYSTEM_NOTIFICATIONS_UPDATED_EVENT));
}

export function getAllJoinRequests(): MinistryJoinRequest[] {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.ministry_join_requests) ? parsed.ministry_join_requests : [];
  } catch {
    return [];
  }
}

export async function fetchAllJoinRequests(): Promise<MinistryJoinRequest[]> {
  const { data, error } = await supabase
    .from('ministry_join_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? (data as MinistryJoinRequest[]) : [];
}

export function getJoinRequestsForMinistry(params: {
  ministryId?: string;
  ministryName?: string;
  status?: MinistryJoinRequest['status'] | 'all';
}): MinistryJoinRequest[] {
  const { ministryId, ministryName, status = 'all' } = params;
  const targetName = (ministryName || '').trim().toLowerCase();

  return getAllJoinRequests()
    .filter(req => {
      const matchesId = Boolean(ministryId && req.ministry_id === ministryId);
      const matchesName = Boolean(targetName && req.ministry_name.trim().toLowerCase() === targetName);
      if (ministryId || targetName) {
        if (!matchesId && !matchesName) return false;
      }
      if (status !== 'all' && req.status !== status) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function getJoinRequestsForMember(memberId: string): MinistryJoinRequest[] {
  if (!memberId) return [];
  return getAllJoinRequests()
    .filter(req => req.member_id === memberId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

async function resolveDepartmentLeaderId(ministry: Ministry): Promise<string | undefined> {
  if (ministry.leader_id) return ministry.leader_id;
  const targetLeaderName = (ministry.leader_name || '').trim().toLowerCase();
  if (!targetLeaderName) return undefined;

  try {
    const { data: profiles } = await supabase.from('profiles').select('*');
    if (Array.isArray(profiles)) {
      const matched = profiles.find(
        (p: Profile) => `${p.first_name} ${p.last_name}`.trim().toLowerCase() === targetLeaderName
      );
      return matched?.id;
    }
  } catch {
    // Ignore fallback lookup errors
  }
  return undefined;
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
  const cleanNote = note.trim();
  const cleanPhone = (phoneOverride ?? profile.phone ?? '').trim();

  if (!profile?.id) {
    throw new Error('Please sign in to submit a ministry interest request.');
  }
  if (!cleanAvailability) {
    throw new Error('Please specify your service or rehearsal availability.');
  }
  if (!cleanPhone) {
    throw new Error('Please provide a contact phone number so the ministry leader can reach you.');
  }

  // Check if user is already an active/training/on_leave member in this ministry
  const [{ data: existingMembership, error: membershipErr }, { data: existingRequests, error: reqErr }] = await Promise.all([
    supabase
      .from('ministry_members')
      .select('*')
      .eq('ministry_id', ministry.id)
      .eq('member_id', profile.id),
    supabase
      .from('ministry_join_requests')
      .select('*')
      .eq('ministry_id', ministry.id)
      .eq('member_id', profile.id)
  ]);

  if (membershipErr) throw membershipErr;
  if (reqErr) throw reqErr;

  const activeEntry = (existingMembership || []).find(
    (m: MinistryMember) => m.status !== 'inactive'
  );
  if (activeEntry) {
    throw new Error(`You are already on the ${ministry.name} team (${activeEntry.role_title}).`);
  }

  const existingPending = (existingRequests || []).find(
    (r: MinistryJoinRequest) => r.status === 'pending'
  );
  if (existingPending) {
    throw new Error(`You already have a pending request to join ${ministry.name}.`);
  }

  const applicantName = `${profile.first_name} ${profile.last_name}`.trim();
  const roles = preferredRoles.length > 0 ? preferredRoles : ['Open to serving where needed'];

  const newRequestPayload: MinistryJoinRequest = {
    id: `mjr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ministry_id: ministry.id,
    ministry_name: ministry.name,
    member_id: profile.id,
    applicant_name: applicantName,
    applicant_email: profile.email || '',
    applicant_phone: cleanPhone,
    preferred_roles: roles,
    availability: cleanAvailability,
    note: cleanNote,
    status: 'pending',
    created_at: new Date().toISOString()
  };

  const { data: insertedRow, error: insertError } = await supabase
    .from('ministry_join_requests')
    .insert(newRequestPayload)
    .select('*')
    .single();

  if (insertError) throw insertError;
  const savedRequest = (insertedRow || newRequestPayload) as MinistryJoinRequest;

  const leaderId = await resolveDepartmentLeaderId(ministry);

  // Notify the respective department leader via in-app notifications
  sendInAppNotification({
    department_name: ministry.name,
    recipient_member_id: leaderId,
    recipient_member_name: ministry.leader_name || 'Department Leader',
    type: 'ministry_join_request',
    title: `New Team Interest: ${applicantName} (${ministry.name})`,
    message: `${applicantName} expressed interest in ${roles.join(', ')}. Availability: ${cleanAvailability}.`,
    sent_by: applicantName
  });

  dispatchRequestsUpdated(ministry.id);
  return savedRequest;
}

export async function withdrawMinistryJoinRequest(
  requestId: string,
  memberId: string
): Promise<MinistryJoinRequest> {
  const { data: target, error: findErr } = await supabase
    .from('ministry_join_requests')
    .select('*')
    .eq('id', requestId)
    .eq('member_id', memberId)
    .maybeSingle();

  if (findErr) throw findErr;
  if (!target) {
    throw new Error('Request could not be found.');
  }
  if (target.status !== 'pending') {
    throw new Error('Only pending requests can be withdrawn.');
  }

  const updatedFields = {
    status: 'withdrawn' as const,
    updated_at: new Date().toISOString()
  };

  const { data: updatedRow, error: updateErr } = await supabase
    .from('ministry_join_requests')
    .update(updatedFields)
    .eq('id', requestId)
    .select('*')
    .single();

  if (updateErr) throw updateErr;
  const updatedItem = (updatedRow || { ...target, ...updatedFields }) as MinistryJoinRequest;
  dispatchRequestsUpdated(updatedItem.ministry_id);
  return updatedItem;
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

  const { data: target, error: findErr } = await supabase
    .from('ministry_join_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (findErr) throw findErr;
  if (!target) {
    throw new Error('Join request could not be found.');
  }

  const finalRoleTitle =
    (roleTitle || '').trim() ||
    (target.preferred_roles || []).find((r: string) => r && !r.toLowerCase().startsWith('open to')) ||
    'Team Member';
  const finalDuty = (duty || '').trim() || target.availability || 'Sunday & Ministry Service Duty';
  const reviewerName = reviewerProfile
    ? `${reviewerProfile.first_name} ${reviewerProfile.last_name}`.trim()
    : 'Ministry Leader';

  // Ensure a canonical ministry_members entry is created or reactivated
  const currentRoster = await getMinistryRoster(target.ministry_id);
  const existing = currentRoster.find(entry => entry.member_id === target.member_id);

  let savedEntry: MinistryMember;
  if (existing) {
    await updateMinistryMember(existing.id, {
      role_title: finalRoleTitle,
      duty: finalDuty,
      status: memberStatus
    });
    savedEntry = {
      ...existing,
      role_title: finalRoleTitle,
      duty: finalDuty,
      status: memberStatus
    };
  } else {
    savedEntry = await addMinistryMember({
      ministry_id: target.ministry_id,
      member_id: target.member_id,
      role_title: finalRoleTitle,
      duty: finalDuty,
      status: memberStatus,
      created_by: reviewerProfile?.id
    });
  }

  // Sync ministry member_count from persisted roster
  try {
    const refreshedRoster = await getMinistryRoster(target.ministry_id);
    const activeCount = refreshedRoster.filter(entry => entry.status !== 'inactive').length;
    if (activeCount > 0) {
      await supabase
        .from('ministries')
        .update({ member_count: activeCount })
        .eq('id', target.ministry_id);
    }
  } catch (err) {
    console.warn('Could not sync ministry member_count after approval:', err);
  }

  const updatedFields = {
    status: 'approved' as const,
    updated_at: new Date().toISOString(),
    reviewed_by_id: reviewerProfile?.id,
    reviewed_by_name: reviewerName,
    reviewed_at: new Date().toISOString(),
    review_note: reviewNote?.trim() || undefined,
    assigned_role_title: finalRoleTitle,
    assigned_duty: finalDuty
  };

  const { data: updatedRow, error: updateErr } = await supabase
    .from('ministry_join_requests')
    .update(updatedFields)
    .eq('id', requestId)
    .select('*')
    .single();

  if (updateErr) throw updateErr;
  const updatedRequest = (updatedRow || { ...target, ...updatedFields }) as MinistryJoinRequest;

  dispatchRequestsUpdated(target.ministry_id);

  // Notify applicant of approval
  sendInAppNotification({
    department_name: target.ministry_name,
    recipient_member_id: target.member_id,
    recipient_member_name: target.applicant_name,
    type: 'ministry_join_update',
    title: `Welcome to ${target.ministry_name}!`,
    message: `Your request to join ${target.ministry_name} was approved by ${reviewerName}. Assigned Role: ${finalRoleTitle} (${finalDuty}).`,
    sent_by: reviewerName
  });

  return { request: updatedRequest, rosterEntry: savedEntry };
}

export async function declineMinistryJoinRequest(input: {
  requestId: string;
  reviewerProfile: Profile | null;
  reviewNote?: string;
}): Promise<MinistryJoinRequest> {
  const { requestId, reviewerProfile, reviewNote } = input;

  const { data: target, error: findErr } = await supabase
    .from('ministry_join_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (findErr) throw findErr;
  if (!target) {
    throw new Error('Join request could not be found.');
  }

  const reviewerName = reviewerProfile
    ? `${reviewerProfile.first_name} ${reviewerProfile.last_name}`.trim()
    : 'Ministry Leader';
  const noteText = (reviewNote || '').trim();

  const updatedFields = {
    status: 'declined' as const,
    updated_at: new Date().toISOString(),
    reviewed_by_id: reviewerProfile?.id,
    reviewed_by_name: reviewerName,
    reviewed_at: new Date().toISOString(),
    review_note: noteText || undefined
  };

  const { data: updatedRow, error: updateErr } = await supabase
    .from('ministry_join_requests')
    .update(updatedFields)
    .eq('id', requestId)
    .select('*')
    .single();

  if (updateErr) throw updateErr;
  const updatedRequest = (updatedRow || { ...target, ...updatedFields }) as MinistryJoinRequest;

  dispatchRequestsUpdated(target.ministry_id);

  sendInAppNotification({
    department_name: target.ministry_name,
    recipient_member_id: target.member_id,
    recipient_member_name: target.applicant_name,
    type: 'ministry_join_update',
    title: `Update on Your ${target.ministry_name} Request`,
    message: noteText
      ? `${reviewerName} reviewed your request: "${noteText}"`
      : `Thank you for your willingness to serve in ${target.ministry_name}. Please reach out to ${reviewerName} for next steps.`,
    sent_by: reviewerName
  });

  return updatedRequest;
}

export async function reopenMinistryJoinRequest(
  requestId: string,
  reviewerProfile: Profile | null
): Promise<MinistryJoinRequest> {
  const { data: target, error: findErr } = await supabase
    .from('ministry_join_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (findErr) throw findErr;
  if (!target) {
    throw new Error('Join request could not be found.');
  }

  const reviewerName = reviewerProfile
    ? `${reviewerProfile.first_name} ${reviewerProfile.last_name}`.trim()
    : 'Ministry Leader';

  const updatedFields = {
    status: 'pending' as const,
    updated_at: new Date().toISOString(),
    reviewed_by_id: reviewerProfile?.id,
    reviewed_by_name: reviewerName,
    review_note: undefined
  };

  const { data: updatedRow, error: updateErr } = await supabase
    .from('ministry_join_requests')
    .update(updatedFields)
    .eq('id', requestId)
    .select('*')
    .single();

  if (updateErr) throw updateErr;
  const reopened = (updatedRow || { ...target, ...updatedFields }) as MinistryJoinRequest;
  dispatchRequestsUpdated(target.ministry_id);
  return reopened;
}

export async function leaveMinistryTeam(input: {
  ministry: Ministry;
  profile: Profile;
  membershipId: string;
  reason?: string;
}): Promise<void> {
  const { ministry, profile, membershipId, reason } = input;
  if (!membershipId) {
    throw new Error('Active ministry assignment was not found.');
  }

  await removeMinistryMember(membershipId);

  try {
    const refreshedRoster = await getMinistryRoster(ministry.id);
    const activeCount = refreshedRoster.filter(entry => entry.status !== 'inactive').length;
    await supabase
      .from('ministries')
      .update({ member_count: activeCount })
      .eq('id', ministry.id);
  } catch (err) {
    console.warn('Could not sync ministry member_count after leaving team:', err);
  }

  const memberName = `${profile.first_name} ${profile.last_name}`.trim();
  const cleanReason = (reason || '').trim();
  const leaderId = await resolveDepartmentLeaderId(ministry);

  sendInAppNotification({
    department_name: ministry.name,
    recipient_member_id: leaderId,
    recipient_member_name: ministry.leader_name || 'Department Leader',
    type: 'ministry_join_update',
    title: `Team Roster Update: ${memberName} (${ministry.name})`,
    message: cleanReason
      ? `${memberName} stepped down from ${ministry.name}. Note: "${cleanReason}"`
      : `${memberName} stepped down from active service in ${ministry.name}.`,
    sent_by: memberName
  });

  dispatchRequestsUpdated(ministry.id);
}

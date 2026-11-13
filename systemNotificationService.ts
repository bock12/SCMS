import { supabase } from './supabaseClient';
import {
  getAllNotifications,
  markNotificationAsRead,
  type InAppNotification
} from './inAppNotificationService';
import { getMemberAvailableEventSurveys } from './memberEventSurveyService';
import { getRequisitions } from './requisitionService';
import { getChurchResources } from './churchResourceService';
import type {
  ChurchEvent,
  EventRegistration,
  FinancialRecord,
  MemberTransfer,
  Ministry,
  MinistryMember,
  Profile,
  Stream
} from './types';

export type SystemNotificationCategory =
  | 'announcements'
  | 'approvals'
  | 'surveys'
  | 'events'
  | 'resources'
  | 'account';

export interface SystemNotificationItem {
  id: string;
  source:
    | 'in_app'
    | 'survey'
    | 'requisition'
    | 'transfer'
    | 'finance'
    | 'stream'
    | 'event'
    | 'resource'
    | 'profile';
  inAppId?: string;
  category: SystemNotificationCategory;
  title: string;
  message: string;
  timestamp: string;
  priority: 'urgent' | 'high' | 'normal';
  is_read: boolean;
  action_url: string;
  action_label: string;
  meta_label: string;
}

interface UserNotificationState {
  readIds: string[];
  dismissedIds: string[];
}

const STATE_STORAGE_PREFIX = 'faithconnect_user_system_notif_state_v1_';
export const SYSTEM_NOTIFICATIONS_UPDATED_EVENT = 'system_notifications_updated';

function getStateStorageKey(profileId: string): string {
  return `${STATE_STORAGE_PREFIX}${profileId}`;
}

function getUserNotificationState(profileId: string): UserNotificationState {
  try {
    const raw = localStorage.getItem(getStateStorageKey(profileId));
    if (!raw) return { readIds: [], dismissedIds: [] };
    const parsed = JSON.parse(raw);
    return {
      readIds: Array.isArray(parsed.readIds) ? parsed.readIds : [],
      dismissedIds: Array.isArray(parsed.dismissedIds) ? parsed.dismissedIds : []
    };
  } catch {
    return { readIds: [], dismissedIds: [] };
  }
}

function saveUserNotificationState(profileId: string, state: UserNotificationState): void {
  try {
    localStorage.setItem(getStateStorageKey(profileId), JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(SYSTEM_NOTIFICATIONS_UPDATED_EVENT, { detail: { profileId } }));
  } catch {
    // Ignore storage quota errors
  }
}

export function markSystemNotificationRead(
  profileId: string,
  item: Pick<SystemNotificationItem, 'id' | 'inAppId'>
): void {
  if (!profileId) return;
  const state = getUserNotificationState(profileId);
  if (!state.readIds.includes(item.id)) {
    state.readIds.push(item.id);
    saveUserNotificationState(profileId, state);
  } else {
    window.dispatchEvent(new CustomEvent(SYSTEM_NOTIFICATIONS_UPDATED_EVENT, { detail: { profileId } }));
  }

  if (item.inAppId) {
    markNotificationAsRead(item.inAppId);
  }
}

export function markAllSystemNotificationsRead(
  profileId: string,
  items: Pick<SystemNotificationItem, 'id' | 'inAppId' | 'is_read'>[]
): void {
  if (!profileId) return;
  const state = getUserNotificationState(profileId);
  const readSet = new Set(state.readIds);
  items.forEach(item => {
    readSet.add(item.id);
    if (item.inAppId && !item.is_read) {
      markNotificationAsRead(item.inAppId);
    }
  });
  saveUserNotificationState(profileId, {
    ...state,
    readIds: Array.from(readSet)
  });
}

export function dismissSystemNotification(profileId: string, notifId: string): void {
  if (!profileId) return;
  const state = getUserNotificationState(profileId);
  const dismissedSet = new Set(state.dismissedIds);
  dismissedSet.add(notifId);
  saveUserNotificationState(profileId, {
    ...state,
    dismissedIds: Array.from(dismissedSet)
  });
}

export function clearDismissedSystemNotifications(profileId: string): void {
  if (!profileId) return;
  const state = getUserNotificationState(profileId);
  saveUserNotificationState(profileId, {
    ...state,
    dismissedIds: []
  });
}

function normalizeText(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function priorityRank(priority: SystemNotificationItem['priority']): number {
  if (priority === 'urgent') return 3;
  if (priority === 'high') return 2;
  return 1;
}

function safeTimestampMs(ts?: string): number {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? 0 : ms;
}

function isInAppNotificationForUser(
  notif: InAppNotification,
  profile: Profile,
  userDeptNames: Set<string>,
  isExecutiveAdmin: boolean,
  isDeptLeader: boolean
): boolean {
  const fullName = normalizeText(`${profile.first_name} ${profile.last_name}`);
  const recipientId = (notif.recipient_member_id || '').trim();
  const recipientName = normalizeText(notif.recipient_member_name);
  const deptName = normalizeText(notif.department_name);

  if (recipientId && recipientId === profile.id) {
    return true;
  }

  if (recipientName && fullName && recipientName === fullName) {
    return true;
  }

  const isBroadcastToDept =
    !recipientId &&
    (!recipientName || recipientName === 'all members' || recipientName === 'all department members');

  if (isBroadcastToDept && (userDeptNames.has(deptName) || isExecutiveAdmin)) {
    return true;
  }

  // Department leaders / admins overseeing that department also see dispatches for their department
  if (isExecutiveAdmin) {
    return true;
  }

  if (isDeptLeader && deptName && userDeptNames.has(deptName)) {
    return true;
  }

  return false;
}

export async function getUserSystemNotifications(profile: Profile | null): Promise<SystemNotificationItem[]> {
  if (!profile) return [];

  const role = profile.primary_role || 'member';
  const fullName = normalizeText(`${profile.first_name} ${profile.last_name}`);
  const isExecutiveAdmin = ['super_admin', 'admin', 'pastor', 'district_admin'].includes(role);
  const isFinanceRole = ['finance_officer', 'admin', 'super_admin', 'pastor'].includes(role);
  const isLeaderRole = isExecutiveAdmin || role === 'leader' || role === 'worker';

  const state = getUserNotificationState(profile.id);
  const readSet = new Set(state.readIds);
  const dismissedSet = new Set(state.dismissedIds);

  const [
    ministriesRes,
    ministryMembersRes,
    surveysRes,
    transfersRes,
    financialsRes,
    streamsRes,
    eventsRes,
    registrationsRes,
    resourcesRes
  ] = await Promise.allSettled([
    supabase.from('ministries').select('*'),
    supabase.from('ministry_members').select('*').eq('member_id', profile.id),
    getMemberAvailableEventSurveys(profile.id),
    supabase.from('member_transfers').select('*'),
    supabase.from('financial_records').select('*'),
    supabase.from('streams').select('*').eq('status', 'live'),
    supabase.from('events').select('*'),
    supabase.from('event_registrations').select('*'),
    getChurchResources(false)
  ]);

  const ministries: Ministry[] =
    ministriesRes.status === 'fulfilled' && Array.isArray(ministriesRes.value.data)
      ? ministriesRes.value.data
      : [];
  const ministryMemberships: MinistryMember[] =
    ministryMembersRes.status === 'fulfilled' && Array.isArray(ministryMembersRes.value.data)
      ? ministryMembersRes.value.data
      : [];

  const userDeptNames = new Set<string>();
  if (profile.assigned_department) userDeptNames.add(normalizeText(profile.assigned_department));
  if (profile.department_name) userDeptNames.add(normalizeText(profile.department_name));

  ministryMemberships.forEach(mm => {
    if (mm.status === 'inactive') return;
    const min = ministries.find(m => m.id === mm.ministry_id);
    if (min?.name) userDeptNames.add(normalizeText(min.name));
  });

  ministries.forEach(min => {
    if (min.leader_id === profile.id || normalizeText(min.leader_name) === fullName) {
      userDeptNames.add(normalizeText(min.name));
    }
  });

  const items: SystemNotificationItem[] = [];

  // 1. In-app department & member notifications
  try {
    const inAppList = getAllNotifications();
    inAppList.forEach(notif => {
      if (!isInAppNotificationForUser(notif, profile, userDeptNames, isExecutiveAdmin, isLeaderRole)) {
        return;
      }
      const sysId = `inapp:${notif.id}`;
      items.push({
        id: sysId,
        source: 'in_app',
        inAppId: notif.id,
        category: 'announcements',
        title: notif.title.replace(/^[\p{Emoji}\s]+/u, '').trim() || notif.title,
        message: notif.message,
        timestamp: notif.created_at,
        priority: notif.type === 'welfare_reminder' ? 'high' : 'normal',
        is_read: notif.is_read || readSet.has(sysId),
        action_url: isLeaderRole ? '/portal/leader' : '/portal/ministries',
        action_label: 'Open Ministry',
        meta_label: `${notif.department_name} · ${notif.sent_by}`
      });
    });
  } catch {
    // Ignore storage read errors
  }

  // 2. Pending Event Feedback Surveys for this member
  if (surveysRes.status === 'fulfilled') {
    surveysRes.value
      .filter(survey => !survey.already_submitted)
      .forEach(survey => {
        const sysId = `survey:${survey.id}`;
        items.push({
          id: sysId,
          source: 'survey',
          category: 'surveys',
          title: `Feedback Survey: ${survey.title}`,
          message: `You are eligible to submit feedback for ${survey.event_title}.`,
          timestamp: survey.updated_at || survey.created_at || survey.event_start_time,
          priority: 'high',
          is_read: readSet.has(sysId),
          action_url: '/portal/surveys',
          action_label: 'Take Survey',
          meta_label: 'Event Feedback'
        });
      });
  }

  // 3. Department Requisitions & Treasury Workflow Notifications
  try {
    const requisitions = getRequisitions();
    requisitions.forEach(req => {
      const isApplicantOrLead =
        req.applicant_id === profile.id ||
        normalizeText(req.applicant_name) === fullName ||
        userDeptNames.has(normalizeText(req.department_name));

      // Pastoral / Board review needed
      if (isExecutiveAdmin && (req.status === 'pending_pastor_approval' || req.status === 'submitted_to_board')) {
        const sysId = `req:review:${req.id}:${req.status}`;
        items.push({
          id: sysId,
          source: 'requisition',
          category: 'approvals',
          title:
            req.status === 'pending_pastor_approval'
              ? `Pastoral Approval Needed: ${req.requisition_number}`
              : `Board Review Required: ${req.requisition_number}`,
          message: `${req.department_name} requested ${req.currency || 'SLE'} ${Number(req.requested_amount).toLocaleString()} for "${req.title}".`,
          timestamp: req.submitted_to_board_at || req.created_at,
          priority: req.priority === 'urgent' ? 'urgent' : 'high',
          is_read: readSet.has(sysId),
          action_url: '/portal/finance',
          action_label: 'Review Requisition',
          meta_label: `${req.department_name} · Requisition`
        });
        return;
      }

      // Finance Officer treasury disbursement / audit actions
      if (
        isFinanceRole &&
        (req.status === 'pastor_approved' ||
          req.status === 'pending_approval' ||
          req.status === 'approved' ||
          req.status === 'reconciled')
      ) {
        const sysId = `req:treasury:${req.id}:${req.status}`;
        const label =
          req.status === 'reconciled'
            ? `Receipt Audit Ready: ${req.requisition_number}`
            : `Treasury Action Needed: ${req.requisition_number}`;
        items.push({
          id: sysId,
          source: 'requisition',
          category: 'approvals',
          title: label,
          message: `${req.department_name} — ${req.title} (${req.currency || 'SLE'} ${Number(req.requested_amount).toLocaleString()}).`,
          timestamp: req.reconciled_at || req.pastor_approved_at || req.board_approved_at || req.created_at,
          priority: req.priority === 'urgent' ? 'urgent' : 'high',
          is_read: readSet.has(sysId),
          action_url: '/portal/finance',
          action_label: 'Open Treasury',
          meta_label: 'Finance & Treasury'
        });
        return;
      }

      // Applicant / Department Leader status updates
      if (
        isApplicantOrLead &&
        (req.status === 'disbursed' || req.status === 'approved' || req.status === 'rejected' || req.status === 'settled')
      ) {
        const sysId = `req:dept:${req.id}:${req.status}`;
        const statusLabel =
          req.status === 'disbursed'
            ? 'Funds Disbursed — Submit Receipts'
            : req.status === 'approved'
            ? 'Requisition Approved'
            : req.status === 'rejected'
            ? 'Requisition Returned / Rejected'
            : 'Requisition Settled';
        items.push({
          id: sysId,
          source: 'requisition',
          category: 'approvals',
          title: `${statusLabel}: ${req.requisition_number}`,
          message: `${req.title} (${req.currency || 'SLE'} ${Number(req.requested_amount).toLocaleString()}).`,
          timestamp: req.settled_at || req.disbursed_at || req.board_approved_at || req.created_at,
          priority: req.status === 'disbursed' || req.status === 'rejected' ? 'high' : 'normal',
          is_read: readSet.has(sysId),
          action_url: '/portal/leader',
          action_label: 'View Department',
          meta_label: req.department_name
        });
      }
    });
  } catch {
    // Ignore requisition read errors
  }

  // 4. Member Transfer Requests
  if (transfersRes.status === 'fulfilled' && Array.isArray(transfersRes.value.data)) {
    const transfers = transfersRes.value.data as MemberTransfer[];
    transfers.forEach(tr => {
      if (isExecutiveAdmin && tr.status === 'pending') {
        const sysId = `transfer:admin:${tr.id}`;
        items.push({
          id: sysId,
          source: 'transfer',
          category: 'approvals',
          title: 'Pending Member Branch Transfer',
          message: tr.notes || 'A congregation member requested a campus branch transfer awaiting review.',
          timestamp: tr.request_date,
          priority: 'high',
          is_read: readSet.has(sysId),
          action_url: '/portal/directory',
          action_label: 'Review Transfers',
          meta_label: 'Member Directory'
        });
      } else if (tr.member_id === profile.id) {
        const sysId = `transfer:self:${tr.id}:${tr.status}`;
        items.push({
          id: sysId,
          source: 'transfer',
          category: 'account',
          title: `Branch Transfer ${tr.status.charAt(0).toUpperCase() + tr.status.slice(1)}`,
          message: tr.notes || `Your campus transfer request status is currently ${tr.status}.`,
          timestamp: tr.request_date,
          priority: tr.status === 'pending' ? 'normal' : 'high',
          is_read: readSet.has(sysId),
          action_url: '/portal/profile',
          action_label: 'View Profile',
          meta_label: 'Membership Transfer'
        });
      }
    });
  }

  // 5. Financial Verification Alerts
  if (financialsRes.status === 'fulfilled' && Array.isArray(financialsRes.value.data)) {
    const records = financialsRes.value.data as FinancialRecord[];
    records.forEach(rec => {
      if (isFinanceRole && rec.status === 'pending_verification') {
        const sysId = `fin:verify:${rec.id}`;
        items.push({
          id: sysId,
          source: 'finance',
          category: 'approvals',
          title: `Verify Giving Proof: ${rec.contributor_name}`,
          message: `${rec.currency || 'SLE'} ${Number(rec.amount).toLocaleString()} (${rec.category}) via ${rec.payment_method.replace('_', ' ')}.`,
          timestamp: rec.date,
          priority: 'high',
          is_read: readSet.has(sysId),
          action_url: '/portal/finance',
          action_label: 'Verify Payment',
          meta_label: 'Treasury Verification'
        });
      } else if (
        (rec.user_id === profile.id || normalizeText(rec.contributor_name) === fullName) &&
        (rec.status === 'pending_verification' || rec.status === 'rejected')
      ) {
        const sysId = `fin:self:${rec.id}:${rec.status}`;
        items.push({
          id: sysId,
          source: 'finance',
          category: 'account',
          title:
            rec.status === 'rejected'
              ? 'Giving Submission Needs Attention'
              : 'Giving Submission Pending Verification',
          message: `${rec.currency || 'SLE'} ${Number(rec.amount).toLocaleString()} for ${rec.category} is ${rec.status.replace('_', ' ')}.`,
          timestamp: rec.date,
          priority: rec.status === 'rejected' ? 'urgent' : 'normal',
          is_read: readSet.has(sysId),
          action_url: '/portal/giving',
          action_label: 'View Giving',
          meta_label: 'Stewardship'
        });
      }
    });
  }

  // 6. Live Sanctuary Streams
  if (streamsRes.status === 'fulfilled' && Array.isArray(streamsRes.value.data)) {
    const liveStreams = streamsRes.value.data as Stream[];
    liveStreams.forEach(stream => {
      const sysId = `stream:live:${stream.id}`;
      items.push({
        id: sysId,
        source: 'stream',
        category: 'events',
        title: `Live Sanctuary Broadcast: ${stream.title}`,
        message: stream.description || 'The church sanctuary broadcast is live now. Join the congregation online.',
        timestamp: stream.scheduled_start || new Date().toISOString(),
        priority: 'urgent',
        is_read: readSet.has(sysId),
        action_url: '/portal/streaming',
        action_label: 'Watch Live',
        meta_label: 'Live Sanctuary'
      });
    });
  }

  // 7. Upcoming Registered Events for this user
  if (
    eventsRes.status === 'fulfilled' &&
    registrationsRes.status === 'fulfilled' &&
    Array.isArray(eventsRes.value.data) &&
    Array.isArray(registrationsRes.value.data)
  ) {
    const events = eventsRes.value.data as ChurchEvent[];
    const registrations = registrationsRes.value.data as EventRegistration[];
    const nowMs = Date.now();
    const myRegEventIds = new Set(
      registrations
        .filter(
          reg =>
            (reg.member_id === profile.id ||
              reg.user_id === profile.id ||
              normalizeText(reg.email) === normalizeText(profile.email)) &&
            reg.status !== 'cancelled'
        )
        .map(reg => reg.event_id)
    );

    events.forEach(evt => {
      if (!myRegEventIds.has(evt.id)) return;
      if (evt.status === 'cancelled' || evt.status === 'completed') return;
      const startMs = safeTimestampMs(evt.start_time);
      if (startMs && startMs + 3600000 * 6 < nowMs) return;

      const sysId = `event:reg:${evt.id}`;
      const dateStr = startMs
        ? new Date(startMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'Upcoming';

      items.push({
        id: sysId,
        source: 'event',
        category: 'events',
        title: `Registered Event: ${evt.title}`,
        message: `${dateStr} · ${evt.location || 'Main Sanctuary'}`,
        timestamp: evt.start_time,
        priority: 'normal',
        is_read: readSet.has(sysId),
        action_url: '/portal/calendar',
        action_label: 'View Event',
        meta_label: evt.category || 'Events & Calendar'
      });
    });
  }

  // 8. Recently Published Church Resources (top 3 published within 30 days)
  if (resourcesRes.status === 'fulfilled' && Array.isArray(resourcesRes.value)) {
    const cutoff = Date.now() - 30 * 86400000;
    resourcesRes.value
      .filter(res => safeTimestampMs(res.updated_at || res.created_at) >= cutoff)
      .slice(0, 3)
      .forEach(res => {
        const sysId = `resource:${res.id}`;
        items.push({
          id: sysId,
          source: 'resource',
          category: 'resources',
          title: `New Resource: ${res.title}`,
          message: res.description || `${res.category} (${res.resource_type}) published to the church library.`,
          timestamp: res.updated_at || res.created_at,
          priority: 'normal',
          is_read: readSet.has(sysId),
          action_url: '/portal/resources',
          action_label: 'Open Library',
          meta_label: res.category || 'Church Resources'
        });
      });
  }

  // 9. Profile completeness reminder if essential contact phone is missing
  if (!profile.phone?.trim()) {
    const sysId = `profile:missing_phone:${profile.id}`;
    items.push({
      id: sysId,
      source: 'profile',
      category: 'account',
      title: 'Complete Your Member Contact Phone',
      message: 'Add a phone number on your profile so pastoral care and ministry coordinators can reach you.',
      timestamp: profile.created_at || new Date().toISOString(),
      priority: 'normal',
      is_read: readSet.has(sysId),
      action_url: '/portal/profile',
      action_label: 'Update Profile',
      meta_label: 'Account'
    });
  }

  return items
    .filter(item => !dismissedSet.has(item.id))
    .sort((a, b) => {
      if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
      const pDiff = priorityRank(b.priority) - priorityRank(a.priority);
      if (pDiff !== 0) return pDiff;
      return safeTimestampMs(b.timestamp) - safeTimestampMs(a.timestamp);
    });
}

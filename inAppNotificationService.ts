import { WelfareCampaignDrive } from './types';

export interface InAppNotification {
  id: string;
  recipient_member_id?: string;
  recipient_member_name?: string;
  department_name: string;
  type: 'welfare_reminder' | 'dues_reminder' | 'drive_announcement' | 'general_notice';
  title: string;
  message: string;
  campaign_id?: string;
  expected_amount?: number;
  deadline?: string;
  created_at: string;
  is_read: boolean;
  sent_by: string;
}

const STORAGE_KEY = 'church_dept_in_app_notifications_v1';

export function getAllNotifications(): InAppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultSeedNotifications();
    return JSON.parse(raw);
  } catch (e) {
    return getDefaultSeedNotifications();
  }
}

export function getDepartmentNotifications(deptName: string): InAppNotification[] {
  const all = getAllNotifications();
  return all.filter(n => n.department_name.toLowerCase() === deptName.toLowerCase());
}

export function sendInAppNotification(notif: Omit<InAppNotification, 'id' | 'created_at' | 'is_read'>): InAppNotification {
  const all = getAllNotifications();
  const newNotif: InAppNotification = {
    ...notif,
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    created_at: new Date().toISOString(),
    is_read: false
  };

  const updated = [newNotif, ...all];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

  window.dispatchEvent(new CustomEvent('dept_notification_sent', { detail: { notification: newNotif, department: notif.department_name } }));
  return newNotif;
}

export function sendDriveReminderToPendingMembers(
  deptName: string,
  campaign: WelfareCampaignDrive,
  pendingMembers: { id: string; name: string }[],
  senderName: string
): number {
  let count = 0;
  pendingMembers.forEach(m => {
    sendInAppNotification({
      department_name: deptName,
      recipient_member_id: m.id,
      recipient_member_name: m.name,
      type: 'welfare_reminder',
      title: `🔔 Contribution Reminder: ${campaign.title}`,
      message: `Friendly reminder for ${m.name}: Target contribution is SLE ${campaign.expected_amount_per_member.toLocaleString()} towards ${campaign.beneficiary_member_name}'s welfare drive. Deadline: ${campaign.deadline}.`,
      campaign_id: campaign.id,
      expected_amount: campaign.expected_amount_per_member,
      deadline: campaign.deadline,
      sent_by: senderName
    });
    count++;
  });
  return count;
}

export function sendMonthlyDuesReminderToPendingMembers(
  deptName: string,
  pendingMembers: { id: string; name: string }[],
  periodMonthYear: string,
  duesAmount: number,
  senderName: string
): number {
  let count = 0;
  pendingMembers.forEach(m => {
    sendInAppNotification({
      department_name: deptName,
      recipient_member_id: m.id,
      recipient_member_name: m.name,
      type: 'dues_reminder',
      title: `📅 Monthly Dues Reminder (${periodMonthYear})`,
      message: `Friendly reminder for ${m.name}: Regular monthly membership dues of SLE ${duesAmount.toLocaleString()} for ${periodMonthYear} are currently due.`,
      expected_amount: duesAmount,
      sent_by: senderName
    });
    count++;
  });
  return count;
}

export function markNotificationAsRead(id: string): void {
  const all = getAllNotifications();
  const updated = all.map(n => n.id === id ? { ...n, is_read: true } : n);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('dept_notification_sent', { detail: { id } }));
}

export function markAllDeptNotificationsAsRead(deptName: string): void {
  const all = getAllNotifications();
  const updated = all.map(n => n.department_name.toLowerCase() === deptName.toLowerCase() ? { ...n, is_read: true } : n);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('dept_notification_sent', { detail: { department: deptName } }));
}

export function deleteNotification(id: string): void {
  const all = getAllNotifications();
  const updated = all.filter(n => n.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('dept_notification_sent', { detail: { id } }));
}

function getDefaultSeedNotifications(): InAppNotification[] {
  return [
    {
      id: 'notif-seed-1',
      department_name: 'Media & IT',
      recipient_member_name: 'David Koroma',
      type: 'welfare_reminder',
      title: '🔔 Contribution Reminder: Bro. Samuel Marriage Support',
      message: 'Friendly reminder: Target contribution of SLE 200 is expected for Bro. Samuel Marriage Support Drive. Deadline: Nov 28, 2026.',
      expected_amount: 200,
      deadline: '2026-11-28',
      created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
      is_read: false,
      sent_by: 'Ministry Leader'
    },
    {
      id: 'notif-seed-2',
      department_name: 'Media & IT',
      recipient_member_name: 'All Department Members',
      type: 'dues_reminder',
      title: '📅 November 2026 Monthly Dues Reminder',
      message: 'Monthly membership dues of SLE 200 for November 2026 are now open for collection. Thank you for your continued faithful support!',
      expected_amount: 200,
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      is_read: false,
      sent_by: 'Finance Officer'
    }
  ];
}

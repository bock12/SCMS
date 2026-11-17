import { beforeEach, describe, expect, test } from 'bun:test';

const values = new Map<string, string>();
const memoryStorage = {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, String(value)); },
  removeItem(key: string) { values.delete(key); },
  clear() { values.clear(); },
  key(index: number) { return [...values.keys()][index] ?? null; },
  get length() { return values.size; }
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: memoryStorage
});

if (typeof globalThis.window === 'undefined') {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener(type: string, cb: EventListenerOrEventListenerObject) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(cb);
      },
      removeEventListener(type: string, cb: EventListenerOrEventListenerObject) {
        listeners.get(type)?.delete(cb);
      },
      dispatchEvent(evt: Event) {
        listeners.get(evt.type)?.forEach(cb => {
          if (typeof cb === 'function') cb(evt);
        });
        return true;
      }
    }
  });
}

if (typeof globalThis.CustomEvent === 'undefined') {
  (globalThis as any).CustomEvent = class CustomEvent<T = any> extends Event {
    detail: T;
    constructor(type: string, init?: { detail?: T }) {
      super(type);
      this.detail = init?.detail as T;
    }
  };
}

const { supabase } = await import('./supabaseClient');
const { sendInAppNotification, getAllNotifications } = await import('./inAppNotificationService');
const {
  getUserSystemNotifications,
  markSystemNotificationRead,
  markAllSystemNotificationsRead,
  dismissSystemNotification
} = await import('./systemNotificationService');

beforeEach(() => {
  memoryStorage.clear();
});

async function assignRoleToProfile(profileId: string, roleName: string) {
  const login = await supabase.auth.signInWithPassword({
    email: 'admin@faithconnect.church',
    password: 'password123'
  });
  if (login.error) throw new Error(login.error.message);

  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', roleName)
    .single();
  if (roleError || !role) throw new Error(roleError?.message || `Role ${roleName} not found.`);

  const assignment = await supabase.rpc('assign_profile_role', {
    p_profile_id: profileId,
    p_role_id: role.id,
    p_scope_type: 'church'
  });
  await supabase.auth.signOut();
  if (assignment.error) throw new Error(assignment.error.message);
}

describe('System Notification Aggregation per User', () => {
  test('aggregates member-scoped live streams, registered events, and personal reminders without leaking admin approvals', async () => {
    const { data: member } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', 'usr-member-1')
      .single();

    sendInAppNotification({
      recipient_member_id: 'usr-member-1',
      recipient_member_name: 'Grace Campbell',
      department_name: 'Voices of Grace Choir',
      type: 'general_notice',
      title: 'Choir Rehearsal Schedule',
      message: 'Rehearsal starts at 6:30 PM on Thursday.',
      sent_by: 'Hannah Adams'
    });

    sendInAppNotification({
      recipient_member_id: 'usr-leader-1',
      recipient_member_name: 'Hannah Adams',
      department_name: 'Voices of Grace Choir',
      type: 'welfare_reminder',
      title: 'Private Leader Notice',
      message: 'Should only appear for Hannah.',
      sent_by: 'Admin'
    });

    const items = await getUserSystemNotifications(member);

    expect(items.some(i => i.source === 'stream' && i.action_url === '/portal/streaming')).toBe(true);
    expect(items.some(i => i.source === 'event' && i.action_url === '/portal/calendar')).toBe(true);
    expect(items.some(i => i.title.includes('Choir Rehearsal Schedule'))).toBe(true);
    expect(items.some(i => i.title.includes('Private Leader Notice'))).toBe(false);
    expect(items.some(i => i.source === 'transfer' && i.category === 'approvals')).toBe(false);
    expect(items.some(i => i.source === 'requisition' && i.category === 'approvals')).toBe(false);
  });

  test('uses active database permissions, not profiles.primary_role, for approvals and treasury alerts', async () => {
    const { data: admin } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', 'usr-admin-1')
      .single();

    const adminItems = await getUserSystemNotifications(admin);
    expect(adminItems.some(i => i.source === 'requisition' && i.title.includes('REQ-2026-007'))).toBe(true);
    expect(adminItems.some(i => i.source === 'transfer' && i.category === 'approvals')).toBe(true);

    const { data: member } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', 'usr-member-1')
      .single();

    // A stale or forged profile label must not grant administrative notification visibility.
    const forgedAdmin = { ...member, primary_role: 'super_admin' as const };
    const forgedAdminItems = await getUserSystemNotifications(forgedAdmin);
    expect(forgedAdminItems.some(i => i.source === 'requisition' && i.category === 'approvals')).toBe(false);
    expect(forgedAdminItems.some(i => i.source === 'transfer' && i.category === 'approvals')).toBe(false);

    // An explicit database finance assignment grants treasury notifications even though
    // the compatibility display field still says "member".
    await assignRoleToProfile('usr-member-1', 'finance_officer');
    const financeProfile = { ...member, primary_role: 'member' as const };
    const financeItems = await getUserSystemNotifications(financeProfile);
    expect(financeItems.some(i => i.source === 'requisition' && i.title.includes('REQ-2026-008'))).toBe(true);
    expect(financeItems.some(i => i.source === 'requisition' && i.title.includes('Receipt Audit Ready'))).toBe(true);
    expect(financeItems.some(i => i.source === 'transfer' && i.category === 'approvals')).toBe(false);
  });

  test('persists read, mark-all-read, and dismiss state per user and syncs in-app notifications', async () => {
    const { data: member } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', 'usr-member-1')
      .single();

    const sent = sendInAppNotification({
      recipient_member_id: 'usr-member-1',
      recipient_member_name: 'Grace Campbell',
      department_name: 'Media & IT',
      type: 'dues_reminder',
      title: 'Dues Reminder',
      message: 'Please settle November dues.',
      sent_by: 'Treasury'
    });

    const initial = await getUserSystemNotifications(member);
    const inAppTarget = initial.find(i => i.inAppId === sent.id);
    expect(inAppTarget).toBeDefined();
    expect(inAppTarget?.is_read).toBe(false);

    markSystemNotificationRead(member.id, inAppTarget!);

    const afterSingleRead = await getUserSystemNotifications(member);
    expect(afterSingleRead.find(i => i.id === inAppTarget!.id)?.is_read).toBe(true);
    expect(getAllNotifications().find(n => n.id === sent.id)?.is_read).toBe(true);

    markAllSystemNotificationsRead(member.id, afterSingleRead);
    const afterAllRead = await getUserSystemNotifications(member);
    expect(afterAllRead.every(i => i.is_read)).toBe(true);

    dismissSystemNotification(member.id, inAppTarget!.id);
    const afterDismiss = await getUserSystemNotifications(member);
    expect(afterDismiss.some(i => i.id === inAppTarget!.id)).toBe(false);
  });
});

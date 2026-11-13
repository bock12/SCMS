import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Award,
  Bell,
  BookOpen,
  Calendar,
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  LogOut,
  Radio,
  RefreshCw,
  ShieldCheck,
  User,
  X
} from 'lucide-react';
import type { Profile } from './types';
import {
  clearDismissedSystemNotifications,
  dismissSystemNotification,
  getUserSystemNotifications,
  markAllSystemNotificationsRead,
  markSystemNotificationRead,
  SYSTEM_NOTIFICATIONS_UPDATED_EVENT,
  type SystemNotificationItem
} from './systemNotificationService';

export type ConsoleKey = 'member' | 'admin' | 'finance' | 'leader';

export function getActiveConsoleForRoute(pathname: string, search: string): ConsoleKey {
  if (pathname.startsWith('/portal/admin')) {
    const tab = new URLSearchParams(search).get('tab');
    if (tab === 'financials') return 'finance';
    return 'admin';
  }
  if (pathname.startsWith('/portal/finance')) return 'finance';
  if (pathname.startsWith('/portal/leader')) return 'leader';
  return 'member';
}

function formatRelativeTime(timestamp: string): string {
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return 'Recent';
  const diffSec = Math.round((Date.now() - ms) / 1000);
  if (diffSec < 0) {
    const aheadHours = Math.round(Math.abs(diffSec) / 3600);
    if (aheadHours < 24) return `In ${Math.max(1, aheadHours)}h`;
    const aheadDays = Math.round(aheadHours / 24);
    return `In ${aheadDays}d`;
  }
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(profile: Profile): string {
  const first = (profile.first_name || '').trim().charAt(0);
  const last = (profile.last_name || '').trim().charAt(0);
  return (first + last).toUpperCase() || 'FC';
}

function getCategoryIcon(item: SystemNotificationItem) {
  switch (item.source) {
    case 'stream':
      return { icon: Radio, containerClass: 'bg-rose-50 text-rose-600 border-rose-200' };
    case 'requisition':
    case 'finance':
      return { icon: Landmark, containerClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'survey':
      return { icon: ClipboardList, containerClass: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'event':
      return { icon: Calendar, containerClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'resource':
      return { icon: BookOpen, containerClass: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'transfer':
    case 'profile':
      return { icon: User, containerClass: 'bg-slate-100 text-slate-700 border-slate-200' };
    default:
      return { icon: Bell, containerClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  }
}

export const useSystemNotifications = (profile: Profile | null) => {
  const location = useLocation();
  const [notifications, setNotifications] = useState<SystemNotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!profile?.id) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const data = await getUserSystemNotifications(profile);
      setNotifications(data);
    } catch (err) {
      console.warn('Unable to load system notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [
    profile?.id,
    profile?.primary_role,
    profile?.first_name,
    profile?.last_name,
    profile?.phone,
    profile?.assigned_department,
    profile?.department_name
  ]);

  useEffect(() => {
    refresh();
  }, [refresh, location.pathname, location.search]);

  useEffect(() => {
    if (!profile?.id) return;
    const handleSync = () => {
      refresh();
    };
    window.addEventListener('dept_notification_sent', handleSync);
    window.addEventListener('requisitions_updated', handleSync);
    window.addEventListener('profile-updated', handleSync);
    window.addEventListener(SYSTEM_NOTIFICATIONS_UPDATED_EVENT, handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      window.removeEventListener('dept_notification_sent', handleSync);
      window.removeEventListener('requisitions_updated', handleSync);
      window.removeEventListener('profile-updated', handleSync);
      window.removeEventListener(SYSTEM_NOTIFICATIONS_UPDATED_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [profile?.id, refresh]);

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.is_read).length,
    [notifications]
  );

  return { notifications, unreadCount, loading, refresh };
};

interface HeaderNotificationBellProps {
  profile: Profile;
  notifications: SystemNotificationItem[];
  unreadCount: number;
  loading: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onRefresh: () => void;
}

export const HeaderNotificationBell: React.FC<HeaderNotificationBellProps> = ({
  profile,
  notifications,
  unreadCount,
  loading,
  isOpen,
  onToggle,
  onClose,
  onRefresh
}) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread' | 'actions' | 'updates'>('all');

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') return notifications.filter(n => !n.is_read);
    if (filter === 'actions') {
      return notifications.filter(n =>
        n.category === 'approvals' || n.category === 'surveys' || n.category === 'account'
      );
    }
    if (filter === 'updates') {
      return notifications.filter(n =>
        n.category === 'announcements' || n.category === 'events' || n.category === 'resources'
      );
    }
    return notifications;
  }, [notifications, filter]);

  const handleNotificationClick = (item: SystemNotificationItem) => {
    markSystemNotificationRead(profile.id, item);
    onClose();
    navigate(item.action_url);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`System notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="System Notifications"
        className={`relative w-10 h-10 rounded-xl border flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isOpen
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
            : 'bg-white border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
        }`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold tabular-nums flex items-center justify-center ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="System notifications"
          className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-[26rem] sm:w-[26rem] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-900 leading-tight">
                Notifications
              </h3>
              <p className="text-[11px] text-slate-500 font-medium tabular-nums mt-0.5">
                {unreadCount > 0
                  ? `${unreadCount} unread · ${notifications.length} total for you`
                  : `${notifications.length} system ${notifications.length === 1 ? 'notice' : 'notices'} for you`}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllSystemNotificationsRead(profile.id, notifications)}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <CheckCheck size={13} />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                onClick={onRefresh}
                title="Refresh notifications"
                aria-label="Refresh notifications"
                className="w-8 h-8 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Segmented Filter Bar */}
          <div className="px-3 py-2 border-b border-slate-100 bg-white">
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'unread', label: 'Unread' },
                  { id: 'actions', label: 'Actions' },
                  { id: 'updates', label: 'Updates' }
                ] as const
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    filter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[24rem] overflow-y-auto divide-y divide-slate-100">
            {loading && notifications.length === 0 ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(idx => (
                  <div key={idx} className="flex items-start gap-3 animate-pulse">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-100 rounded w-3/4" />
                      <div className="h-2.5 bg-slate-100 rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="px-5 py-9 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Bell size={18} />
                </div>
                <p className="text-xs font-bold text-slate-700">
                  {filter === 'unread' ? 'You are all caught up' : 'No matching notifications'}
                </p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                  System alerts, approvals, surveys, ministry reminders, and live service updates for your account appear here.
                </p>
                {notifications.length === 0 && (
                  <button
                    type="button"
                    onClick={() => clearDismissedSystemNotifications(profile.id)}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer pt-1"
                  >
                    Restore dismissed notices
                  </button>
                )}
              </div>
            ) : (
              filteredNotifications.map(item => {
                const { icon: IconComp, containerClass } = getCategoryIcon(item);
                return (
                  <div
                    key={item.id}
                    className={`group flex items-start gap-3 px-4 py-3 transition-colors ${
                      item.is_read ? 'bg-white hover:bg-slate-50' : 'bg-indigo-50/35 hover:bg-indigo-50/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(item)}
                      className="flex items-start gap-3 flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-none"
                    >
                      <div
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${containerClass}`}
                      >
                        <IconComp size={16} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-xs leading-snug line-clamp-1 ${
                              item.is_read ? 'font-semibold text-slate-700' : 'font-extrabold text-slate-900'
                            }`}
                          >
                            {item.title}
                          </p>
                          {!item.is_read && (
                            <span
                              className="w-2 h-2 rounded-full bg-indigo-600 shrink-0 mt-1"
                              title="Unread"
                            />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                          {item.message}
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 tabular-nums">
                          <span className="truncate">{item.meta_label}</span>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0">{formatRelativeTime(item.timestamp)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-indigo-600 font-bold shrink-0">{item.action_label}</span>
                        </div>
                      </div>
                    </button>

                    <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                      {!item.is_read && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            markSystemNotificationRead(profile.id, item);
                          }}
                          title="Mark as read"
                          aria-label="Mark notification as read"
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Check size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissSystemNotification(profile.id, item.id);
                        }}
                        title="Dismiss"
                        aria-label="Dismiss notification"
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface HeaderUserMenuProps {
  profile: Profile;
  unreadCount: number;
  activeConsole: ConsoleKey;
  onSelectConsole: (consoleKey: ConsoleKey) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenNotifications: () => void;
  onSignOut: () => void;
}

export const HeaderUserMenu: React.FC<HeaderUserMenuProps> = ({
  profile,
  unreadCount,
  activeConsole,
  onSelectConsole,
  isOpen,
  onToggle,
  onClose,
  onOpenNotifications,
  onSignOut
}) => {
  const navigate = useNavigate();
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [profile.avatar_url, profile.id]);

  const role = profile.primary_role || 'member';
  const roleLabel = role.replace(/_/g, ' ');
  const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Member';
  const initials = getInitials(profile);

  const isAdminOrPastor = ['super_admin', 'admin', 'pastor', 'district_admin'].includes(role);
  const canAccessFinance = role === 'finance_officer' || isAdminOrPastor;
  const isLeaderOrStaff =
    ['admin', 'super_admin', 'pastor', 'district_admin', 'leader', 'worker'].includes(role) ||
    Boolean(profile.assigned_department || profile.department_name);

  const availableConsoles: {
    key: ConsoleKey;
    label: string;
    subtitle: string;
    route: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    iconClass: string;
    activeBg: string;
  }[] = [
    {
      key: 'member',
      label: 'Member Portal',
      subtitle: 'Congregation life & profile',
      route: '/portal',
      icon: LayoutDashboard,
      iconClass: 'text-indigo-600',
      activeBg: 'bg-indigo-50 text-indigo-800'
    }
  ];

  if (isAdminOrPastor) {
    availableConsoles.push({
      key: 'admin',
      label: 'Pastoral & Admin Console',
      subtitle: 'Church management & settings',
      route: '/portal/admin?tab=overview',
      icon: ShieldCheck,
      iconClass: 'text-indigo-600',
      activeBg: 'bg-indigo-50 text-indigo-800'
    });
  }

  if (canAccessFinance) {
    availableConsoles.push({
      key: 'finance',
      label: 'Finance & Treasury Console',
      subtitle: 'Ledger, budgets & requisitions',
      route: '/portal/finance',
      icon: Landmark,
      iconClass: 'text-emerald-600',
      activeBg: 'bg-emerald-50 text-emerald-800'
    });
  }

  if (isLeaderOrStaff) {
    availableConsoles.push({
      key: 'leader',
      label: 'Ministry Leader Console',
      subtitle: 'Department roster, dues & funds',
      route: '/portal/leader',
      icon: Award,
      iconClass: 'text-amber-600',
      activeBg: 'bg-amber-50 text-amber-800'
    });
  }

  const handleChooseConsole = (item: (typeof availableConsoles)[number]) => {
    onSelectConsole(item.key);
    onClose();
    navigate(item.route);
  };

  return (
    <div className="relative flex items-center pl-2 sm:pl-3 border-l border-slate-200 shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Account menu"
        className={`flex items-center gap-2 sm:gap-2.5 p-1 pr-1.5 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isOpen ? 'bg-slate-100' : 'hover:bg-slate-50'
        }`}
      >
        <div className="text-right hidden lg:block max-w-[160px] pl-1">
          <p className="text-sm font-bold text-slate-900 leading-none truncate">{fullName}</p>
          <p className="text-xs text-indigo-600 font-semibold capitalize mt-0.5 truncate">
            {roleLabel}
          </p>
        </div>

        <div className="w-9 h-9 bg-indigo-50 rounded-full overflow-hidden border-2 border-indigo-200 flex items-center justify-center text-indigo-700 font-extrabold text-xs shrink-0">
          {profile.avatar_url && !avatarError ? (
            <img
              src={profile.avatar_url}
              alt={fullName}
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>

        <ChevronDown
          size={15}
          className={`text-slate-400 transition-transform duration-150 shrink-0 ${
            isOpen ? 'rotate-180 text-indigo-600' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="User account controls"
          className="absolute right-0 top-full mt-2 w-[calc(100vw-1.5rem)] max-w-72 sm:w-72 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50"
        >
          {/* User Identity Summary */}
          <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 overflow-hidden flex items-center justify-center text-indigo-700 font-extrabold text-xs shrink-0">
              {profile.avatar_url && !avatarError ? (
                <img
                  src={profile.avatar_url}
                  alt={fullName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900 truncate">{fullName}</p>
              <p className="text-xs text-slate-500 truncate">{profile.email}</p>
              <p className="text-[11px] font-semibold text-indigo-700 capitalize truncate mt-0.5">
                {roleLabel}
                {(profile.assigned_department || profile.department_name) && (
                  <>
                    <span className="text-slate-400"> · </span>
                    <span className="text-slate-600">
                      {profile.assigned_department || profile.department_name}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Console Switcher (Controls which console's menus show in the Sidebar) */}
          <div className="p-1.5 space-y-0.5">
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              {availableConsoles.length > 1 ? 'Switch Console' : 'Active Console'}
            </p>
            {availableConsoles.map(item => {
              const isSelected = activeConsole === item.key;
              const IconComp = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => handleChooseConsole(item)}
                  className={`w-full min-h-[44px] flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected
                      ? item.activeBg
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <IconComp size={16} className={`${item.iconClass} shrink-0`} />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold leading-tight truncate">
                        {item.label}
                      </span>
                      <span className="block text-[10px] text-slate-500 leading-tight truncate mt-0.5">
                        {item.subtitle}
                      </span>
                    </span>
                  </span>
                  {isSelected && <Check size={14} className="shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Account Controls (Notifications) */}
          <div className="p-1.5 border-t border-slate-100 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onOpenNotifications();
              }}
              className="w-full min-h-[40px] flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-indigo-700 transition-colors cursor-pointer text-left"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Bell size={15} className="text-slate-500 shrink-0" />
                <span className="truncate">Notifications</span>
              </span>
              {unreadCount > 0 && (
                <span className="text-[11px] font-extrabold text-rose-600 tabular-nums shrink-0">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Sign Out */}
          <div className="p-1.5 border-t border-slate-100 bg-slate-50/50">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onSignOut();
              }}
              className="w-full min-h-[40px] flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left"
            >
              <LogOut size={15} className="shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

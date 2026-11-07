import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Profile, ChurchBranch, District, MemberTransfer, Stream, ChatMessage, Ministry, FinancialRecord, ChurchEvent, EventRegistration, EventCategory, EventTargetAudience, GivingConfig, EventRecurrence, EventOccurrence, OccurrenceOverride, EventRecurrenceRuleConfig, MonthRecurrenceOverride, ChurchProfile } from './types';
import { EventWorkspaceModal } from './EventWorkspaceModal';
import { getGivingConfig, saveGivingConfig } from './givingConfig';
import { RolesAndPermissionsTab } from './RolesAndPermissionsTab';
import { hasPermission, getUserPermissions, ALL_PERMISSIONS, getCustomRoles, getRoleAssignments } from './roleService';
import { getRecurrenceBadge, getEventAccount, getAllEventAccounts, calculateNextRecurrenceDate, advanceRecurringEventDate, detectScheduleConflicts, generateEventOccurrences, saveOccurrenceOverride, saveOccurrenceAttendance, resolveOccurrencePreemption } from './eventAccountService';
import { LocationMap } from './LocationMap';
import { getChurchProfile, saveChurchProfile, PRESET_CHURCH_LOGOS, PRESET_GPS_LOCATIONS, PRESET_COLOR_THEMES, getCurrentGpsLocation } from './churchProfileService';
import { 
  Users, Building2, Map, MapPin, Radio, Activity, Plus, Search, 
  Trash2, ShieldAlert, Check, X, MoreHorizontal, ArrowRightLeft,
  Clock, AlertCircle, ChevronDown, ChevronRight, ChevronLeft, Video, Calendar as CalendarIcon, Play, Key, RefreshCw, ArrowLeft, Settings, Square, Send, MessageSquare, Eye,
  DollarSign, Heart, Sparkles, ShieldCheck, Download, CheckCircle2, Layers, Church,
  UserPlus, UserMinus, UserCheck, Filter, Edit, Copy, FileText, LayoutGrid, List, Phone, Mail, Shield, Upload,
  Printer, ExternalLink, Share2, CreditCard, Landmark, Smartphone, Sliders, Compass, Globe, Image as ImageIcon, Palette
} from 'lucide-react';

const PermissionRestrictedCard = ({ requiredPermission, profile }: { requiredPermission: string; profile: Profile | null }) => {
  const permInfo = ALL_PERMISSIONS.find(p => p.key === requiredPermission);
  const userPerms = getUserPermissions(profile);

  return (
    <div className="bg-white rounded-3xl border border-rose-200 p-8 sm:p-12 shadow-md text-center max-w-2xl mx-auto my-8 space-y-6 animate-in fade-in">
      <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
        <ShieldAlert size={32} />
      </div>
      <div className="space-y-2">
        <span className="px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-black uppercase tracking-wider">
          Permission Restricted
        </span>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">System Role Permission Enforcement</h3>
        <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          Your current account role (<strong className="capitalize text-slate-900">{profile?.primary_role?.replace('_', ' ') || 'Member'}</strong>) does not hold the required permission to access this administrative module.
        </p>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left text-xs space-y-1.5 max-w-md mx-auto">
        <div className="font-extrabold text-indigo-700 uppercase tracking-wider text-[10px]">Required System Permission:</div>
        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
          <Key size={14} className="text-indigo-600" />
          <span>{permInfo?.label || requiredPermission}</span>
        </div>
        <p className="text-slate-500 text-[11px] leading-relaxed">{permInfo?.description}</p>
      </div>

      <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl text-left text-xs space-y-2 max-w-md mx-auto">
        <span className="font-extrabold text-amber-800 text-[10px] uppercase tracking-wider block">Granted System Permissions For Your Profile:</span>
        <div className="flex flex-wrap gap-1.5">
          {userPerms.map(pKey => (
            <span key={pKey} className="px-2 py-1 bg-white border border-amber-300 text-amber-900 rounded-lg font-bold text-[10px] flex items-center gap-1">
              <Check size={12} className="text-amber-600" />
              <span>{ALL_PERMISSIONS.find(p => p.key === pKey)?.label || pKey}</span>
            </span>
          ))}
          {userPerms.length === 0 && (
            <span className="text-slate-400 italic">No administrative permissions granted yet.</span>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 italic max-w-md mx-auto">
        Contact Grace Cathedral's Lead Pastor or Church Administrator to appoint your profile to a custom leadership role definition in Governance.
      </p>
    </div>
  );
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ profile }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get('tab') as any) || 'overview';
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);
  const [churchProfile, setChurchProfile] = useState(() => getChurchProfile());

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) setChurchProfile(e.detail);
      else setChurchProfile(getChurchProfile());
    };
    window.addEventListener('church-profile-updated', handleUpdate);
    return () => window.removeEventListener('church-profile-updated', handleUpdate);
  }, []);

  if (!profile || !['super_admin', 'admin', 'pastor', 'finance_officer', 'district_admin'].includes(profile.primary_role)) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <ShieldAlert size={64} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-slate-500">You do not have leadership permissions to view this administrative area.</p>
      </div>
    );
  }

  const setTab = (tab: string) => {
    setSearchParams({ tab });
    setShowMobileMoreMenu(false);
  };

  const tabs = [
    { id: 'overview', label: 'Church Overview', icon: Activity, shortLabel: 'Overview' },
    { id: 'events', label: 'Events & Calendar', icon: CalendarIcon, shortLabel: 'Events' },
    { id: 'users', label: 'Congregation Roster', icon: Users, shortLabel: 'Roster' },
    { id: 'roles', label: 'Roles & Governance', icon: ShieldCheck, shortLabel: 'Roles' },
    { id: 'ministries', label: 'Ministries & Teams', icon: Building2, shortLabel: 'Ministries' },
    { id: 'financials', label: 'Tithes & Giving', icon: DollarSign, shortLabel: 'Giving' },
    { id: 'streaming', label: 'Live Broadcasts', icon: Video, shortLabel: 'Streams' },
    { id: 'multitenant', label: 'Multi-Tenant Roadmap', icon: Map, shortLabel: 'Roadmap' },
    { id: 'settings', label: 'Church Settings', icon: Settings, shortLabel: 'Settings' }
  ];

  // Primary bottom mobile tabs (Expanded by 2 to include Roles & Ministries)
  const primaryMobileTabs = ['overview', 'events', 'users', 'financials', 'roles', 'ministries'];

  return (
    <div className="min-h-screen pb-24 lg:pb-12 space-y-6">
      {/* Desktop & Tablet Sidebar Layout Container */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        
        {/* DESKTOP & TABLET SIDEBAR (Visible on md and lg screens) */}
        <aside className="hidden md:flex flex-col w-60 xl:w-68 shrink-0 bg-white rounded-3xl border border-slate-200 p-5 shadow-xs sticky top-6 space-y-6">
          {/* Header Brand Lockup */}
          <div className="space-y-2 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-indigo-100 shrink-0">
                <Church size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-slate-900 leading-tight truncate">Church Admin</h2>
                <span className="text-[10px] text-slate-400 font-semibold block truncate">FaithConnect Cathedral</span>
              </div>
            </div>

            <div className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[10px] font-black uppercase flex items-center gap-1.5 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Single Church Mode</span>
            </div>
          </div>

          {/* Vertical Sidebar Navigation Links */}
          <nav className="space-y-1.5 flex-1 overflow-y-auto max-h-[calc(100vh-180px)] pr-1">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider px-3 block mb-2">
              Admin Navigation
            </span>
            {tabs.map(t => {
              const Icon = t.icon;
              const isActive = currentTab === t.id;
              const permKeyMap: Record<string, any> = {
                events: 'manage_events',
                users: 'manage_members',
                roles: 'manage_members',
                ministries: 'manage_ministries',
                financials: 'manage_finances',
                streaming: 'manage_streams'
              };
              const reqPerm = permKeyMap[t.id];
              const isAllowed = !reqPerm || hasPermission(profile, reqPerm);

              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    isActive 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 font-black' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                    <span className="truncate">{t.label}</span>
                  </div>
                  {!isAllowed && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase flex items-center gap-0.5 shrink-0 ${
                      isActive ? 'bg-indigo-800 text-indigo-100' : 'bg-amber-100 text-amber-900'
                    }`} title="Permission Restricted">
                      <Key size={10} /> Lock
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User Profile Leader Footer Box */}
          <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-indigo-100 border border-indigo-200 shrink-0">
              <img src={profile.avatar_url || `https://picsum.photos/seed/${profile.id}/100`} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-extrabold text-slate-900 text-xs truncate">{profile.first_name} {profile.last_name}</h4>
              <span className="text-[10px] text-indigo-600 font-extrabold uppercase truncate block">{profile.primary_role.replace('_', ' ')}</span>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 min-w-0 space-y-6 w-full">
          {/* Mobile Top Header Banner (Visible on < md) */}
          <div className="block md:hidden bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-indigo-100 shrink-0">
                  <Church size={20} />
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight">Church Administration</h1>
                  <span className="text-xs text-slate-400 font-semibold">• {churchProfile.name || 'FaithConnect Grace Cathedral'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Tab Content Render with Permission Enforcement */}
          {currentTab === 'overview' && <OverviewTab onSwitchTab={setTab} />}
          {currentTab === 'events' && (
            hasPermission(profile, 'manage_events') 
              ? <EventsAdminTab /> 
              : <PermissionRestrictedCard requiredPermission="manage_events" profile={profile} />
          )}
          {currentTab === 'users' && (
            hasPermission(profile, 'manage_members') 
              ? <UsersTab /> 
              : <PermissionRestrictedCard requiredPermission="manage_members" profile={profile} />
          )}
          {currentTab === 'roles' && (
            hasPermission(profile, 'manage_members') 
              ? <RolesAndPermissionsTab /> 
              : <PermissionRestrictedCard requiredPermission="manage_members" profile={profile} />
          )}
          {currentTab === 'ministries' && (
            hasPermission(profile, 'manage_ministries') 
              ? <MinistriesAdminTab /> 
              : <PermissionRestrictedCard requiredPermission="manage_ministries" profile={profile} />
          )}
          {currentTab === 'financials' && (
            hasPermission(profile, 'manage_finances') 
              ? <FinancialsAdminTab /> 
              : <PermissionRestrictedCard requiredPermission="manage_finances" profile={profile} />
          )}
          {currentTab === 'streaming' && (
            hasPermission(profile, 'manage_streams') 
              ? <StreamingTab profile={profile} /> 
              : <PermissionRestrictedCard requiredPermission="manage_streams" profile={profile} />
          )}
          {currentTab === 'multitenant' && <MultiTenantTab />}
          {currentTab === 'settings' && <ChurchSettingsTab />}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR (Fixed at bottom on < md screens) */}
      <nav className="block md:hidden fixed bottom-0 inset-x-0 z-[90] bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-2xl px-1 py-1.5">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {tabs.filter(t => primaryMobileTabs.includes(t.id)).map(t => {
            const Icon = t.icon;
            const isActive = currentTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center justify-center py-1 px-1 sm:px-2 rounded-2xl transition-all cursor-pointer ${
                  isActive ? 'text-indigo-600 font-black scale-105' : 'text-slate-400 hover:text-slate-600 font-semibold'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-colors ${isActive ? 'bg-indigo-50 text-indigo-600' : ''}`}>
                  <Icon size={18} />
                </div>
                <span className="text-[9px] sm:text-[10px] mt-0.5">{t.shortLabel}</span>
              </button>
            );
          })}

          {/* "More Menu" Toggle Button */}
          <button
            onClick={() => setShowMobileMoreMenu(!showMobileMoreMenu)}
            className={`flex flex-col items-center justify-center py-1 px-1 sm:px-2 rounded-2xl transition-all cursor-pointer ${
              showMobileMoreMenu || !primaryMobileTabs.includes(currentTab) ? 'text-indigo-600 font-black scale-105' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${showMobileMoreMenu || !primaryMobileTabs.includes(currentTab) ? 'bg-indigo-50 text-indigo-600' : ''}`}>
              <Sliders size={18} />
            </div>
            <span className="text-[9px] sm:text-[10px] mt-0.5">More</span>
          </button>
        </div>
      </nav>

      {/* MOBILE "MORE TABS" SLIDE-UP DRAWER SHEET */}
      {showMobileMoreMenu && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-end justify-center p-0 md:hidden">
          <div className="bg-white rounded-t-3xl border-t border-slate-200 w-full max-w-lg p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Church size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Additional Administration Modules</h3>
                  <p className="text-[11px] text-slate-500">Tap any section to navigate immediately</p>
                </div>
              </div>
              <button 
                onClick={() => setShowMobileMoreMenu(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {tabs.filter(t => !primaryMobileTabs.includes(t.id)).map(t => {
                const Icon = t.icon;
                const isActive = currentTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                      isActive 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-black' 
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-bold'
                    }`}
                  >
                    <Icon size={18} className={isActive ? 'text-white' : 'text-slate-500'} />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs block truncate">{t.shortLabel}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub Components ---

const StatsCard = ({ title, value, icon: Icon, color, subtitle }: any) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color} text-white shadow-sm`}>
        <Icon size={24} />
      </div>
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Metrics</span>
    </div>
    <div className="text-3xl font-black text-slate-900 tracking-tight">{value}</div>
    <div className="text-sm font-bold text-slate-700 mt-1">{title}</div>
    {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
  </div>
);

const OverviewTab = ({ onSwitchTab }: { onSwitchTab: (tab: string) => void }) => {
  const [stats, setStats] = useState({ members: 0, ministries: 6, streams: 0, donations: 2580 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [members, streams, financials] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('streams').select('*', { count: 'exact', head: true }),
        supabase.from('financial_records').select('*')
      ]);
      
      const totalGiving = financials.data 
        ? financials.data.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
        : 2580;

      setStats({
        members: members.count || 9,
        ministries: 6,
        streams: streams.count || 4,
        donations: totalGiving
      });
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (loading) return <div className="p-10 text-center text-slate-400">Loading church metrics...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <StatsCard title="Active Congregants" value={stats.members} subtitle="Registered church members" icon={Users} color="bg-indigo-600" />
        <StatsCard title="Active Ministries" value={stats.ministries} subtitle="Worship, Youth, Media, Ushers" icon={Building2} color="bg-emerald-600" />
        <StatsCard title="Month-To-Date Giving" value={`$${stats.donations.toLocaleString()}`} subtitle="Tithes, Offering, Building" icon={DollarSign} color="bg-amber-600" />
        <StatsCard title="Sanctuary Broadcasts" value={stats.streams} subtitle="Live and scheduled services" icon={Video} color="bg-rose-600" />
      </div>

      {/* Quick Administration Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Weekly Ministry Snapshot</h3>
              <p className="text-xs text-slate-500">Key benchmarks for Grace Cathedral this week</p>
            </div>
            <button 
              onClick={() => onSwitchTab('financials')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
            >
              View Giving Ledger &rarr;
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase">Average Attendance</span>
              <div className="text-2xl font-black text-slate-900 mt-1">285 Worshippers</div>
              <p className="text-xs text-emerald-600 font-semibold mt-1">&uarr; +12% from last Sunday</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase">Online Stream Reach</span>
              <div className="text-2xl font-black text-slate-900 mt-1">1,450 Views</div>
              <p className="text-xs text-indigo-600 font-semibold mt-1">YouTube & Sanctuary Stream</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase">Prayer Requests Received</span>
              <div className="text-2xl font-black text-slate-900 mt-1">18 Petitions</div>
              <p className="text-xs text-slate-500 font-semibold mt-1">Handled by Intercessory Team</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase">Volunteer Workers</span>
              <div className="text-2xl font-black text-slate-900 mt-1">68 Servants</div>
              <p className="text-xs text-emerald-600 font-semibold mt-1">Active across 6 departments</p>
            </div>
          </div>
        </div>

        {/* Quick Launch Panel */}
        <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 rounded-3xl p-6 text-white shadow-lg flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              <Sparkles size={14} /> Quick Pastoral Tools
            </div>
            <h3 className="text-xl font-black mb-2">Pastoral Management</h3>
            <p className="text-indigo-200 text-xs leading-relaxed mb-6">
              Manage your local congregation with ease. Elevate team roles, record Sunday offerings, schedule livestream broadcasts, or prepare for multi-tenant branch expansion.
            </p>
          </div>

          <div className="space-y-2">
            <button 
              onClick={() => onSwitchTab('financials')}
              className="w-full py-2.5 bg-white text-indigo-950 font-bold text-xs rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <DollarSign size={16} /> Record Tithes & Offerings
            </button>
            <button 
              onClick={() => onSwitchTab('streaming')}
              className="w-full py-2.5 bg-indigo-800 text-white font-bold text-xs rounded-xl hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2 cursor-pointer border border-indigo-500/50"
            >
              <Video size={16} /> Schedule Live Broadcast
            </button>
          </div>
        </div>
      </div>

      {/* Upcoming Birthdays (Next 30 Days) Widget */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center font-black text-lg">
              🎂
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Upcoming Birthdays (Next 30 Days)</h3>
              <p className="text-xs text-slate-500">Grace Cathedral congregants celebrating milestone birthdays soon</p>
            </div>
          </div>
          <span className="text-xs font-extrabold px-3 py-1 bg-rose-50 text-rose-700 rounded-full border border-rose-100 self-start sm:self-auto">
            3 Birthdays Coming Up
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: "Grace Campbell", role: "Active Member", date: "Nov 5", daysLeft: 7, email: "member@faithconnect.church", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80" },
            { name: "Hannah Adams", role: "Worship Leader", date: "Nov 14", daysLeft: 16, email: "worship@faithconnect.church", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=100&q=80" },
            { name: "Min. Samuel Okonkwo", role: "Youth Leader", date: "Nov 22", daysLeft: 24, email: "youth@faithconnect.church", avatar: "https://picsum.photos/seed/samuel/100/100" }
          ].map((bday, idx) => (
            <div key={idx} className="p-4 bg-slate-50 hover:bg-rose-50/50 rounded-2xl border border-slate-100 hover:border-rose-200 transition-all flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-rose-200 flex-shrink-0">
                  <img src={bday.avatar} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">{bday.name}</h4>
                  <p className="text-[10px] text-indigo-600 font-semibold">{bday.role}</p>
                  <a href={`mailto:${bday.email}`} className="text-[10px] text-slate-400 hover:underline">Send Blessing</a>
                </div>
              </div>
              <div className="text-right">
                <span className="font-black text-rose-600 text-sm block">{bday.date}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full">
                  in {bday.daysLeft} days
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Baptism Anniversaries (This Month) Widget */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center font-black text-lg">
              🌊
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Upcoming Baptism Anniversaries (This Month)</h3>
              <p className="text-xs text-slate-500">Grace Cathedral congregants celebrating water baptism milestones stored in user profiles</p>
            </div>
          </div>
          <span className="text-xs font-extrabold px-3 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-200 self-start sm:self-auto">
            4 Anniversaries This Month
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: "Grace Campbell", role: "Active Member", bDate: "Oct 17, 2022", years: 4, officiant: "Rev. Sarah Johnson", email: "member@faithconnect.church", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80" },
            { name: "Min. Samuel Okonkwo", role: "Youth Leader", bDate: "Oct 28, 2021", years: 5, officiant: "Bishop Marcus Vance", email: "youth@faithconnect.church", avatar: "https://picsum.photos/seed/samuel/100/100" },
            { name: "Elijah Wright", role: "Worship Worker", bDate: "Oct 10, 2020", years: 6, officiant: "Rev. Sarah Johnson", email: "ewright@gmail.com", avatar: "https://picsum.photos/seed/elijah/100/100" },
            { name: "Rebecca Foster", role: "Communion Servant", bDate: "Oct 22, 2023", years: 3, officiant: "Pastor David Miller", email: "rfoster@gmail.com", avatar: "https://picsum.photos/seed/rebecca/200/200" }
          ].map((ann, idx) => (
            <div key={idx} className="p-4 bg-slate-50 hover:bg-amber-50/50 rounded-2xl border border-slate-100 hover:border-amber-200 transition-all flex flex-col justify-between space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-amber-300 flex-shrink-0">
                  <img src={ann.avatar} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">{ann.name}</h4>
                  <p className="text-[10px] text-indigo-600 font-semibold">{ann.role}</p>
                  <p className="text-[10px] text-slate-400">By {ann.officiant}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Baptized</span>
                  <span className="text-xs font-black text-amber-900">{ann.bDate}</span>
                </div>
                <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-extrabold">
                  {ann.years} Years in Christ
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Congregation Users Tab ---

const UsersTab = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'suspended' | 'archived' | 'all'>('active');
  const [baptismFilter, setBaptismFilter] = useState<'all' | 'baptized' | 'unbaptized'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [userTabSubView, setUserTabSubView] = useState<'roster' | 'assign_roles'>('roster');
  const [roleSuccessToast, setRoleSuccessToast] = useState<string | null>(null);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [viewingUser, setViewingUser] = useState<Profile | null>(null);
  const [createdCredsModal, setCreatedCredsModal] = useState<{ name: string; email: string; pass: string; isBaptized: boolean } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Form Fields State
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<string>('member');
  const [formStatus, setFormStatus] = useState<'active' | 'suspended' | 'archived'>('active');
  const [formAvatar, setFormAvatar] = useState('');
  const [formIsBaptized, setFormIsBaptized] = useState(false);
  const [formBaptismDate, setFormBaptismDate] = useState('');
  const [formBaptizedBy, setFormBaptizedBy] = useState('');
  const [formDob, setFormDob] = useState('');
  const [formMaritalStatus, setFormMaritalStatus] = useState<'Single' | 'Married' | 'Widowed' | 'Divorced'>('Single');
  const [formMarriageDate, setFormMarriageDate] = useState('');
  const [formCreateCredentials, setFormCreateCredentials] = useState(true);
  const [formPassword, setFormPassword] = useState('');
  const [showPassText, setShowPassText] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const presetAvatars = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80'
  ];

  const generateTempPassword = () => 'FaithConnect' + Math.floor(1000 + Math.random() * 9000) + '!';

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) {
      setUsers(data as Profile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const resetForm = () => {
    setFormFirstName('');
    setFormLastName('');
    setFormEmail('');
    setFormPhone('');
    setFormRole('member');
    setFormStatus('active');
    setFormAvatar('');
    setFormIsBaptized(false);
    setFormBaptismDate('');
    setFormBaptizedBy('Rev. Sarah Johnson');
    setFormDob('');
    setFormMaritalStatus('Single');
    setFormMarriageDate('');
    setFormCreateCredentials(true);
    setFormPassword(generateTempPassword());
    setShowPassText(false);
    setFormError(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setFormError('Profile photo file size must be less than 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFormAvatar(reader.result);
        setFormError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const validateDuplicateMember = (currentUserId?: string): boolean => {
    setFormError(null);
    const normEmail = formEmail.trim().toLowerCase();
    const normPhone = formPhone.trim().replace(/[^0-9+]/g, '');

    // Duplicate Email Enforcement
    const existingEmailUser = users.find(u => 
      u.id !== currentUserId && u.email && u.email.trim().toLowerCase() === normEmail
    );
    if (existingEmailUser) {
      setFormError(`⚠️ Duplicate Email Error: A member with email "${formEmail.trim()}" is already registered in the roster (${existingEmailUser.first_name} ${existingEmailUser.last_name}). No two members can share the same email.`);
      return false;
    }

    // Duplicate Phone Enforcement
    if (normPhone && normPhone.length > 5) {
      const existingPhoneUser = users.find(u => {
        if (u.id === currentUserId || !u.phone) return false;
        const existingNormPhone = u.phone.trim().replace(/[^0-9+]/g, '');
        return existingNormPhone.length > 5 && existingNormPhone === normPhone;
      });

      if (existingPhoneUser) {
        setFormError(`⚠️ Duplicate Phone Error: A member with phone number "${formPhone.trim()}" is already registered in the roster (${existingPhoneUser.first_name} ${existingPhoneUser.last_name}). No two members can share the same phone number.`);
        return false;
      }
    }

    return true;
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (user: Profile) => {
    setEditingUser(user);
    setFormError(null);
    setFormFirstName(user.first_name || '');
    setFormLastName(user.last_name || '');
    setFormEmail(user.email || '');
    setFormPhone(user.phone || '');
    setFormRole(user.primary_role || 'member');
    setFormStatus((user as any).status || 'active');
    setFormAvatar(user.avatar_url || '');
    setFormIsBaptized(Boolean((user as any).is_baptized));
    setFormBaptismDate((user as any).baptism_date || '');
    setFormBaptizedBy((user as any).baptized_by || 'Rev. Sarah Johnson');
    setFormDob((user as any).date_of_birth || '');
    setFormMaritalStatus((user as any).marital_status || 'Single');
    setFormMarriageDate((user as any).marriage_date || '');
    setFormCreateCredentials(Boolean((user as any).has_login_credentials ?? true));
    setFormPassword((user as any).temporary_password || generateTempPassword());
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFirstName.trim() || !formLastName.trim() || !formEmail.trim()) return;

    if (!validateDuplicateMember()) return;

    const newProfile: Profile = {
      id: `usr_${Date.now()}`,
      branch_id: 'branch-1',
      first_name: formFirstName.trim(),
      last_name: formLastName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim(),
      primary_role: formRole as any,
      avatar_url: formAvatar || `https://picsum.photos/seed/${Date.now()}/200`,
      created_at: new Date().toISOString(),
      is_baptized: formIsBaptized,
      baptism_date: formIsBaptized ? formBaptismDate : undefined,
      baptized_by: formIsBaptized ? formBaptizedBy : undefined,
      date_of_birth: formDob || undefined,
      marital_status: formMaritalStatus,
      marriage_date: formMaritalStatus === 'Married' ? formMarriageDate : undefined
    };
    (newProfile as any).status = formStatus;
    (newProfile as any).has_login_credentials = formCreateCredentials;
    (newProfile as any).login_email = formEmail.trim();
    (newProfile as any).temporary_password = formPassword || generateTempPassword();

    await supabase.from('profiles').insert(newProfile);
    setUsers(prev => [newProfile, ...prev]);
    setShowAddModal(false);

    if (formCreateCredentials) {
      setCreatedCredsModal({
        name: `${formFirstName} ${formLastName}`,
        email: formEmail.trim(),
        pass: formPassword || 'FaithConnect2026!',
        isBaptized: formIsBaptized
      });
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (!validateDuplicateMember(editingUser.id)) return;

    const updatedData = {
      first_name: formFirstName.trim(),
      last_name: formLastName.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim(),
      primary_role: formRole as any,
      status: formStatus,
      avatar_url: formAvatar || editingUser.avatar_url,
      is_baptized: formIsBaptized,
      baptism_date: formIsBaptized ? formBaptismDate : undefined,
      baptized_by: formIsBaptized ? formBaptizedBy : undefined,
      date_of_birth: formDob || undefined,
      marital_status: formMaritalStatus,
      marriage_date: formMaritalStatus === 'Married' ? formMarriageDate : undefined,
      has_login_credentials: formCreateCredentials,
      login_email: formEmail.trim(),
      temporary_password: formPassword || generateTempPassword()
    };

    await supabase.from('profiles').update(updatedData).eq('id', editingUser.id);
    setUsers(prev => prev.map(p => p.id === editingUser.id ? { ...p, ...updatedData } as Profile : p));
    setEditingUser(null);

    if (formCreateCredentials) {
      setCreatedCredsModal({
        name: `${formFirstName} ${formLastName}`,
        email: formEmail.trim(),
        pass: formPassword || 'FaithConnect2026!',
        isBaptized: formIsBaptized
      });
    }
  };

  const handleToggleSuspend = async (user: Profile) => {
    const isSuspended = (user as any).status === 'suspended';
    const newStatus = isSuspended ? 'active' : 'suspended';

    await supabase.from('profiles').update({ status: newStatus }).eq('id', user.id);
    setUsers(prev => prev.map(p => p.id === user.id ? ({ ...p, status: newStatus } as any) : p));
  };

  const handleSoftDelete = async (user: Profile) => {
    const isArchived = (user as any).status === 'archived';
    const newStatus = isArchived ? 'active' : 'archived';

    await supabase.from('profiles').update({ status: newStatus }).eq('id', user.id);
    setUsers(prev => prev.map(p => p.id === user.id ? ({ ...p, status: newStatus } as any) : p));
  };

  const handleRoleChange = async (userId: string, newRole: string, userName?: string) => {
    await supabase.from('profiles').update({ primary_role: newRole }).eq('id', userId);
    setUsers(prev => prev.map(p => p.id === userId ? { ...p, primary_role: newRole as any } : p));
    const targetName = userName || users.find(u => u.id === userId)?.first_name || 'Member';
    setRoleSuccessToast(`Successfully updated ${targetName}'s primary role in Supabase to "${newRole.replace('_', ' ').toUpperCase()}"`);
    setTimeout(() => setRoleSuccessToast(null), 4000);
  };

  const handleCreateCredentialsForUser = async (user: Profile) => {
    const tempPass = generateTempPassword();
    const update = {
      has_login_credentials: true,
      login_email: user.email,
      temporary_password: tempPass
    };
    await supabase.from('profiles').update(update).eq('id', user.id);
    setUsers(prev => prev.map(p => p.id === user.id ? ({ ...p, ...update } as any) : p));

    setCreatedCredsModal({
      name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      pass: tempPass,
      isBaptized: Boolean((user as any).is_baptized)
    });
  };

  const renderMemberCards = (userList: Profile[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {userList.map((user) => {
        const userStatus = (user as any).status || 'active';
        const isSuspended = userStatus === 'suspended';
        const isArchived = userStatus === 'archived';
        const isBaptized = Boolean((user as any).is_baptized);
        const bDate = (user as any).baptism_date;
        const hasLogin = Boolean((user as any).has_login_credentials ?? true);

        return (
          <div
            key={user.id}
            className={`bg-white rounded-3xl border p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 ${
              isSuspended ? 'border-rose-300 bg-rose-50/20' : isArchived ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                    <img 
                      src={user.avatar_url || `https://picsum.photos/seed/${user.id}/100/100`} 
                      alt="" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-base leading-tight">
                      {user.first_name} {user.last_name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {user.primary_role?.replace('_', ' ')}
                      </span>
                      {isSuspended && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-700">
                          Suspended
                        </span>
                      )}
                      {isArchived && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800">
                          Archived
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingUser(user)}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  <Eye size={18} />
                </button>
              </div>

              {/* Badges Bar */}
              <div className="flex flex-wrap items-center gap-1.5 my-3">
                {isBaptized ? (
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-900 text-[10px] font-extrabold rounded-lg border border-amber-200 flex items-center gap-1">
                    <Sparkles size={11} className="text-amber-600" />
                    Baptized {bDate ? `(${new Date(bDate).toLocaleDateString([], { month: 'short', year: 'numeric' })})` : ''}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-lg">
                    Unbaptized
                  </span>
                )}

                {hasLogin ? (
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-extrabold rounded-lg border border-emerald-200 flex items-center gap-1">
                    <Key size={11} className="text-emerald-600" />
                    Login Active
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg">
                    No Credentials
                  </span>
                )}
              </div>

              {/* Contact Info */}
              <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                <p className="flex items-center gap-2 truncate">
                  <Mail size={14} className="text-slate-400 shrink-0" />
                  <span className="font-mono text-slate-800 truncate">{user.email}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <span>{user.phone || 'No phone recorded'}</span>
                </p>
              </div>
            </div>

            {/* Card Action Controls */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <select
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-indigo-700 outline-none"
                value={user.primary_role}
                onChange={(e) => handleRoleChange(user.id, e.target.value)}
              >
                <option value="member">Member</option>
                <option value="worker">Worker</option>
                <option value="leader">Leader</option>
                <option value="finance_officer">Finance Officer / Treasurer</option>
                <option value="pastor">Pastor</option>
                <option value="admin">Admin</option>
              </select>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEditModal(user)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleSuspend(user)}
                  className={`px-2.5 py-1 font-bold rounded-lg text-xs transition-colors cursor-pointer ${
                    isSuspended ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  }`}
                >
                  {isSuspended ? 'Unsuspend' : 'Suspend'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Filtered Users List
  const filteredUsers = users.filter(u => {
    const userStatus = (u as any).status || 'active';
    if (statusFilter !== 'all' && userStatus !== statusFilter) return false;

    if (baptismFilter === 'baptized' && !(u as any).is_baptized) return false;
    if (baptismFilter === 'unbaptized' && (u as any).is_baptized) return false;

    if (selectedRole !== 'all' && u.primary_role !== selectedRole) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      const phone = (u.phone || '').toLowerCase();
      return fullName.includes(q) || email.includes(q) || phone.includes(q);
    }
    return true;
  });

  // Calculate Metrics
  const totalCount = users.length;
  const baptizedCount = users.filter(u => (u as any).is_baptized).length;
  const leadershipCount = users.filter(u => ['pastor', 'leader', 'worker', 'admin', 'super_admin'].includes(u.primary_role)).length;
  const credentialUsersCount = users.filter(u => (u as any).has_login_credentials ?? true).length;

  return (
    <div className="space-y-6">
      {/* Overview Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
            <Users size={20} />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">Total Roster</span>
            <span className="text-xl font-black text-slate-900 tabular-nums">{totalCount}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <Sparkles size={20} />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">Water Baptized</span>
            <span className="text-xl font-black text-slate-900 tabular-nums">{baptizedCount}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">Ministers & Workers</span>
            <span className="text-xl font-black text-slate-900 tabular-nums">{leadershipCount}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
            <Key size={20} />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">Portal Logins</span>
            <span className="text-xl font-black text-slate-900 tabular-nums">{credentialUsersCount}</span>
          </div>
        </div>
      </div>

      {/* Sub Tab Switcher: Directory Roster vs Assign Roles */}
      <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-full">
        <div className="grid grid-cols-2 gap-1.5 w-full">
          <button
            type="button"
            onClick={() => setUserTabSubView('roster')}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center ${
              userTabSubView === 'roster'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users size={14} className="shrink-0" />
            <span className="truncate">Directory ({totalCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setUserTabSubView('assign_roles')}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center ${
              userTabSubView === 'assign_roles'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
            <span className="truncate">Assign Roles</span>
          </button>
        </div>
      </div>

      {/* Role Success Toast Alert */}
      {roleSuccessToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{roleSuccessToast}</span>
          </div>
          <button onClick={() => setRoleSuccessToast(null)} className="text-emerald-500 hover:text-emerald-700">
            <X size={16} />
          </button>
        </div>
      )}

      {userTabSubView === 'assign_roles' ? (
        /* DEDICATED ASSIGN ROLES SECTION */
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 flex items-center gap-1.5 w-fit mb-2">
                  <Shield size={12} className="text-indigo-600" />
                  Governance & Access Matrix
                </span>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Assign Member Roles</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                  Update any member's <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">primary_role</code> in the Supabase <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">profiles</code> table. Select a role from the dropdown to grant or modify permissions immediately across the portal.
                </p>
              </div>

              {/* Quick Search */}
              <div className="relative w-full lg:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type="text"
                  placeholder="Filter members by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Role Privilege Descriptions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/60">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">finance_officer</span>
                <p className="text-xs font-bold text-slate-800 mt-1.5">Finance Officer / Treasury</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Manages all income/expenses, approves department budget requisitions & issues financial reports.</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/60">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">leader</span>
                <p className="text-xs font-bold text-slate-800 mt-1.5">Ministry Leader</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Leads department teams (e.g., Media, Worship Choir) and submits funding requisitions.</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/60">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-800">pastor / admin</span>
                <p className="text-xs font-bold text-slate-800 mt-1.5">Pastor & Administrator</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Full church administration, member management, events, broadcasts & governance.</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/60">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">worker / member</span>
                <p className="text-xs font-bold text-slate-800 mt-1.5">Worker & Member</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Volunteers at church events, submits tithes/giving, views live broadcasts & event workspaces.</p>
              </div>
            </div>
          </div>

          {/* Members Role Selection Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <span>Member Governance List</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                  {filteredUsers.length} Congregants
                </span>
              </h4>
              <span className="text-xs text-slate-500 font-medium">Select new role from dropdown to save in Supabase</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/70 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-5 py-3">Member Name & Details</th>
                    <th className="px-5 py-3">Email Address</th>
                    <th className="px-5 py-3">Current Active Role</th>
                    <th className="px-5 py-3">Assign Primary Role (Supabase Dropdown)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                            <img src={user.avatar_url || `https://picsum.photos/seed/${user.id}/100/100`} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-sm">
                              {user.first_name} {user.last_name}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">{user.phone || 'No phone recorded'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-700">
                        {user.email}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          user.primary_role === 'finance_officer' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                          user.primary_role === 'pastor' || user.primary_role === 'admin' || user.primary_role === 'super_admin' ? 'bg-indigo-100 text-indigo-900 border border-indigo-200' :
                          user.primary_role === 'leader' ? 'bg-purple-100 text-purple-900 border border-purple-200' :
                          user.primary_role === 'worker' ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' :
                          'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {user.primary_role?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={user.primary_role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value, `${user.first_name} ${user.last_name}`)}
                            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-indigo-200 rounded-xl font-extrabold text-xs text-indigo-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                          >
                            <option value="member">Member (General Congregant)</option>
                            <option value="worker">Worker (Ministry Volunteer)</option>
                            <option value="leader">Leader (Department / Ministry Head)</option>
                            <option value="finance_officer">Finance Officer (Treasury & Ledger Manager)</option>
                            <option value="pastor">Pastor (Spiritual Leader)</option>
                            <option value="admin">Admin (Church Administrator)</option>
                            <option value="district_admin">District Admin</option>
                            <option value="super_admin">Super Admin / Senior Pastor</option>
                          </select>
                          <span className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-1">
                            <Check size={12} /> Auto-saves
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* Control Header & Add Member Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
            Congregation Directory & Roster
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
              {filteredUsers.length} Listed
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Add members, record water baptism details, assign ministry roles, and manage portal access credentials.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {/* Status Dropdown Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shrink-0"
          >
            <option value="active">Status: Active</option>
            <option value="suspended">Status: Suspended</option>
            <option value="archived">Status: Archived</option>
            <option value="all">Status: All</option>
          </select>

          {/* Baptism Dropdown Filter */}
          <select
            value={baptismFilter}
            onChange={(e) => setBaptismFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-amber-900 bg-amber-50/50 border border-amber-200/80 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shrink-0"
          >
            <option value="all">Baptism: All</option>
            <option value="baptized">Water Baptized</option>
            <option value="unbaptized">Unbaptized</option>
          </select>

          {/* View Mode Toggle (Hidden on Mobile & Tablet) */}
          <div className="hidden lg:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Table View"
              className={`p-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              title="Cards View"
              className={`p-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutGrid size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <UserPlus size={16} />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Role Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search by first name, last name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Role Filter Dropdown */}
          <div className="w-full md:w-52 shrink-0">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Roles & Positions</option>
              <option value="super_admin">Senior Pastors / Super Admins</option>
              <option value="admin">Church Admins</option>
              <option value="pastor">Pastors</option>
              <option value="leader">Ministry Leaders</option>
              <option value="worker">Volunteers & Workers</option>
              <option value="member">General Members</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Roster List (Table or Cards View) */}
      {loading ? (
        <div className="p-12 bg-white rounded-3xl border border-slate-200 text-center text-slate-400 text-xs font-bold">
          Loading congregation roster...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-12 bg-white rounded-3xl border border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Users size={24} />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">No Members Match Search Criteria</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try resetting your filters, clearing the search query, or add a new congregant to the roster.
          </p>
          <button
            type="button"
            onClick={() => { setSearch(''); setSelectedRole('all'); setStatusFilter('active'); setBaptismFilter('all'); }}
            className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-xl text-xs hover:bg-indigo-100 transition-colors cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <>
          {/* Dense Table View - Desktop Only (hidden on mobile & tablet) */}
          <div className="hidden lg:block bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Member Details</th>
                    <th className="px-5 py-3.5">Contact Info</th>
                    <th className="px-5 py-3.5">Baptism Milestone</th>
                    <th className="px-5 py-3.5">Role & Access</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => {
                    const userStatus = (user as any).status || 'active';
                    const isSuspended = userStatus === 'suspended';
                    const isArchived = userStatus === 'archived';
                    const isBaptized = Boolean((user as any).is_baptized);
                    const bDate = (user as any).baptism_date;
                    const hasLogin = Boolean((user as any).has_login_credentials ?? true);

                    return (
                      <tr 
                        key={user.id} 
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isSuspended ? 'bg-rose-50/20' : isArchived ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        {/* Name & Avatar */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                              <img 
                                src={user.avatar_url || `https://picsum.photos/seed/${user.id}/100/100`} 
                                alt="" 
                                className="w-full h-full object-cover" 
                              />
                            </div>
                            <div>
                              <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                                {user.first_name} {user.last_name}
                                {isSuspended && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-700">
                                    Suspended
                                  </span>
                                )}
                                {isArchived && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800">
                                    Archived
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide">
                                FaithConnect Grace Cathedral
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Email & Phone */}
                        <td className="px-5 py-3.5 text-xs">
                          <div className="text-slate-800 font-mono">{user.email}</div>
                          <div className="text-slate-400 text-[11px] mt-0.5">{user.phone || 'No phone recorded'}</div>
                        </td>

                        {/* Baptism Milestone */}
                        <td className="px-5 py-3.5 text-xs">
                          {isBaptized ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 font-bold text-[11px] border border-amber-200">
                              <Sparkles size={12} className="text-amber-600" />
                              Baptized {bDate ? `(${new Date(bDate).toLocaleDateString()})` : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 font-medium text-[11px]">
                              Unbaptized
                            </span>
                          )}
                        </td>

                        {/* Role & Credential Status */}
                        <td className="px-5 py-3.5 space-y-1">
                          <select
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-indigo-700 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            value={user.primary_role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          >
                            <option value="member">Member</option>
                            <option value="worker">Worker</option>
                            <option value="leader">Leader</option>
                            <option value="pastor">Pastor</option>
                            <option value="admin">Admin</option>
                            <option value="super_admin">Super Admin</option>
                          </select>

                          <div className="mt-1">
                            {hasLogin ? (
                              <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                                <Key size={10} /> Login Enabled
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleCreateCredentialsForUser(user)}
                                className="text-[10px] text-indigo-600 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Key size={10} /> Create Credentials
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingUser(user)}
                              title="View Profile Details"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye size={16} />
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditModal(user)}
                              title="Edit Member Details"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit size={16} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleSuspend(user)}
                              title={isSuspended ? "Reactivate Member" : "Suspend Member"}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isSuspended ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100'
                              }`}
                            >
                              <ShieldAlert size={16} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSoftDelete(user)}
                              title={isArchived ? "Restore Member" : "Soft Delete Member"}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isArchived ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100'
                              }`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards/Grid View Fallback for Mobile & Tablet (< lg) */}
          <div className="lg:hidden">
            {renderMemberCards(filteredUsers)}
          </div>
        </>
      ) : (
        renderMemberCards(filteredUsers)
      )}
      </>
      )}

      {/* --- ADD / EDIT MEMBER MODAL --- */}
      {(showAddModal || editingUser) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 pt-16 sm:pt-20 pb-10 z-[100] overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 max-w-xl w-full p-4 sm:p-6 md:p-8 shadow-2xl my-auto space-y-4 sm:space-y-6">
            <div className="flex items-start justify-between pb-3 sm:pb-4 border-b border-slate-100 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    {editingUser ? 'Edit Congregant Profile' : 'Add New Church Member'}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500">Record congregant personal details, baptism milestones, and portal access.</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => { setShowAddModal(false); setEditingUser(null); }}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={editingUser ? handleSaveEdit : handleAddMember} className="space-y-4 sm:space-y-5 text-xs">
              {/* Form Error Banner */}
              {formError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                  <span className="flex-1 leading-relaxed">{formError}</span>
                </div>
              )}

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    First Name *
                  </label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Samuel"
                    value={formFirstName}
                    onChange={(e) => setFormFirstName(e.target.value)}
                    className="w-full p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Last Name *
                  </label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Okonkwo"
                    value={formLastName}
                    onChange={(e) => setFormLastName(e.target.value)}
                    className="w-full p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Contact Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Email Address (Unique) *
                  </label>
                  <input 
                    type="email" 
                    required 
                    placeholder="member@faithconnect.church"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Phone Number (Unique)
                  </label>
                  <input 
                    type="text" 
                    placeholder="+1 (555) 000-0000"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Role & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Primary Role / Position
                  </label>
                  <select 
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="member">General Member</option>
                    <option value="worker">Volunteer / Worker</option>
                    <option value="leader">Ministry Leader</option>
                    <option value="pastor">Pastor</option>
                    <option value="admin">Church Admin</option>
                    <option value="super_admin">Senior Pastor / Super Admin</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Membership Status
                  </label>
                  <select 
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="active">Active Member</option>
                    <option value="suspended">Suspended</option>
                    <option value="archived">Archived (Soft Deleted)</option>
                  </select>
                </div>
              </div>

              {/* Avatar Selection & Photo Upload Section */}
              <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <label className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block">
                  📸 Member Profile Image / Photo
                </label>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Avatar Preview Circle */}
                  <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-indigo-500 shadow-xs shrink-0 bg-indigo-50 flex items-center justify-center text-indigo-700 font-extrabold text-xl">
                    {formAvatar ? (
                      <img src={formAvatar} alt="Profile preview" className="w-full h-full object-cover" />
                    ) : (
                      <span>{formFirstName ? formFirstName.charAt(0) : 'U'}</span>
                    )}
                  </div>

                  {/* Upload Actions */}
                  <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                    <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                      <label className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors flex items-center gap-1.5 shrink-0">
                        <Upload size={14} />
                        <span>Upload Member Photo</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleImageUpload} 
                        />
                      </label>

                      {formAvatar && (
                        <button
                          type="button"
                          onClick={() => setFormAvatar('')}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                        >
                          Remove Photo
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">JPG, PNG or WEBP (Max 5MB). Photo updates automatically.</p>
                  </div>
                </div>

                {/* Preset Avatars & Image URL Alternative */}
                <div className="pt-2 border-t border-slate-200/60 space-y-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Or Choose Preset Avatar:</span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {presetAvatars.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setFormAvatar(url)}
                        className={`w-8 h-8 rounded-full overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                          formAvatar === url ? 'border-indigo-600 scale-110 shadow-xs' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>

                  <input 
                    type="text" 
                    placeholder="Or paste external image URL..."
                    value={formAvatar}
                    onChange={(e) => setFormAvatar(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-[10px] outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-slate-600"
                  />
                </div>
              </div>

              {/* Date of Birth & Marital Status Box */}
              <div className="p-3.5 sm:p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-3">
                <span className="text-xs font-extrabold text-purple-900 block">🎂 Personal Birth Date & Marital Status</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-purple-800 tracking-wider block mb-1">
                      Date of Birth
                    </label>
                    <input 
                      type="date" 
                      value={formDob}
                      onChange={(e) => setFormDob(e.target.value)}
                      className="w-full p-2.5 bg-white border border-purple-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-purple-800 tracking-wider block mb-1">
                      Marital Status
                    </label>
                    <select 
                      value={formMaritalStatus}
                      onChange={(e) => setFormMaritalStatus(e.target.value as any)}
                      className="w-full p-2.5 bg-white border border-purple-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    >
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Widowed">Widowed</option>
                      <option value="Divorced">Divorced</option>
                    </select>
                  </div>
                </div>

                {formMaritalStatus === 'Married' && (
                  <div>
                    <label className="text-[10px] font-extrabold uppercase text-purple-800 tracking-wider block mb-1">
                      Marriage / Wedding Anniversary Date
                    </label>
                    <input 
                      type="date" 
                      value={formMarriageDate}
                      onChange={(e) => setFormMarriageDate(e.target.value)}
                      className="w-full p-2.5 bg-white border border-purple-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                )}
              </div>

              {/* Water Baptism Details Box */}
              <div className="p-3.5 sm:p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                <label className="flex items-center gap-2 cursor-pointer font-extrabold text-amber-900 text-xs">
                  <input 
                    type="checkbox" 
                    checked={formIsBaptized}
                    onChange={(e) => setFormIsBaptized(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>🌊 Member is Water Baptized</span>
                </label>

                {formIsBaptized && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-amber-800 tracking-wider block mb-1">
                        Water Baptism Date
                      </label>
                      <input 
                        type="date" 
                        value={formBaptismDate}
                        onChange={(e) => setFormBaptismDate(e.target.value)}
                        className="w-full p-2.5 bg-white border border-amber-200 rounded-xl font-bold text-amber-900 outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-amber-800 tracking-wider block mb-1">
                        Officiating Pastor / Minister
                      </label>
                      <input 
                        type="text" 
                        placeholder="e.g. Rev. Sarah Johnson"
                        value={formBaptizedBy}
                        onChange={(e) => setFormBaptizedBy(e.target.value)}
                        className="w-full p-2.5 bg-white border border-amber-200 rounded-xl font-medium text-amber-900 outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Member Login Credentials Box */}
              <div className="p-3.5 sm:p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
                <label className="flex items-center gap-2 cursor-pointer font-extrabold text-indigo-900 text-xs">
                  <input 
                    type="checkbox" 
                    checked={formCreateCredentials}
                    onChange={(e) => setFormCreateCredentials(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>🔑 Generate Portal Login Credentials</span>
                </label>

                {formCreateCredentials && (
                  <div className="pt-2 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold text-indigo-800">
                      <span>Initial Temporary Password</span>
                      <button 
                        type="button" 
                        onClick={() => setFormPassword(generateTempPassword())}
                        className="text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw size={10} /> Regenerate
                      </button>
                    </div>

                    <div className="relative">
                      <input 
                        type={showPassText ? "text" : "password"}
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-mono text-xs font-bold text-slate-800 pr-16 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassText(!showPassText)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-indigo-600 hover:underline cursor-pointer"
                      >
                        {showPassText ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingUser(null); }}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-100 transition-all cursor-pointer text-center"
                >
                  {editingUser ? 'Save Member Updates' : 'Add Member to Roster'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- VIEW MEMBER DETAILS MODAL --- */}
      {viewingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 pt-16 sm:pt-20 pb-10 z-[100] overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 my-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-indigo-200">
                  <img src={viewingUser.avatar_url || `https://picsum.photos/seed/${viewingUser.id}/100`} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg leading-tight">
                    {viewingUser.first_name} {viewingUser.last_name}
                  </h3>
                  <span className="inline-block px-2 py-0.5 mt-1 bg-indigo-50 text-indigo-700 font-extrabold text-[10px] rounded uppercase">
                    {viewingUser.primary_role?.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setViewingUser(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Email:</span>
                <span className="font-mono text-slate-800 font-bold">{viewingUser.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Phone:</span>
                <span className="text-slate-800 font-bold">{viewingUser.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Date of Birth:</span>
                <span className="text-purple-700 font-bold">
                  {(viewingUser as any).date_of_birth ? new Date((viewingUser as any).date_of_birth).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Marital Status:</span>
                <span className="text-slate-800 font-bold">{(viewingUser as any).marital_status || 'Single'}</span>
              </div>
              {(viewingUser as any).marital_status === 'Married' && (
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Marriage Anniversary:</span>
                  <span className="text-purple-800 font-bold">
                    {(viewingUser as any).marriage_date ? new Date((viewingUser as any).marriage_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Water Baptized:</span>
                <span className="font-bold text-amber-800">
                  {(viewingUser as any).is_baptized ? `Yes (${(viewingUser as any).baptism_date || 'Date logged'})` : 'No'}
                </span>
              </div>
              {(viewingUser as any).is_baptized && (viewingUser as any).baptized_by && (
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Officiated By:</span>
                  <span className="text-slate-800 font-bold">{(viewingUser as any).baptized_by}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Portal Access:</span>
                <span className="font-bold text-emerald-700">
                  {(viewingUser as any).has_login_credentials ? 'Active Credentials' : 'Disabled'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { const u = viewingUser; setViewingUser(null); openEditModal(u); }}
                className="px-4 py-2 bg-indigo-600 text-white font-extrabold rounded-xl text-xs hover:bg-indigo-700 cursor-pointer"
              >
                Edit Member Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CREATED LOGIN CREDENTIALS CONFIRMATION MODAL --- */}
      {createdCredsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 pt-16 sm:pt-20 pb-10 z-[100] overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto">
              <Key size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Portal Credentials Active</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Share these login credentials with <strong className="text-slate-800">{createdCredsModal.name}</strong>.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Portal URL:</span>
                <span className="font-mono text-indigo-600 font-bold">https://faithconnect.church/login</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Login Email:</span>
                <span className="font-mono text-slate-800 font-bold">{createdCredsModal.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Temporary Password:</span>
                <span className="font-mono text-emerald-600 font-black">{createdCredsModal.pass}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`FaithConnect Member Portal Login:\nEmail: ${createdCredsModal.email}\nPassword: ${createdCredsModal.pass}`);
                  setCopiedCreds(true);
                  setTimeout(() => setCopiedCreds(false), 2000);
                }}
                className="flex-1 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy size={14} />
                <span>{copiedCreds ? 'Copied to Clipboard!' : 'Copy Credentials'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreatedCredsModal(null)}
                className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Ministries & Teams Admin Tab ---

const MinistriesAdminTab = () => {
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // Custom categories state
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('fc_custom_categories');
      return saved ? JSON.parse(saved) : ['Men', 'Women'];
    } catch {
      return ['Men', 'Women'];
    }
  });

  // Modals state
  const [showAddMinistryModal, setShowAddMinistryModal] = useState(false);
  const [editingMinistry, setEditingMinistry] = useState<Ministry | null>(null);

  // Inline temporal category creation state inside forms
  const [showInlineCategoryAdd, setShowInlineCategoryAdd] = useState(false);
  const [inlineCategoryInput, setInlineCategoryInput] = useState('');

  // Add Ministry Form state
  const [newMinistry, setNewMinistry] = useState({
    name: '',
    description: '',
    leader_name: '',
    leader_id: '',
    meeting_time: '',
    category: 'Worship',
    roles: ['Department Team Lead', 'Volunteer Coordinator', 'Service Duty Member']
  });
  const [newRoleInput, setNewRoleInput] = useState('');

  // Edit Ministry Form state inside modal
  const [editRoleInput, setEditRoleInput] = useState('');

  const fetchMinistriesAndProfiles = async () => {
    const [minRes, profRes] = await Promise.all([
      supabase.from('ministries').select('*'),
      supabase.from('profiles').select('*').order('first_name', { ascending: true })
    ]);
    if (minRes.data) setMinistries(minRes.data as Ministry[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
  };

  useEffect(() => {
    fetchMinistriesAndProfiles();
  }, []);

  const defaultCategories = ['Worship', 'Youth', 'Children', 'Men', 'Women', 'Hospitality', 'Prayer', 'Production', 'Outreach'];
  // Combine default categories with custom categories uniquely
  const allCategories = Array.from(new Set([...defaultCategories, ...customCategories]));

  const handleSaveInlineCategory = (targetForm: 'add' | 'edit') => {
    const trimmed = inlineCategoryInput.trim();
    if (!trimmed) {
      setShowInlineCategoryAdd(false);
      return;
    }

    if (!allCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...customCategories, trimmed];
      setCustomCategories(updated);
      try {
        localStorage.setItem('fc_custom_categories', JSON.stringify(updated));
      } catch (err) {
        console.warn("Could not save custom category", err);
      }
    }

    if (targetForm === 'add') {
      setNewMinistry(prev => ({ ...prev, category: trimmed }));
    } else if (targetForm === 'edit' && editingMinistry) {
      setEditingMinistry(prev => prev ? ({ ...prev, category: trimmed }) : null);
    }

    setInlineCategoryInput('');
    setShowInlineCategoryAdd(false);
  };

  const handleCreateMinistry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMinistry.name.trim()) return;

    const leaderProfile = profiles.find(p => p.id === newMinistry.leader_id);
    const leaderName = leaderProfile 
      ? `${leaderProfile.first_name} ${leaderProfile.last_name}` 
      : (newMinistry.leader_name.trim() || 'TBD');

    const createdItem: Ministry = {
      id: `min_${Date.now()}`,
      name: newMinistry.name.trim(),
      description: newMinistry.description.trim(),
      leader_name: leaderName,
      leader_id: leaderProfile ? leaderProfile.id : undefined,
      meeting_time: newMinistry.meeting_time.trim() || 'Weekly Gathering',
      member_count: 1,
      category: newMinistry.category,
      roles_and_responsibilities: newMinistry.roles.length > 0 ? newMinistry.roles : ['Department Member']
    };

    await supabase.from('ministries').insert(createdItem);
    setShowAddMinistryModal(false);
    setNewMinistry({
      name: '',
      description: '',
      leader_name: '',
      leader_id: '',
      meeting_time: '',
      category: 'Worship',
      roles: ['Department Team Lead', 'Volunteer Coordinator', 'Service Duty Member']
    });
    fetchMinistriesAndProfiles();
  };

  const handleSaveMinistryEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMinistry) return;

    const leaderProfile = profiles.find(p => p.id === editingMinistry.leader_id);
    const leaderName = leaderProfile 
      ? `${leaderProfile.first_name} ${leaderProfile.last_name}` 
      : (editingMinistry.leader_name || 'TBD');

    const updatedData = {
      name: editingMinistry.name,
      description: editingMinistry.description,
      leader_name: leaderName,
      leader_id: editingMinistry.leader_id,
      meeting_time: editingMinistry.meeting_time,
      member_count: Number(editingMinistry.member_count) || 1,
      category: editingMinistry.category,
      roles_and_responsibilities: editingMinistry.roles_and_responsibilities || []
    };

    await supabase.from('ministries').update(updatedData).eq('id', editingMinistry.id);
    setMinistries(prev => prev.map(m => m.id === editingMinistry.id ? { ...m, ...updatedData } as Ministry : m));
    setEditingMinistry(null);
  };

  const handleDeleteMinistry = async (minId: string) => {
    if (!confirm("Are you sure you want to remove this ministry department?")) return;
    await supabase.from('ministries').delete().eq('id', minId);
    setMinistries(prev => prev.filter(m => m.id !== minId));
    setEditingMinistry(null);
  };

  const handleAddRoleToEditing = () => {
    if (!editRoleInput.trim() || !editingMinistry) return;
    const currentRoles = editingMinistry.roles_and_responsibilities || [];
    setEditingMinistry({
      ...editingMinistry,
      roles_and_responsibilities: [...currentRoles, editRoleInput.trim()]
    });
    setEditRoleInput('');
  };

  const handleRemoveRoleFromEditing = (index: number) => {
    if (!editingMinistry) return;
    const currentRoles = editingMinistry.roles_and_responsibilities || [];
    setEditingMinistry({
      ...editingMinistry,
      roles_and_responsibilities: currentRoles.filter((_, i) => i !== index)
    });
  };

  const filteredMinistries = ministries.filter(m => {
    if (selectedCategory === 'All') return true;
    return m.category.toLowerCase() === selectedCategory.toLowerCase();
  });

  return (
    <div className="space-y-6">
      {/* Header & Main Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 flex items-center gap-1">
              <Building2 size={12} />
              {ministries.length} Departments Active
            </span>
            <span className="text-xs text-slate-400 font-semibold">• Grace Cathedral Teams</span>
          </div>
          <h3 className="font-extrabold text-slate-900 text-2xl tracking-tight">Church Ministries & Departments</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage choir, youth, ushers, Men's & Women's fellowships, assign department leaders, and define team responsibilities.
          </p>
        </div>

        <div className="flex flex-row items-center gap-2.5 w-full md:w-auto">
          {/* Category Dropdown Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 shadow-2xs flex-1 md:flex-initial min-w-0 sm:min-w-[240px]">
            <Filter size={15} className="text-slate-400 shrink-0" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-800 outline-none cursor-pointer w-full pr-1 truncate"
            >
              <option value="All">All Categories ({ministries.length})</option>
              {allCategories.map(cat => {
                const count = ministries.filter(m => m.category.toLowerCase() === cat.toLowerCase()).length;
                return (
                  <option key={cat} value={cat}>
                    {cat} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Add Ministry Button - Strictly on the Right of Dropdown */}
          <button 
            type="button"
            onClick={() => {
              setShowInlineCategoryAdd(false);
              setInlineCategoryInput('');
              setShowAddMinistryModal(true);
            }} 
            className="px-4 sm:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0"
          >
            <Plus size={16} />
            <span>Add Ministry</span>
          </button>
        </div>
      </div>

      {/* Ministries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredMinistries.map((m) => {
          const leaderProfile = profiles.find(p => p.id === m.leader_id || `${p.first_name} ${p.last_name}` === m.leader_name);
          const rolesList = m.roles_and_responsibilities || [];

          return (
            <div key={m.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    m.category === 'Men' || m.category === 'Women' 
                      ? 'bg-amber-50 text-amber-900 border-amber-200' 
                      : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                  }`}>
                    {m.category}
                  </span>
                  <span className="text-xs font-extrabold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    {m.member_count} Servants
                  </span>
                </div>

                <h4 className="font-extrabold text-slate-900 text-lg mb-1 leading-snug">{m.name}</h4>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">{m.description}</p>

                {/* Assigned Leader Card */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-indigo-100 border border-indigo-200 shrink-0">
                    <img 
                      src={leaderProfile?.avatar_url || `https://picsum.photos/seed/${m.id}/100/100`} 
                      alt="" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[9px] font-black uppercase text-indigo-600 tracking-wider block">Department Leader</span>
                    <p className="font-extrabold text-slate-900 text-xs truncate">{m.leader_name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{m.meeting_time}</p>
                  </div>
                </div>

                {/* Department-Specific Governance Roles & Appointed Leaders */}
                {(() => {
                  const allCustomRoles = getCustomRoles();
                  const allAssignments = getRoleAssignments();
                  const deptRoles = allCustomRoles.filter(r => 
                    (r.ministry_name && r.ministry_name.toLowerCase().includes(m.name.toLowerCase())) || 
                    (r.ministry_name && m.name.toLowerCase().includes(r.ministry_name.toLowerCase())) ||
                    r.category.toLowerCase() === m.category.toLowerCase()
                  );
                  const deptAssignments = allAssignments.filter(a => 
                    (a.ministry_name && a.ministry_name.toLowerCase().includes(m.name.toLowerCase())) ||
                    (a.ministry_name && m.name.toLowerCase().includes(a.ministry_name.toLowerCase()))
                  );

                  return (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                        <span>Department Roles ({deptRoles.length})</span>
                        <Link 
                          to="/portal/admin?tab=roles" 
                          className="text-indigo-600 hover:text-indigo-800 font-extrabold cursor-pointer"
                        >
                          Manage Roles &rarr;
                        </Link>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {deptRoles.map((r) => {
                          const assigned = deptAssignments.filter(a => a.role_id === r.id);
                          return (
                            <div key={r.id} className="px-2.5 py-1 bg-indigo-50 border border-indigo-100 text-indigo-900 text-[10px] font-bold rounded-lg flex items-center gap-1.5">
                              <ShieldCheck size={11} className="text-indigo-600 shrink-0" />
                              <span>{r.name}</span>
                              {assigned.length > 0 && (
                                <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded-full text-[9px] font-black shrink-0">
                                  {assigned.length}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {deptRoles.length === 0 && (
                          <span className="text-[11px] text-slate-400 italic">No department-scoped roles defined yet.</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Card Footer Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button 
                  type="button"
                  onClick={() => {
                    setShowInlineCategoryAdd(false);
                    setInlineCategoryInput('');
                    setEditingMinistry(m);
                  }}
                  className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Edit size={14} />
                  <span>View & Manage Department</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- ADD NEW MINISTRY MODAL --- */}
      {showAddMinistryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 pt-16 sm:pt-20 pb-10 z-[100] overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Add New Department / Team</h3>
                  <p className="text-[11px] text-slate-500">Create a new ministry group and assign a team leader.</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowAddMinistryModal(false)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateMinistry} className="space-y-4 text-xs">
              {/* Ministry Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Ministry Name *
                  </label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Media & Sound Engineering"
                    value={newMinistry.name}
                    onChange={(e) => setNewMinistry({ ...newMinistry, name: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Category *
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select 
                      value={newMinistry.category}
                      onChange={(e) => setNewMinistry({ ...newMinistry, category: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowInlineCategoryAdd(prev => !prev)}
                      title="Add Custom Category"
                      className="px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl border border-indigo-200 flex items-center justify-center gap-1 shrink-0 cursor-pointer transition-all text-xs"
                    >
                      <Plus size={15} />
                      <span className="hidden sm:inline">New</span>
                    </button>
                  </div>

                  {/* Temporal Inline Category Input Field */}
                  {showInlineCategoryAdd && (
                    <div className="mt-2.5 p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                      <label className="text-[10px] font-extrabold uppercase text-indigo-900 tracking-wider block">
                        Create & Select New Category
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="e.g. Senior Saints, Evangelism"
                          value={inlineCategoryInput}
                          onChange={(e) => setInlineCategoryInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveInlineCategory('add');
                            }
                          }}
                          className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveInlineCategory('add')}
                          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs whitespace-nowrap"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInlineCategoryInput('');
                            setShowInlineCategoryAdd(false);
                          }}
                          className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-lg text-xs cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Department Leader Selection */}
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                  Department Leader (From Member Roster)
                </label>
                <select 
                  value={newMinistry.leader_id}
                  onChange={(e) => {
                    const chosen = profiles.find(p => p.id === e.target.value);
                    setNewMinistry({
                      ...newMinistry,
                      leader_id: e.target.value,
                      leader_name: chosen ? `${chosen.first_name} ${chosen.last_name}` : ''
                    });
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">-- Select Member from Congregation Roster --</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.primary_role})
                    </option>
                  ))}
                </select>

                {!newMinistry.leader_id && (
                  <input 
                    type="text" 
                    placeholder="Or enter leader name manually..."
                    value={newMinistry.leader_name}
                    onChange={(e) => setNewMinistry({ ...newMinistry, leader_name: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs mt-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
              </div>

              {/* Schedule & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Meeting Schedule
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. Saturdays at 4:00 PM"
                    value={newMinistry.meeting_time}
                    onChange={(e) => setNewMinistry({ ...newMinistry, meeting_time: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Description
                  </label>
                  <input 
                    type="text" 
                    placeholder="Brief department mission statement..."
                    value={newMinistry.description}
                    onChange={(e) => setNewMinistry({ ...newMinistry, description: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Roles & Responsibilities Section */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">
                  Assign Roles & Responsibilities
                </span>

                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="e.g. Section Leader, Sound Engineer"
                    value={newRoleInput}
                    onChange={(e) => setNewRoleInput(e.target.value)}
                    className="flex-1 p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none"
                  />
                  <button 
                    type="button" 
                    onClick={() => {
                      if (newRoleInput.trim()) {
                        setNewMinistry({ ...newMinistry, roles: [...newMinistry.roles, newRoleInput.trim()] });
                        setNewRoleInput('');
                      }
                    }}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-xl text-xs hover:bg-indigo-100 cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {newMinistry.roles.map((r, i) => (
                    <span key={i} className="px-2.5 py-1 bg-white border border-slate-200 text-slate-800 text-[10px] font-extrabold rounded-lg flex items-center gap-1">
                      {r}
                      <button 
                        type="button" 
                        onClick={() => setNewMinistry({ ...newMinistry, roles: newMinistry.roles.filter((_, idx) => idx !== i) })}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer ml-1"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowAddMinistryModal(false)} 
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-6 py-2.5 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-100 cursor-pointer"
                >
                  Create Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DEPARTMENT DETAILS & EDIT MODAL --- */}
      {editingMinistry && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 pt-16 sm:pt-20 pb-10 z-[100] overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 max-w-2xl w-full p-5 sm:p-8 shadow-2xl space-y-6 my-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Building2 size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                      {editingMinistry.category}
                    </span>
                    <span className="text-xs text-slate-400 font-bold">• Grace Cathedral</span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">{editingMinistry.name}</h3>
                </div>
              </div>

              <button 
                type="button"
                onClick={() => setEditingMinistry(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveMinistryEdit} className="space-y-6 text-xs">
              {/* Department Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Department Title *
                  </label>
                  <input 
                    type="text" 
                    required
                    value={editingMinistry.name}
                    onChange={(e) => setEditingMinistry({ ...editingMinistry, name: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Category *
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select 
                      value={editingMinistry.category}
                      onChange={(e) => setEditingMinistry({ ...editingMinistry, category: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowInlineCategoryAdd(prev => !prev)}
                      title="Add Custom Category"
                      className="px-3 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl border border-indigo-200 flex items-center justify-center gap-1 shrink-0 cursor-pointer transition-all text-xs"
                    >
                      <Plus size={16} />
                      <span className="hidden sm:inline">New</span>
                    </button>
                  </div>

                  {/* Temporal Inline Category Input Field */}
                  {showInlineCategoryAdd && (
                    <div className="mt-2.5 p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                      <label className="text-[10px] font-extrabold uppercase text-indigo-900 tracking-wider block">
                        Create & Select New Category
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="e.g. Senior Saints, Evangelism"
                          value={inlineCategoryInput}
                          onChange={(e) => setInlineCategoryInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveInlineCategory('edit');
                            }
                          }}
                          className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveInlineCategory('edit')}
                          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs whitespace-nowrap"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInlineCategoryInput('');
                            setShowInlineCategoryAdd(false);
                          }}
                          className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-lg text-xs cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Leader Reassignment */}
              <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                    <UserCheck size={16} className="text-indigo-600" />
                    Assign Department Leader
                  </span>
                  <span className="text-[10px] text-indigo-600 font-bold">Selected from Roster</span>
                </div>

                <select 
                  value={editingMinistry.leader_id || ''}
                  onChange={(e) => {
                    const chosen = profiles.find(p => p.id === e.target.value);
                    setEditingMinistry({
                      ...editingMinistry,
                      leader_id: e.target.value,
                      leader_name: chosen ? `${chosen.first_name} ${chosen.last_name}` : editingMinistry.leader_name
                    });
                  }}
                  className="w-full p-3 bg-white border border-indigo-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">-- Choose Leader from Congregation Roster --</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.primary_role.replace('_', ' ')}) - {p.email}
                    </option>
                  ))}
                </select>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">
                    Or Override Leader Name Manually:
                  </label>
                  <input 
                    type="text" 
                    value={editingMinistry.leader_name}
                    onChange={(e) => setEditingMinistry({ ...editingMinistry, leader_name: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none"
                  />
                </div>
              </div>

              {/* Schedule, Member Count, Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Meeting Schedule
                  </label>
                  <input 
                    type="text" 
                    value={editingMinistry.meeting_time}
                    onChange={(e) => setEditingMinistry({ ...editingMinistry, meeting_time: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                    Active Member Count
                  </label>
                  <input 
                    type="number" 
                    value={editingMinistry.member_count}
                    onChange={(e) => setEditingMinistry({ ...editingMinistry, member_count: Number(e.target.value) })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                  Department Objectives & Mission
                </label>
                <textarea 
                  rows={2}
                  value={editingMinistry.description}
                  onChange={(e) => setEditingMinistry({ ...editingMinistry, description: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Roles & Responsibilities Section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    Roles & Responsibilities Editor
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {(editingMinistry.roles_and_responsibilities || []).length} Defined Positions
                  </span>
                </div>

                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Add new position or responsibility..."
                    value={editRoleInput}
                    onChange={(e) => setEditRoleInput(e.target.value)}
                    className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button 
                    type="button"
                    onClick={handleAddRoleToEditing}
                    className="px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 cursor-pointer"
                  >
                    Add Position
                  </button>
                </div>

                <div className="space-y-2 pt-1 max-h-40 overflow-y-auto">
                  {(editingMinistry.roles_and_responsibilities || []).length === 0 ? (
                    <p className="text-slate-400 italic text-[11px] py-2">No custom positions defined yet.</p>
                  ) : (
                    (editingMinistry.roles_and_responsibilities || []).map((role, idx) => (
                      <div key={idx} className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-xs">• {role}</span>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveRoleFromEditing(idx)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer p-1"
                          title="Remove role"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleDeleteMinistry(editingMinistry.id)}
                  className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>Delete Department</span>
                </button>

                <div className="flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditingMinistry(null)}
                    className="px-5 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md shadow-indigo-100 transition-all cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Financials Admin Tab ---

const FinancialsAdminTab = ({ onSwitchTab }: { onSwitchTab?: (tab: string) => void }) => {
  const [givingConfig, setGivingConfig] = useState<GivingConfig>(getGivingConfig());
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  
  // Modals & Controls
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showPrintReceiptModal, setShowPrintReceiptModal] = useState<FinancialRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending_verification'>('all');

  // Member Selection State for FinancialsAdminTab
  const [membersList, setMembersList] = useState<Profile[]>([]);
  const [contributorType, setContributorType] = useState<'member' | 'non_member'>('member');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');

  // Manual Entry Form State
  const [contributor, setContributor] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedFundId, setSelectedFundId] = useState('f1');
  const [customFundInput, setCustomFundInput] = useState('');
  const [method, setMethod] = useState<'card' | 'bank_transfer' | 'cash' | 'mobile_money'>('cash');
  const [notes, setNotes] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [txnId, setTxnId] = useState('');

  // Configuration Modal Form State
  const [configActiveTab, setConfigActiveTab] = useState<'funds' | 'mobile' | 'bank'>('mobile');
  const [newFundName, setNewFundName] = useState('');
  const [newFundDesc, setNewFundDesc] = useState('');

  // Mobile Money Provider Form State (Add / Edit)
  const [editingGatewayId, setEditingGatewayId] = useState<string | null>(null);
  const [showGatewayForm, setShowGatewayForm] = useState(false);
  const [gwProvider, setGwProvider] = useState('');
  const [gwMerchantNumber, setGwMerchantNumber] = useState('');
  const [gwMerchantName, setGwMerchantName] = useState('');
  const [gwInstructions, setGwInstructions] = useState('');

  // Bank Form State
  const [bankName, setBankName] = useState(givingConfig.bank_details.bank_name);
  const [bankAccName, setBankAccName] = useState(givingConfig.bank_details.account_name);
  const [bankAccNum, setBankAccNum] = useState(givingConfig.bank_details.account_number);
  const [bankSwift, setBankSwift] = useState(givingConfig.bank_details.swift_code || '');

  const fetchMembers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('first_name', { ascending: true });
    if (data && data.length > 0) {
      setMembersList(data as Profile[]);
    } else {
      setMembersList([
        { id: 'm-1', first_name: 'Grace', last_name: 'Campbell', primary_role: 'Congregant', phone: '077 444 555' } as any,
        { id: 'm-2', first_name: 'Sahr', last_name: 'Sesay', primary_role: 'Financial Officer', phone: '076 100 200' } as any,
        { id: 'm-3', first_name: 'David', last_name: 'Miller', primary_role: 'Deacon', phone: '078 123 456' } as any,
        { id: 'm-4', first_name: 'Hannah', last_name: 'Adams', primary_role: 'Worship Lead', phone: '079 888 999' } as any,
        { id: 'm-5', first_name: 'Rev. Sarah', last_name: 'Johnson', primary_role: 'Senior Pastor', phone: '076 999 000' } as any,
      ]);
    }
  };

  const handleSelectMember = (memberId: string) => {
    setSelectedMemberId(memberId);
    if (memberId === 'custom') {
      setContributorType('non_member');
      setContributor('');
      return;
    }
    const found = membersList.find(m => m.id === memberId);
    if (found) {
      setContributor(`${found.first_name} ${found.last_name}`);
      if (found.phone && !senderPhone) {
        setSenderPhone(found.phone);
      }
    }
  };

  const fetchRecords = async () => {
    const { data } = await supabase.from('financial_records').select('*').order('date', { ascending: false });
    if (data && data.length > 0) {
      setRecords(data as FinancialRecord[]);
    } else {
      setRecords([
        {
          id: 'rec-1',
          contributor_name: 'Grace Campbell',
          category: 'Tithe',
          amount: 1500,
          currency: 'SLE',
          date: new Date(Date.now() - 3600000 * 5).toISOString(),
          payment_method: 'mobile_money',
          status: 'pending_verification',
          sender_phone: '077 444 555',
          transaction_id: 'AFRI-88912',
          notes: '10% Covenant Tithe for October'
        },
        {
          id: 'rec-2',
          contributor_name: 'Sahr Sesay',
          category: 'Building & Sanctuary Expansion',
          amount: 5000,
          currency: 'SLE',
          date: new Date(Date.now() - 86400000).toISOString(),
          payment_method: 'bank_transfer',
          status: 'pending_verification',
          transaction_id: 'SLCB-WIRE-9921',
          notes: 'Sanctuary Renovation Seed'
        },
        {
          id: 'rec-3',
          contributor_name: 'Hannah Adams',
          category: 'Sunday Offering',
          amount: 750,
          currency: 'SLE',
          date: new Date(Date.now() - 86400000 * 2).toISOString(),
          payment_method: 'card',
          status: 'completed',
          card_last4: '4242',
          card_brand: 'Visa'
        }
      ]);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchMembers();
    setGivingConfig(getGivingConfig());
  }, []);

  const handlePersistConfig = (updated: GivingConfig) => {
    setGivingConfig(updated);
    saveGivingConfig(updated);
  };

  // Save Configuration Updates
  const handleSaveConfig = () => {
    const updated: GivingConfig = {
      ...givingConfig,
      bank_details: {
        ...givingConfig.bank_details,
        bank_name: bankName.trim(),
        account_name: bankAccName.trim(),
        account_number: bankAccNum.trim(),
        swift_code: bankSwift.trim()
      }
    };
    handlePersistConfig(updated);
    setShowConfigModal(false);
  };

  const handleAddCustomFund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFundName.trim()) return;

    const newFund = {
      id: `f_${Date.now()}`,
      name: newFundName.trim(),
      description: newFundDesc.trim() || undefined,
      is_active: true
    };

    const updated = {
      ...givingConfig,
      funds: [...givingConfig.funds, newFund]
    };

    handlePersistConfig(updated);
    setNewFundName('');
    setNewFundDesc('');
  };

  const handleToggleFundStatus = (fundId: string) => {
    const updated = {
      ...givingConfig,
      funds: givingConfig.funds.map(f => f.id === fundId ? { ...f, is_active: !f.is_active } : f)
    };
    handlePersistConfig(updated);
  };

  // --- MOBILE MONEY GATEWAY CRUD HANDLERS ---
  const handleOpenAddGateway = () => {
    setEditingGatewayId(null);
    setGwProvider('');
    setGwMerchantNumber('');
    setGwMerchantName('Grace Cathedral Ministry');
    setGwInstructions('');
    setShowGatewayForm(true);
  };

  const handleOpenEditGateway = (g: any) => {
    setEditingGatewayId(g.id || g.provider);
    setGwProvider(g.provider);
    setGwMerchantNumber(g.merchant_number);
    setGwMerchantName(g.merchant_name);
    setGwInstructions(g.dial_code_instructions);
    setShowGatewayForm(true);
  };

  const handleSaveGateway = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gwProvider.trim() || !gwMerchantNumber.trim()) return;

    let updatedList = [...givingConfig.mobile_gateways];

    if (editingGatewayId) {
      updatedList = updatedList.map(g => {
        if ((g.id && g.id === editingGatewayId) || g.provider === editingGatewayId) {
          return {
            ...g,
            provider: gwProvider.trim(),
            merchant_number: gwMerchantNumber.trim(),
            merchant_name: gwMerchantName.trim() || 'Grace Cathedral Ministry',
            dial_code_instructions: gwInstructions.trim()
          };
        }
        return g;
      });
    } else {
      const newGw = {
        id: `mm-${Date.now()}`,
        provider: gwProvider.trim(),
        merchant_number: gwMerchantNumber.trim(),
        merchant_name: gwMerchantName.trim() || 'Grace Cathedral Ministry',
        dial_code_instructions: gwInstructions.trim() || `Dial provider USSD -> Pay Merchant -> Enter Code -> Confirm`,
        is_active: true
      };
      updatedList.push(newGw);
    }

    const updatedConfig = { ...givingConfig, mobile_gateways: updatedList };
    handlePersistConfig(updatedConfig);
    setShowGatewayForm(false);
  };

  const handleDeleteGateway = (gwIdOrProvider: string) => {
    if (!confirm("Are you sure you want to delete this Mobile Money provider?")) return;
    const updatedList = givingConfig.mobile_gateways.filter(g => (g.id || g.provider) !== gwIdOrProvider);
    handlePersistConfig({ ...givingConfig, mobile_gateways: updatedList });
  };

  const handleToggleGateway = (gwIdOrProvider: string) => {
    const updatedList = givingConfig.mobile_gateways.map(g => {
      if ((g.id || g.provider) === gwIdOrProvider) {
        return { ...g, is_active: !g.is_active };
      }
      return g;
    });
    handlePersistConfig({ ...givingConfig, mobile_gateways: updatedList });
  };

  // Transaction Verification Actions
  const handleApproveRecord = async (recordId: string) => {
    await supabase.from('financial_records').update({ status: 'completed' }).eq('id', recordId);
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, status: 'completed' } : r));
  };

  const handleRejectRecord = async (recordId: string) => {
    if (!confirm("Are you sure you want to mark this transaction proof as rejected?")) return;
    await supabase.from('financial_records').update({ status: 'rejected' }).eq('id', recordId);
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, status: 'rejected' } : r));
  };

  // Record Manual Giving Entry
  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    let fundCategoryName = 'Tithe';
    if (selectedFundId === 'custom_fund') {
      fundCategoryName = customFundInput.trim() || 'Custom Contribution';
    } else {
      const found = givingConfig.funds.find(f => f.id === selectedFundId);
      if (found) fundCategoryName = found.name;
    }

    const payload = {
      contributor_name: contributor.trim() || 'Anonymous Congregant',
      category: fundCategoryName,
      amount: Number(amount),
      currency: givingConfig.currency_symbol || 'SLE',
      date: new Date().toISOString(),
      payment_method: method,
      status: 'completed' as const,
      notes: notes.trim(),
      sender_phone: senderPhone.trim() || undefined,
      transaction_id: txnId.trim() || undefined
    };

    await supabase.from('financial_records').insert(payload);

    setShowEntryModal(false);
    setContributor('');
    setAmount('');
    setNotes('');
    setSenderPhone('');
    setTxnId('');
    fetchRecords();
  };

  // Calculations
  const filteredRecords = records.filter(r => {
    const rStatus = r.status || 'completed';
    if (statusFilter !== 'all' && rStatus !== statusFilter) return false;
    return true;
  });

  const totalAmount = records.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const tithesTotal = records.filter(r => r.category?.toLowerCase().includes('tithe')).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const offeringTotal = records.filter(r => r.category?.toLowerCase().includes('offering')).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const pendingCount = records.filter(r => r.status === 'pending_verification').length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header Bar with Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
              {givingConfig.currency_symbol || 'SLE'} Default Currency
            </span>
            <span className="text-xs text-slate-400 font-semibold">• Finance Officer & Treasurer Ledger</span>
          </div>
          <h3 className="font-black text-slate-900 text-lg sm:text-xl tracking-tight">Tithes & Financial Ledger</h3>
          <p className="text-xs text-slate-500 mt-0.5">Manage weekly tithes, Sunday offerings, mobile money receipts, and custom funds.</p>
        </div>

        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Link
            to="/portal/finance"
            className="flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border border-indigo-200 shrink-0"
          >
            <Landmark size={15} />
            <span>Finance Officer Console</span>
          </Link>

          <button 
            onClick={() => setShowEntryModal(true)}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all cursor-pointer shrink-0"
          >
            <Plus size={16} />
            <span>Record Entry</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-tight">Total Received</span>
          <div className="text-lg sm:text-2xl font-black text-slate-900 truncate">{givingConfig.currency_symbol || 'SLE'} {totalAmount.toLocaleString()}</div>
          <p className="text-[10px] sm:text-[11px] text-emerald-600 font-semibold truncate">All giving categories combined</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-tight">Tithes Ledger</span>
          <div className="text-lg sm:text-2xl font-black text-indigo-600 truncate">{givingConfig.currency_symbol || 'SLE'} {tithesTotal.toLocaleString()}</div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-semibold truncate">Member covenant tithes</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-[10px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-tight">Sunday Offering</span>
          <div className="text-lg sm:text-2xl font-black text-emerald-600 truncate">{givingConfig.currency_symbol || 'SLE'} {offeringTotal.toLocaleString()}</div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-semibold truncate">General worship collections</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-200 bg-amber-50/30 shadow-xs space-y-1">
          <span className="text-[10px] sm:text-xs font-extrabold text-amber-700 uppercase tracking-tight">Pending Proofs</span>
          <div className="text-lg sm:text-2xl font-black text-amber-700 truncate">{pendingCount}</div>
          <p className="text-[10px] sm:text-[11px] text-amber-800 font-semibold truncate">Mobile & wire proof queue</p>
        </div>
      </div>

      {/* Verification Filter Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs font-bold">
        {/* Mobile Dropdown Filter (< sm) */}
        <div className="sm:hidden space-y-1.5 w-full">
          <label className="text-slate-500 uppercase tracking-wider text-[10px] font-extrabold block">Filter Transactions:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Records ({records.length})</option>
            <option value="pending_verification">⏳ Pending Proofs ({pendingCount})</option>
            <option value="completed">✓ Settled / Confirmed</option>
          </select>
        </div>

        {/* Desktop Tab Filter Bar (>= sm) */}
        <div className="hidden sm:flex items-center gap-2 flex-wrap">
          <span className="text-slate-500 uppercase tracking-wider text-[10px] font-extrabold">Filter Transactions:</span>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'all' ? 'bg-white text-indigo-600 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Records ({records.length})
            </button>
            <button
              onClick={() => setStatusFilter('pending_verification')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'pending_verification' ? 'bg-amber-500 text-white shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock size={13} />
              <span>Pending Proofs ({pendingCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'completed' ? 'bg-emerald-600 text-white shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Settled / Confirmed
            </button>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
        >
          <Printer size={14} /> Print Financial Report
        </button>
      </div>

      {/* --- FINANCIAL TRANSACTIONS (Card View for Mobile & Tablet, Table View for Desktop) --- */}
      <div className="space-y-4">
        {/* MOBILE & TABLET CARD VIEW (< lg) */}
        <div className="block lg:hidden space-y-3">
          {filteredRecords.map((r) => {
            const isPending = r.status === 'pending_verification';
            return (
              <div key={r.id} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-slate-900 text-sm truncate">{r.contributor_name}</h4>
                    <span className="text-[10px] text-slate-400 block mt-0.5">{new Date(r.date).toLocaleString()}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-black text-emerald-600 text-base block">
                      {r.currency || givingConfig.currency_symbol || 'SLE'} {Number(r.amount).toLocaleString()}
                    </span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase mt-1 ${
                      isPending ? 'bg-amber-100 text-amber-900' :
                      r.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {isPending ? '⏳ Pending' : r.status === 'rejected' ? '❌ Rejected' : '✓ Settled'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {r.category}
                    </span>
                    <span className="text-slate-600 font-bold capitalize">{r.payment_method.replace('_', ' ')}</span>
                  </div>
                  {r.transaction_id && <span className="font-mono text-[10px] text-indigo-600 font-bold">Ref: {r.transaction_id}</span>}
                </div>

                {r.sender_phone && (
                  <p className="text-[11px] text-slate-500 font-mono">Mobile Money Sender: {r.sender_phone}</p>
                )}

                {r.notes && (
                  <p className="text-[11px] text-slate-500 italic bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                    "{r.notes}"
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  {isPending ? (
                    <div className="w-full flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleApproveRecord(r.id)}
                        className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Check size={14} /> Confirm
                      </button>
                      <button
                        onClick={() => handleRejectRecord(r.id)}
                        className="flex-1 sm:flex-initial px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowPrintReceiptModal(r)}
                      className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Printer size={14} /> Print Receipt
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredRecords.length === 0 && (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center text-slate-400 italic text-xs">
              No financial records found for this filter view.
            </div>
          )}
        </div>

        {/* DESKTOP TABLE VIEW (lg+) */}
        <div className="hidden lg:block bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[700px]">
              <thead className="bg-slate-50 text-slate-500 font-extrabold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Contributor & Details</th>
                  <th className="px-6 py-4">Giving Fund</th>
                  <th className="px-6 py-4">Amount ({givingConfig.currency_symbol || 'SLE'})</th>
                  <th className="px-6 py-4">Method & Proof</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredRecords.map((r) => {
                  const isPending = r.status === 'pending_verification';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-extrabold text-slate-900 text-xs">{r.contributor_name}</div>
                        <div className="text-[10px] text-slate-400">{new Date(r.date).toLocaleString()}</div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-800 border border-indigo-100">
                          {r.category}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-black text-emerald-600 text-sm">
                        {r.currency || givingConfig.currency_symbol || 'SLE'} {Number(r.amount).toLocaleString()}
                      </td>

                      <td className="px-6 py-4 text-xs">
                        <span className="font-bold text-slate-800 capitalize block">{r.payment_method.replace('_', ' ')}</span>
                        {r.sender_phone && <span className="text-[10px] text-slate-500 block">Phone: {r.sender_phone}</span>}
                        {r.transaction_id && <span className="text-[10px] font-mono text-indigo-600 font-bold block">Ref: {r.transaction_id}</span>}
                        {r.notes && <span className="text-[10px] text-slate-400 block truncate max-w-[200px]">{r.notes}</span>}
                      </td>

                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          isPending ? 'bg-amber-100 text-amber-900 animate-pulse' :
                          r.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isPending ? '⏳ Pending Proof' : r.status === 'rejected' ? '❌ Rejected' : '✓ Confirmed'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending ? (
                            <>
                              <button
                                onClick={() => handleApproveRecord(r.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                                title="Approve & Confirm Proof"
                              >
                                <Check size={12} /> Confirm
                              </button>
                              <button
                                onClick={() => handleRejectRecord(r.id)}
                                className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                title="Reject Proof"
                              >
                                <X size={12} />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setShowPrintReceiptModal(r)}
                              className="p-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                              title="Print Official Statement Receipt"
                            >
                              <Printer size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic text-xs">
                      No financial records found for this filter view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- MODAL 1: RECORD MANUAL ENTRY --- */}
      {showEntryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">Record Church Contribution</h3>
              <button onClick={() => setShowEntryModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRecord} className="space-y-3.5 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-extrabold text-slate-700 block text-xs">Contributor / Member Name *</label>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setContributorType('member');
                        if (membersList.length > 0 && !selectedMemberId) {
                          handleSelectMember(membersList[0].id);
                        }
                      }}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        contributorType === 'member' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Select Member
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setContributorType('non_member');
                        setSelectedMemberId('custom');
                      }}
                      className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        contributorType === 'non_member' ? 'bg-white text-indigo-700 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Non-Member
                    </button>
                  </div>
                </div>

                {contributorType === 'member' ? (
                  <div className="space-y-1.5">
                    <select
                      value={selectedMemberId}
                      onChange={e => handleSelectMember(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none cursor-pointer"
                    >
                      <option value="">-- Select Member from Roster ({membersList.length} Available) --</option>
                      {membersList.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.first_name} {m.last_name} ({m.primary_role || m.role || 'Member'}) {m.phone ? `• ${m.phone}` : ''}
                        </option>
                      ))}
                      <option value="custom">+ Enter Non-Member / Custom Name...</option>
                    </select>
                    {contributor && (
                      <p className="text-[11px] text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 flex items-center justify-between">
                        <span>Selected Contributor: <strong>{contributor}</strong></span>
                        <button type="button" onClick={() => setContributorType('non_member')} className="text-indigo-600 hover:underline text-[10px] cursor-pointer">
                          Edit Name
                        </button>
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="e.g. Visitor John Doe, Anonymous, Corporate Supporter"
                    value={contributor}
                    onChange={e => setContributor(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Amount ({givingConfig.currency_symbol || 'SLE'}) *</label>
                  <input 
                    type="number" 
                    required
                    min={1}
                    placeholder="100.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-indigo-700 text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Giving Fund *</label>
                  <select 
                    value={selectedFundId}
                    onChange={(e) => setSelectedFundId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                  >
                    {givingConfig.funds.filter(f => f.is_active).map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                    <option value="custom_fund">Custom Fund...</option>
                  </select>
                </div>
              </div>

              {selectedFundId === 'custom_fund' && (
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Custom Given Fund Name *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Choir Uniforms"
                    value={customFundInput}
                    onChange={e => setCustomFundInput(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
              )}

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Payment Method</label>
                <select 
                  value={method}
                  onChange={(e) => setMethod(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  <option value="cash">Cash / Envelope Collection</option>
                  <option value="mobile_money">Mobile Money (Afrimoney/Orange)</option>
                  <option value="bank_transfer">Bank Wire / ACH</option>
                  <option value="card">Credit / Debit Card</option>
                </select>
              </div>

              {method === 'mobile_money' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-600 block mb-0.5">Sender Phone</label>
                    <input 
                      type="text" 
                      placeholder="077 123 456"
                      value={senderPhone}
                      onChange={e => setSenderPhone(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-0.5">Transaction ID</label>
                    <input 
                      type="text" 
                      placeholder="TXN-8812"
                      value={txnId}
                      onChange={e => setTxnId(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Notes / Sunday Service Batch</label>
                <input 
                  type="text" 
                  placeholder="e.g. Envelope #442 or 1st Sunday Service"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowEntryModal(false)} className="px-4 py-2 text-slate-500 font-bold cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 cursor-pointer shadow-md">
                  Save Ledger Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: CONFIGURE GIVING FUNDS & GATEWAYS --- */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl p-4 sm:p-6 max-w-2xl w-full shadow-2xl border border-slate-200 space-y-5 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                  Financial Module Settings
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1">Configure Giving Funds & Payment Gateways</h3>
              </div>
              <button onClick={() => setShowConfigModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-xl">
                <X size={20} />
              </button>
            </div>

            {/* Config Sub-Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold">
              <button
                onClick={() => setConfigActiveTab('mobile')}
                className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  configActiveTab === 'mobile' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                📱 Mobile Money Providers ({givingConfig.mobile_gateways.length})
              </button>
              <button
                onClick={() => setConfigActiveTab('funds')}
                className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  configActiveTab === 'funds' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                📁 Giving Funds ({givingConfig.funds.length})
              </button>
              <button
                onClick={() => setConfigActiveTab('bank')}
                className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  configActiveTab === 'bank' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                🏛️ Bank Account Details
              </button>
            </div>

            {/* TAB 1: DYNAMIC FULLY CUSTOMIZABLE MOBILE MONEY PROVIDERS */}
            {configActiveTab === 'mobile' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <p className="text-slate-500">Configure merchant numbers and USSD instructions for mobile money providers (Afrimoney, Orange Money, M-Pesa, MTN MoMo, etc.).</p>
                  <button
                    onClick={handleOpenAddGateway}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl font-extrabold hover:bg-indigo-700 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus size={14} /> Add Provider
                  </button>
                </div>

                {/* Sub-form to Add or Edit Provider */}
                {showGatewayForm && (
                  <form onSubmit={handleSaveGateway} className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200 space-y-3">
                    <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                      <span className="font-black text-indigo-950 uppercase text-[11px]">
                        {editingGatewayId ? 'Edit Mobile Money Provider' : '➕ Add New Mobile Money Provider'}
                      </span>
                      <button type="button" onClick={() => setShowGatewayForm(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="font-bold text-slate-700 block mb-0.5">Provider Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Afrimoney, Orange Money, M-Pesa, Telebirr"
                          value={gwProvider}
                          onChange={e => setGwProvider(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-0.5">Merchant Number / Code *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 077 123 456 (Code: 8812)"
                          value={gwMerchantNumber}
                          onChange={e => setGwMerchantNumber(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-xl font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-0.5">Account Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Grace Cathedral Ministry"
                        value={gwMerchantName}
                        onChange={e => setGwMerchantName(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-0.5">USSD Dial Instructions</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Dial *161# -> Select Pay Merchant -> Enter Code 8812 -> Enter Amount..."
                        value={gwInstructions}
                        onChange={e => setGwInstructions(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setShowGatewayForm(false)} className="px-3 py-1.5 text-slate-500 font-bold">
                        Cancel
                      </button>
                      <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 cursor-pointer shadow-xs">
                        {editingGatewayId ? 'Save Changes' : 'Add Provider'}
                      </button>
                    </div>
                  </form>
                )}

                {/* List of Mobile Money Providers */}
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {givingConfig.mobile_gateways.map((g, idx) => {
                    const gwId = g.id || g.provider;
                    return (
                      <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white font-black flex items-center justify-center text-xs">
                              📱
                            </span>
                            <div>
                              <span className="font-black text-slate-900 text-sm">{g.provider}</span>
                              <span className="text-[10px] text-slate-400 block font-mono">{g.merchant_number}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleGateway(gwId)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${
                                g.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {g.is_active ? 'Active' : 'Disabled'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditGateway(g)}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                              title="Edit Merchant Info"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteGateway(gwId)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              title="Delete Provider"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="p-2.5 bg-white rounded-xl border border-slate-100 text-[11px] space-y-1">
                          <p className="font-bold text-slate-700">Account Name: <span className="text-slate-900">{g.merchant_name}</span></p>
                          <p className="text-slate-500">{g.dial_code_instructions}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: GIVING FUNDS MANAGER */}
            {configActiveTab === 'funds' && (
              <div className="space-y-4 text-xs">
                {/* Add Custom Giving Fund Form */}
                <form onSubmit={handleAddCustomFund} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <span className="font-extrabold text-slate-900 block">➕ Add New Giving Fund / Project Category</span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5">Fund Category Name *</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. Youth Camp Sponsorship"
                        value={newFundName}
                        onChange={e => setNewFundName(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 block mb-0.5">Short Description</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Annual youth retreat fund"
                        value={newFundDesc}
                        onChange={e => setNewFundDesc(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 cursor-pointer shadow-xs">
                      Add Fund Category
                    </button>
                  </div>
                </form>

                {/* Existing Funds List */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {givingConfig.funds.map(fund => (
                    <div key={fund.id} className="p-3 bg-white rounded-2xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <p className="font-extrabold text-slate-900">{fund.name}</p>
                        {fund.description && <p className="text-[10px] text-slate-400">{fund.description}</p>}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleFundStatus(fund.id)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-colors ${
                          fund.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {fund.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: BANK DETAILS */}
            {configActiveTab === 'bank' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Bank Name *</label>
                  <input 
                    type="text" 
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Account Name *</label>
                  <input 
                    type="text" 
                    value={bankAccName}
                    onChange={e => setBankAccName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Account Number *</label>
                    <input 
                      type="text" 
                      value={bankAccNum}
                      onChange={e => setBankAccNum(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">SWIFT / BIC Code</label>
                    <input 
                      type="text" 
                      value={bankSwift}
                      onChange={e => setBankSwift(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button onClick={() => setShowConfigModal(false)} className="px-4 py-2 font-bold text-slate-500 cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSaveConfig} className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 cursor-pointer shadow-md">
                Save Module Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 3: PRINT OFFICIAL TAX STATEMENT RECEIPT --- */}
      {showPrintReceiptModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                Official Giving Statement
              </span>
              <button onClick={() => setShowPrintReceiptModal(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Contributor:</span>
                <strong className="text-slate-900">{showPrintReceiptModal.contributor_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Giving Fund:</span>
                <strong className="text-indigo-600">{showPrintReceiptModal.category}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount Received:</span>
                <strong className="text-emerald-600 text-base">{showPrintReceiptModal.currency || 'SLE'} {showPrintReceiptModal.amount.toLocaleString()}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Payment Method:</span>
                <span className="capitalize font-bold text-slate-800">{showPrintReceiptModal.payment_method.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="uppercase font-extrabold text-emerald-700">{showPrintReceiptModal.status || 'Confirmed'}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 text-[11px]">
                <span className="text-slate-400">Date & Time:</span>
                <span>{new Date(showPrintReceiptModal.date).toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer size={15} /> Print Official Statement
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Streaming Tab ---

const StreamingTab = ({ profile }: { profile: Profile }) => {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newStream, setNewStream] = useState({
    title: '',
    platform: 'youtube',
    privacy: 'public',
    scheduled_start: new Date().toISOString().slice(0, 16)
  });

  const fetchStreams = async () => {
    setLoading(true);
    const { data } = await supabase.from('streams').select('*').order('scheduled_start', { ascending: false });
    if (data) setStreams(data as unknown as Stream[]);
    setLoading(false);
  };

  useEffect(() => { fetchStreams(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('streams').insert([{
      ...newStream,
      branch_id: profile.branch_id || 'branch-1',
      status: 'scheduled',
      view_count: 0
    }]);

    if (error) alert(error.message);
    else {
      setShowModal(false);
      fetchStreams();
    }
  };

  const deleteStream = async (streamId: string) => {
    if (!confirm("Are you sure you want to delete this stream schedule?")) return;
    const { error } = await supabase.from('streams').delete().eq('id', streamId);
    if (error) alert(error.message);
    else fetchStreams();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">Broadcast & Livestream Studio</h3>
          <p className="text-xs text-slate-500">Configure OBS/vMix RTMP streaming, schedule services, and monitor chats.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 cursor-pointer">
          <Plus size={16} /> Schedule Broadcast
        </button>
      </div>

      {showModal && (
        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Service Title</label>
                <input required type="text" className="w-full p-2.5 border rounded-xl text-sm mt-1" value={newStream.title} onChange={e => setNewStream({...newStream, title: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Platform</label>
                <select className="w-full p-2.5 border rounded-xl text-sm mt-1" value={newStream.platform} onChange={e => setNewStream({...newStream, platform: e.target.value})}>
                  <option value="youtube">YouTube Live</option>
                  <option value="facebook">Facebook Live</option>
                  <option value="vimeo">Vimeo</option>
                  <option value="custom">Custom RTMP</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Scheduled Start Time</label>
                <input required type="datetime-local" className="w-full p-2.5 border rounded-xl text-sm mt-1" value={newStream.scheduled_start} onChange={e => setNewStream({...newStream, scheduled_start: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Privacy Level</label>
                <select className="w-full p-2.5 border rounded-xl text-sm mt-1" value={newStream.privacy} onChange={e => setNewStream({...newStream, privacy: e.target.value})}>
                  <option value="public">Public (Everyone)</option>
                  <option value="members_only">Members Only</option>
                  <option value="private">Private (Staff Testing)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
               <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-500 text-xs font-bold">Cancel</button>
               <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">Schedule Broadcast</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {streams.map(stream => (
          <div key={stream.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                  stream.status === 'live' ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-slate-100 text-slate-600'
                }`}>
                  {stream.status}
                </span>
                <span className="text-xs font-mono text-slate-400 capitalize">{stream.platform}</span>
              </div>
              <h4 className="font-bold text-slate-900 mb-1 text-base">{stream.title}</h4>
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                <CalendarIcon size={14} />
                {new Date(stream.scheduled_start).toLocaleString()}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex gap-2">
              <Link 
                to={`/portal/admin/streaming/${stream.id}`}
                className="flex-1 py-2.5 bg-slate-50 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Settings size={14} /> Studio & RTMP Controls
              </Link>
              <button 
                onClick={() => deleteStream(stream.id)}
                className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 transition-colors"
                title="Delete Stream"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Multi-Tenant Upgrade Tab ---

const MultiTenantTab = () => {
  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 border border-indigo-200 rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <Layers size={22} />
          </div>
          <div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-200 text-indigo-900">
              Future Roadmap
            </span>
            <h2 className="text-2xl font-black text-indigo-950 mt-0.5">Multi-Tenant Campus Architecture</h2>
          </div>
        </div>

        <p className="text-sm text-indigo-900/80 leading-relaxed max-w-3xl mb-6">
          FaithConnect is currently configured in <strong>Single Church Mode</strong> for Grace Cathedral. All underlying schemas (`districts`, `church_branches`, `member_transfers`) are already fully implemented in the database engine. When your church plants new campuses or forms a regional district, you can activate multi-tenancy with zero downtime.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-indigo-100">
            <h4 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-2">
              <Church size={16} className="text-indigo-600" /> Multi-Campus Ready
            </h4>
            <p className="text-xs text-slate-500">Each branch maintains its own pastor, worker roster, and local service schedules.</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-indigo-100">
            <h4 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-2">
              <Map size={16} className="text-emerald-600" /> District Hierarchy
            </h4>
            <p className="text-xs text-slate-500">Bishops and District Overseers can monitor aggregate growth across cities and regions.</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-indigo-100">
            <h4 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-2">
              <ArrowRightLeft size={16} className="text-amber-600" /> Seamless Transfers
            </h4>
            <p className="text-xs text-slate-500">Transfer members relocating between campuses with 1-click pastoral approval.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Church Settings Tab ---

const ChurchSettingsTab = () => {
  const [settingsTab, setSettingsTab] = useState<'profile' | 'mobile' | 'funds' | 'bank'>('profile');
  const [givingConfig, setGivingConfig] = useState<GivingConfig>(getGivingConfig());
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Church Profile State
  const [profileData, setProfileData] = useState<ChurchProfile>(() => getChurchProfile());
  const [newServiceTime, setNewServiceTime] = useState('');
  const [showPresetLogoPicker, setShowPresetLogoPicker] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Mobile Money Provider Form State (Add / Edit)
  const [editingGatewayId, setEditingGatewayId] = useState<string | null>(null);
  const [showGatewayForm, setShowGatewayForm] = useState(false);
  const [gwProvider, setGwProvider] = useState('');
  const [gwMerchantNumber, setGwMerchantNumber] = useState('');
  const [gwMerchantName, setGwMerchantName] = useState('');
  const [gwInstructions, setGwInstructions] = useState('');

  // Fund Form State
  const [newFundName, setNewFundName] = useState('');
  const [newFundDesc, setNewFundDesc] = useState('');

  // Bank Form State
  const [bankName, setBankName] = useState(givingConfig.bank_details.bank_name);
  const [bankAccName, setBankAccName] = useState(givingConfig.bank_details.account_name);
  const [bankAccNum, setBankAccNum] = useState(givingConfig.bank_details.account_number);
  const [bankSwift, setBankSwift] = useState(givingConfig.bank_details.swift_code || '');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handlePersistConfig = (updated: GivingConfig) => {
    setGivingConfig(updated);
    saveGivingConfig(updated);
    showToast('✓ Payment Gateway & Fund configurations updated successfully!');
  };

  const handleSaveChurchProfile = (e: React.FormEvent) => {
    e.preventDefault();
    saveChurchProfile(profileData);
    showToast('✓ Church Profile, Logo & GPS Location settings saved successfully!');
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Logo image size should be less than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setProfileData(prev => ({ ...prev, logo_url: reader.result as string }));
        showToast('📷 Church logo updated!');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGetCurrentGps = async () => {
    setGpsLoading(true);
    try {
      const loc = await getCurrentGpsLocation();
      setProfileData(prev => ({
        ...prev,
        latitude: loc.lat,
        longitude: loc.lng
      }));
      setGpsLoading(false);
      showToast(loc.source === 'device' 
        ? '📍 Acquired exact GPS coordinates from your device location!' 
        : '📍 Acquired regional GPS coordinates from network location!'
      );
    } catch (err: any) {
      setGpsLoading(false);
      alert(`Could not retrieve GPS coordinates: ${err?.message || 'Access denied'}`);
    }
  };

  const handleAddServiceTime = () => {
    if (!newServiceTime.trim()) return;
    setProfileData(prev => ({
      ...prev,
      service_times: [...prev.service_times, newServiceTime.trim()]
    }));
    setNewServiceTime('');
  };

  const handleRemoveServiceTime = (idx: number) => {
    setProfileData(prev => ({
      ...prev,
      service_times: prev.service_times.filter((_, i) => i !== idx)
    }));
  };

  const handleSaveBank = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: GivingConfig = {
      ...givingConfig,
      bank_details: {
        ...givingConfig.bank_details,
        bank_name: bankName.trim(),
        account_name: bankAccName.trim(),
        account_number: bankAccNum.trim(),
        swift_code: bankSwift.trim()
      }
    };
    handlePersistConfig(updated);
  };

  const handleAddCustomFund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFundName.trim()) return;

    const newFund = {
      id: `f_${Date.now()}`,
      name: newFundName.trim(),
      description: newFundDesc.trim() || undefined,
      is_active: true
    };

    const updated = {
      ...givingConfig,
      funds: [...givingConfig.funds, newFund]
    };

    handlePersistConfig(updated);
    setNewFundName('');
    setNewFundDesc('');
  };

  const handleToggleFundStatus = (fundId: string) => {
    const updated = {
      ...givingConfig,
      funds: givingConfig.funds.map(f => f.id === fundId ? { ...f, is_active: !f.is_active } : f)
    };
    handlePersistConfig(updated);
  };

  const handleOpenAddGateway = () => {
    setEditingGatewayId(null);
    setGwProvider('');
    setGwMerchantNumber('');
    setGwMerchantName(profileData.name || 'Grace Cathedral Ministry');
    setGwInstructions('');
    setShowGatewayForm(true);
  };

  const handleOpenEditGateway = (g: any) => {
    setEditingGatewayId(g.id || g.provider);
    setGwProvider(g.provider);
    setGwMerchantNumber(g.merchant_number);
    setGwMerchantName(g.merchant_name);
    setGwInstructions(g.dial_code_instructions);
    setShowGatewayForm(true);
  };

  const handleSaveGateway = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gwProvider.trim() || !gwMerchantNumber.trim()) return;

    let updatedList = [...givingConfig.mobile_gateways];

    if (editingGatewayId) {
      updatedList = updatedList.map(g => {
        if ((g.id && g.id === editingGatewayId) || g.provider === editingGatewayId) {
          return {
            ...g,
            provider: gwProvider.trim(),
            merchant_number: gwMerchantNumber.trim(),
            merchant_name: gwMerchantName.trim() || profileData.name || 'Grace Cathedral Ministry',
            dial_code_instructions: gwInstructions.trim()
          };
        }
        return g;
      });
    } else {
      const newGw = {
        id: `mm-${Date.now()}`,
        provider: gwProvider.trim(),
        merchant_number: gwMerchantNumber.trim(),
        merchant_name: gwMerchantName.trim() || profileData.name || 'Grace Cathedral Ministry',
        dial_code_instructions: gwInstructions.trim() || `Dial provider USSD -> Pay Merchant -> Enter Code -> Confirm`,
        is_active: true
      };
      updatedList.push(newGw);
    }

    const updatedConfig = { ...givingConfig, mobile_gateways: updatedList };
    handlePersistConfig(updatedConfig);
    setShowGatewayForm(false);
  };

  const handleDeleteGateway = (gwIdOrProvider: string) => {
    if (!confirm("Are you sure you want to delete this Mobile Money provider?")) return;
    const updatedList = givingConfig.mobile_gateways.filter(g => (g.id || g.provider) !== gwIdOrProvider);
    handlePersistConfig({ ...givingConfig, mobile_gateways: updatedList });
  };

  const handleToggleGateway = (gwIdOrProvider: string) => {
    const updatedList = givingConfig.mobile_gateways.map(g => {
      if ((g.id || g.provider) === gwIdOrProvider) {
        return { ...g, is_active: !g.is_active };
      }
      return g;
    });
    handlePersistConfig({ ...givingConfig, mobile_gateways: updatedList });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
              System Settings & Gateway Module
            </span>
            <span className="text-xs text-slate-400 font-semibold">• {profileData.name}</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Church Profile, GPS & Payment Gateways</h2>
          <p className="text-xs text-slate-500 mt-1">
            Setup church profile identity, upload church logo, configure GPS map coordinates, weekly service schedules, giving funds, and mobile money payment gateways.
          </p>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-4 overflow-x-auto text-xs font-bold scrollbar-none">
          <button
            onClick={() => setSettingsTab('profile')}
            className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              settingsTab === 'profile' ? 'bg-indigo-600 text-white font-extrabold shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Church size={15} />
            <span>Church Profile, Logo & GPS Location</span>
          </button>

          <button
            onClick={() => setSettingsTab('mobile')}
            className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              settingsTab === 'mobile' ? 'bg-indigo-600 text-white font-extrabold shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>📱 Mobile Money Providers ({givingConfig.mobile_gateways.length})</span>
          </button>

          <button
            onClick={() => setSettingsTab('funds')}
            className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              settingsTab === 'funds' ? 'bg-indigo-600 text-white font-extrabold shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>📁 Giving Funds ({givingConfig.funds.length})</span>
          </button>

          <button
            onClick={() => setSettingsTab('bank')}
            className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              settingsTab === 'bank' ? 'bg-indigo-600 text-white font-extrabold shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Landmark size={15} />
            <span>Bank Account Details</span>
          </button>
        </div>
      </div>

      {toastMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-emerald-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* TAB 1: CHURCH PROFILE, LOGO & GPS */}
      {settingsTab === 'profile' && (
        <form onSubmit={handleSaveChurchProfile} className="space-y-6 max-w-4xl text-xs">
          {/* SECTION 1: LOGO & CHURCH BRANDING THEME */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Palette className="text-indigo-600" size={22} />
              <div>
                <h3 className="text-base font-black text-slate-900">Church Logo & Theme Branding</h3>
                <p className="text-xs text-slate-500">Upload custom emblem logo and set primary/secondary portal brand color hex codes.</p>
              </div>
            </div>

            {/* Logo Upload & Picker */}
            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80">
              <div className="relative shrink-0">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-white border-2 border-indigo-200 shadow-md overflow-hidden flex items-center justify-center text-slate-400">
                  {profileData.logo_url ? (
                    <img src={profileData.logo_url} alt="Church Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Church size={40} />
                  )}
                </div>
                {profileData.logo_url && (
                  <button
                    type="button"
                    onClick={() => setProfileData(prev => ({ ...prev, logo_url: '' }))}
                    className="absolute -top-2 -right-2 w-7 h-7 bg-rose-600 text-white rounded-full flex items-center justify-center hover:bg-rose-700 shadow-sm cursor-pointer"
                    title="Remove Logo"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="space-y-3 flex-1 w-full">
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1">Logo Image URL</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/photo-..."
                      value={profileData.logo_url}
                      onChange={e => setProfileData(prev => ({ ...prev, logo_url: e.target.value }))}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPresetLogoPicker(!showPresetLogoPicker)}
                      className="px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold transition-all shrink-0 cursor-pointer"
                    >
                      Preset Logos
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <label className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-xs">
                    <Upload size={15} />
                    <span>Upload Logo File</span>
                    <input type="file" accept="image/*" onChange={handleLogoFileUpload} className="hidden" />
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">PNG, JPG, SVG or WEBP up to 5MB</span>
                </div>

                {showPresetLogoPicker && (
                  <div className="p-3 bg-white rounded-2xl border border-slate-200 space-y-2 animate-in fade-in shadow-xs">
                    <span className="font-bold text-slate-700 block text-[11px]">Choose from Preset Church Logos:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {PRESET_CHURCH_LOGOS.map((preset, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setProfileData(prev => ({ ...prev, logo_url: preset.url }));
                            setShowPresetLogoPicker(false);
                            showToast(`Selected "${preset.name}" logo!`);
                          }}
                          className="p-2 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-left flex flex-col items-center gap-1.5 cursor-pointer"
                        >
                          <img src={preset.url} alt={preset.name} className="w-10 h-10 rounded-lg object-cover" />
                          <span className="text-[10px] font-extrabold text-slate-700 text-center truncate w-full">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Portal Theme Primary & Secondary Colors */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div>
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wide">Portal Brand Theme Colors</h4>
                <p className="text-[11px] text-slate-500">Pick custom hex colors or choose a pre-configured theme palette to restyle headers, primary action buttons, and highlights.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Primary Color Picker */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-extrabold text-slate-700 block text-xs">Primary Accent Color *</label>
                    <span className="font-mono text-[11px] font-extrabold text-slate-600 uppercase">{profileData.primary_color || '#4f46e5'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={profileData.primary_color || '#4f46e5'}
                      onChange={e => setProfileData(prev => ({ ...prev, primary_color: e.target.value }))}
                      className="w-12 h-10 rounded-xl cursor-pointer border-0 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={profileData.primary_color || '#4f46e5'}
                      onChange={e => setProfileData(prev => ({ ...prev, primary_color: e.target.value }))}
                      placeholder="#4f46e5"
                      className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-xs"
                    />
                  </div>
                </div>

                {/* Secondary Color Picker */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-extrabold text-slate-700 block text-xs">Secondary Accent Color *</label>
                    <span className="font-mono text-[11px] font-extrabold text-slate-600 uppercase">{profileData.secondary_color || '#10b981'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={profileData.secondary_color || '#10b981'}
                      onChange={e => setProfileData(prev => ({ ...prev, secondary_color: e.target.value }))}
                      className="w-12 h-10 rounded-xl cursor-pointer border-0 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={profileData.secondary_color || '#10b981'}
                      onChange={e => setProfileData(prev => ({ ...prev, secondary_color: e.target.value }))}
                      placeholder="#10b981"
                      className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Preset Theme Palettes */}
              <div className="space-y-2 pt-1">
                <span className="font-extrabold text-slate-700 block text-[11px]">Preset Portal Color Palettes:</span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {PRESET_COLOR_THEMES.map((theme, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setProfileData(prev => ({
                          ...prev,
                          primary_color: theme.primary,
                          secondary_color: theme.secondary
                        }));
                        showToast(`Applied "${theme.name}" theme palette!`);
                      }}
                      className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all text-left flex flex-col gap-1.5 cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        <span className="w-5 h-5 rounded-full shadow-2xs border border-white" style={{ backgroundColor: theme.primary }} />
                        <span className="w-5 h-5 rounded-full shadow-2xs border border-white" style={{ backgroundColor: theme.secondary }} />
                      </div>
                      <span className="text-[10px] font-bold text-slate-800 leading-tight truncate">{theme.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Theme Preview Box */}
              <div className="p-4 bg-slate-900 rounded-2xl text-white space-y-3 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-400">Live Portal Theme Preview</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: profileData.primary_color || '#4f46e5' }} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: profileData.secondary_color || '#10b981' }} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl font-bold text-white text-xs shadow-sm transition-all"
                    style={{ backgroundColor: profileData.primary_color || '#4f46e5' }}
                  >
                    Primary Button
                  </button>
                  <span
                    className="px-3 py-1 rounded-full text-[10px] font-black uppercase text-white shadow-2xs"
                    style={{ backgroundColor: profileData.secondary_color || '#10b981' }}
                  >
                    Secondary Badge
                  </span>
                  <span
                    className="text-xs font-bold underline cursor-pointer"
                    style={{ color: profileData.primary_color || '#4f46e5' }}
                  >
                    Active Link Accent
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: CHURCH IDENTITY & ADDRESS */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Church className="text-indigo-600" size={20} />
              <h3 className="text-base font-black text-slate-900">Church General Information</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Main Header Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FaithConnect"
                  value={profileData.main_title || ''}
                  onChange={e => setProfileData(prev => ({ ...prev, main_title: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-400 font-medium">Main large headline title in top navigation bar</span>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Subtle Subtitle Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grace Cathedral"
                  value={profileData.subtle_title || ''}
                  onChange={e => setProfileData(prev => ({ ...prev, subtle_title: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-400 font-medium">Subtle tagline subtitle under the main headline title</span>
              </div>

              <div className="sm:col-span-2">
                <label className="font-extrabold text-slate-700 block mb-1">Full Church Legal Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FaithConnect Grace Cathedral"
                  value={profileData.name}
                  onChange={e => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Senior Pastor(s) / Lead Minister *</label>
                <input
                  type="text"
                  required
                  value={profileData.senior_pastor}
                  onChange={e => setProfileData(prev => ({ ...prev, senior_pastor: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Contact Phone *</label>
                <input
                  type="text"
                  required
                  value={profileData.phone}
                  onChange={e => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Contact Email *</label>
                <input
                  type="email"
                  required
                  value={profileData.email}
                  onChange={e => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-extrabold text-slate-700 block mb-1">Physical Address *</label>
                <input
                  type="text"
                  required
                  value={profileData.address}
                  onChange={e => setProfileData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">City *</label>
                <input
                  type="text"
                  required
                  value={profileData.city}
                  onChange={e => setProfileData(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">State / Region / Country *</label>
                <input
                  type="text"
                  required
                  value={profileData.state_country}
                  onChange={e => setProfileData(prev => ({ ...prev, state_country: e.target.value }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-extrabold text-slate-700 block mb-1">Website URL</label>
                <input
                  type="url"
                  value={profileData.website || ''}
                  onChange={e => setProfileData(prev => ({ ...prev, website: e.target.value }))}
                  placeholder="https://faithconnect.church"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-extrabold text-slate-700 block mb-1">Mission Statement / Vision</label>
                <textarea
                  rows={2}
                  value={profileData.mission_statement || ''}
                  onChange={e => setProfileData(prev => ({ ...prev, mission_statement: e.target.value }))}
                  placeholder="Empowering believer communities, promoting transformation..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: WEEKLY SERVICE TIMES */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="text-indigo-600" size={20} />
                <h3 className="text-base font-black text-slate-900">Weekly Worship Service Times</h3>
              </div>
            </div>

            <div className="space-y-2">
              {profileData.service_times.map((st, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-800">• {st}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveServiceTime(i)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Remove Service Time"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="e.g. Sunday Youth Service: 4:00 PM"
                value={newServiceTime}
                onChange={e => setNewServiceTime(e.target.value)}
                className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
              />
              <button
                type="button"
                onClick={handleAddServiceTime}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus size={16} /> Add Service Time
              </button>
            </div>
          </div>

          {/* SECTION 4: GPS LOCATION & INTERACTIVE MAP CONFIGURATION */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="text-indigo-600" size={20} />
                <div>
                  <h3 className="text-base font-black text-slate-900">Church GPS Coordinates & Interactive Map</h3>
                  <p className="text-xs text-slate-500">Set accurate latitude & longitude coordinates to render the church sanctuary on interactive maps.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGetCurrentGps}
                disabled={gpsLoading}
                className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 text-xs shadow-xs"
              >
                {gpsLoading ? <RefreshCw size={15} className="animate-spin text-emerald-600" /> : <Compass size={15} className="text-emerald-600" />}
                <span>Use Current Device GPS</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Latitude (° N/S) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={profileData.latitude}
                  onChange={e => setProfileData(prev => ({ ...prev, latitude: parseFloat(e.target.value) || 0 }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-700 block mb-1">Longitude (° E/W) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={profileData.longitude}
                  onChange={e => setProfileData(prev => ({ ...prev, longitude: parseFloat(e.target.value) || 0 }))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-extrabold text-slate-700 block mb-1">Quick Location Preset Selector</label>
                <select
                  onChange={e => {
                    const idx = Number(e.target.value);
                    if (!isNaN(idx) && PRESET_GPS_LOCATIONS[idx]) {
                      const p = PRESET_GPS_LOCATIONS[idx];
                      setProfileData(prev => ({ ...prev, latitude: p.lat, longitude: p.lng }));
                      showToast(`📍 Set GPS location to "${p.name}"`);
                    }
                  }}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 cursor-pointer"
                >
                  <option value="">-- Choose Preset Location --</option>
                  {PRESET_GPS_LOCATIONS.map((loc, idx) => (
                    <option key={idx} value={idx}>
                      {loc.name} ({loc.lat}, {loc.lng})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Interactive Location Map Preview */}
            <div className="space-y-2 pt-2">
              <span className="font-extrabold text-slate-700 block text-xs">Live Map Location Preview:</span>
              <LocationMap
                latitude={profileData.latitude}
                longitude={profileData.longitude}
                title={profileData.name}
                subtitle={`${profileData.address}, ${profileData.city}`}
                height="280px"
              />
            </div>
          </div>

          {/* SAVE BUTTON */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs shadow-lg shadow-indigo-200 transition-all cursor-pointer flex items-center gap-2"
            >
              <Check size={18} />
              <span>Save Church Profile & GPS Settings</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: MOBILE MONEY PROVIDERS */}
      {settingsTab === 'mobile' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5 max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900">Mobile Money Gateway Configuration</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure merchant numbers, account titles, and USSD dial instructions (Afrimoney, Orange Money, M-Pesa, etc.).</p>
            </div>
            <button
              onClick={handleOpenAddGateway}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-extrabold hover:bg-indigo-700 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 text-xs shadow-xs"
            >
              <Plus size={16} /> Add Provider
            </button>
          </div>

          {showGatewayForm && (
            <form onSubmit={handleSaveGateway} className="p-5 bg-indigo-50/60 rounded-2xl border border-indigo-200 space-y-3.5 text-xs">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                <span className="font-black text-indigo-950 uppercase text-xs">
                  {editingGatewayId ? 'Edit Mobile Money Provider' : '➕ Add New Mobile Money Provider'}
                </span>
                <button type="button" onClick={() => setShowGatewayForm(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Provider Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Afrimoney, Orange Money, M-Pesa"
                    value={gwProvider}
                    onChange={e => setGwProvider(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Merchant Number / Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 076 892 101 or #144*4*8891#"
                    value={gwMerchantNumber}
                    onChange={e => setGwMerchantNumber(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Account Title / Merchant Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grace Cathedral Ministry"
                  value={gwMerchantName}
                  onChange={e => setGwMerchantName(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">USSD Dial Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Dial *161# -> Select Pay Merchant -> Enter Code 8812 -> Enter Amount..."
                  value={gwInstructions}
                  onChange={e => setGwInstructions(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowGatewayForm(false)} className="px-4 py-2 text-slate-500 font-bold">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 cursor-pointer shadow-xs">
                  {editingGatewayId ? 'Save Changes' : 'Add Provider'}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {givingConfig.mobile_gateways.map((g, idx) => {
              const gwId = g.id || g.provider;
              return (
                <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-xl bg-amber-500 text-white font-black flex items-center justify-center text-sm shadow-2xs">
                        📱
                      </span>
                      <div>
                        <span className="font-black text-slate-900 text-sm block">{g.provider}</span>
                        <span className="text-[10px] text-slate-500 block font-mono font-bold">{g.merchant_number}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleGateway(gwId)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-colors ${
                          g.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {g.is_active ? 'Active' : 'Disabled'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditGateway(g)}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                        title="Edit Provider"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGateway(gwId)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="Delete Provider"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-slate-100 text-[11px] space-y-1">
                    <p className="font-bold text-slate-700">Account Name: <span className="text-slate-900 font-extrabold">{g.merchant_name}</span></p>
                    <p className="text-slate-500 font-medium">{g.dial_code_instructions}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: GIVING FUNDS */}
      {settingsTab === 'funds' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5 max-w-3xl text-xs">
          <div>
            <h3 className="text-lg font-black text-slate-900">Giving Funds & Project Categories</h3>
            <p className="text-xs text-slate-500 mt-0.5">Manage offering funds and custom giving projects available in church portal checkout.</p>
          </div>

          <form onSubmit={handleAddCustomFund} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <span className="font-extrabold text-slate-900 block text-xs">➕ Add New Giving Fund / Project Category</span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Fund Category Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Youth Camp Sponsorship"
                  value={newFundName}
                  onChange={e => setNewFundName(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Short Description</label>
                <input 
                  type="text" 
                  placeholder="e.g. Annual youth retreat seed"
                  value={newFundDesc}
                  onChange={e => setNewFundDesc(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 cursor-pointer shadow-xs">
                Add Fund Category
              </button>
            </div>
          </form>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {givingConfig.funds.map(fund => (
              <div key={fund.id} className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-extrabold text-slate-900 text-xs">{fund.name}</p>
                  {fund.description && <p className="text-[11px] text-slate-400">{fund.description}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleFundStatus(fund.id)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-colors ${
                    fund.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {fund.is_active ? 'Active' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: BANK ACCOUNT DETAILS */}
      {settingsTab === 'bank' && (
        <form onSubmit={handleSaveBank} className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-5 max-w-3xl text-xs">
          <div>
            <h3 className="text-lg font-black text-slate-900">Church Bank Wire & Transfer Details</h3>
            <p className="text-xs text-slate-500 mt-0.5">Banking instructions displayed to congregants making electronic wire deposits.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-extrabold text-slate-700 block mb-1">Bank Name *</label>
              <input
                type="text"
                required
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                placeholder="e.g. Sierra Leone Commercial Bank (SLCB)"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="font-extrabold text-slate-700 block mb-1">Account Title / Name *</label>
              <input
                type="text"
                required
                value={bankAccName}
                onChange={e => setBankAccName(e.target.value)}
                placeholder="e.g. Grace Cathedral General Account"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="font-extrabold text-slate-700 block mb-1">Account Number *</label>
              <input
                type="text"
                required
                value={bankAccNum}
                onChange={e => setBankAccNum(e.target.value)}
                placeholder="e.g. 003-010-994821"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="font-extrabold text-slate-700 block mb-1">SWIFT / Routing Code</label>
              <input
                type="text"
                value={bankSwift}
                onChange={e => setBankSwift(e.target.value)}
                placeholder="e.g. SLCBFREETOWN"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md shadow-indigo-100 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check size={16} /> Save Bank Details
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// --- Stream Chat & Studio Details (Exported for /streaming/:streamId) ---

export const StreamDetailsPage = ({ profile }: { profile: Profile | null }) => {
  const { streamId } = useParams();
  const [stream, setStream] = useState<Stream | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenLoading, setRegenLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [viewerCount, setViewerCount] = useState(148);

  useEffect(() => {
    if (streamId) {
      const fetchStream = async () => {
        const { data } = await supabase.from('streams').select('*').eq('id', streamId).maybeSingle();
        if (data) setStream(data as unknown as Stream);
        setLoading(false);
      };
      fetchStream();
    }
  }, [streamId]);

  const updateStatus = async (newStatus: string) => {
    if (!stream) return;
    const { error } = await supabase.from('streams').update({ status: newStatus }).eq('id', stream.id);
    if (!error) {
      setStream({ ...stream, status: newStatus as any });
      alert("Broadcast status updated successfully.");
    }
  };

  const regenerateKey = async () => {
    if (!stream || !confirm("Warning: Regenerating stream key will disconnect active encoder software (OBS/vMix). Continue?")) return;
    setRegenLoading(true);
    const { data } = await supabase.functions.invoke('stream-admin', {
      body: { action: 'regenerate_key', streamId: stream.id }
    });
    alert(`New encoder stream key generated: ${data?.streamKey || 'sk_live_' + Date.now()}`);
    setRegenLoading(false);
  };

  if (!profile || !['super_admin', 'admin', 'pastor'].includes(profile.primary_role)) {
    return <div className="p-10 text-center text-slate-500 font-bold">Access Denied</div>;
  }

  if (loading) return <div className="p-10 text-center text-slate-400">Loading broadcast studio...</div>;
  if (!stream) return <div className="p-10 text-center text-slate-400">Broadcast not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/portal/admin?tab=streaming" className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          <ArrowLeft size={18} className="text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Broadcast Studio & RTMP Management</h1>
          <p className="text-slate-500 text-xs">Obs/vMix encoder parameters and live sanctuary stream monitor.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{stream.title}</h2>
                <p className="text-xs text-slate-500 mt-1">{stream.description || "Live sanctuary broadcast from Grace Cathedral."}</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-100 text-rose-700">
                {stream.status}
              </span>
            </div>

            <div className="aspect-video w-full bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center text-white mb-6">
              {stream.embed_url ? (
                <iframe src={stream.embed_url} className="w-full h-full" title="Stream" allowFullScreen />
              ) : (
                <div className="text-center p-6">
                  <Video size={40} className="mx-auto mb-2 text-indigo-400" />
                  <p className="font-bold text-sm">RTMP Sanctuary Encoder Feed</p>
                  <p className="text-xs text-slate-400 mt-1">rtmp://live.faithconnect.church/live</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">RTMP Encoder Endpoint</p>
                <p className="text-xs font-mono text-slate-800 font-bold mt-0.5">rtmp://live.faithconnect.church/live</p>
              </div>
              <button 
                onClick={regenerateKey}
                disabled={regenLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 flex items-center gap-1.5 cursor-pointer"
              >
                <Key size={14} /> Regenerate Key
              </button>
            </div>
          </div>
        </div>

        {/* Stream Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Broadcast Controls</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Broadcast State</label>
              <select 
                value={stream.status} 
                onChange={(e) => updateStatus(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold"
              >
                <option value="scheduled">Scheduled</option>
                <option value="live">Live Broadcasting Now</option>
                <option value="ended">Service Ended</option>
                <option value="archived">Archived to Catalog</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Church Events & Calendar Administration Tab ---

const EventsAdminTab = () => {
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedAudience, setSelectedAudience] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedRecurrence, setSelectedRecurrence] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'calendar'>('grid');
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());

  // Modals
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ChurchEvent | null>(null);
  const [showRosterModal, setShowRosterModal] = useState<ChurchEvent | null>(null);
  const [workspaceEvent, setWorkspaceEvent] = useState<ChurchEvent | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<EventCategory>('Worship Service');
  const [formAudience, setFormAudience] = useState<EventTargetAudience>('All Congregation');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formLocation, setFormLocation] = useState('Grace Cathedral Main Sanctuary');
  const [formLatitude, setFormLatitude] = useState<number>(8.484);
  const [formLongitude, setFormLongitude] = useState<number>(-13.229);
  const [formIsVirtual, setFormIsVirtual] = useState(false);
  const [formVirtualLink, setFormVirtualLink] = useState('');
  const [formOrganizer, setFormOrganizer] = useState('Grace Cathedral Pastoral Team');
  const [formBannerImage, setFormBannerImage] = useState('');
  const [formRegRequired, setFormRegRequired] = useState(false);
  const [formMaxAttendees, setFormMaxAttendees] = useState<number>(100);
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatusState] = useState<'upcoming' | 'ongoing' | 'completed' | 'cancelled'>('upcoming');

  // Recurrence & Dedicated Event Treasury Account Form State
  const [formRecurrence, setFormRecurrence] = useState<EventRecurrence>('one_time');
  const [formRecurrenceNth, setFormRecurrenceNth] = useState<number>(2);
  const [formRecurrenceWeekday, setFormRecurrenceWeekday] = useState<number>(0);
  const [formExcludedMonths, setFormExcludedMonths] = useState<number[]>([]); // Default no excluded months
  const [formWeeklyDays, setFormWeeklyDays] = useState<number[]>([0]); // 0 = Sunday
  const [formJanFirstSundayException, setFormJanFirstSundayException] = useState<boolean>(true); // Default true for Monthly Combined
  const [formQuarterlyStartMonth, setFormQuarterlyStartMonth] = useState<number>(11); // 11 = December
  const [formIsCombinedService, setFormIsCombinedService] = useState<boolean>(false);
  const [formRecurrencePattern, setFormRecurrencePattern] = useState('');
  const [formRecurringAllowance, setFormRecurringAllowance] = useState<number>(15000);
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formHasFundingAccount, setFormHasFundingAccount] = useState<boolean>(true);

  // Sub view mode: Occurrences vs Definitions
  const [eventsSubView, setEventsSubView] = useState<'occurrences' | 'definitions'>('occurrences');

  // Generated Occurrences Calendar View State
  const [calCurrentDate, setCalCurrentDate] = useState<Date>(new Date());
  const [selectedCalDateStr, setSelectedCalDateStr] = useState<string | null>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [occDisplayMode, setOccDisplayMode] = useState<'calendar' | 'list'>('calendar');

  // Single Occurrence Override Modal State
  const [showOverrideModal, setShowOverrideModal] = useState<EventOccurrence | null>(null);
  const [overrideAction, setOverrideAction] = useState<'cancel' | 'reschedule' | 'modify'>('reschedule');
  const [overrideNewTime, setOverrideNewTime] = useState<string>('');
  const [overrideNewLocation, setOverrideNewLocation] = useState<string>('');
  const [overrideNotes, setOverrideNotes] = useState<string>('');

  // Occurrence Attendance Modal State
  const [showAttendanceModal, setShowAttendanceModal] = useState<EventOccurrence | null>(null);
  const [attendanceHeadcount, setAttendanceHeadcount] = useState<number>(0);

  // Manual Roster Add State
  const [manualMemberId, setManualMemberId] = useState('');
  const [manualName, setManualName] = useState('');
  // Recurrence Toast & Advancement State
  const [recurrenceToast, setRecurrenceToast] = useState<string | null>(null);

  const handleAdvanceEventRecurrence = async (evt: ChurchEvent) => {
    const updated = await advanceRecurringEventDate(evt);
    setEvents(prev => prev.map(e => e.id === updated.id ? updated : e));
    setRecurrenceToast(`🎉 Updated program schedule for "${evt.title}" to ${new Date(updated.start_time).toLocaleString()}!`);
    setTimeout(() => setRecurrenceToast(null), 5000);
  };

  const handleAutoAdvancePastEvents = async () => {
    const now = new Date().getTime();
    const pastRecurring = events.filter(e => e.recurrence && e.recurrence !== 'one_time' && new Date(e.end_time || e.start_time).getTime() < now);
    if (pastRecurring.length === 0) return;

    for (const evt of pastRecurring) {
      await advanceRecurringEventDate(evt);
    }

    setRecurrenceToast(`🚀 Successfully rolled ${pastRecurring.length} past recurring program(s) forward to their next scheduled cycle!`);
    setTimeout(() => setRecurrenceToast(null), 6000);
    fetchEventsData();
  };

  const defaultBannerPresets = [
    { label: 'Worship Service', url: 'https://images.unsplash.com/photo-1510525009512-ad7fc13eefab?auto=format&fit=crop&w=1200&q=80' },
    { label: 'Conference / Summit', url: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80' },
    { label: 'Brotherhood / Men', url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80' },
    { label: 'Youth Night', url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80' },
    { label: 'Outreach & Food Drive', url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1200&q=80' },
    { label: 'Prayer & Candlelight', url: 'https://images.unsplash.com/photo-1544427920-c49ccfb85579?auto=format&fit=crop&w=1200&q=80' }
  ];

  const fetchEventsData = async () => {
    setLoading(true);
    const [evtRes, regRes, profRes] = await Promise.all([
      supabase.from('events').select('*').order('start_time', { ascending: true }),
      supabase.from('event_registrations').select('*'),
      supabase.from('profiles').select('*').order('first_name', { ascending: true })
    ]);

    if (evtRes.data) setEvents(evtRes.data as ChurchEvent[]);
    if (regRes.data) setRegistrations(regRes.data as EventRegistration[]);
    if (profRes.data) setMembers(profRes.data as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchEventsData();
  }, []);

  const openAddModalForDate = (date?: Date) => {
    setEditingEvent(null);
    const targetDate = date || new Date(Date.now() + 86400000);
    const startIso = new Date(targetDate.setHours(10, 0, 0, 0)).toISOString().slice(0, 16);
    const endIso = new Date(targetDate.setHours(12, 0, 0, 0)).toISOString().slice(0, 16);

    setFormTitle('');
    setFormCategory('Worship Service');
    setFormAudience('All Congregation');
    setFormStartTime(startIso);
    setFormEndTime(endIso);
    setFormLocation('Grace Cathedral Main Sanctuary');
    setFormLatitude(8.484);
    setFormLongitude(-13.229);
    setFormIsVirtual(false);
    setFormVirtualLink('');
    setFormOrganizer('Grace Cathedral Pastoral Team');
    setFormBannerImage(defaultBannerPresets[0].url);
    setFormRegRequired(false);
    setFormMaxAttendees(100);
    setFormDescription('');
    setFormStatusState('upcoming');
    setFormRecurrence('one_time');
    setFormRecurrenceNth(2);
    setFormRecurrenceWeekday(0); // Sunday
    setFormExcludedMonths([]); 
    setFormWeeklyDays([0]);
    setFormJanFirstSundayException(true);
    setFormQuarterlyStartMonth(11); // December
    setFormIsCombinedService(false);
    setFormRecurrencePattern('');
    setFormRecurringAllowance(15000);
    setFormAccountNumber(`EVT-ACC-2026-${Math.floor(100 + Math.random() * 900)}`);
    setFormHasFundingAccount(true);
    setShowFormModal(true);
  };

  const openAddModal = () => openAddModalForDate();

  const openEditModal = (evt: ChurchEvent) => {
    setEditingEvent(evt);
    setFormTitle(evt.title);
    setFormCategory(evt.category);
    setFormAudience(evt.target_audience || 'All Congregation');
    
    const formatDt = (isoStr: string) => {
      try {
        return new Date(isoStr).toISOString().slice(0, 16);
      } catch (e) {
        return isoStr.slice(0, 16);
      }
    };
    setFormStartTime(formatDt(evt.start_time));
    setFormEndTime(formatDt(evt.end_time));
    setFormLocation(evt.location || 'Grace Cathedral Sanctuary');
    setFormLatitude(evt.latitude ?? 8.484);
    setFormLongitude(evt.longitude ?? -13.229);
    setFormIsVirtual(!!evt.is_virtual);
    setFormVirtualLink(evt.virtual_link || '');
    setFormOrganizer(evt.organizer_name || 'Grace Cathedral Leadership');
    setFormBannerImage(evt.featured_image || defaultBannerPresets[0].url);
    setFormRegRequired(!!evt.registration_required);
    setFormMaxAttendees(evt.max_attendees || 100);
    setFormDescription(evt.description || '');
    setFormStatusState(evt.status || 'upcoming');
    setFormRecurrence(evt.recurrence || 'one_time');
    setFormRecurrenceNth(evt.recurrence_nth || evt.recurrence_config?.week_number || 2);
    setFormRecurrenceWeekday(evt.recurrence_weekday ?? evt.recurrence_config?.weekday ?? 0);
    setFormWeeklyDays(evt.recurrence_config?.days_of_week || [0]);
    setFormQuarterlyStartMonth(evt.recurrence_config?.starting_month ?? 11);
    
    const hasJanEx = evt.recurrence_config?.month_overrides?.some(o => o.month === 0) || evt.recurrence_pattern?.toLowerCase().includes('january');
    setFormJanFirstSundayException(Boolean(hasJanEx));

    const defaultExcluded = evt.excluded_months || [];
    setFormExcludedMonths(defaultExcluded);
    setFormIsCombinedService(Boolean(evt.is_combined_service || evt.title.toLowerCase().includes('combined') || evt.title.toLowerCase().includes('joint')));
    setFormRecurrencePattern(evt.recurrence_pattern || '');
    setFormRecurringAllowance(evt.recurring_funding_allowance || 15000);
    setFormAccountNumber(evt.account_number || `EVT-ACC-2026-${Math.floor(100 + Math.random() * 900)}`);
    setFormHasFundingAccount(evt.has_funding_account !== false);
    setShowFormModal(true);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Image file size should be less than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setFormBannerImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const assignedAccountNum = formAccountNumber.trim() || `EVT-ACC-2026-${Math.floor(100 + Math.random() * 900)}`;

    const recConfig: EventRecurrenceRuleConfig = {
      frequency: formRecurrence === 'weekly' ? 'WEEKLY' :
                 formRecurrence === 'monthly' || formRecurrence === 'nth_weekday_monthly' ? 'MONTHLY' :
                 formRecurrence === 'quarterly' ? 'QUARTERLY' :
                 formRecurrence === 'yearly' ? 'YEARLY' : 'DAILY',
      interval: 1,
      days_of_week: formWeeklyDays,
      weekday: formRecurrenceWeekday,
      week_number: formRecurrenceNth,
      starting_month: formQuarterlyStartMonth,
      anchor_months: formRecurrence === 'quarterly'
        ? (formQuarterlyStartMonth === 11 ? [11, 2, 5, 8] : formQuarterlyStartMonth === 0 ? [0, 3, 6, 9] : [2, 5, 8, 11])
        : undefined,
      month_overrides: (formRecurrence === 'monthly' || formRecurrence === 'nth_weekday_monthly') && formJanFirstSundayException
        ? [{ month: 0, week_number: 1, weekday: formRecurrenceWeekday }]
        : []
    };

    const payload = {
      title: formTitle.trim(),
      category: formCategory,
      target_audience: formAudience,
      start_time: new Date(formStartTime).toISOString(),
      end_time: new Date(formEndTime).toISOString(),
      location: formLocation.trim() || 'Main Sanctuary',
      latitude: Number(formLatitude),
      longitude: Number(formLongitude),
      is_virtual: formIsVirtual,
      virtual_link: formIsVirtual ? formVirtualLink.trim() : '',
      organizer_name: formOrganizer.trim() || 'Grace Cathedral Pastoral Team',
      featured_image: formBannerImage || defaultBannerPresets[0].url,
      registration_required: formRegRequired,
      max_attendees: Number(formMaxAttendees) || 100,
      description: formDescription.trim(),
      status: formStatus,
      recurrence: formRecurrence,
      recurrence_nth: (formRecurrence === 'nth_weekday_monthly' || formRecurrence === 'monthly') ? formRecurrenceNth : undefined,
      recurrence_weekday: (formRecurrence === 'nth_weekday_monthly' || formRecurrence === 'monthly') ? formRecurrenceWeekday : undefined,
      excluded_months: formExcludedMonths,
      is_combined_service: formIsCombinedService,
      recurrence_config: recConfig,
      recurrence_pattern: formRecurrencePattern.trim() || undefined,
      recurring_funding_allowance: Number(formRecurringAllowance) || 15000,
      has_funding_account: formHasFundingAccount,
      account_number: formHasFundingAccount ? assignedAccountNum : undefined
    };

    if (editingEvent) {
      await supabase.from('events').update(payload).eq('id', editingEvent.id);
      // Ensure account is synced
      getEventAccount(editingEvent.id, payload.title, payload.recurring_funding_allowance);
    } else {
      const newEvtId = `evt_${Date.now()}`;
      await supabase.from('events').insert({
        id: newEvtId,
        ...payload,
        registered_count: 0,
        branch_id: 'branch-1'
      });
      // Initialize dedicated treasury account
      getEventAccount(newEvtId, payload.title, payload.recurring_funding_allowance);
    }

    setShowFormModal(false);
    fetchEventsData();
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to permanently delete this church event?")) return;
    try {
      // 1. Delete child event registrations
      await supabase.from('event_registrations').delete().eq('event_id', eventId);
      // 2. Delete the event from Supabase
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) {
        console.warn("Supabase event delete note:", error.message);
      }
    } catch (err) {
      console.warn("Event deletion warning:", err);
    }

    // 3. Immediately remove from local state so UI updates instantly
    setEvents(prev => prev.filter(e => e.id !== eventId));
    setRegistrations(prev => prev.filter(r => r.event_id !== eventId));

    // 4. Clean up any open modals or workspace views
    if (workspaceEvent?.id === eventId) setWorkspaceEvent(null);
    if (showRosterModal?.id === eventId) setShowRosterModal(null);
    if (editingEvent?.id === eventId) setShowFormModal(false);

    try {
      localStorage.removeItem(`event_workspace_${eventId}`);
      localStorage.removeItem(`event_workspace_report_${eventId}`);
    } catch (e) {
      // ignore storage errors
    }
  };

  const handleManualRegisterMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRosterModal) return;

    let memberName = manualName.trim();
    let memberEmail = manualEmail.trim();
    let memberPhone = manualPhone.trim();

    if (manualMemberId) {
      const found = members.find(m => m.id === manualMemberId);
      if (found) {
        memberName = `${found.first_name} ${found.last_name}`;
        memberEmail = found.email;
        memberPhone = found.phone || '';
      }
    }

    if (!memberName || !memberEmail) return;

    const newReg = {
      event_id: showRosterModal.id,
      user_id: manualMemberId || undefined,
      member_name: memberName,
      email: memberEmail,
      phone: memberPhone,
      status: 'confirmed' as const,
      registered_at: new Date().toISOString()
    };

    await supabase.from('event_registrations').insert(newReg);

    const newCount = (showRosterModal.registered_count || 0) + 1;
    await supabase.from('events').update({ registered_count: newCount }).eq('id', showRosterModal.id);

    setManualMemberId('');
    setManualName('');
    setManualEmail('');
    setManualPhone('');
    fetchEventsData();
  };

  const handleRemoveRegistration = async (regId: string) => {
    if (!confirm("Remove this attendee from the registration roster?")) return;
    await supabase.from('event_registrations').delete().eq('id', regId);

    if (showRosterModal) {
      const newCount = Math.max(0, (showRosterModal.registered_count || 1) - 1);
      await supabase.from('events').update({ registered_count: newCount }).eq('id', showRosterModal.id);
    }
    fetchEventsData();
  };

  const exportRosterCSV = (evt: ChurchEvent) => {
    const evtRegs = registrations.filter(r => r.event_id === evt.id);
    if (evtRegs.length === 0) {
      alert("No registrations to export for this event.");
      return;
    }

    const headers = "Name,Email,Phone,Registered At,Status\n";
    const rows = evtRegs.map(r => 
      `"${r.member_name}","${r.email}","${r.phone || ''}","${new Date(r.registered_at).toLocaleString()}","${r.status}"`
    ).join("\n");

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event_roster_${evt.title.replace(/\s+/g, '_').toLowerCase()}.csv`;
    a.click();
  };

  const categoriesList = ['All', 'Worship Service', 'Special Service', 'Conference', 'Youth Event', 'Community Outreach', 'Prayer & Fasting', 'Department Meeting', 'Fellowship & Social'];
  const audienceList = ['All', 'All Congregation', 'Youth & Teens', 'Men', 'Women', 'Leaders & Workers', 'Children'];

  const getCategoryBadgeStyle = (category: string) => {
    switch (category) {
      case 'Worship Service': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'Conference': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Youth Event': return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'Community Outreach': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Prayer & Fasting': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Special Service': return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'Department Meeting': return 'bg-slate-100 text-slate-800 border-slate-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const recurrenceFilterList = [
    { value: 'All', label: 'All Recurrence' },
    { value: 'weekly', label: '📅 Weekly Programs' },
    { value: 'monthly', label: '🔄 Monthly Programs' },
    { value: 'quarterly', label: '🏛️ Quarterly Programs' },
    { value: 'yearly', label: '🌟 Yearly Programs' },
    { value: 'one_time', label: '⚡ One-Time Events' }
  ];

  const filteredEvents = events.filter(evt => {
    const matchesSearch = evt.title.toLowerCase().includes(search.toLowerCase()) || 
                          evt.location.toLowerCase().includes(search.toLowerCase()) ||
                          evt.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || evt.category === selectedCategory;
    const matchesAudience = selectedAudience === 'All' || evt.target_audience === selectedAudience;
    const matchesStatus = selectedStatus === 'all' || evt.status === selectedStatus;
    const matchesRecurrence = selectedRecurrence === 'All' || (evt.recurrence || 'one_time') === selectedRecurrence;

    return matchesSearch && matchesCategory && matchesAudience && matchesStatus && matchesRecurrence;
  });

  const isFilterActive = search !== '' || selectedCategory !== 'All' || selectedAudience !== 'All' || selectedStatus !== 'all' || selectedRecurrence !== 'All';

  const resetFilters = () => {
    setSearch('');
    setSelectedCategory('All');
    setSelectedAudience('All');
    setSelectedStatus('all');
    setSelectedRecurrence('All');
  };

  const totalRegistrations = registrations.length;
  const upcomingCount = events.filter(e => e.status === 'upcoming').length;
  const virtualCount = events.filter(e => e.is_virtual).length;

  // Calendar Logic
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDaysInMonth = new Date(year, month, 0).getDate();
  const totalGridCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;

  const today = new Date();

  // Render Grid View
  const renderGridView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {filteredEvents.map(evt => {
        const startDate = new Date(evt.start_time);
        const endDate = new Date(evt.end_time);
        const isMultiDay = startDate.toDateString() !== endDate.toDateString();
        const dateStr = isMultiDay 
          ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
          : startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = `${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        const evtRegs = registrations.filter(r => r.event_id === evt.id);
        const registeredCount = evt.registered_count || evtRegs.length;

        return (
          <div key={evt.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
            <div>
              {/* Banner Image Header */}
              <div className="relative h-40 sm:h-44 w-full bg-slate-900 overflow-hidden">
                <img
                  src={evt.featured_image || defaultBannerPresets[0].url}
                  alt={evt.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/30 to-transparent" />

                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-xs ${getCategoryBadgeStyle(evt.category)}`}>
                      {evt.category}
                    </span>
                    {(() => {
                      const rec = getRecurrenceBadge(evt.recurrence);
                      return (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shadow-xs flex items-center gap-1 ${rec.badgeColor}`}>
                          <span>{rec.icon}</span>
                          <span className="truncate max-w-[110px]">{rec.label}</span>
                        </span>
                      );
                    })()}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    evt.status === 'upcoming' ? 'bg-emerald-500 text-white' :
                    evt.status === 'ongoing' ? 'bg-rose-600 text-white animate-pulse' :
                    evt.status === 'completed' ? 'bg-slate-700 text-slate-200' :
                    'bg-rose-100 text-rose-800'
                  }`}>
                    {evt.status}
                  </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <div className="flex items-center gap-1.5 text-amber-300 text-[11px] font-bold">
                    <CalendarIcon size={13} />
                    <span>{dateStr}</span>
                  </div>
                </div>
              </div>

              {/* Body Content */}
              <div className="p-4 sm:p-5 space-y-3">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-base leading-snug mb-1">{evt.title}</h4>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{evt.description}</p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <div className="flex items-center gap-2 font-medium">
                    <Clock size={14} className="text-indigo-600 shrink-0" />
                    <span>{timeStr}</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <MapPin size={14} className="text-indigo-600 shrink-0" />
                    <span className="truncate">{evt.location}</span>
                  </div>
                  {evt.recurrence_pattern && (
                    <div className="flex items-center gap-2 text-purple-700 font-bold text-[11px]">
                      <span>🔁</span>
                      <span className="truncate">{evt.recurrence_pattern}</span>
                    </div>
                  )}
                  {evt.is_virtual && (
                    <div className="flex items-center gap-2 text-rose-600 font-bold">
                      <Radio size={14} className="animate-pulse shrink-0" />
                      <span>Online Stream Enabled</span>
                    </div>
                  )}
                  {(evt.is_combined_service || evt.title.toLowerCase().includes('combined') || evt.title.toLowerCase().includes('joint')) ? (
                    <div className="p-2 bg-amber-50 rounded-xl border border-amber-200 text-[10px] font-extrabold text-amber-900 flex items-center gap-1.5">
                      <span>✨</span>
                      <span>Combined Service (Preempts Standard Weekly Gathering)</span>
                    </div>
                  ) : (
                    detectedConflicts.find(c => c.preemptedEventId === evt.id) && (
                      <div className="p-2 bg-purple-50 rounded-xl border border-purple-200 text-[10px] font-bold text-purple-900 flex items-center gap-1.5">
                        <span>⚠️</span>
                        <span>Merged into Combined Service on this date</span>
                      </div>
                    )
                  )}
                </div>

                {/* Registration Progress Bar */}
                {evt.registration_required && (
                  <div className="p-3 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-1.5">
                    <div className="flex justify-between items-center text-[11px] font-bold">
                      <span className="text-indigo-900">Registered Congregants</span>
                      <span className="text-indigo-700">{registeredCount} / {evt.max_attendees || 100}</span>
                    </div>
                    <div className="w-full bg-indigo-200 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (registeredCount / (evt.max_attendees || 100)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Next Recurrence Cycle Pill & Roll Action */}
                {evt.recurrence && evt.recurrence !== 'one_time' && (
                  <div className="p-2.5 bg-purple-50/80 rounded-2xl border border-purple-200/80 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] font-black uppercase text-purple-900 block">Next Cycle Schedule</span>
                      <span className="font-bold text-slate-800 text-[11px]">
                        {calculateNextRecurrenceDate(evt.start_time, evt.end_time, evt.recurrence).formattedNextStart}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAdvanceEventRecurrence(evt);
                      }}
                      className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-lg text-[10px] shadow-2xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                      title="Advance event date to next scheduled recurrence cycle"
                    >
                      <RefreshCw size={11} /> Advance Date
                    </button>
                  </div>
                )}

                {/* Dedicated Event Account & Treasury Balance Pill */}
                {(() => {
                  if (evt.has_funding_account === false) {
                    return (
                      <div 
                        onClick={() => setWorkspaceEvent(evt)}
                        className="p-2.5 bg-slate-50/70 hover:bg-slate-100/70 rounded-2xl border border-slate-100 transition-all flex items-center justify-between text-xs cursor-pointer"
                        title="Open Workspace (Non-funded event)"
                      >
                        <div className="flex items-center gap-1.5 font-bold text-slate-500 text-[11px]">
                          <Landmark size={14} className="text-slate-400 shrink-0" />
                          <span>No Dedicated Funding Account</span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase bg-slate-200/60 px-2 py-0.5 rounded-full">
                          Standard Gathering
                        </span>
                      </div>
                    );
                  }
                  const acc = getEventAccount(evt.id, evt.title, evt.recurring_funding_allowance);
                  return (
                    <div 
                      onClick={() => setWorkspaceEvent(evt)}
                      className="p-2.5 bg-slate-50 hover:bg-emerald-50/50 rounded-2xl border border-slate-100 hover:border-emerald-200 transition-all flex items-center justify-between text-xs cursor-pointer"
                      title="Open Workspace to manage this dedicated event funding account"
                    >
                      <div className="flex items-center gap-1.5 font-bold text-slate-700">
                        <Landmark size={14} className="text-emerald-600 shrink-0" />
                        <div>
                          <span className="font-mono text-[11px] text-slate-900 block font-extrabold">{evt.account_number || acc.account_number}</span>
                          <span className="text-[9px] text-slate-400 block font-normal">Dedicated Fund</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase leading-none">Cash Balance</span>
                        <span className="text-xs font-black text-emerald-700 font-mono">
                          SLE {acc.current_balance.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Card Footer Actions */}
            <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setWorkspaceEvent(evt)}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Open Event Workspace"
                >
                  <Layers size={14} />
                  <span>Workspace</span>
                </button>
                <button
                  onClick={() => setShowRosterModal(evt)}
                  className="px-2.5 py-2 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Users size={14} />
                  <span>RSVPs ({registeredCount})</span>
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(evt)}
                  title="Edit Event"
                  className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                >
                  <Edit size={15} />
                </button>
                <button
                  onClick={() => handleDeleteEvent(evt.id)}
                  title="Delete Event"
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Render Table View
  const renderTableView = () => (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs min-w-[700px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
              <th className="p-4">Event & Category</th>
              <th className="p-4">Recurrence</th>
              <th className="p-4">Dedicated Account</th>
              <th className="p-4">Date & Time</th>
              <th className="p-4">Location</th>
              <th className="p-4">Target Audience</th>
              <th className="p-4">RSVPs</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {filteredEvents.map(evt => {
              const startDate = new Date(evt.start_time);
              const evtRegs = registrations.filter(r => r.event_id === evt.id);
              const registeredCount = evt.registered_count || evtRegs.length;
              const rec = getRecurrenceBadge(evt.recurrence);
              const acc = getEventAccount(evt.id, evt.title, evt.recurring_funding_allowance);

              return (
                <tr key={evt.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-slate-900 text-sm">{evt.title}</div>
                    <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${getCategoryBadgeStyle(evt.category)}`}>
                      {evt.category}
                    </span>
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 w-fit ${rec.badgeColor}`}>
                      <span>{rec.icon}</span>
                      <span>{rec.label}</span>
                    </span>
                    {evt.recurrence_pattern && (
                      <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">{evt.recurrence_pattern}</span>
                    )}
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    <div className="font-mono font-bold text-slate-900 text-xs flex items-center gap-1">
                      <Landmark size={13} className="text-emerald-600" />
                      <span>{evt.account_number || acc.account_number}</span>
                    </div>
                    <div className="text-[10px] font-black text-emerald-700 font-mono mt-0.5">
                      Bal: SLE {acc.current_balance.toLocaleString()}
                    </div>
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    <div className="font-bold text-slate-800">{startDate.toLocaleDateString()}</div>
                    <div className="text-[10px] text-slate-400">{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td className="p-4 truncate max-w-[180px]">
                    {evt.location}
                  </td>
                  <td className="p-4 whitespace-nowrap font-bold text-slate-600">
                    {evt.target_audience || 'All'}
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-black">
                      {registeredCount} {evt.max_attendees ? `/ ${evt.max_attendees}` : ''}
                    </span>
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      evt.status === 'upcoming' ? 'bg-emerald-100 text-emerald-800' :
                      evt.status === 'ongoing' ? 'bg-rose-100 text-rose-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {evt.status}
                    </span>
                  </td>
                  <td className="p-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {evt.recurrence && evt.recurrence !== 'one_time' && (
                        <button
                          onClick={() => handleAdvanceEventRecurrence(evt)}
                          className="px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          title="Advance event date to next scheduled recurrence cycle"
                        >
                          <RefreshCw size={12} />
                          <span>Roll Date</span>
                        </button>
                      )}
                      <button
                        onClick={() => setWorkspaceEvent(evt)}
                        className="px-2.5 py-1 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                        title="Open Event Control Workspace"
                      >
                        <Layers size={13} />
                        <span>Workspace</span>
                      </button>
                      <button
                        onClick={() => setShowRosterModal(evt)}
                        className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg font-bold hover:bg-indigo-100 transition-colors"
                        title="View Attendees"
                      >
                        <Users size={14} />
                      </button>
                      <button
                        onClick={() => openEditModal(evt)}
                        className="p-1.5 text-slate-600 hover:text-indigo-600 rounded-lg hover:bg-slate-100"
                        title="Edit Event"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(evt.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                        title="Delete Event"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Render Calendar View
  const renderCalendarView = () => (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Calendar Header */}
      <div className="p-4 sm:p-6 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 text-indigo-300 flex items-center justify-center font-bold border border-indigo-500/20">
            <CalendarIcon size={20} />
          </div>
          <div className="text-center sm:text-left">
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
              {currentMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <p className="text-xs text-slate-400">Monthly Worship Schedule & Event Grid</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonthDate(new Date(year, month - 1, 1))}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Previous Month"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setCurrentMonthDate(new Date())}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentMonthDate(new Date(year, month + 1, 1))}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Next Month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Weekday Names Header */}
      <div className="grid grid-cols-7 border-b border-slate-200 text-center font-bold text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="py-2.5 sm:py-3 border-r last:border-r-0 border-slate-200">
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day.charAt(0)}</span>
          </div>
        ))}
      </div>

      {/* Monthly Days Grid */}
      <div className="grid grid-cols-7 divide-x divide-y divide-slate-200 bg-slate-100">
        {Array.from({ length: totalGridCells }).map((_, index) => {
          let dayNum = 0;
          let isCurrentMonth = false;

          if (index < firstDayIndex) {
            dayNum = prevDaysInMonth - firstDayIndex + index + 1;
          } else if (index < firstDayIndex + daysInMonth) {
            dayNum = index - firstDayIndex + 1;
            isCurrentMonth = true;
          } else {
            dayNum = index - (firstDayIndex + daysInMonth) + 1;
          }

          const cellDate = isCurrentMonth 
            ? new Date(year, month, dayNum)
            : index < firstDayIndex 
              ? new Date(year, month - 1, dayNum)
              : new Date(year, month + 1, dayNum);

          const isTodayCell = isCurrentMonth && 
            dayNum === today.getDate() && 
            month === today.getMonth() && 
            year === today.getFullYear();

          const cellEvts = isCurrentMonth ? filteredEvents.filter(evt => {
            const s = new Date(evt.start_time);
            return s.getFullYear() === year && s.getMonth() === month && s.getDate() === dayNum;
          }) : [];

          return (
            <div
              key={index}
              className={`min-h-[90px] sm:min-h-[120px] p-1.5 sm:p-2 flex flex-col justify-between transition-colors ${
                isCurrentMonth ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/60 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                    isTodayCell 
                      ? 'bg-indigo-600 text-white shadow-xs' 
                      : isCurrentMonth ? 'text-slate-800' : 'text-slate-300'
                  }`}
                >
                  {dayNum}
                </span>

                {isCurrentMonth && (
                  <button
                    onClick={() => openAddModalForDate(cellDate)}
                    className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-0.5 text-slate-400 hover:text-indigo-600 transition-opacity cursor-pointer rounded"
                    title="Add event on this date"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>

              {/* Day Events Pills */}
              <div className="space-y-1 mt-1 flex-1 overflow-y-auto max-h-[80px]">
                {cellEvts.map(evt => (
                  <div
                    key={evt.id}
                    onClick={() => setWorkspaceEvent(evt)}
                    className={`p-1 px-1.5 rounded-lg border text-[10px] font-bold truncate cursor-pointer transition-all hover:scale-[1.02] shadow-2xs ${getCategoryBadgeStyle(evt.category)}`}
                    title={`${evt.title} (${new Date(evt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) - Click to open Event Workspace`}
                  >
                    <span className="block truncate">{evt.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Render Occurrences Calendar / Timeline View
  const renderOccurrencesView = () => {
    // Generate occurrences across a broad window centered around calCurrentDate
    const viewYear = calCurrentDate.getFullYear();
    const viewMonth = calCurrentDate.getMonth(); // 0-indexed
    const rangeStart = new Date(viewYear, viewMonth - 2, 1);
    const rangeEnd = new Date(viewYear, viewMonth + 3, 0);

    const rawGenerated = events.flatMap(evt => generateEventOccurrences(evt, rangeStart, rangeEnd));
    const allGenerated = resolveOccurrencePreemption(rawGenerated);

    const filteredOccs = allGenerated.filter(occ => {
      const q = search.toLowerCase();
      const matchesSearch = occ.event_title.toLowerCase().includes(q) ||
                            (occ.location || '').toLowerCase().includes(q) ||
                            occ.occurrence_date.includes(q);
      const matchesCategory = selectedCategory === 'All' || occ.category === selectedCategory;
      const matchesStatus = selectedStatus === 'all' || occ.status === selectedStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Calendar grid calculations
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

    // Build grid cells (42 total)
    const gridCells: Array<{
      dayNum: number;
      isCurrentMonth: boolean;
      dateStr: string;
      events: EventOccurrence[];
    }> = [];

    // Prev month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dNum = prevMonthDays - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
      gridCells.push({
        dayNum: dNum,
        isCurrentMonth: false,
        dateStr: dStr,
        events: filteredOccs.filter(o => o.occurrence_date === dStr)
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      gridCells.push({
        dayNum: d,
        isCurrentMonth: true,
        dateStr: dStr,
        events: filteredOccs.filter(o => o.occurrence_date === dStr)
      });
    }

    // Next month padding
    const remainingCells = 42 - gridCells.length;
    for (let d = 1; d <= remainingCells; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      gridCells.push({
        dayNum: d,
        isCurrentMonth: false,
        dateStr: dStr,
        events: filteredOccs.filter(o => o.occurrence_date === dStr)
      });
    }

    const activeSelectedDate = selectedCalDateStr || todayStr;
    const selectedDayEvents = filteredOccs.filter(o => o.occurrence_date === activeSelectedDate);

    // Formatted date string for selected day header
    const activeDateObj = new Date(activeSelectedDate + 'T00:00:00');
    const formattedSelectedDate = activeDateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return (
      <div className="space-y-5">
        {/* TOP TOOLBAR: MONTH NAVIGATION & MODE TOGGLE */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-100 shrink-0">
              <CalendarIcon size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-slate-900 text-lg">
                  {monthNames[viewMonth]} {viewYear}
                </h4>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {filteredOccs.length} Dates Calculated
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Interactive church schedule calendar. Click any day to inspect programs, log headcount, or override occurrences.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2.5">
            {/* Prev / Today / Next Controls */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setCalCurrentDate(new Date(viewYear, viewMonth - 1, 1))}
                className="p-2 rounded-xl text-slate-700 hover:bg-white hover:shadow-2xs transition-all cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setCalCurrentDate(now);
                  setSelectedCalDateStr(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-black text-indigo-700 hover:bg-white hover:shadow-2xs transition-all cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setCalCurrentDate(new Date(viewYear, viewMonth + 1, 1))}
                className="p-2 rounded-xl text-slate-700 hover:bg-white hover:shadow-2xs transition-all cursor-pointer"
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* View Mode Toggle: Calendar vs List */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setOccDisplayMode('calendar')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  occDisplayMode === 'calendar' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid size={14} />
                <span>Calendar Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setOccDisplayMode('list')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  occDisplayMode === 'list' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List size={14} />
                <span>Timeline Cards</span>
              </button>
            </div>
          </div>
        </div>

        {/* CALENDAR DISPLAY MODE */}
        {occDisplayMode === 'calendar' ? (
          <div className="space-y-6">
            {/* MONTHLY CALENDAR GRID */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-3 sm:p-5 space-y-3">
              {/* Day Headers */}
              <div className="grid grid-cols-7 text-center font-extrabold text-[11px] sm:text-xs text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-100">
                <div className="text-rose-600">Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div className="text-indigo-600">Sat</div>
              </div>

              {/* 7-Column Days Grid */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
                {gridCells.map((cell, idx) => {
                  const isToday = cell.dateStr === todayStr;
                  const isSelected = cell.dateStr === activeSelectedDate;

                  return (
                    <div
                      key={`${cell.dateStr}-${idx}`}
                      onClick={() => setSelectedCalDateStr(cell.dateStr)}
                      className={`min-h-[85px] sm:min-h-[115px] p-1.5 sm:p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        !cell.isCurrentMonth
                          ? 'bg-slate-50/50 border-slate-100 text-slate-400 opacity-60'
                          : isSelected
                          ? 'bg-indigo-50/40 border-indigo-500 ring-2 ring-indigo-500/30 shadow-xs'
                          : isToday
                          ? 'bg-amber-50/40 border-amber-300'
                          : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Top Date Header */}
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs sm:text-sm font-black ${
                          isToday
                            ? 'bg-amber-500 text-slate-950 px-2 py-0.5 rounded-lg shadow-2xs'
                            : isSelected
                            ? 'bg-indigo-600 text-white px-2 py-0.5 rounded-lg shadow-2xs'
                            : cell.isCurrentMonth
                            ? 'text-slate-800'
                            : 'text-slate-400'
                        }`}>
                          {cell.dayNum}
                        </span>

                        {cell.events.length > 0 && (
                          <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800">
                            {cell.events.length}
                          </span>
                        )}
                      </div>

                      {/* Event Badges List in Cell */}
                      <div className="space-y-1 my-1 overflow-hidden flex-1">
                        {cell.events.slice(0, 2).map((occ) => {
                          const timeFormatted = new Date(occ.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          return (
                            <div
                              key={occ.id}
                              className={`p-1 px-1.5 rounded-lg text-[10px] font-bold border truncate flex items-center justify-between gap-1 transition-transform hover:scale-[1.02] ${
                                occ.status === 'cancelled'
                                  ? 'line-through opacity-50 bg-rose-50 text-rose-800 border-rose-200'
                                  : occ.is_combined_service
                                  ? 'bg-amber-100 text-amber-950 border-amber-300 font-extrabold'
                                  : getCategoryBadgeStyle(occ.category || 'Worship Service')
                              }`}
                            >
                              <span className="truncate">{occ.event_title}</span>
                              <span className="text-[9px] font-mono shrink-0 opacity-80">{timeFormatted}</span>
                            </div>
                          );
                        })}

                        {cell.events.length > 2 && (
                          <div className="text-[9px] font-extrabold text-indigo-600 text-center bg-indigo-50 rounded py-0.5 border border-indigo-100">
                            +{cell.events.length - 2} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SELECTED DAY INSPECTOR PANEL */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-xs shrink-0">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">
                      Scheduled Events for {formattedSelectedDate}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedDayEvents.length === 0
                        ? 'No church programs scheduled on this specific date.'
                        : `Displaying ${selectedDayEvents.length} program occurrence(s) on ${activeSelectedDate}.`}
                    </p>
                  </div>
                </div>

                <button
                  onClick={openAddModal}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shrink-0"
                >
                  <Plus size={15} /> Schedule Event
                </button>
              </div>

              {selectedDayEvents.length === 0 ? (
                <div className="p-10 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 italic text-xs space-y-2">
                  <CalendarIcon size={32} className="mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-600">No events scheduled for {activeSelectedDate}</p>
                  <p className="text-[11px] text-slate-400">Click "Schedule Event" or select another date on the calendar above.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedDayEvents.map(occ => {
                    const parentEvt = events.find(e => e.id === occ.event_id);
                    const occDateObj = new Date(occ.start_time);
                    const isPast = occDateObj.getTime() < Date.now();

                    return (
                      <div
                        key={occ.id}
                        className={`bg-white rounded-3xl border p-5 shadow-xs flex flex-col justify-between space-y-3 transition-all ${
                          occ.status === 'cancelled' ? 'border-rose-200 bg-rose-50/20' :
                          occ.is_modified ? 'border-purple-300 bg-purple-50/20' : 'border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2.5 py-1 bg-slate-900 text-amber-300 font-mono text-[11px] font-black rounded-lg">
                              {occ.occurrence_date}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              occ.status === 'cancelled' ? 'bg-rose-100 text-rose-800' :
                              occ.status === 'rescheduled' ? 'bg-purple-100 text-purple-900' :
                              isPast ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {occ.status}
                            </span>
                          </div>

                          <div>
                            <h4 className="font-extrabold text-slate-900 text-base leading-snug">{occ.event_title}</h4>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryBadgeStyle(occ.category || 'Worship Service')}`}>
                                {occ.category}
                              </span>
                              {occ.is_combined_service && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200">
                                  ✨ Combined Service
                                </span>
                              )}
                              {occ.is_modified && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-900">
                                  Modified
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="space-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-1.5 font-bold">
                              <Clock size={13} className="text-indigo-600 shrink-0" />
                              <span>{occDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="flex items-center gap-1.5 truncate">
                              <MapPin size={13} className="text-indigo-600 shrink-0" />
                              <span className="truncate">{occ.override_location || occ.location || 'Main Sanctuary'}</span>
                            </div>
                            {occ.account_number && (
                              <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                                <Landmark size={13} className="text-emerald-600 shrink-0" />
                                <span>{occ.account_number}</span>
                              </div>
                            )}
                            {occ.modified_notes && (
                              <p className="text-[10px] text-purple-800 bg-purple-50 p-1.5 rounded-lg font-medium">
                                Override Notes: {occ.modified_notes}
                              </p>
                            )}
                          </div>

                          {/* Attendance Headcount Badge */}
                          <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-[10px] font-extrabold uppercase text-slate-400">Headcount</span>
                            <span className="font-black text-indigo-900">{occ.attendance_count || 0} Attended</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setOverrideAction(occ.status === 'cancelled' ? 'cancel' : 'reschedule');
                              setOverrideNewTime(occ.start_time.slice(0, 16));
                              setOverrideNewLocation(occ.override_location || occ.location || '');
                              setOverrideNotes(occ.modified_notes || '');
                              setShowOverrideModal(occ);
                            }}
                            className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 font-extrabold rounded-xl text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                            title="Override start time, location, or cancel for this date only"
                          >
                            <Clock size={12} />
                            <span>Override</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setAttendanceHeadcount(occ.attendance_count || 0);
                              setShowAttendanceModal(occ);
                            }}
                            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold rounded-xl text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                            title="Log door attendance headcount"
                          >
                            <Users size={12} />
                            <span>Headcount</span>
                          </button>

                          {parentEvt && (
                            <button
                              type="button"
                              onClick={() => setWorkspaceEvent(parentEvt)}
                              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-[11px] transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                              title="Open Event Workspace"
                            >
                              <Layers size={12} />
                              <span>Workspace</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* TIMELINE CARDS LIST VIEW */
          <div className="space-y-4">
            {filteredOccs.length === 0 ? (
              <div className="p-10 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 italic text-xs">
                No occurrences match your search or filter criteria.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOccs.map(occ => {
                  const parentEvt = events.find(e => e.id === occ.event_id);
                  const occDateObj = new Date(occ.start_time);
                  const isPast = occDateObj.getTime() < Date.now();

                  return (
                    <div
                      key={occ.id}
                      className={`bg-white rounded-3xl border p-5 shadow-xs flex flex-col justify-between space-y-3 transition-all ${
                        occ.status === 'cancelled' ? 'border-rose-200 bg-rose-50/20' :
                        occ.is_modified ? 'border-purple-300 bg-purple-50/20' : 'border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2.5 py-1 bg-slate-900 text-amber-300 font-mono text-[11px] font-black rounded-lg">
                            {occ.occurrence_date}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            occ.status === 'cancelled' ? 'bg-rose-100 text-rose-800' :
                            occ.status === 'rescheduled' ? 'bg-purple-100 text-purple-900' :
                            isPast ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {occ.status}
                          </span>
                        </div>

                        <div>
                          <h4 className="font-extrabold text-slate-900 text-base leading-snug">{occ.event_title}</h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryBadgeStyle(occ.category || 'Worship Service')}`}>
                              {occ.category}
                            </span>
                            {occ.is_combined_service && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200">
                                ✨ Combined
                              </span>
                            )}
                            {occ.is_modified && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-900">
                                Modified Scope
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-1.5 font-bold">
                            <Clock size={13} className="text-indigo-600 shrink-0" />
                            <span>{occDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin size={13} className="text-indigo-600 shrink-0" />
                            <span className="truncate">{occ.override_location || occ.location || 'Sanctuary'}</span>
                          </div>
                          {occ.account_number && (
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                              <Landmark size={13} className="text-emerald-600 shrink-0" />
                              <span>{occ.account_number}</span>
                            </div>
                          )}
                          {occ.modified_notes && (
                            <p className="text-[10px] text-purple-800 bg-purple-50 p-1.5 rounded-lg font-medium">
                              Exemption: {occ.modified_notes}
                            </p>
                          )}
                        </div>

                        <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-[10px] font-extrabold uppercase text-slate-400">Recorded Headcount</span>
                          <span className="font-black text-indigo-900">{occ.attendance_count || 0} Attended</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setOverrideAction(occ.status === 'cancelled' ? 'cancel' : 'reschedule');
                            setOverrideNewTime(occ.start_time.slice(0, 16));
                            setOverrideNewLocation(occ.override_location || occ.location || '');
                            setOverrideNotes(occ.modified_notes || '');
                            setShowOverrideModal(occ);
                          }}
                          className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 font-extrabold rounded-xl text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Clock size={12} />
                          <span>Override Date</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAttendanceHeadcount(occ.attendance_count || 0);
                            setShowAttendanceModal(occ);
                          }}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold rounded-xl text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Users size={12} />
                          <span>Headcount</span>
                        </button>

                        {parentEvt && (
                          <button
                            type="button"
                            onClick={() => setWorkspaceEvent(parentEvt)}
                            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-[11px] transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                          >
                            <Layers size={12} />
                            <span>Workspace</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (workspaceEvent) {
    return (
      <EventWorkspaceModal
        event={workspaceEvent}
        members={members}
        registrations={registrations}
        onClose={() => setWorkspaceEvent(null)}
        onUpdateEvent={(updatedEvt) => {
          setEvents(prev => prev.map(e => e.id === updatedEvt.id ? updatedEvt : e));
          setWorkspaceEvent(updatedEvt);
        }}
        onRefreshData={fetchEventsData}
      />
    );
  }

  const pastRecurringEvents = events.filter(e => e.recurrence && e.recurrence !== 'one_time' && new Date(e.end_time || e.start_time).getTime() < Date.now());
  const detectedConflicts = detectScheduleConflicts(events);

  return (
    <div className="space-y-6">
      {/* METRICS STAT CARDS (POSITIONED AT TOP) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-100 shrink-0">
            <CalendarIcon size={20} className="sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">{events.length}</div>
            <div className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight">Total Church Events</div>
            <p className="text-[10px] text-slate-400 font-semibold">{upcomingCount} upcoming programs</p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center font-bold shadow-md shadow-amber-100 shrink-0">
            <Users size={20} className="sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">{totalRegistrations}</div>
            <div className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight">Congregant RSVPs</div>
            <p className="text-[10px] text-slate-400 font-semibold">Active registrations</p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-100 shrink-0">
            <Video size={20} className="sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">{virtualCount}</div>
            <div className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight">Virtual Streams</div>
            <p className="text-[10px] text-slate-400 font-semibold">Broadcast enabled</p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-md shadow-rose-100 shrink-0">
            <Sparkles size={20} className="sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">{events.filter(e => e.registration_required).length}</div>
            <div className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight">RSVP Events</div>
            <p className="text-[10px] text-slate-400 font-semibold">Capacity managed</p>
          </div>
        </div>
      </div>

      {/* MAIN ACTION BAR & FILTERS */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Church Events & Program Roster</h3>
            <p className="text-xs text-slate-500 mt-0.5">Schedule worship services, conferences, youth rallies, and fellowship gatherings.</p>
          </div>

          <div className="flex items-center gap-2">
            {eventsSubView === 'definitions' && (
              <div className="hidden lg:flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid size={14} /> Grid
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    viewMode === 'table' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <List size={14} /> List
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    viewMode === 'calendar' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CalendarIcon size={14} /> Calendar
                </button>
              </div>
            )}

            <button
              onClick={openAddModal}
              className="px-4 sm:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 transition-all flex items-center gap-2 cursor-pointer ml-auto sm:ml-0"
            >
              <Plus size={16} />
              <span>Create Event</span>
            </button>
          </div>
        </div>

        {/* 2-COLUMN PER ROW ON MOBILE & TABLET SEARCH & FILTER GRID */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 w-full">
            {/* Search Input (Full width on mobile/tablet, 1 col on desktop) */}
            <div className="relative col-span-2 lg:col-span-1 w-full">
              <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search title, venue, details..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500 focus:bg-white transition-all min-h-[42px]"
              />
            </div>

            {/* Category Filter Dropdown (1 col in 2-col grid) */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 min-h-[42px] col-span-1 w-full">
              <Filter size={14} className="text-slate-400 shrink-0" />
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none w-full cursor-pointer"
              >
                <option value="All">All Categories ({events.length})</option>
                {categoriesList.filter(c => c !== 'All').map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Audience Filter Dropdown (1 col in 2-col grid) */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 min-h-[42px] col-span-1 w-full">
              <Users size={14} className="text-slate-400 shrink-0" />
              <select
                value={selectedAudience}
                onChange={e => setSelectedAudience(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none w-full cursor-pointer"
              >
                <option value="All">All Audiences</option>
                {audienceList.filter(a => a !== 'All').map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Status Filter Dropdown (1 col in 2-col grid) */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 min-h-[42px] col-span-1 w-full">
              <Activity size={14} className="text-slate-400 shrink-0" />
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none w-full cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="upcoming">Upcoming</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Recurrence Filter Dropdown (1 col in 2-col grid) */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 min-h-[42px] col-span-1 w-full">
              <Clock size={14} className="text-purple-500 shrink-0" />
              <select
                value={selectedRecurrence}
                onChange={e => setSelectedRecurrence(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none w-full cursor-pointer"
              >
                {recurrenceFilterList.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {isFilterActive && (
            <div className="flex justify-end">
              <button
                onClick={resetFilters}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer py-1"
              >
                <X size={14} /> Clear Active Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SUB-VIEW MODE SWITCHER & SYSTEM BANNERS (MOVED BELOW FILTERS) */}
      <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-full">
        <div className="grid grid-cols-2 gap-1.5 w-full">
          <button
            type="button"
            onClick={() => setEventsSubView('occurrences')}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center ${
              eventsSubView === 'occurrences'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarIcon size={14} className="shrink-0" />
            <span className="truncate">Calendar Dates</span>
          </button>

          <button
            type="button"
            onClick={() => setEventsSubView('definitions')}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center ${
              eventsSubView === 'definitions'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings size={14} className="text-purple-600 shrink-0" />
            <span className="truncate">Master Rules ({events.length})</span>
          </button>
        </div>
      </div>

      {/* Recurrence Toast Notification */}
      {recurrenceToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{recurrenceToast}</span>
          </div>
          <button onClick={() => setRecurrenceToast(null)} className="text-emerald-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Schedule Conflicts & Combined Service Preemption Banner */}
      {detectedConflicts.length > 0 && (
        <div className="p-4.5 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 bg-white rounded-2xl border border-amber-300/80 text-xs shadow-xs space-y-3 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-amber-500 text-white font-black flex items-center justify-center text-sm shrink-0 shadow-2xs">
                ✨
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-slate-900 text-sm">Combined Service & Schedule Preemption Rule Active</h4>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-black text-[10px] rounded-full uppercase border border-amber-200">
                    {detectedConflicts.length} Rule(s) Detected
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] font-medium mt-0.5">
                  The system enforces that regular weekly services are merged into monthly/joint combined services so two services do not run simultaneously.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-1 border-t border-amber-200/60">
            {detectedConflicts.map((c, idx) => (
              <div key={idx} className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-900 text-[11px] bg-amber-200/60 px-2 py-0.5 rounded-md shrink-0">{c.conflictDate}</span>
                  <span className="font-bold text-slate-800 text-[11px]">{c.message}</span>
                </div>
                <span className="px-2.5 py-1 bg-amber-500 text-white font-black text-[10px] rounded-lg uppercase shrink-0 self-start sm:self-auto shadow-2xs">
                  {c.conflictType === 'combined_preemption' ? '✨ Combined Service Preempts Weekly' : '⚠️ Time Collision Warning'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto-Advance Notification Banner for Past Recurring Programs */}
      {pastRecurringEvents.length > 0 && (
        <div className="p-4.5 bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 text-white rounded-2xl border border-purple-800 text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-800 text-amber-300 flex items-center justify-center shrink-0">
              <RefreshCw size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white">Past Recurrence Date Alert</span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-black uppercase bg-amber-400 text-slate-950">
                  {pastRecurringEvents.length} Program(s) Due
                </span>
              </div>
              <p className="text-purple-200 text-[11px] font-medium mt-0.5">
                Some recurring church programs have passed their scheduled date. Roll them forward to their next cycle date in 1-click.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAutoAdvancePastEvents}
            className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <RefreshCw size={14} />
            <span>Auto-Advance All Past Program Dates</span>
          </button>
        </div>
      )}

      {/* Events Sub-View Rendering */}
      {eventsSubView === 'occurrences' ? (
        renderOccurrencesView()
      ) : loading ? (
        <div className="p-12 text-center text-slate-400 font-bold flex items-center justify-center gap-2">
          <RefreshCw size={18} className="animate-spin text-indigo-600" />
          <span>Loading church calendar events...</span>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
          <CalendarIcon size={48} className="mx-auto text-slate-300" />
          <h4 className="text-lg font-bold text-slate-800">No Church Events Found</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No events match your current filter criteria. Create a new event or clear your filters to view all scheduled programs.
          </p>
          <button
            onClick={openAddModal}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all cursor-pointer inline-flex items-center gap-2 mt-2"
          >
            <Plus size={16} /> Create New Event
          </button>
        </div>
      ) : (
        <>
          {/* On Mobile & Tablet (< lg), ALWAYS render Grid View regardless of selected viewMode */}
          <div className="block lg:hidden">
            {renderGridView()}
          </div>

          {/* On Desktop (lg+), render according to selected viewMode */}
          <div className="hidden lg:block">
            {viewMode === 'grid' && renderGridView()}
            {viewMode === 'table' && renderTableView()}
            {viewMode === 'calendar' && renderCalendarView()}
          </div>
        </>
      )}

      {/* --- ADD / EDIT EVENT MODAL --- */}
      {showFormModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-6 z-[100] overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-3xl w-full p-4 sm:p-7 shadow-2xl space-y-5 my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3.5 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-md z-20 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-black shadow-md shadow-indigo-200 shrink-0">
                  <CalendarIcon size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                      {editingEvent ? 'Edit Church Program' : 'Create Church Event'}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {editingEvent ? 'Update Mode' : 'New Program'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Configure event schedule, recurrence engine, venue, and dedicated ledger.</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowFormModal(false)} 
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form id="event-form" onSubmit={handleSaveEvent} className="space-y-5 text-xs overflow-y-auto pr-1 flex-1">
              {/* SECTION 1: PROGRAM IDENTITY & DETAILS */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-3.5">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-xs uppercase tracking-wide">
                  <Sparkles size={16} className="text-indigo-600" />
                  <span>Program Identity & Details</span>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 uppercase block mb-1">Program Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Annual Believers Prophetic Conference"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-bold text-slate-900 text-sm transition-all min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="font-extrabold text-slate-700 uppercase block mb-1">Event Category</label>
                    <select
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value as any)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-800 cursor-pointer focus:border-indigo-500 transition-all min-h-[44px]"
                    >
                      {categoriesList.filter(c => c !== 'All').map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-700 uppercase block mb-1">Target Audience</label>
                    <select
                      value={formAudience}
                      onChange={e => setFormAudience(e.target.value as any)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-800 cursor-pointer focus:border-indigo-500 transition-all min-h-[44px]"
                    >
                      {audienceList.filter(a => a !== 'All').map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 uppercase block mb-1">Program Description & Overview</label>
                  <textarea
                    rows={3}
                    placeholder="Sermon theme, guest speakers, schedule notes, or special congregant instructions..."
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none text-slate-800 font-medium leading-relaxed focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* SECTION 2: SCHEDULE, VENUE & PREEMPTION */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-3.5">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-xs uppercase tracking-wide">
                  <Clock size={16} className="text-indigo-600" />
                  <span>Schedule, Venue & Preemption Rules</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="font-extrabold text-slate-700 uppercase block mb-1">Start Date & Time *</label>
                    <input
                      type="datetime-local"
                      required
                      value={formStartTime}
                      onChange={e => setFormStartTime(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-900 focus:border-indigo-500 transition-all min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-700 uppercase block mb-1">End Date & Time *</label>
                    <input
                      type="datetime-local"
                      required
                      value={formEndTime}
                      onChange={e => setFormEndTime(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-900 focus:border-indigo-500 transition-all min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="font-extrabold text-slate-700 uppercase block mb-1">Venue / Physical Location</label>
                    <input
                      type="text"
                      value={formLocation}
                      onChange={e => setFormLocation(e.target.value)}
                      placeholder="e.g. Grace Cathedral Main Sanctuary"
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 font-medium focus:border-indigo-500 transition-all min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-700 uppercase block mb-1">Host Ministry / Department</label>
                    <input
                      type="text"
                      value={formOrganizer}
                      onChange={e => setFormOrganizer(e.target.value)}
                      placeholder="e.g. Pastoral Directorate or Youth Ministry"
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none text-slate-900 font-medium focus:border-indigo-500 transition-all min-h-[44px]"
                    />
                  </div>
                </div>

                {/* Event Location GPS Configuration & Map Preview */}
                <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                      <MapPin size={15} className="text-indigo-600" />
                      <span>Venue GPS Map Coordinates</span>
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const loc = await getCurrentGpsLocation();
                          setFormLatitude(loc.lat);
                          setFormLongitude(loc.lng);
                        } catch (err: any) {
                          alert(`GPS location error: ${err?.message || 'Access denied'}`);
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-xl text-[11px] border border-emerald-200 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <Compass size={13} />
                      <span>Use Device GPS</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-600 block mb-1">Latitude (° N/S)</label>
                      <input
                        type="number"
                        step="any"
                        value={formLatitude}
                        onChange={e => setFormLatitude(parseFloat(e.target.value) || 0)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-600 block mb-1">Longitude (° E/W)</label>
                      <input
                        type="number"
                        step="any"
                        value={formLongitude}
                        onChange={e => setFormLongitude(parseFloat(e.target.value) || 0)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-bold"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="font-bold text-slate-600 block mb-1">Location Preset</label>
                      <select
                        onChange={e => {
                          const idx = Number(e.target.value);
                          if (!isNaN(idx) && PRESET_GPS_LOCATIONS[idx]) {
                            const p = PRESET_GPS_LOCATIONS[idx];
                            setFormLatitude(p.lat);
                            setFormLongitude(p.lng);
                          }
                        }}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 cursor-pointer"
                      >
                        <option value="">-- Choose Preset Location --</option>
                        {PRESET_GPS_LOCATIONS.map((loc, idx) => (
                          <option key={idx} value={idx}>
                            {loc.name} ({loc.lat}, {loc.lng})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-1">
                    <LocationMap
                      latitude={formLatitude}
                      longitude={formLongitude}
                      title={formTitle || 'Event Venue'}
                      subtitle={formLocation}
                      height="180px"
                    />
                  </div>
                </div>

                {/* Combined Service Overriding Checkbox */}
                <div className="p-3.5 bg-amber-50/90 rounded-2xl border border-amber-200/90 space-y-1.5">
                  <label className="flex items-center gap-2.5 cursor-pointer font-extrabold text-amber-950 text-xs">
                    <input
                      type="checkbox"
                      checked={formIsCombinedService}
                      onChange={e => setFormIsCombinedService(e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded cursor-pointer shrink-0"
                    />
                    <span>✨ Combined Service (Preempts & Merges Regular Weekly Gathering)</span>
                  </label>
                  <p className="text-[10px] font-medium text-amber-800 leading-normal pl-6">
                    Enforces that standard weekly services on this date are automatically merged into this Combined Service to prevent schedule collisions.
                  </p>
                </div>
              </div>

              {/* SECTION 3: BANNER MEDIA & VIRTUAL STREAM */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-slate-900 uppercase text-xs flex items-center gap-2">
                    <Upload size={16} className="text-indigo-600" />
                    <span>Featured Banner & Live Broadcast</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold">Upload or select preset</span>
                </div>

                {/* Banner Image Preview */}
                {formBannerImage && (
                  <div className="relative h-32 w-full rounded-2xl overflow-hidden border border-slate-300 shadow-xs group">
                    <img
                      src={formBannerImage}
                      alt="Banner Preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFormBannerImage('')}
                        className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-rose-700 cursor-pointer shadow-md"
                      >
                        <Trash2 size={14} /> Remove Banner
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center justify-center gap-2 p-3 bg-white border border-indigo-200 hover:border-indigo-500 rounded-xl cursor-pointer text-indigo-700 font-bold hover:bg-indigo-50/50 transition-all text-xs shadow-2xs min-h-[44px]">
                    <Upload size={16} />
                    <span>Upload Banner Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileUpload}
                      className="hidden"
                    />
                  </label>

                  <input
                    type="text"
                    placeholder="Or paste banner image URL..."
                    value={formBannerImage}
                    onChange={e => setFormBannerImage(e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none text-slate-800 font-medium text-xs focus:border-indigo-500 min-h-[44px]"
                  />
                </div>

                {/* Cathedral Stock Presets */}
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5"> Cathedral Presets:</span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {defaultBannerPresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setFormBannerImage(preset.url)}
                        className={`h-12 rounded-xl overflow-hidden border-2 transition-all cursor-pointer relative ${
                          formBannerImage === preset.url ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-slate-200 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={preset.url} alt="" className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[7.5px] font-bold truncate p-0.5 text-center">
                          {preset.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Virtual Stream Link */}
                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 text-xs">
                    <input
                      type="checkbox"
                      checked={formIsVirtual}
                      onChange={e => setFormIsVirtual(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded cursor-pointer shrink-0"
                    />
                    <span>Enable Live Broadcast / Virtual Attendance Stream</span>
                  </label>

                  {formIsVirtual && (
                    <div className="pt-2">
                      <label className="font-bold text-slate-600 block mb-1">Broadcast Link / Stream URL</label>
                      <input
                        type="text"
                        value={formVirtualLink}
                        onChange={e => setFormVirtualLink(e.target.value)}
                        placeholder="/portal/streaming or YouTube Live URL"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-xs focus:bg-white focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 4: CONGREGANT RSVPS & CAPACITY */}
              <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/80 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer font-extrabold text-indigo-950 text-xs">
                  <input
                    type="checkbox"
                    checked={formRegRequired}
                    onChange={e => setFormRegRequired(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer shrink-0"
                  />
                  <span>Require Congregant RSVP / Seat Registration</span>
                </label>

                {formRegRequired && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Maximum Seat Capacity</label>
                      <input
                        type="number"
                        min={1}
                        value={formMaxAttendees}
                        onChange={e => setFormMaxAttendees(Number(e.target.value))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 5: RECURRENCE SCHEDULE ENGINE & TREASURY LEDGER */}
              <div className="p-4 bg-gradient-to-br from-indigo-50/80 via-purple-50/50 to-slate-50 rounded-2xl border border-indigo-200/80 space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
                  <div className="flex items-center gap-2 font-black text-indigo-950 text-xs uppercase tracking-wide">
                    <Clock size={16} className="text-purple-600" />
                    <span>Recurrence Schedule Engine & Dedicated Treasury Account</span>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/80 px-2.5 py-0.5 rounded-full border border-indigo-200">
                    Autonomous Ledger
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="font-extrabold text-slate-700 uppercase block mb-1">Recurrence Schedule</label>
                    <select
                      value={formRecurrence}
                      onChange={e => {
                        const newRec = e.target.value as EventRecurrence;
                        setFormRecurrence(newRec);
                        if (newRec === 'nth_weekday_monthly') {
                          setFormRecurrencePattern(`2nd Sunday of every month (Except January)`);
                        }
                      }}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-800 cursor-pointer focus:border-indigo-500 min-h-[44px]"
                    >
                      <option value="one_time">⚡ One-Time Event</option>
                      <option value="weekly">📅 Weekly Program (Sundays / Midweek)</option>
                      <option value="monthly">🔄 Monthly Program (Standard Monthly)</option>
                      <option value="nth_weekday_monthly">🗓️ Ordinal Monthly (e.g. Every 2nd Sunday of Month)</option>
                      <option value="quarterly">🏛️ Quarterly Program (Fellowships / Summits)</option>
                      <option value="yearly">🌟 Yearly / Annual Program (Conferences)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-700 uppercase block mb-1">
                      {formRecurrence !== 'one_time' ? 'Cycle Budget Allowance (SLE)' : 'Target Event Budget (SLE)'}
                    </label>
                    <input
                      type="number"
                      min={100}
                      value={formRecurringAllowance}
                      onChange={e => setFormRecurringAllowance(Number(e.target.value))}
                      placeholder="e.g. 15000"
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold font-mono text-slate-900 min-h-[44px]"
                    />
                  </div>
                </div>

                {/* Weekly Days Selector */}
                {formRecurrence === 'weekly' && (
                  <div className="p-3.5 bg-indigo-50/80 rounded-2xl border border-indigo-200 space-y-2">
                    <span className="font-extrabold text-indigo-950 text-xs uppercase tracking-wide block">
                      Select Active Service Days
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'Sunday', day: 0 },
                        { label: 'Monday', day: 1 },
                        { label: 'Tuesday', day: 2 },
                        { label: 'Wednesday', day: 3 },
                        { label: 'Thursday', day: 4 },
                        { label: 'Friday', day: 5 },
                        { label: 'Saturday', day: 6 }
                      ].map(item => {
                        const isSel = formWeeklyDays.includes(item.day);
                        return (
                          <button
                            key={item.day}
                            type="button"
                            onClick={() => {
                              const nextDays = isSel
                                ? formWeeklyDays.filter(d => d !== item.day)
                                : [...formWeeklyDays, item.day];
                              setFormWeeklyDays(nextDays.length > 0 ? nextDays : [0]);
                              const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                              setFormRecurrencePattern(`Every week on ${nextDays.map(d => dayNames[d]).join(', ')}`);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isSel ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            {item.label} {isSel ? '✓' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quarterly Starting Month Anchor Selector */}
                {formRecurrence === 'quarterly' && (
                  <div className="p-3.5 bg-purple-50/90 rounded-2xl border border-purple-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-purple-950 text-xs uppercase tracking-wide">
                        Quarterly Anchor & Month Sequence
                      </span>
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full">
                        Anchored Cycle
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-extrabold text-slate-700 text-[10px] uppercase block mb-1">Starting Anchor Month</label>
                        <select
                          value={formQuarterlyStartMonth}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setFormQuarterlyStartMonth(val);
                            const seqStr = val === 11 ? 'Dec → Mar → Jun → Sep' : val === 0 ? 'Jan → Apr → Jul → Oct' : 'Mar → Jun → Sep → Dec';
                            setFormRecurrencePattern(`Quarterly on First Sunday (${seqStr})`);
                          }}
                          className="w-full p-2.5 bg-white border border-purple-200 rounded-xl font-bold text-xs text-purple-900 outline-none cursor-pointer"
                        >
                          <option value={11}>December Anchor (Dec → Mar → Jun → Sep)</option>
                          <option value={2}>March Anchor (Mar → Jun → Sep → Dec)</option>
                          <option value={0}>January Anchor (Jan → Apr → Jul → Oct)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-extrabold text-slate-700 text-[10px] uppercase block mb-1">Week Occurrence</label>
                        <select
                          value={formRecurrenceNth}
                          onChange={e => setFormRecurrenceNth(Number(e.target.value))}
                          className="w-full p-2.5 bg-white border border-purple-200 rounded-xl font-bold text-xs text-purple-900 outline-none cursor-pointer"
                        >
                          <option value={1}>1st Sunday of Quarter Month</option>
                          <option value={2}>2nd Sunday of Quarter Month</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Granular Ordinal Recurrence Controls for Nth Weekday & Month Exclusions */}
                {(formRecurrence === 'nth_weekday_monthly' || formRecurrence === 'monthly') && (
                  <div className="p-3.5 bg-purple-50/90 rounded-2xl border border-purple-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-purple-950 text-xs uppercase tracking-wide">
                        Ordinal Recurrence & Month Overrides
                      </span>
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                        Smart Recurrence Engine
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-extrabold text-slate-700 text-[10px] uppercase block mb-1">Standard Occurrence (Nth)</label>
                        <select
                          value={formRecurrenceNth}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setFormRecurrenceNth(val);
                            const nthStr = val === 1 ? '1st' : val === 2 ? '2nd' : val === 3 ? '3rd' : val === 4 ? '4th' : 'Last';
                            const wNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                            const excStr = formJanFirstSundayException ? ' (January = First Sunday)' : '';
                            setFormRecurrencePattern(`${nthStr} ${wNames[formRecurrenceWeekday]} of every month${excStr}`);
                          }}
                          className="w-full p-2.5 bg-white border border-purple-200 rounded-xl font-bold text-xs text-purple-900 outline-none"
                        >
                          <option value={1}>1st (First Week)</option>
                          <option value={2}>2nd (Second Week)</option>
                          <option value={3}>3rd (Third Week)</option>
                          <option value={4}>4th (Fourth Week)</option>
                          <option value={5}>5th / Last Week</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-extrabold text-slate-700 text-[10px] uppercase block mb-1">Weekday</label>
                        <select
                          value={formRecurrenceWeekday}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setFormRecurrenceWeekday(val);
                            const nthStr = formRecurrenceNth === 1 ? '1st' : formRecurrenceNth === 2 ? '2nd' : formRecurrenceNth === 3 ? '3rd' : formRecurrenceNth === 4 ? '4th' : 'Last';
                            const wNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                            const excStr = formJanFirstSundayException ? ' (January = First Sunday)' : '';
                            setFormRecurrencePattern(`${nthStr} ${wNames[val]} of every month${excStr}`);
                          }}
                          className="w-full p-2.5 bg-white border border-purple-200 rounded-xl font-bold text-xs text-purple-900 outline-none"
                        >
                          <option value={0}>Sunday</option>
                          <option value={1}>Monday</option>
                          <option value={2}>Tuesday</option>
                          <option value={3}>Wednesday</option>
                          <option value={4}>Thursday</option>
                          <option value={5}>Friday</option>
                          <option value={6}>Saturday</option>
                        </select>
                      </div>
                    </div>

                    {/* Month Overrides / Exception Rules */}
                    <div className="pt-2 border-t border-purple-200/60">
                      <label className="flex items-center gap-2 cursor-pointer font-extrabold text-purple-950 text-xs">
                        <input
                          type="checkbox"
                          checked={formJanFirstSundayException}
                          onChange={e => {
                            const val = e.target.checked;
                            setFormJanFirstSundayException(val);
                            const nthStr = formRecurrenceNth === 1 ? '1st' : formRecurrenceNth === 2 ? '2nd' : formRecurrenceNth === 3 ? '3rd' : formRecurrenceNth === 4 ? '4th' : 'Last';
                            const wNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                            const excStr = val ? ' (January = First Sunday Exception)' : '';
                            setFormRecurrencePattern(`${nthStr} ${wNames[formRecurrenceWeekday]} of every month${excStr}`);
                          }}
                          className="w-4 h-4 text-purple-600 rounded cursor-pointer shrink-0"
                        />
                        <span>⚡ Apply January Override Rule: January = First Sunday</span>
                      </label>
                      <p className="text-[10px] text-purple-800 leading-tight pl-6 mt-0.5">
                        When enabled, January will generate the First Sunday while all other months generate the Second Sunday.
                      </p>
                    </div>
                  </div>
                )}

                {/* Live Recurrence Roll Preview & Upcoming Occurrences Preview Box */}
                {formRecurrence !== 'one_time' && formStartTime && (() => {
                  const tempEvt: ChurchEvent = {
                    id: editingEvent?.id || 'temp_preview',
                    title: formTitle || 'Preview Event',
                    category: formCategory,
                    start_time: new Date(formStartTime).toISOString(),
                    end_time: new Date(formEndTime || formStartTime).toISOString(),
                    location: formLocation,
                    organizer_name: formOrganizer,
                    recurrence: formRecurrence,
                    recurrence_nth: formRecurrenceNth,
                    recurrence_weekday: formRecurrenceWeekday,
                    excluded_months: formExcludedMonths,
                    recurrence_pattern: formRecurrencePattern,
                    recurrence_config: {
                      frequency: formRecurrence === 'weekly' ? 'WEEKLY' : formRecurrence === 'quarterly' ? 'QUARTERLY' : 'MONTHLY',
                      days_of_week: formWeeklyDays,
                      weekday: formRecurrenceWeekday,
                      week_number: formRecurrenceNth,
                      starting_month: formQuarterlyStartMonth,
                      anchor_months: formRecurrence === 'quarterly'
                        ? (formQuarterlyStartMonth === 11 ? [11, 2, 5, 8] : formQuarterlyStartMonth === 0 ? [0, 3, 6, 9] : [2, 5, 8, 11])
                        : undefined,
                      month_overrides: formJanFirstSundayException ? [{ month: 0, week_number: 1, weekday: formRecurrenceWeekday }] : []
                    }
                  };
                  const sampleOccs = generateEventOccurrences(
                    tempEvt,
                    new Date(formStartTime),
                    new Date(new Date(formStartTime).getTime() + 86400000 * 180)
                  ).slice(0, 4);

                  return (
                    <div className="p-3.5 bg-purple-100/70 rounded-2xl border border-purple-200/90 space-y-2.5 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div>
                          <span className="font-extrabold text-purple-950 block text-[10px] uppercase tracking-wider">Calculated Next Cycle Schedule</span>
                          <span className="font-bold text-slate-800 text-xs">
                            {calculateNextRecurrenceDate(formStartTime, formEndTime || formStartTime, formRecurrence, tempEvt).formattedNextStart}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const { nextStartISO, nextEndISO } = calculateNextRecurrenceDate(formStartTime, formEndTime || formStartTime, formRecurrence, tempEvt);
                            setFormStartTime(nextStartISO.slice(0, 16));
                            setFormEndTime(nextEndISO.slice(0, 16));
                          }}
                          className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-extrabold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                        >
                          <RefreshCw size={13} /> Roll Form Dates to Next Cycle
                        </button>
                      </div>

                      {sampleOccs.length > 0 && (
                        <div className="pt-2 border-t border-purple-200/80 space-y-1">
                          <span className="text-[10px] font-extrabold text-purple-900 uppercase block">
                            📅 Next {sampleOccs.length} Scheduled Occurrences Preview:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {sampleOccs.map((o, idx) => (
                              <span key={idx} className="px-2.5 py-1 bg-white border border-purple-200 text-purple-950 rounded-xl text-[10px] font-bold shadow-2xs font-mono">
                                #{idx + 1}: {o.occurrence_date} ({new Date(o.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer font-extrabold text-slate-900 text-xs">
                    <input
                      type="checkbox"
                      checked={formHasFundingAccount}
                      onChange={e => setFormHasFundingAccount(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded cursor-pointer shrink-0"
                    />
                    <span>Require Dedicated Event Treasury / Funding Account</span>
                  </label>
                  <p className="text-[10px] text-slate-500 leading-normal pl-6">
                    Enable for major events requiring dedicated budget allocations, donor sponsorships, or vendor disbursements. Uncheck for routine non-funded gatherings (e.g. prayer meetings or free youth socials).
                  </p>

                  {formHasFundingAccount && (
                    <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="font-extrabold text-slate-700 uppercase block mb-1">Recurrence Pattern Description</label>
                        <input
                          type="text"
                          value={formRecurrencePattern}
                          onChange={e => setFormRecurrencePattern(e.target.value)}
                          placeholder="e.g. 2nd Sunday of every month (Except January)"
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-medium text-xs min-h-[44px]"
                        />
                      </div>

                      <div>
                        <label className="font-extrabold text-slate-700 uppercase block mb-1">Dedicated Event Account Number</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={formAccountNumber}
                            onChange={e => setFormAccountNumber(e.target.value)}
                            placeholder="e.g. EVT-ACC-2026-001"
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-mono font-bold text-indigo-950 text-xs min-h-[44px]"
                          />
                          <button
                            type="button"
                            onClick={() => setFormAccountNumber(`EVT-ACC-2026-${Math.floor(100 + Math.random() * 900)}`)}
                            className="absolute right-2 top-2 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                          >
                            Regen
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </form>

            {/* Compact Action Footer */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0 bg-white z-20">
              <div className="flex items-center gap-1.5">
                <label className="font-extrabold text-slate-500 text-[11px] hidden xs:inline">Status:</label>
                <select
                  value={formStatus}
                  onChange={e => setFormStatusState(e.target.value as any)}
                  className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg font-bold text-xs text-slate-800 cursor-pointer outline-none focus:border-indigo-500"
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowFormModal(false)} 
                  className="px-3 py-2 font-bold text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  form="event-form"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-sm transition-all cursor-pointer text-xs flex items-center gap-1.5"
                >
                  <Check size={15} />
                  <span>{editingEvent ? 'Save Changes' : 'Publish Event'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ATTENDEE / ROSTER MODAL --- */}
      {showRosterModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-[100] overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                  RSVP Roster Sheet
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-1">{showRosterModal.title}</h3>
                <p className="text-xs text-slate-500">
                  {showRosterModal.registered_count || 0} Registered Congregants • Capacity: {showRosterModal.max_attendees || 'Unlimited'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportRosterCSV(showRosterModal)}
                  className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={14} /> Export CSV
                </button>
                <button onClick={() => setShowRosterModal(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Manual Add Form */}
            <form onSubmit={handleManualRegisterMember} className="p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
              <span className="font-extrabold text-slate-800 block">➕ Manually Add Congregant RSVP</span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-500 block mb-0.5">Select Existing Member</label>
                  <select
                    value={manualMemberId}
                    onChange={e => {
                      setManualMemberId(e.target.value);
                      const m = members.find(p => p.id === e.target.value);
                      if (m) {
                        setManualName(`${m.first_name} ${m.last_name}`);
                        setManualEmail(m.email);
                        setManualPhone(m.phone || '');
                      }
                    }}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none font-medium"
                  >
                    <option value="">-- Or enter visitor details below --</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.email})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-500 block mb-0.5">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-500 block mb-0.5">Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="john@example.com"
                    value={manualEmail}
                    onChange={e => setManualEmail(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-500 block mb-0.5">Phone</label>
                  <input
                    type="text"
                    placeholder="+1 (555) 000-0000"
                    value={manualPhone}
                    onChange={e => setManualPhone(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm cursor-pointer"
                >
                  Confirm RSVP Registration
                </button>
              </div>
            </form>

            {/* Registered Attendee List */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-extrabold text-slate-700">Registered Attendees List</span>
                <input
                  type="text"
                  placeholder="Filter roster..."
                  value={rosterSearch}
                  onChange={e => setRosterSearch(e.target.value)}
                  className="p-1.5 px-3 bg-slate-50 border rounded-lg text-xs outline-none"
                />
              </div>

              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {registrations
                  .filter(r => r.event_id === showRosterModal.id)
                  .filter(r => r.member_name.toLowerCase().includes(rosterSearch.toLowerCase()) || r.email.toLowerCase().includes(rosterSearch.toLowerCase()))
                  .map(reg => (
                    <div key={reg.id} className="p-3 bg-white rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-xs shrink-0">
                          {reg.member_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900">{reg.member_name}</p>
                          <p className="text-[10px] text-slate-400">{reg.email} {reg.phone ? `• ${reg.phone}` : ''}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-black uppercase">
                          {reg.status}
                        </span>
                        <button
                          onClick={() => handleRemoveRegistration(reg.id)}
                          className="p-1 text-slate-300 hover:text-rose-600 rounded cursor-pointer"
                          title="Remove registration"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                {registrations.filter(r => r.event_id === showRosterModal.id).length === 0 && (
                  <p className="p-6 text-center text-slate-400 italic text-xs">No congregant RSVPs registered yet for this program.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* --- SINGLE OCCURRENCE OVERRIDE MODAL --- */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[110]">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900">
                  Single Occurrence Scope Override
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">{showOverrideModal.event_title}</h3>
                <p className="text-xs text-slate-500">Scheduled Date: {showOverrideModal.occurrence_date}</p>
              </div>
              <button onClick={() => setShowOverrideModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="font-extrabold text-slate-700 block">Select Scope Action for this Date Only</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer font-bold text-slate-800">
                  <input
                    type="radio"
                    name="occAction"
                    checked={overrideAction === 'reschedule'}
                    onChange={() => setOverrideAction('reschedule')}
                  />
                  <span>⏰ Reschedule Start Time for this Date Only</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer font-bold text-slate-800">
                  <input
                    type="radio"
                    name="occAction"
                    checked={overrideAction === 'cancel'}
                    onChange={() => setOverrideAction('cancel')}
                  />
                  <span>🚫 Cancel this Specific Occurrence (e.g. Special Convention)</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer font-bold text-slate-800">
                  <input
                    type="radio"
                    name="occAction"
                    checked={overrideAction === 'modify'}
                    onChange={() => setOverrideAction('modify')}
                  />
                  <span>📍 Change Venue / Location for this Date Only</span>
                </label>
              </div>

              {overrideAction === 'reschedule' && (
                <div>
                  <label className="font-bold text-slate-600 block mb-1">New Start Time for {showOverrideModal.occurrence_date}</label>
                  <input
                    type="datetime-local"
                    value={overrideNewTime}
                    onChange={e => setOverrideNewTime(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
              )}

              {overrideAction === 'modify' && (
                <div>
                  <label className="font-bold text-slate-600 block mb-1">New Venue / Location for {showOverrideModal.occurrence_date}</label>
                  <input
                    type="text"
                    placeholder="e.g. Main Courtyard or Youth Auditorium"
                    value={overrideNewLocation}
                    onChange={e => setOverrideNewLocation(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
              )}

              <div>
                <label className="font-bold text-slate-600 block mb-1">Reason / Exemption Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Moved start time from 9 AM to 10 AM due to National Convention"
                  value={overrideNotes}
                  onChange={e => setOverrideNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setShowOverrideModal(null)} className="px-4 py-2 text-slate-500 font-bold cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => {
                  saveOccurrenceOverride({
                    id: showOverrideModal.id,
                    event_id: showOverrideModal.event_id,
                    occurrence_date: showOverrideModal.occurrence_date,
                    action: overrideAction,
                    new_start_time: overrideNewTime || undefined,
                    new_location: overrideNewLocation || undefined,
                    notes: overrideNotes
                  });
                  setShowOverrideModal(null);
                  fetchEventsData();
                }}
                className="px-5 py-2.5 bg-purple-700 text-white font-black rounded-xl hover:bg-purple-800 shadow-md cursor-pointer"
              >
                Save Occurrence Exemption
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ATTENDANCE TRACKER MODAL --- */}
      {showAttendanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[110]">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  Record Attendance Headcount
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">{showAttendanceModal.event_title}</h3>
                <p className="text-xs text-slate-500">Date: {showAttendanceModal.occurrence_date}</p>
              </div>
              <button onClick={() => setShowAttendanceModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="font-extrabold text-slate-700 block">Actual Headcount / Worshippers Present</label>
              <input
                type="number"
                min={0}
                value={attendanceHeadcount}
                onChange={e => setAttendanceHeadcount(Number(e.target.value))}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-emerald-700 text-lg outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setShowAttendanceModal(null)} className="px-4 py-2 text-slate-500 font-bold cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => {
                  saveOccurrenceAttendance(showAttendanceModal.id, attendanceHeadcount);
                  setShowAttendanceModal(null);
                  fetchEventsData();
                }}
                className="px-5 py-2.5 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 shadow-md cursor-pointer"
              >
                Save Attendance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
